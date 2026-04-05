/**
 * Production BRUCE plate: 6" × 2" × 0.5" · blind seats only (no diamond meshes).
 * Matches iced nameplate look: connected bold letters, baguette channels in letter fill,
 * multi-row outline pavé + bail seats (see reference in repo assets).
 * Outputs: generated/3dprint_bruce_pendant.{obj,cad,stl}
 */
import path from 'path';
import { fileURLToPath } from 'url';
import { runBuild } from './jewelry-build.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'generated');
const IN = 25.4;
const ROOT = path.join(__dirname, '..');
const FONT_BOLD = path.join(ROOT, 'fonts', 'Roboto-Bold.ttf');

const { objPath, cadPath, stlPath, config } = runBuild({
  text: 'BRUCE',
  targetLengthMm: 6 * IN,
  targetHeightMm: 2 * IN,
  plateDepthMm: 0.5 * IN,
  seatDepthRatio: 0.72,
  reliefRatio: 0.18,
  exactEnvelope: true,
  addBail: true,
  roundCount: 56,
  backingMargin: 1.045,
  eliteSeats: true,
  /** Visual fidelity for jewelry (larger files, longer CSG) — not print-tight */
  printTight: false,
  /** Triple-row border pavé, denser baguettes & frame; contour-aware baguette grid */
  referenceIced: true,
  letterAdvanceScale: 0.9,
  fontFile: FONT_BOLD,
  outBase: path.join(OUT, '3dprint_bruce_pendant'),
});

console.log('3D print BRUCE (referenceIced, seats only):', objPath, cadPath, stlPath);
console.log('Envelope mm:', config.scaledSizeMm, 'relief mm:', config.reliefMm);
