'use strict';

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

/**
 * Binary STL: 80-byte header, uint32 tri count LE, 50 bytes/triangle.
 * @returns {{ triangles: number, bbox: { min: number[], max: number[], sizeMm: number[] }, binary: boolean } | null}
 */
function stlStatsFromBuffer(buf) {
  if (!buf || buf.length < 84) return null;
  const head5 = buf.slice(0, 5).toString('ascii').toLowerCase();
  if (head5 === 'solid') {
    const ascii = parseAsciiStl(buf);
    if (ascii) return ascii;
  }
  const n = buf.readUInt32LE(80);
  const expected = 84 + n * 50;
  const looksBinary = n > 0 && n < 50_000_000 && buf.length >= expected;
  if (!looksBinary) return parseAsciiStl(buf);
  if (n < 0 || n > 50_000_000 || buf.length < expected) return null;
  let min = [Infinity, Infinity, Infinity];
  let max = [-Infinity, -Infinity, -Infinity];
  let off = 84;
  for (let i = 0; i < n; i++) {
    off += 12;
    for (let k = 0; k < 3; k++) {
      const x = buf.readFloatLE(off);
      off += 4;
      const y = buf.readFloatLE(off);
      off += 4;
      const z = buf.readFloatLE(off);
      off += 4;
      min[0] = Math.min(min[0], x);
      min[1] = Math.min(min[1], y);
      min[2] = Math.min(min[2], z);
      max[0] = Math.max(max[0], x);
      max[1] = Math.max(max[1], y);
      max[2] = Math.max(max[2], z);
    }
    off += 2;
  }
  return {
    triangles: n,
    binary: true,
    bbox: {
      min,
      max,
      sizeMm: [max[0] - min[0], max[1] - min[1], max[2] - min[2]],
    },
  };
}

function parseAsciiStl(buf) {
  const text = buf.toString('utf8', 0, Math.min(buf.length, 2_000_000));
  const verts = [];
  const re = /vertex\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    verts.push([parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])]);
  }
  if (verts.length < 3) return null;
  let min = [Infinity, Infinity, Infinity];
  let max = [-Infinity, -Infinity, -Infinity];
  for (const [x, y, z] of verts) {
    min[0] = Math.min(min[0], x);
    min[1] = Math.min(min[1], y);
    min[2] = Math.min(min[2], z);
    max[0] = Math.max(max[0], x);
    max[1] = Math.max(max[1], y);
    max[2] = Math.max(max[2], z);
  }
  return {
    triangles: Math.floor(verts.length / 3),
    binary: false,
    bbox: {
      min,
      max,
      sizeMm: [max[0] - min[0], max[1] - min[1], max[2] - min[2]],
    },
  };
}

async function stlStatsFromFile(absPath) {
  const buf = await fs.readFile(absPath);
  return stlStatsFromBuffer(buf);
}

function assertUnderGenerated(root, rel) {
  const clean = path.normalize(String(rel || '').replace(/^\//, '')).replace(/^(\.\.(\/|\\|$))+/, '');
  const full = path.join(root, clean);
  const gen = path.join(root, 'generated');
  if (!full.startsWith(gen)) throw new Error('path must be under generated/');
  if (!fsSync.existsSync(full)) throw new Error('file not found');
  return full;
}

module.exports = {
  stlStatsFromBuffer,
  stlStatsFromFile,
  assertUnderGenerated,
};
