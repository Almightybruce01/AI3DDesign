/**
 * Complex pendant: hollow framed plate, caged back holes, round outline + baguette interior seats,
 * separate digit link with chain slot behind.
 * CLI: node complex-pendant-build.mjs <config.json>
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import opentype from 'opentype.js';
import * as THREE from 'three';
import { Evaluator, Brush, ADDITION, SUBTRACTION } from 'three-bvh-csg';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DEFAULT_FONT = path.join(ROOT, 'fonts', 'BebasNeue-Regular.ttf');

function ensureCsgAttributes(geom) {
  let g = geom.index ? geom.toNonIndexed() : geom;
  g.computeVertexNormals();
  const pos = g.getAttribute('position');
  if (pos && !g.getAttribute('uv')) {
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2));
  }
  return g;
}

function writeObjStreamingSync(mesh, filepath, objectName) {
  const base = objectName || path.basename(filepath, path.extname(filepath));
  fs.writeFileSync(filepath, `# AI3DDesign — complex pendant\no ${base}\n`);
  const g = mesh.geometry;
  const pos = g.getAttribute('position');
  const idx = g.getIndex();
  let block = '';
  const flush = () => {
    if (block.length) {
      fs.appendFileSync(filepath, block);
      block = '';
    }
  };
  const push = (s) => {
    block += s;
    if (block.length > 524288) flush();
  };
  for (let i = 0; i < pos.count; i++) {
    push(`v ${pos.getX(i)} ${pos.getY(i)} ${pos.getZ(i)}\n`);
  }
  flush();
  if (idx) {
    for (let i = 0; i < idx.count; i += 3) {
      push(`f ${idx.getX(i) + 1} ${idx.getX(i + 1) + 1} ${idx.getX(i + 2) + 1}\n`);
    }
  } else {
    for (let i = 0; i < pos.count; i += 3) {
      push(`f ${i + 1} ${i + 2} ${i + 3}\n`);
    }
  }
  flush();
}

function stlWrite(mesh, filepath) {
  const exporter = new STLExporter();
  const stlBuf = exporter.parse(mesh, { binary: true });
  const outStl =
    stlBuf instanceof DataView
      ? Buffer.from(stlBuf.buffer, stlBuf.byteOffset, stlBuf.byteLength)
      : Buffer.from(stlBuf);
  fs.writeFileSync(filepath, outStl);
}

function roundedRectShape(w, h, r) {
  const shape = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  const rr = Math.min(r, w / 2 - 0.02, h / 2 - 0.02);
  shape.moveTo(x + rr, y);
  shape.lineTo(x + w - rr, y);
  shape.quadraticCurveTo(x + w, y, x + w, y + rr);
  shape.lineTo(x + w, y + h - rr);
  shape.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  shape.lineTo(x + rr, y + h);
  shape.quadraticCurveTo(x, y + h, x, y + h - rr);
  shape.lineTo(x, y + rr);
  shape.quadraticCurveTo(x, y, x + rr, y);
  return shape;
}

function pathToContours(path) {
  const contours = [];
  let current = [];
  let curX = 0,
    curY = 0;
  let startX = 0,
    startY = 0;
  for (const cmd of path.commands) {
    if (cmd.type === 'M') {
      if (current.length > 0) contours.push(current);
      current = [[cmd.x, cmd.y]];
      curX = cmd.x;
      curY = cmd.y;
      startX = cmd.x;
      startY = cmd.y;
    } else if (cmd.type === 'L') {
      current.push([cmd.x, cmd.y]);
      curX = cmd.x;
      curY = cmd.y;
    } else if (cmd.type === 'C') {
      for (let t = 0.05; t <= 1; t += 0.1) {
        const mt = 1 - t;
        const x =
          mt ** 3 * curX +
          3 * mt ** 2 * t * cmd.x1 +
          3 * mt * t ** 2 * cmd.x2 +
          t ** 3 * cmd.x;
        const y =
          mt ** 3 * curY +
          3 * mt ** 2 * t * cmd.y1 +
          3 * mt * t ** 2 * cmd.y2 +
          t ** 3 * cmd.y;
        current.push([x, y]);
      }
      curX = cmd.x;
      curY = cmd.y;
    } else if (cmd.type === 'Q') {
      for (let t = 0.1; t <= 1; t += 0.15) {
        const mt = 1 - t;
        const x = mt * mt * curX + 2 * mt * t * cmd.x1 + t * t * cmd.x;
        const y = mt * mt * curY + 2 * mt * t * cmd.y1 + t * t * cmd.y;
        current.push([x, y]);
      }
      curX = cmd.x;
      curY = cmd.y;
    } else if (cmd.type === 'Z') {
      if (current.length > 0) contours.push(current);
      current = [];
      curX = startX;
      curY = startY;
    }
  }
  if (current.length > 0) contours.push(current);
  return contours;
}

function extrudeChar(font, ch, fontSize, depth) {
  const glyph = font.charToGlyph(ch);
  const glyphPath = glyph.getPath(0, 0, fontSize);
  const contours = pathToContours(glyphPath);
  if (!contours.length) throw new Error(`No outline for "${ch}"`);
  let outer = contours[0];
  for (const c of contours) {
    if (c.length > outer.length) outer = c;
  }
  const shape = new THREE.Shape(outer.map(([x, y]) => new THREE.Vector2(x, -y)));
  const geom = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.12,
    bevelSize: 0.1,
    bevelSegments: 1,
    curveSegments: 12,
    steps: 1,
  });
  geom.computeBoundingBox();
  const b = geom.boundingBox;
  const c = b.getCenter(new THREE.Vector3());
  geom.translate(-c.x, -c.y, -c.z);
  geom.computeBoundingBox();
  return { geom: ensureCsgAttributes(geom), box: geom.boundingBox };
}

function unionBrushes(evaluator, brushes) {
  let acc = brushes[0];
  acc.updateMatrixWorld(true);
  for (let i = 1; i < brushes.length; i++) {
    const b = brushes[i];
    b.updateMatrixWorld(true);
    acc = evaluator.evaluate(acc, b, ADDITION);
  }
  return acc;
}

function inFrameRing(px, py, ow, oh, iw, ih) {
  const ix = Math.abs(px) < iw / 2;
  const iy = Math.abs(py) < ih / 2;
  if (ix && iy) return false;
  return Math.abs(px) < ow / 2 && Math.abs(py) < oh / 2;
}

function ringPoints2D(w, h, r, totalPts) {
  const pts = [];
  const x0 = -w / 2,
    y0 = -h / 2;
  const rr = Math.min(r, w / 2 - 0.02, h / 2 - 0.02);
  const segs = Math.max(8, Math.floor(totalPts / 4));
  const edges = [
    [x0 + rr, y0, x0 + w - rr, y0],
    [x0 + w, y0 + rr, x0 + w, y0 + h - rr],
    [x0 + w - rr, y0 + h, x0 + rr, y0 + h],
    [x0, y0 + h - rr, x0, y0 + rr],
  ];
  for (const [ax, ay, bx, by] of edges) {
    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      pts.push([ax + t * (bx - ax), ay + t * (by - ay)]);
    }
  }
  return pts;
}

function run(cfg) {
  const wallMm = Number(cfg.wallThicknessMm) || 12.7;
  const outerW = Number(cfg.outerWidthMm) || 48;
  const outerH = Number(cfg.outerHeightMm) || 40;
  const cornerR = Number(cfg.cornerRadiusMm) || 4;
  const totalDepth = Number(cfg.totalDepthMm) || 18;
  const roundR = Number(cfg.roundStoneRadiusMm) || 0.5;
  const bagL = Number(cfg.baguetteHalfLengthMm) || 2;
  const bagW = Number(cfg.baguetteHalfWidthMm) || 1;
  const outlineCount = Math.min(96, Math.max(20, parseInt(cfg.outlineRoundCount, 10) || 44));
  const cageCols = Math.min(10, Math.max(3, parseInt(cfg.cageGridCols, 10) || 6));
  const cageRows = Math.min(10, Math.max(3, parseInt(cfg.cageGridRows, 10) || 5));
  const cageHoleR = Number(cfg.cageHoleRadiusMm) || 0.85;
  const digit = String(cfg.connectorDigit || '6').slice(0, 1);
  const chainSlotW = Number(cfg.chainClearanceMm) > 0 ? Number(cfg.chainClearanceMm) + 0.6 : 26.6;
  const sixDepth = Number(cfg.sixExtrudeDepthMm) || 5;
  const sixFontSize = Number(cfg.sixFontSizeMm) || 22;
  const fontPath = cfg.fontFile && fs.existsSync(cfg.fontFile) ? cfg.fontFile : DEFAULT_FONT;
  const font = opentype.loadSync(fontPath);

  const innerW = Math.max(6, outerW - 2 * wallMm);
  const innerH = Math.max(6, outerH - 2 * wallMm);

  const outerShape = roundedRectShape(outerW, outerH, cornerR);
  const ir = Math.max(0.4, cornerR - wallMm * 0.9);
  const iw = innerW,
    ih = innerH;
  const ix = -iw / 2,
    iy = -ih / 2;
  const innerPath = new THREE.Path();
  innerPath.moveTo(ix + ir, iy);
  innerPath.lineTo(ix + iw - ir, iy);
  innerPath.quadraticCurveTo(ix + iw, iy, ix + iw, iy + ir);
  innerPath.lineTo(ix + iw, iy + ih - ir);
  innerPath.quadraticCurveTo(ix + iw, iy + ih, ix + iw - ir, iy + ih);
  innerPath.lineTo(ix + ir, iy + ih);
  innerPath.quadraticCurveTo(ix, iy + ih, ix, iy + ih - ir);
  innerPath.lineTo(ix, iy + ir);
  innerPath.quadraticCurveTo(ix, iy, ix + ir, iy);
  outerShape.holes.push(innerPath);

  let frameGeom = ensureCsgAttributes(
    new THREE.ExtrudeGeometry(outerShape, {
      depth: totalDepth,
      bevelEnabled: false,
      curveSegments: 8,
      steps: 1,
    }),
  );

  const evaluator = new Evaluator();
  let body = new Brush(frameGeom);
  body.updateMatrixWorld(true);

  const cageHoleDepth = Math.min(totalDepth * 0.55, totalDepth - 0.5);
  const holeBrushes = [];
  for (let i = 0; i < cageCols; i++) {
    for (let j = 0; j < cageRows; j++) {
      const u = (i + 0.5) / cageCols - 0.5;
      const v = (j + 0.5) / cageRows - 0.5;
      const cx = u * outerW * 0.88;
      const cy = v * outerH * 0.88;
      if (!inFrameRing(cx, cy, outerW * 0.98, outerH * 0.98, innerW * 1.02, innerH * 1.02)) continue;
      const cyl = new THREE.CylinderGeometry(cageHoleR, cageHoleR, cageHoleDepth, 10);
      cyl.rotateX(Math.PI / 2);
      cyl.translate(cx, cy, cageHoleDepth / 2 + 0.1);
      holeBrushes.push(new Brush(ensureCsgAttributes(cyl)));
    }
  }
  if (holeBrushes.length) {
    holeBrushes.forEach((b) => b.updateMatrixWorld(true));
    const holesUnion = unionBrushes(evaluator, holeBrushes);
    body = evaluator.evaluate(body, holesUnion, SUBTRACTION);
  }

  const seatBrushes = [];
  const outlinePts = ringPoints2D(outerW - roundR * 3, outerH - roundR * 3, cornerR, outlineCount);
  const step = Math.max(1, Math.floor(outlinePts.length / outlineCount));
  const seatDepth = Math.min(totalDepth * 0.48, 2.0);
  for (let i = 0; i < outlinePts.length; i += step) {
    const [px, py] = outlinePts[i % outlinePts.length];
    const cyl = new THREE.CylinderGeometry(roundR, roundR, seatDepth, 10);
    cyl.rotateX(Math.PI / 2);
    cyl.translate(px, py, totalDepth - seatDepth / 2 - 0.06);
    seatBrushes.push(new Brush(ensureCsgAttributes(cyl)));
  }
  for (let u = -1; u <= 1; u += 0.45) {
    for (let v = -1; v <= 1; v += 0.45) {
      const px = u * ((outerW + innerW) / 4) * 0.92;
      const py = v * ((outerH + innerH) / 4) * 0.92;
      if (!inFrameRing(px, py, outerW * 0.95, outerH * 0.95, innerW * 1.05, innerH * 1.05)) continue;
      const bd = Math.min(totalDepth * 0.42, 1.75);
      const box = new THREE.BoxGeometry(bagL * 2, bagW * 2, bd);
      box.translate(px, py, totalDepth - bd / 2 - 0.08);
      seatBrushes.push(new Brush(ensureCsgAttributes(box)));
    }
  }
  if (seatBrushes.length) {
    seatBrushes.forEach((b) => b.updateMatrixWorld(true));
    const seatsUnion = unionBrushes(evaluator, seatBrushes);
    body = evaluator.evaluate(body, seatsUnion, SUBTRACTION);
  }

  const mainMesh = new THREE.Mesh(body.geometry, new THREE.MeshStandardMaterial());

  const { geom: sixGeom, box: sixBox } = extrudeChar(font, digit, sixFontSize, sixDepth);
  const slotDepth = sixDepth + 0.8;
  const slot = new THREE.BoxGeometry(chainSlotW, 5, slotDepth);
  const sz = sixBox.getSize(new THREE.Vector3());
  slot.translate(0, -sz.y * 0.38 - 1.2, sixDepth / 2);
  const slotBr = new Brush(ensureCsgAttributes(slot));
  slotBr.updateMatrixWorld(true);
  let sixBrush = new Brush(sixGeom);
  sixBrush.updateMatrixWorld(true);
  const ev2 = new Evaluator();
  const sixResult = ev2.evaluate(sixBrush, slotBr, SUBTRACTION);
  const sixMesh = new THREE.Mesh(sixResult.geometry, new THREE.MeshStandardMaterial());

  const outBase = cfg.outBase || path.join(ROOT, 'generated', 'complex_pendant');
  const mainPath = `${outBase}_main.obj`;
  const sixPath = `${outBase}_six.obj`;
  writeObjStreamingSync(mainMesh, mainPath, `${path.basename(outBase)}_main`);
  writeObjStreamingSync(sixMesh, sixPath, `${path.basename(outBase)}_six`);
  stlWrite(mainMesh, `${outBase}_main.stl`);
  stlWrite(sixMesh, `${outBase}_six.stl`);

  return {
    ok: true,
    mainObj: path.relative(ROOT, mainPath).replace(/\\/g, '/'),
    sixObj: path.relative(ROOT, sixPath).replace(/\\/g, '/'),
    mainStl: path.relative(ROOT, `${outBase}_main.stl`).replace(/\\/g, '/'),
    sixStl: path.relative(ROOT, `${outBase}_six.stl`).replace(/\\/g, '/'),
  };
}

const cfgPath = process.argv[2];
if (!cfgPath) {
  console.error('Usage: node complex-pendant-build.mjs <config.json>');
  process.exit(1);
}
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
try {
  console.log(JSON.stringify(run(cfg)));
} catch (e) {
  console.error(e);
  process.exit(1);
}
