'use strict';

/** Rough server-side ETA for UI (actual time varies by CPU). */

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function formatEta(seconds) {
  const s = Math.round(seconds);
  if (s < 55) return `~${s} sec`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (r < 8 || m >= 10) return `~${m} min`;
  return `~${m} min ${r} sec`;
}

function estimateJewelryBuildSeconds(body) {
  let t = 22;
  if (body.referenceIced === true) t += 320;
  if (body.printTight !== true) t += 95;
  const rounds = parseInt(body.roundCount, 10) || 36;
  t += rounds * 0.55;
  if (body.vectorId || body.vectorSvgPath) t += 28;
  if (body.eliteSeats !== false) t += 18;
  const text = String(body.text || '').replace(/\s/g, '');
  t += Math.min(40, text.length * 1.2);
  return clamp(t, 12, 4200);
}

function estimateComplexBuildSeconds(cfg) {
  const cols = parseInt(cfg.cageGridCols, 10) || 6;
  const rows = parseInt(cfg.cageGridRows, 10) || 5;
  const outline = parseInt(cfg.outlineRoundCount, 10) || 44;
  let t = 12 + cols * rows * 0.35 + outline * 0.12;
  return clamp(t, 8, 180);
}

function estimateCubanBuildSeconds(body) {
  let t = 28;
  const W = Number(body.linkWidthMm);
  if (Number.isFinite(W)) t += W * 0.15;
  const clasp = body.clasp && typeof body.clasp === 'object';
  if (clasp) t += 12;
  return clamp(t, 15, 120);
}

function estimateVectorScanSeconds() {
  return 8;
}

function estimateComplexAnalyzeSeconds(hasImage) {
  return hasImage ? 52 : 30;
}

/** Vision + mesh rebuild; varies with API latency. */
function estimatePhotoToPrintSeconds() {
  return 95;
}

module.exports = {
  formatEta,
  estimateJewelryBuildSeconds,
  estimateComplexBuildSeconds,
  estimateCubanBuildSeconds,
  estimateVectorScanSeconds,
  estimateComplexAnalyzeSeconds,
  estimatePhotoToPrintSeconds,
};
