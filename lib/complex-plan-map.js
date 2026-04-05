'use strict';

function n(v, d) {
  const x = Number(v);
  return Number.isFinite(x) ? x : d;
}

/**
 * Map GPT JSON plan (see complex-build-ai SCHEMA) → complex-pendant-build.mjs config.
 */
function planToComplexBuildConfig(plan, outBase) {
  const p = plan && plan.plate ? plan.plate : {};
  const h = plan && plan.hollow ? plan.hollow : {};
  const s = plan && plan.stones ? plan.stones : {};
  const c = plan && plan.connector ? plan.connector : {};

  const roundD = n(s.roundStoneDiameterMm, 1.0);
  const bagL = n(s.baguetteLengthMm, 4);
  const bagW = n(s.baguetteWidthMm, 2);

  return {
    outerWidthMm: n(p.outerWidthMm, 48),
    outerHeightMm: n(p.outerHeightMm, 40),
    cornerRadiusMm: n(p.cornerRadiusMm, 4),
    totalDepthMm: n(p.totalDepthMm, 18),
    wallThicknessMm: n(p.wallThicknessMm, 12.7),
    cageGridCols: Math.min(12, Math.max(3, parseInt(h.cageGridCols, 10) || 6)),
    cageGridRows: Math.min(12, Math.max(3, parseInt(h.cageGridRows, 10) || 5)),
    cageHoleRadiusMm: n(h.cageHoleRadiusMm, 0.85),
    roundStoneRadiusMm: roundD / 2,
    baguetteHalfLengthMm: bagL / 2,
    baguetteHalfWidthMm: bagW / 2,
    outlineRoundCount: Math.min(96, Math.max(20, parseInt(s.outlineRoundCount, 10) || 44)),
    connectorDigit: String(c.digit || '6').slice(0, 1),
    chainClearanceMm: n(c.chainClearanceMm, 26),
    sixFontSizeMm: n(c.sixHeightMm, 22),
    sixExtrudeDepthMm: n(c.sixDepthMm, 5),
    outBase,
  };
}

module.exports = { planToComplexBuildConfig };
