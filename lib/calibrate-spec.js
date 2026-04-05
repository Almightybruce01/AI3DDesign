'use strict';

/**
 * Deep-clone analysis and apply caliper measurements to printSpec + top-level estimates.
 */
function calibrateAnalysis(analysis, opts = {}) {
  const out = JSON.parse(JSON.stringify(analysis || {}));
  const ps = out.printSpec || (out.printSpec = {});

  const mw = Number(opts.measuredLinkWidthMm);
  const ml = Number(opts.measuredChainLengthIn);
  const tr = Number(opts.thicknessRatio);

  if (Number.isFinite(mw) && mw >= 4 && mw <= 80) {
    ps.linkWidthMm = Math.round(mw * 100) / 100;
    out.estimatedFaceWidthMm = ps.linkWidthMm;
  }
  if (Number.isFinite(ml) && ml >= 5 && ml <= 40) {
    ps.chainLengthIn = Math.round(ml * 1000) / 1000;
    out.estimatedLengthIn = ps.chainLengthIn;
  }
  if (Number.isFinite(tr) && tr >= 0.28 && tr <= 0.55) {
    ps.thicknessRatio = Math.round(tr * 1000) / 1000;
  }

  out.calibratedAt = new Date().toISOString();
  out.calibrationNote = String(opts.note || '').slice(0, 500);
  return out;
}

module.exports = { calibrateAnalysis };
