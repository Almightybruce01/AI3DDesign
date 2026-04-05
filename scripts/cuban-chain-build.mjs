/**
 * Miami Cuban — single-link + box clasp proxies (layout/manufacturing reference).
 * CLI: node scripts/cuban-chain-build.mjs <config.json>
 * Config: { linkWidthMm, thicknessMm, linkLengthAlongMm, clasp: { boxLengthMm, boxWidthMm, boxThicknessMm, tongueLengthMm } }
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

function writeObjStreamingSync(mesh, filepath, objectName = null) {
  const base = objectName || path.basename(filepath, path.extname(filepath));
  fs.writeFileSync(filepath, `# AI3DDesign — Miami Cuban link + clasp proxy\no ${base}\n`);
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

function stadiumShape(L, H) {
  const shape = new THREE.Shape();
  const R = H / 2;
  const straight = Math.max(0.001, L - 2 * R);
  const leftX = -straight / 2 - R;
  shape.moveTo(leftX, -R);
  shape.lineTo(straight / 2, -R);
  shape.absarc(straight / 2 + R, 0, R, -Math.PI / 2, Math.PI / 2, false);
  shape.lineTo(-straight / 2, R);
  shape.absarc(leftX, 0, R, Math.PI / 2, (3 * Math.PI) / 2, false);
  return shape;
}

function bevelExtrudeLink(faceWidthMm, linkLengthAlongMm, thicknessMm) {
  const sh = stadiumShape(linkLengthAlongMm, thicknessMm);
  const g = new THREE.ExtrudeGeometry(sh, {
    depth: faceWidthMm,
    bevelEnabled: true,
    bevelThickness: Math.min(0.35, faceWidthMm * 0.04),
    bevelSize: Math.min(0.28, faceWidthMm * 0.03),
    bevelSegments: 2,
    curveSegments: 24,
  });
  g.rotateY(-Math.PI / 2);
  g.translate(0, 0, faceWidthMm / 2);
  const ng = toNonIndexed(g);
  ng.computeVertexNormals();
  return ng;
}

function toNonIndexed(g) {
  return g.index ? g.toNonIndexed() : g;
}

function boxClaspHalf(size, center) {
  const g = new THREE.BoxGeometry(size.x, size.y, size.z);
  g.translate(center.x, center.y, center.z);
  const ng = toNonIndexed(g);
  ng.computeVertexNormals();
  return ng;
}

function buildMeshes(cfg) {
  const W = Number(cfg.linkWidthMm) || 12;
  const T = Number(cfg.thicknessMm) || W * 0.44;
  const L = Number(cfg.linkLengthAlongMm) || W * 1.16;
  const c = cfg.clasp || {};
  const bL = Number(c.boxLengthMm) || W * 1.58;
  const bW = Number(c.boxWidthMm) || W * 1.12;
  const bT = Number(c.boxThicknessMm) || T * 1.08;
  const tongue = Number(c.tongueLengthMm) || bL * 0.42;

  const linkGeom = bevelExtrudeLink(W, L, T);
  const gap = W * 0.35;
  const offsetX = L / 2 + gap + bL / 2;

  const maleParts = [];
  maleParts.push(boxClaspHalf(new THREE.Vector3(bL * 0.55, bW, bT), new THREE.Vector3(offsetX, 0, 0)));
  maleParts.push(
    boxClaspHalf(
      new THREE.Vector3(tongue * 0.55, bW * 0.35, bT * 0.42),
      new THREE.Vector3(offsetX + bL * 0.22, 0, bT * 0.22),
    ),
  );

  const femaleParts = [];
  femaleParts.push(boxClaspHalf(new THREE.Vector3(bL * 0.52, bW * 1.02, bT * 1.02), new THREE.Vector3(-offsetX, 0, 0)));
  femaleParts.push(
    boxClaspHalf(
      new THREE.Vector3(bL * 0.25, bW * 0.92, bT * 0.35),
      new THREE.Vector3(-offsetX - bL * 0.12, 0, -bT * 0.28),
    ),
  );

  const torus = new THREE.TorusGeometry(W * 0.2, W * 0.06, 12, 32);
  torus.rotateY(Math.PI / 2);
  torus.translate(offsetX + bL * 0.62, bW * 0.55, 0);
  const safety = toNonIndexed(torus);
  safety.computeVertexNormals();

  const merged = mergeGeometries([linkGeom, ...maleParts, ...femaleParts, safety], false);
  merged.computeVertexNormals();
  return merged;
}

function run(cfg) {
  const outBase = cfg.outBase || path.join(ROOT, 'generated', 'cuban_last');
  const geom = buildMeshes(cfg);
  const mesh = new THREE.Mesh(geom);
  mesh.updateMatrixWorld(true);

  const objPath = `${outBase}.obj`;
  const stlPath = `${outBase}.stl`;
  writeObjStreamingSync(mesh, objPath, path.basename(outBase));

  const exporter = new STLExporter();
  const stlBuf = exporter.parse(mesh, { binary: true });
  const outStl =
    stlBuf instanceof DataView
      ? Buffer.from(stlBuf.buffer, stlBuf.byteOffset, stlBuf.byteLength)
      : Buffer.from(stlBuf);
  fs.writeFileSync(stlPath, outStl);

  return {
    ok: true,
    obj: path.relative(ROOT, objPath).replace(/\\/g, '/'),
    stl: path.relative(ROOT, stlPath).replace(/\\/g, '/'),
    linkWidthMm: cfg.linkWidthMm,
    thicknessMm: cfg.thicknessMm,
    linkLengthAlongMm: cfg.linkLengthAlongMm,
  };
}

const cfgPath = process.argv[2];
if (!cfgPath) {
  console.error('Usage: node cuban-chain-build.mjs <config.json>');
  process.exit(1);
}
const raw = fs.readFileSync(cfgPath, 'utf8');
const cfg = JSON.parse(raw);
try {
  const result = run(cfg);
  console.log(JSON.stringify(result));
} catch (e) {
  console.error(e);
  process.exit(1);
}
