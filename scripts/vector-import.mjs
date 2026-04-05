/**
 * SVG / potrace path → nested contours → same structure as font-based extrusion.
 * Coordinates: y-up (jewelry-build XY plane matches opentype paths after flip).
 */
import fs from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const parseSVGPath = require('svg-path-parser');

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

function flattenCubic(x0, y0, x1, y1, x2, y2, x3, y3, segs) {
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

function flattenQuad(x0, y0, x1, y1, x2, y2, segs) {
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

/** Flatten SVG path d to closed loops in SVG pixels (y-down). */
export function pathDToLoops(d, curveSteps = 5) {
  let cmds;
  try {
    cmds = parseSVGPath.makeAbsolute(parseSVGPath(d));
  } catch {
    return [];
  }
  const loops = [];
  let current = [];
  let subStart = null;
  let px = 0,
    py = 0;
  let lastCpx = 0,
    lastCpy = 0;
  let lastQpx = 0,
    lastQpy = 0;

  const flushLoop = () => {
    if (current.length > 2) {
      const p0 = current[0];
      const pN = current[current.length - 1];
      if (Math.hypot(pN[0] - p0[0], pN[1] - p0[1]) > 1e-5) current.push([p0[0], p0[1]]);
      loops.push(current);
    }
    current = [];
  };

  for (const c of cmds) {
    switch (c.command) {
      case 'moveto':
        if (current.length > 2) flushLoop();
        subStart = [c.x, c.y];
        current = [[c.x, c.y]];
        px = c.x;
        py = c.y;
        break;
      case 'lineto':
        current.push([c.x, c.y]);
        px = c.x;
        py = c.y;
        break;
      case 'horizontal lineto':
        current.push([c.x, py]);
        px = c.x;
        break;
      case 'vertical lineto':
        current.push([px, c.y]);
        py = c.y;
        break;
      case 'curveto': {
        const pts = flattenCubic(px, py, c.x1, c.y1, c.x2, c.y2, c.x, c.y, curveSteps);
        current.push(...pts);
        lastCpx = c.x2;
        lastCpy = c.y2;
        px = c.x;
        py = c.y;
        break;
      }
      case 'smooth curveto': {
        const cp1x = 2 * px - lastCpx;
        const cp1y = 2 * py - lastCpy;
        const pts = flattenCubic(px, py, cp1x, cp1y, c.x2, c.y2, c.x, c.y, curveSteps);
        current.push(...pts);
        lastCpx = c.x2;
        lastCpy = c.y2;
        px = c.x;
        py = c.y;
        break;
      }
      case 'quadratic curveto': {
        const pts = flattenQuad(px, py, c.x1, c.y1, c.x, c.y, curveSteps);
        current.push(...pts);
        lastQpx = c.x1;
        lastQpy = c.y1;
        px = c.x;
        py = c.y;
        break;
      }
      case 'smooth quadratic curveto': {
        const cp1x = 2 * px - lastQpx;
        const cp1y = 2 * py - lastQpy;
        const pts = flattenQuad(px, py, cp1x, cp1y, c.x, c.y, curveSteps);
        current.push(...pts);
        lastQpx = cp1x;
        lastQpy = cp1y;
        px = c.x;
        py = c.y;
        break;
      }
      case 'elliptical arc':
        current.push([c.x, c.y]);
        px = c.x;
        py = c.y;
        break;
      case 'closepath':
        if (subStart && current.length) {
          const last = current[current.length - 1];
          if (Math.hypot(last[0] - subStart[0], last[1] - subStart[1]) > 1e-5) current.push([subStart[0], subStart[1]]);
        }
        flushLoop();
        subStart = null;
        break;
      default:
        break;
    }
  }
  if (current.length > 2) flushLoop();
  return loops;
}

function extractPathDs(svgString) {
  const out = [];
  const re = /<path\b[^>]*\bd\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let m;
  while ((m = re.exec(svgString))) out.push(m[1]);
  return out;
}

/** SVG y-down → store like opentype rings: point [x, -y_svg] is what shapes use via contoursToShape */
function loopsYUp(loops) {
  return loops.map((loop) => loop.map(([x, y]) => [x, -y]));
}

function nestContoursToComponents(loopsY) {
  if (loopsY.length === 0) return [];

  const metas = loopsY
    .filter((c) => c.length >= 3)
    .map((points) => ({
      points,
      area: Math.abs(signedArea(points)),
      signed: signedArea(points),
      cen: centroid(points),
    }))
    .sort((a, b) => b.area - a.area);

  const n = metas.length;
  const parent = new Array(n).fill(-1);
  for (let j = 0; j < n; j++) {
    let best = -1;
    let bestArea = Infinity;
    for (let i = 0; i < n; i++) {
      if (i === j) continue;
      if (!(metas[i].area > metas[j].area * 1.001)) continue;
      if (pointInPolygon(metas[j].cen.x, metas[j].cen.y, metas[i].points)) {
        if (metas[i].area < bestArea) {
          bestArea = metas[i].area;
          best = i;
        }
      }
    }
    parent[j] = best;
  }

  const roots = [];
  for (let i = 0; i < n; i++) {
    if (parent[i] !== -1) continue;
    const holes = [];
    for (let j = 0; j < n; j++) {
      if (parent[j] === i) holes.push(metas[j].points);
    }
    roots.push({ outer: metas[i].points, holes });
  }

  return roots.filter((r) => r.outer.length >= 3);
}

/**
 * Read potrace (or any) SVG; return components { outer, holes }[] and plain bounds before scaling.
 */
export function parseSvgFileToComponents(svgPath, curveSteps = 5) {
  const svg = fs.readFileSync(svgPath, 'utf8');
  const ds = extractPathDs(svg);
  const allLoops = [];
  for (const d of ds) {
    const loops = pathDToLoops(d, curveSteps);
    for (const L of loops) {
      if (L.length >= 3) allLoops.push(L);
    }
  }
  const yUp = loopsYUp(allLoops);
  return nestContoursToComponents(yUp);
}

export function boundsOfComponents(components) {
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const { outer, holes } of components) {
    for (const ring of [outer, ...holes]) {
      for (const [x, y] of ring) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
  }
  return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY };
}
