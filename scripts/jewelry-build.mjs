/**
 * Matrix-grade jewelry plate: text + optional bail, backing relief, blind gem seats
 * (round: crown + pavilion lathe; baguette: frustum shell).
 * CLI: node jewelry-build.mjs <config.json>
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import opentype from 'opentype.js';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Evaluator, Brush, ADDITION, SUBTRACTION } from 'three-bvh-csg';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { parseSvgFileToComponents } from './vector-import.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DEFAULT_FONT = path.join(ROOT, 'fonts', 'BebasNeue-Regular.ttf');
const OUT_DIR = path.join(ROOT, 'generated');

/** three-bvh-csg: UV + normals on every mesh; non-indexed avoids attr mismatch in unions */
/** Streamed OBJ — avoids max string length on dense iced meshes */
function writeObjStreamingSync(mesh, filepath, objectName = null) {
  const base = objectName || path.basename(filepath, path.extname(filepath));
  fs.writeFileSync(filepath, `# AI3DDesign — Matrix jewelry export\no ${base}\n`);
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
    if (block.length > 524_288) flush();
  };
  for (let i = 0; i < pos.count; i++) {
    push(`v ${pos.getX(i)} ${pos.getY(i)} ${pos.getZ(i)}\n`);
  }
  flush();
  if (idx) {
    for (let i = 0; i < idx.count; i += 3) {
      const a = idx.getX(i) + 1;
      const b = idx.getX(i + 1) + 1;
      const c = idx.getX(i + 2) + 1;
      push(`f ${a} ${b} ${c}\n`);
    }
  } else {
    for (let i = 0; i < pos.count; i += 3) {
      push(`f ${i + 1} ${i + 2} ${i + 3}\n`);
    }
  }
  flush();
}

function ensureCsgAttributes(geom) {
  let g = geom.index ? geom.toNonIndexed() : geom;
  g.computeVertexNormals();
  const pos = g.getAttribute('position');
  if (!pos) return g;
  const n = pos.count;
  if (!g.getAttribute('uv')) {
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  }
  return g;
}

function signedArea(points) {
  let a = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    a += points[i][0] * points[j][1] - points[j][0] * points[i][1];
  }
  return a / 2;
}

function centroid(points) {
  let x = 0,
    y = 0;
  for (const p of points) {
    x += p[0];
    y += p[1];
  }
  const n = points.length || 1;
  return { x: x / n, y: y / n };
}

function pointInPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0],
      yi = poly[i][1];
    const xj = poly[j][0],
      yj = poly[j][1];
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function flattenCubic(x0, y0, x1, y1, x2, y2, x3, y3, segs = 10) {
  const out = [];
  for (let i = 1; i <= segs; i++) {
    const t = i / segs;
    const t2 = t * t,
      t3 = t2 * t;
    const mt = 1 - t,
      mt2 = mt * mt,
      mt3 = mt2 * mt;
    const x = mt3 * x0 + 3 * mt2 * t * x1 + 3 * mt * t2 * x2 + t3 * x3;
    const y = mt3 * y0 + 3 * mt2 * t * y1 + 3 * mt * t2 * y2 + t3 * y3;
    out.push([x, y]);
  }
  return out;
}

function flattenQuad(x0, y0, x1, y1, x2, y2, segs = 10) {
  const out = [];
  for (let i = 1; i <= segs; i++) {
    const t = i / segs;
    const mt = 1 - t;
    const x = mt * mt * x0 + 2 * mt * t * x1 + t * t * x2;
    const y = mt * mt * y0 + 2 * mt * t * y1 + t * t * y2;
    out.push([x, y]);
  }
  return out;
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
      const pts = flattenCubic(curX, curY, cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.x, cmd.y);
      current.push(...pts);
      curX = cmd.x;
      curY = cmd.y;
    } else if (cmd.type === 'Q') {
      const pts = flattenQuad(curX, curY, cmd.x1, cmd.y1, cmd.x, cmd.y);
      current.push(...pts);
      curX = cmd.x;
      curY = cmd.y;
    } else if (cmd.type === 'Z') {
      if (current.length > 0) {
        const p0 = current[0];
        const pN = current[current.length - 1];
        if (Math.hypot(pN[0] - p0[0], pN[1] - p0[1]) > 1e-4) {
          current.push([p0[0], p0[1]]);
        }
        contours.push(current);
      }
      current = [];
      curX = startX;
      curY = startY;
    }
  }
  if (current.length > 0) contours.push(current);
  return contours;
}

function classifyContours(contours) {
  const meta = contours
    .filter((c) => c.length >= 3)
    .map((c) => ({
      points: c,
      area: Math.abs(signedArea(c)),
      c: centroid(c),
    }))
    .sort((a, b) => b.area - a.area);

  if (meta.length === 0) return { outer: [], holes: [] };

  const outer = meta[0].points;
  const holes = [];
  for (let i = 1; i < meta.length; i++) {
    if (pointInPolygon(meta[i].c.x, meta[i].c.y, outer)) {
      holes.push(meta[i].points);
    }
  }
  return { outer, holes };
}

function contoursToShape(outer, holes) {
  const shape = new THREE.Shape(outer.map(([x, y]) => new THREE.Vector2(x, -y)));
  for (const h of holes) {
    const p = new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, -y)));
    shape.holes.push(p);
  }
  return shape;
}

function extrudeWord(font, text, fontSize, depth, opts = {}) {
  const useBevel = opts.bevel !== false;
  const advScale = opts.letterAdvanceScale != null ? opts.letterAdvanceScale : 1;
  const scale = fontSize / font.unitsPerEm;
  let penX = 0;
  const geoms = [];
  const letterBoxes = [];
  const outlineRings = [];
  let letterIdx = 0;

  for (const ch of text) {
    if (ch === ' ') {
      const sp = font.charToGlyph(' ');
      penX += sp.advanceWidth * scale * advScale;
      continue;
    }
    const glyph = font.charToGlyph(ch);
    const glyphPath = glyph.getPath(penX, 0, fontSize);
    const contours = pathToContours(glyphPath);
    penX += glyph.advanceWidth * scale * advScale;

    if (contours.length === 0) continue;

    const { outer, holes } = classifyContours(contours);
    if (outer.length < 3) continue;

    outlineRings.push({
      kind: 'outer',
      letterIndex: letterIdx,
      points: outer.map(([x, y]) => [x, -y]).map((p) => [...p]),
    });
    for (const hole of holes) {
      outlineRings.push({
        kind: 'hole',
        letterIndex: letterIdx,
        points: hole.map(([x, y]) => [x, -y]).map((p) => [...p]),
      });
    }

    const curveSeg = opts.curveSegments ?? 16;
    const bevSeg = useBevel ? Math.min(2, Math.max(1, opts.bevelSegments ?? 2)) : 0;
    const shape = contoursToShape(outer, holes);
    const geom = new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: useBevel,
      bevelThickness: useBevel ? 0.26 : 0,
      bevelSize: useBevel ? 0.2 : 0,
      bevelOffset: 0,
      bevelSegments: bevSeg,
      curveSegments: curveSeg,
      steps: 1,
    });
    geom.computeBoundingBox();
    const b = geom.boundingBox;
    letterBoxes.push({
      minX: b.min.x,
      maxX: b.max.x,
      minY: b.min.y,
      maxY: b.max.y,
    });
    geoms.push(geom);
    letterIdx += 1;
  }

  if (geoms.length === 0) throw new Error('No geometry for text');

  const mergedBox = new THREE.Box3();
  for (const g of geoms) {
    g.computeBoundingBox();
    mergedBox.union(g.boundingBox);
  }

  const center = mergedBox.getCenter(new THREE.Vector3());
  const off = new THREE.Vector3(-center.x, -center.y, -depth / 2);

  for (const g of geoms) {
    g.translate(off.x, off.y, off.z);
  }

  for (const box of letterBoxes) {
    box.minX += off.x;
    box.maxX += off.x;
    box.minY += off.y;
    box.maxY += off.y;
  }

  for (const ring of outlineRings) {
    for (const p of ring.points) {
      p[0] += off.x;
      p[1] += off.y;
    }
  }

  const baseGeom = mergeGeometries(geoms, false);
  for (const g of geoms) g.dispose();

  return {
    baseGeom,
    letterBoxes,
    mergedBoxSize: mergedBox.getSize(new THREE.Vector3()),
    outlineRings,
  };
}

/** Traced / authored SVG contours → same mesh + ring structure as extrudeWord (potrace / vector scan). */
function extrudeFromComponents(components, depth, opts = {}) {
  const useBevel = opts.bevel !== false;
  const curveSeg = opts.curveSegments ?? 16;
  const bevSeg = useBevel ? Math.min(2, Math.max(1, opts.bevelSegments ?? 2)) : 0;
  const geoms = [];
  const letterBoxes = [];
  const outlineRings = [];
  let letterIdx = 0;

  for (const { outer, holes } of components) {
    if (outer.length < 3) continue;
    outlineRings.push({
      kind: 'outer',
      letterIndex: letterIdx,
      points: outer.map(([x, y]) => [x, -y]).map((p) => [...p]),
    });
    for (const h of holes) {
      outlineRings.push({
        kind: 'hole',
        letterIndex: letterIdx,
        points: h.map(([x, y]) => [x, -y]).map((p) => [...p]),
      });
    }
    const shape = contoursToShape(outer, holes);
    const geom = new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: useBevel,
      bevelThickness: useBevel ? 0.26 : 0,
      bevelSize: useBevel ? 0.2 : 0,
      bevelOffset: 0,
      bevelSegments: bevSeg,
      curveSegments: curveSeg,
      steps: 1,
    });
    geom.computeBoundingBox();
    const b = geom.boundingBox;
    letterBoxes.push({
      minX: b.min.x,
      maxX: b.max.x,
      minY: b.min.y,
      maxY: b.max.y,
    });
    geoms.push(geom);
    letterIdx += 1;
  }

  if (geoms.length === 0) throw new Error('No extrudable regions in SVG (check paths are closed).');

  const mergedBox = new THREE.Box3();
  for (const g of geoms) {
    g.computeBoundingBox();
    mergedBox.union(g.boundingBox);
  }

  const center = mergedBox.getCenter(new THREE.Vector3());
  const off = new THREE.Vector3(-center.x, -center.y, -depth / 2);

  for (const g of geoms) g.translate(off.x, off.y, off.z);
  for (const box of letterBoxes) {
    box.minX += off.x;
    box.maxX += off.x;
    box.minY += off.y;
    box.maxY += off.y;
  }
  for (const ring of outlineRings) {
    for (const p of ring.points) {
      p[0] += off.x;
      p[1] += off.y;
    }
  }

  const baseGeom = mergeGeometries(geoms, false);
  for (const g of geoms) g.dispose();

  return {
    baseGeom,
    letterBoxes,
    mergedBoxSize: mergedBox.getSize(new THREE.Vector3()),
    outlineRings,
  };
}

function ringCentroid2(ring) {
  let x = 0,
    y = 0;
  for (const p of ring) {
    x += p[0];
    y += p[1];
  }
  const n = ring.length || 1;
  return { x: x / n, y: y / n };
}

function resampleClosedRing(ring, maxSegLen) {
  if (ring.length < 2) return [];
  const out = [];
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const p0 = ring[i];
    const p1 = ring[(i + 1) % n];
    const d = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    const steps = Math.max(1, Math.ceil(d / maxSegLen));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      out.push([p0[0] + t * (p1[0] - p0[0]), p0[1] + t * (p1[1] - p0[1])]);
    }
  }
  return out;
}

function outwardNormal2(ring, i, cen) {
  const n = ring.length;
  const p = ring[i];
  const prev = ring[(i - 1 + n) % n];
  const next = ring[(i + 1) % n];
  let tx = next[0] - prev[0];
  let ty = next[1] - prev[1];
  const len = Math.hypot(tx, ty) || 1;
  tx /= len;
  ty /= len;
  let nx = ty;
  let ny = -tx;
  const vx = p[0] - cen.x;
  const vy = p[1] - cen.y;
  if (nx * vx + ny * vy < 0) {
    nx = -nx;
    ny = -ny;
  }
  return [nx, ny];
}

/** Pavé along real glyph outlines (outer perimeter + void edges), 2–3 rows — matches iced border look */
function makeOutlinePaveRings(rings, halfThickness, seatDepth, rStone, stepAlong, rowOffsetsMm, elite, latheSegs = 22) {
  const cylSegs = Math.max(8, Math.round(latheSegs * 0.75));
  const geoms = [];
  for (const { points } of rings) {
    if (points.length < 3) continue;
    const cen = ringCentroid2(points);
    const res = resampleClosedRing(points, stepAlong);
    const M = res.length;
    if (M < 3) continue;
    for (let i = 0; i < M; i++) {
      const p = res[i];
      const [nx, ny] = outwardNormal2(res, i, cen);
      for (const row of rowOffsetsMm) {
        const px = p[0] + nx * row;
        const py = p[1] + ny * row;
        if (elite) {
          geoms.push(placeSeatOnTop(roundBrilliantSeat(rStone * 1.03, seatDepth, latheSegs), px, py, halfThickness));
        } else {
          const cyl = new THREE.CylinderGeometry(rStone, rStone, seatDepth, cylSegs);
          cyl.rotateX(Math.PI / 2);
          cyl.translate(px, py, halfThickness - seatDepth / 2);
          geoms.push(ensureCsgAttributes(cyl));
        }
      }
    }
  }
  return geoms;
}

function unionBrushesBatched(evaluator, brushes, batchSize = 36) {
  if (brushes.length === 0) return null;
  if (brushes.length === 1) return brushes[0];
  let layers = [];
  for (let i = 0; i < brushes.length; i += batchSize) {
    const slice = brushes.slice(i, i + batchSize);
    layers.push(unionBrushes(evaluator, slice));
  }
  while (layers.length > 1) {
    const next = [];
    for (let i = 0; i < layers.length; i += 2) {
      if (i + 1 < layers.length) {
        const a = layers[i];
        const b = layers[i + 1];
        a.updateMatrixWorld(true);
        b.updateMatrixWorld(true);
        next.push(evaluator.evaluate(a, b, ADDITION));
      } else {
        next.push(layers[i]);
      }
    }
    layers = next;
  }
  return layers[0];
}

function unionLetterBoxes(letterBoxes) {
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const b of letterBoxes) {
    minX = Math.min(minX, b.minX);
    maxX = Math.max(maxX, b.maxX);
    minY = Math.min(minY, b.minY);
    maxY = Math.max(maxY, b.maxY);
  }
  return { minX, maxX, minY, maxY };
}

/** Backing slab: rear flush with plate; front recessed so letters read prouder in +Z */
function backingSlabGeometry(u, margin, tBack, halfThickness) {
  const w = (u.maxX - u.minX) * margin;
  const h = (u.maxY - u.minY) * margin;
  const cx = (u.minX + u.maxX) / 2;
  const cy = (u.minY + u.maxY) / 2;
  const g = new THREE.BoxGeometry(w, h, tBack);
  const zc = -halfThickness + tBack / 2;
  g.translate(cx, cy, zc);
  return g;
}

/**
 * Round brilliant–style blind seat: flat crown + tapering pavilion (lathe), opening at +Z local.
 */
function roundBrilliantSeat(rTable, seatDepth, segs = 28) {
  const pts = [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(rTable * 0.1, seatDepth * 0.32),
    new THREE.Vector2(rTable * 0.68, seatDepth * 0.74),
    new THREE.Vector2(rTable * 0.96, seatDepth * 0.94),
    new THREE.Vector2(rTable, seatDepth),
  ];
  const lathe = new THREE.LatheGeometry(pts, segs);
  lathe.rotateX(-Math.PI / 2);
  return ensureCsgAttributes(lathe);
}

/** Rectangular frustum seat (baguette taper); indexed mesh for stable CSG. */
function baguetteFrustumSeat(wTop, lTop, seatDepth, taper = 0.74) {
  const wBot = wTop * taper;
  const lBot = lTop * taper;
  const hxT = wTop / 2,
    hyT = lTop / 2,
    hxB = wBot / 2,
    hyB = lBot / 2;
  const p = new Float32Array([
    -hxT, -hyT, 0, hxT, -hyT, 0, hxT, hyT, 0, -hxT, hyT, 0, -hxB, -hyB, -seatDepth, hxB, -hyB, -seatDepth, hxB, hyB, -seatDepth, -hxB, hyB, -seatDepth,
  ]);
  const idx = [
    0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 1, 5, 6, 1, 6, 2, 2, 6, 7, 2, 7, 3, 3, 7, 4, 3, 4, 0,
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  g.setIndex(idx);
  return ensureCsgAttributes(g);
}

function placeSeatOnTop(geom, px, py, halfThickness) {
  const g = geom.clone();
  ensureCsgAttributes(g);
  g.translate(px, py, halfThickness - 0.002);
  return g;
}

/** Baguette grid only inside glyph fill (outer contour minus counters); matches iced letter channels. */
function makeBaguetteSeats(
  letterBoxes,
  outlineRings,
  halfThickness,
  seatDepth,
  bagW,
  bagL,
  stepX,
  stepY,
  elite,
  inset = 0.32,
) {
  const geoms = [];
  const tw = 0.88;
  for (let li = 0; li < letterBoxes.length; li++) {
    const box = letterBoxes[li];
    const outers = outlineRings.filter((r) => r.letterIndex === li && r.kind === 'outer');
    const counters = outlineRings.filter((r) => r.letterIndex === li && r.kind === 'hole');
    const outer = outers[0];
    if (!outer || outer.points.length < 3) continue;

    const x0 = box.minX + stepX * inset;
    const x1 = box.maxX - stepX * inset;
    const y0 = box.minY + stepY * inset;
    const y1 = box.maxY - stepY * inset;
    for (let px = x0; px < x1; px += stepX) {
      for (let py = y0; py < y1; py += stepY) {
        if (!pointInPolygon(px, py, outer.points)) continue;
        if (counters.some((h) => pointInPolygon(px, py, h.points))) continue;

        const vertical = (Math.round(px / stepX) + Math.round(py / stepY)) % 2 === 0;
        const wT = vertical ? bagW * tw : bagL * tw;
        const lT = vertical ? bagL * tw : bagW * tw;
        let g;
        if (elite) {
          g = baguetteFrustumSeat(wT, lT, seatDepth, 0.74);
        } else {
          g = vertical
            ? new THREE.BoxGeometry(bagW, bagL, seatDepth)
            : new THREE.BoxGeometry(bagL, bagW, seatDepth);
          g.translate(px, py, halfThickness - seatDepth / 2);
          geoms.push(ensureCsgAttributes(g));
          continue;
        }
        geoms.push(placeSeatOnTop(g, px, py, halfThickness));
      }
    }
  }
  return geoms;
}

function makeHaloSeats(sizeX, sizeY, halfThickness, seatDepth, pad, r, count, elite, latheSegs = 24) {
  const w = sizeX / 2 + pad;
  const h = sizeY / 2 + pad;
  const geoms = [];
  const n = Math.max(count, 8);

  const bottom = { x0: -w, y0: -h, x1: w, y1: -h };
  const right = { x0: w, y0: -h, x1: w, y1: h };
  const top = { x0: w, y0: h, x1: -w, y1: h };
  const left = { x0: -w, y0: h, x1: -w, y1: -h };
  const sides = [bottom, right, top, left];
  const lens = sides.map((s) => Math.hypot(s.x1 - s.x0, s.y1 - s.y0));
  const perim = lens.reduce((a, b) => a + b, 0);

  for (let i = 0; i < n; i++) {
    let d = (i / n) * perim;
    let side = 0;
    while (side < 4 && d > lens[side]) {
      d -= lens[side];
      side++;
    }
    if (side >= 4) side = 3;
    const s = sides[side];
    const t = lens[side] > 1e-6 ? d / lens[side] : 0;
    const x = s.x0 + t * (s.x1 - s.x0);
    const y = s.y0 + t * (s.y1 - s.y0);
    if (elite) {
      const lathe = roundBrilliantSeat(r * 1.02, seatDepth, latheSegs);
      geoms.push(placeSeatOnTop(lathe, x, y, halfThickness));
    } else {
      const cyl = new THREE.CylinderGeometry(r, r, seatDepth, Math.max(10, latheSegs));
      cyl.rotateX(Math.PI / 2);
      cyl.translate(x, y, halfThickness - seatDepth / 2);
      geoms.push(ensureCsgAttributes(cyl));
    }
  }

  return geoms;
}

function makeBailSeats(cx, cy, majorR, halfThickness, seatDepth, rSmall, count, elite, latheSegs = 20) {
  const geoms = [];
  for (let i = 0; i < count; i++) {
    const u = (i / count) * Math.PI * 2;
    const x = cx + Math.cos(u) * majorR;
    const y = cy + Math.sin(u) * majorR;
    if (elite) {
      const lathe = roundBrilliantSeat(rSmall * 1.05, seatDepth, latheSegs);
      geoms.push(placeSeatOnTop(lathe, x, y, halfThickness));
    } else {
      const cyl = new THREE.CylinderGeometry(rSmall, rSmall, seatDepth, Math.max(8, latheSegs));
      cyl.rotateX(Math.PI / 2);
      cyl.translate(x, y, halfThickness - seatDepth / 2);
      geoms.push(ensureCsgAttributes(cyl));
    }
  }
  return geoms;
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

function buildBailTorus(unionBox, halfThickness, evaluator, baseBrush, printTight = false) {
  const { minX, maxX, maxY } = unionBox;
  const cx = (minX + maxX) / 2;
  const majorR = Math.max(3.5, (maxX - minX) * 0.078);
  const minorR = halfThickness * 0.9;
  const cy = maxY + majorR * 0.72;

  const tube = printTight ? 8 : 12;
  const rad = printTight ? 28 : 40;
  const torus = new THREE.TorusGeometry(majorR, minorR, tube, rad, Math.PI * 1.28);
  torus.rotateX(Math.PI / 2);
  torus.translate(cx, cy, 0);
  ensureCsgAttributes(torus);

  const bailBrush = new Brush(torus);
  bailBrush.updateMatrixWorld(true);
  return {
    combined: evaluator.evaluate(baseBrush, bailBrush, ADDITION),
    bailMeta: { cx, cy, majorR, minorR },
  };
}

export function runBuild(rawConfig) {
  const config = {
    text: String(rawConfig.text || 'BRUCE').toUpperCase().replace(/[^A-Z0-9 ]/g, ''),
    targetLengthMm: Number(rawConfig.targetLengthMm) || Number(rawConfig.targetWidthMm) || 48,
    targetHeightMm: Number(rawConfig.targetHeightMm) || null,
    plateDepthMm: Number(rawConfig.plateDepthMm) || 2.2,
    seatDepthRatio: Math.min(0.9, Math.max(0.38, Number(rawConfig.seatDepthRatio) || 0.72)),
    reliefMm: rawConfig.reliefMm != null ? Number(rawConfig.reliefMm) : null,
    reliefRatio: Math.min(0.45, Math.max(0.06, Number(rawConfig.reliefRatio) || 0.14)),
    addBail: rawConfig.addBail !== false,
    roundCount: parseInt(rawConfig.roundCount, 10) || 36,
    backingMargin: Number(rawConfig.backingMargin) || 1.04,
    eliteSeats: rawConfig.eliteSeats !== false,
    exactEnvelope: rawConfig.exactEnvelope === true,
    /** Fewer triangles + fewer CSG cutters → smaller STL/OBJ, faster slice (detail trade-off) */
    printTight: rawConfig.printTight === true /** Denser mesh + fewer seats for faster slice */,
    /** Photo-style iced plate: triple-row outline pavé, denser baguettes & frame (more CSG time) */
    referenceIced: rawConfig.referenceIced === true,
    letterAdvanceScale:
      rawConfig.letterAdvanceScale != null ? Number(rawConfig.letterAdvanceScale) : 1,
    fontFile: rawConfig.fontFile || DEFAULT_FONT,
    outBase: rawConfig.outBase || path.join(OUT_DIR, 'jewelry_last'),
    vectorSvgPath: rawConfig.vectorSvgPath
      ? path.isAbsolute(String(rawConfig.vectorSvgPath))
        ? String(rawConfig.vectorSvgPath)
        : path.join(ROOT, String(rawConfig.vectorSvgPath).replace(/^\//, ''))
      : null,
    vectorCurveSteps: Math.min(18, Math.max(3, parseInt(rawConfig.vectorCurveSteps, 10) || 6)),
  };

  const pt = config.printTight;
  const ref = config.referenceIced;
  const latheSegs = pt ? 12 : 22;

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const plateDepth = config.plateDepthMm;
  let lettersGeom;
  let letterBoxes;
  let mergedBoxSize;
  let outlineRings;

  if (config.vectorSvgPath) {
    if (!fs.existsSync(config.vectorSvgPath)) {
      throw new Error(`Vector SVG not found: ${config.vectorSvgPath}`);
    }
    const components = parseSvgFileToComponents(config.vectorSvgPath, config.vectorCurveSteps);
    if (components.length === 0) {
      throw new Error('SVG trace produced no regions. Try invert/threshold or a high-contrast silhouette.');
    }
    ({
      baseGeom: lettersGeom,
      letterBoxes,
      mergedBoxSize,
      outlineRings,
    } = extrudeFromComponents(components, plateDepth, {
      bevel: !pt,
      curveSegments: pt ? 12 : ref ? 20 : 16,
    }));
  } else {
    if (!fs.existsSync(config.fontFile)) {
      throw new Error(`Font not found: ${config.fontFile}`);
    }
    const fontSize = 64;
    const fontBuf = fs.readFileSync(config.fontFile);
    const font = opentype.parse(fontBuf.buffer.slice(fontBuf.byteOffset, fontBuf.byteOffset + fontBuf.byteLength));
    ({ baseGeom: lettersGeom, letterBoxes, mergedBoxSize, outlineRings } = extrudeWord(
      font,
      config.text,
      fontSize,
      plateDepth,
      {
        bevel: !pt,
        curveSegments: pt ? 12 : ref ? 20 : 16,
        letterAdvanceScale: config.letterAdvanceScale,
      },
    ));
  }

  let s = 1;
  let sx = 1;
  let sy = 1;
  if (config.exactEnvelope && config.targetHeightMm != null && config.targetHeightMm > 0) {
    sx = config.targetLengthMm / Math.max(mergedBoxSize.x, 1e-6);
    sy = config.targetHeightMm / Math.max(mergedBoxSize.y, 1e-6);
    lettersGeom.scale(sx, sy, 1);
    for (const box of letterBoxes) {
      box.minX *= sx;
      box.maxX *= sx;
      box.minY *= sy;
      box.maxY *= sy;
    }
    s = Math.sqrt(sx * sy);
  } else if (config.targetHeightMm != null && config.targetHeightMm > 0) {
    const sL = config.targetLengthMm / Math.max(mergedBoxSize.x, 1e-6);
    const sH = config.targetHeightMm / Math.max(mergedBoxSize.y, 1e-6);
    s = Math.min(sL, sH);
    lettersGeom.scale(s, s, 1);
    for (const box of letterBoxes) {
      box.minX *= s;
      box.maxX *= s;
      box.minY *= s;
      box.maxY *= s;
    }
    sx = sy = s;
  } else {
    s = config.targetLengthMm / Math.max(mergedBoxSize.x, 1e-6);
    sx = sy = s;
    lettersGeom.scale(s, s, 1);
    for (const box of letterBoxes) {
      box.minX *= s;
      box.maxX *= s;
      box.minY *= s;
      box.maxY *= s;
    }
  }

  for (const ring of outlineRings) {
    for (const p of ring.points) {
      p[0] *= sx;
      p[1] *= sy;
    }
  }

  const scaledW = mergedBoxSize.x * sx;
  const scaledH = mergedBoxSize.y * sy;
  const plateDepthScaled = plateDepth;
  const halfThickness = plateDepthScaled / 2;
  const reliefMm =
    config.reliefMm != null
      ? Math.min(config.reliefMm, plateDepthScaled * 0.4)
      : plateDepthScaled * config.reliefRatio;
  const tBack = Math.max(plateDepthScaled * 0.35, plateDepthScaled - reliefMm);

  const u = unionLetterBoxes(letterBoxes);
  const slabGeom = backingSlabGeometry(u, config.backingMargin, tBack, halfThickness);

  const seatDepth = Math.min(plateDepthScaled - 0.15, plateDepthScaled * config.seatDepthRatio);

  const evaluator = new Evaluator();
  evaluator.useGroups = false;

  ensureCsgAttributes(lettersGeom);
  ensureCsgAttributes(slabGeom);

  let lettersBrush = new Brush(lettersGeom);
  lettersBrush.updateMatrixWorld(true);

  const slabBrush = new Brush(slabGeom);
  slabBrush.updateMatrixWorld(true);

  let bodyBrush = evaluator.evaluate(lettersBrush, slabBrush, ADDITION);

  let bailSeats = [];
  if (config.addBail) {
    const { combined, bailMeta } = buildBailTorus(u, halfThickness, evaluator, bodyBrush, pt);
    bodyBrush = combined;
    const bailN = pt ? 14 : ref ? 36 : 26;
    bailSeats = makeBailSeats(
      bailMeta.cx,
      bailMeta.cy,
      bailMeta.majorR,
      halfThickness,
      seatDepth,
      0.48 * s,
      bailN,
      config.eliteSeats,
      latheSegs,
    );
  }
  const bagMul = pt ? 1.9 : ref ? 1.06 : 1;
  const bagW = 0.78 * s;
  const bagL = 2.95 * s;
  const stepX = 1.42 * s * bagMul;
  const stepY = 1.52 * s * bagMul;

  const bagGeomList = makeBaguetteSeats(
    letterBoxes,
    outlineRings,
    halfThickness,
    seatDepth,
    bagW,
    bagL,
    stepX,
    stepY,
    config.eliteSeats,
    ref ? 0.22 : 0.32,
  );
  const rRound = Math.max(0.48, 0.72 * s);
  const stepAlongBase = pt ? Math.max(2.25, rRound * 3.45) : Math.max(1.55, rRound * 2.75);
  const stepAlong = ref && !pt ? stepAlongBase * 0.8 : stepAlongBase;
  const rowOffsets = pt
    ? [rRound * 0.52, rRound * 1.95]
    : ref
      ? [rRound * 0.4, rRound * 1.22, rRound * 2.08]
      : [rRound * 0.5, rRound * 2.12];
  const outlinePaveList = makeOutlinePaveRings(
    outlineRings,
    halfThickness,
    seatDepth,
    rRound,
    stepAlong,
    rowOffsets,
    config.eliteSeats,
    latheSegs,
  );
  const frameCount = pt ? Math.min(config.roundCount, 28) : Math.max(config.roundCount, 40);
  const frameRounds = makeHaloSeats(
    scaledW,
    scaledH,
    halfThickness,
    seatDepth,
    1.35 * s,
    rRound * 0.92,
    frameCount,
    config.eliteSeats,
    latheSegs,
  );

  const holeGeoms = [...bagGeomList, ...outlinePaveList, ...frameRounds, ...bailSeats].filter(Boolean);
  if (holeGeoms.length === 0) throw new Error('No seats generated');

  const holeBrushes = holeGeoms.map((hg) => {
    const br = new Brush(hg);
    br.updateMatrixWorld(true);
    return br;
  });

  const batchHole = pt ? 52 : ref ? 28 : 32;
  const holesUnion = unionBrushesBatched(evaluator, holeBrushes, batchHole);
  const result = evaluator.evaluate(bodyBrush, holesUnion, SUBTRACTION);
  result.updateMatrixWorld(true);

  const mesh = new THREE.Mesh(result.geometry, new THREE.MeshStandardMaterial());
  const stlView = new STLExporter().parse(mesh, { binary: true });

  const objPath = `${config.outBase}.obj`;
  const cadPath = `${config.outBase}.cad`;
  const stlPath = `${config.outBase}.stl`;
  writeObjStreamingSync(mesh, objPath, path.basename(objPath, '.obj'));
  fs.writeFileSync(cadPath, Buffer.from(stlView.buffer));
  fs.writeFileSync(stlPath, Buffer.from(stlView.buffer));

  return {
    objPath,
    cadPath,
    stlPath,
    config: {
      ...config,
      seatDepthMm: seatDepth,
      halfThicknessMm: halfThickness,
      xyScale: s,
      scaleXY: { sx, sy },
      scaledSizeMm: { x: scaledW, y: scaledH, z: plateDepthScaled },
      reliefMm,
      tBackMm: tBack,
    },
  };
}

function main() {
  const cfgPath = process.argv[2];
  if (!cfgPath) {
    console.error('Usage: node jewelry-build.mjs <config.json>');
    process.exit(1);
  }
  const raw = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  const { objPath, cadPath, stlPath, config } = runBuild(raw);
  console.log(JSON.stringify({ ok: true, objPath, cadPath, stlPath, config }));
}

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv[2]) {
  main();
}

