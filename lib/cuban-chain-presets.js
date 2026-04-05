'use strict';

/**
 * 100 Miami Cuban chain setups: face width 8–26 mm, lengths 16–30 in,
 * style families with distinct pitch/thickness/hollow/weight multipliers.
 */

const CHAIN_LENGTHS_IN = [16, 18, 20, 22, 24, 26, 28, 30];

const STYLE_FAMILIES = [
  {
    id: 'classic_solid',
    label: 'Classic solid Miami',
    pitchScale: 1.24,
    thicknessRatio: 0.44,
    hollowFactor: 1,
    weightScale: 1,
    finish: 'high-polish mirror',
    notes: 'Tight pitch, full-profile bars; heaviest solid band.',
  },
  {
    id: 'semi_hollow',
    label: 'Semi-hollow Miami',
    pitchScale: 1.26,
    thicknessRatio: 0.4,
    hollowFactor: 0.62,
    weightScale: 0.78,
    finish: 'high-polish with slight hollow core',
    notes: 'Weight-reduced core; walls sized for clasp torque.',
  },
  {
    id: 'hollow_light',
    label: 'Hollow lightweight',
    pitchScale: 1.28,
    thicknessRatio: 0.36,
    hollowFactor: 0.38,
    weightScale: 0.52,
    finish: 'bright polish, thin walls',
    notes: 'Lowest g/mm; verify crush/bend limits for repair.',
  },
  {
    id: 'iced_pave',
    label: 'Iced face (pavé)',
    pitchScale: 1.25,
    thicknessRatio: 0.46,
    hollowFactor: 0.88,
    weightScale: 0.92,
    finish: 'micro-pavé on face, mirror channels',
    notes: 'Stone coverage removes metal; check prong clearance.',
  },
  {
    id: 'channel_baguette',
    label: 'Channel baguette windows',
    pitchScale: 1.27,
    thicknessRatio: 0.45,
    hollowFactor: 0.85,
    weightScale: 0.9,
    finish: 'channel-set baguettes along long axis',
    notes: 'Structural webs between channels.',
  },
  {
    id: 'two_tone',
    label: 'Two-tone (white/rose)',
    pitchScale: 1.24,
    thicknessRatio: 0.44,
    hollowFactor: 0.95,
    weightScale: 0.97,
    finish: 'yellow base, white gold face, rose accents',
    notes: 'Solder line control at color boundaries.',
  },
  {
    id: 'white_rhodium',
    label: '18k white + rhodium',
    pitchScale: 1.24,
    thicknessRatio: 0.43,
    hollowFactor: 1,
    weightScale: 1,
    finish: 'rhodium bright, crisp edges',
    notes: 'Retail plating vs. wear layer called out in prompts.',
  },
  {
    id: 'rose_gold',
    label: '18k rose gold',
    pitchScale: 1.25,
    thicknessRatio: 0.44,
    hollowFactor: 1,
    weightScale: 1,
    finish: 'warm copper-rose luster',
    notes: 'Copper alloy tint; slightly different density vs. yellow.',
  },
  {
    id: 'satin_brushed',
    label: 'Satin brushed face',
    pitchScale: 1.26,
    thicknessRatio: 0.44,
    hollowFactor: 1,
    weightScale: 1,
    finish: 'directional satin with polished flanks',
    notes: 'Specular line differs from full mirror.',
  },
  {
    id: 'beveled_edge',
    label: 'Beveled edge + rolled',
    pitchScale: 1.23,
    thicknessRatio: 0.45,
    hollowFactor: 1,
    weightScale: 1.02,
    finish: 'facet bevel on long edges, rolled barrel',
    notes: 'Slightly wider perceived light catch.',
  },
];

const WIDTHS_MM = [];
for (let w = 8; w <= 26; w++) WIDTHS_MM.push(w);

function buildPresetList() {
  const presets = [];
  const lengths = CHAIN_LENGTHS_IN;
  let idx = 0;

  outer: for (const chainLengthIn of lengths) {
    for (const linkWidthMm of WIDTHS_MM) {
      if (presets.length >= 100) break outer;
      const style = STYLE_FAMILIES[idx % STYLE_FAMILIES.length];
      const id = `cuban_${String(idx).padStart(3, '0')}`;
      const derived = computeDerived({ chainLengthIn, linkWidthMm, style });
      presets.push({
        id,
        ordinal: idx,
        chainLengthIn,
        linkWidthMm,
        styleId: style.id,
        styleLabel: style.label,
        ...derived,
        aiPromptHint: buildAiPromptHint({ chainLengthIn, linkWidthMm, style, derived }),
      });
      idx += 1;
    }
  }

  // If we still have fewer than 100 (shouldn't with 8*19=152), pad with 26" + extra widths
  let wExtra = 8;
  while (presets.length < 100) {
    const style = STYLE_FAMILIES[presets.length % STYLE_FAMILIES.length];
    const id = `cuban_${String(presets.length).padStart(3, '0')}`;
    const chainLengthIn = 30;
    const linkWidthMm = Math.min(26, wExtra++);
    const derived = computeDerived({ chainLengthIn, linkWidthMm, style });
    presets.push({
      id,
      ordinal: presets.length,
      chainLengthIn,
      linkWidthMm,
      styleId: style.id,
      styleLabel: style.label,
      ...derived,
      aiPromptHint: buildAiPromptHint({ chainLengthIn, linkWidthMm, style, derived }),
    });
  }

  return presets.slice(0, 100);
}

function computeDerived({ chainLengthIn, linkWidthMm, style }) {
  const W = linkWidthMm;
  const pitchMm = W * style.pitchScale;
  const chainLengthMm = chainLengthIn * 25.4;
  const linkCount = Math.max(8, Math.round(chainLengthMm / pitchMm));
  const effectivePitch = chainLengthMm / linkCount;
  const linkLengthAlongMm = W * 1.16;
  const thicknessMm = W * style.thicknessRatio;
  const innerClearanceMm = W * 0.39;
  const claspLengthMm = W * 1.58;
  const claspWidthMm = W * 1.12;
  const claspThicknessMm = thicknessMm * 1.08;
  const tongueLengthMm = claspLengthMm * 0.42;
  const safetyLoopIdMm = W * 0.55;

  // Volume proxy: length * cross-section * fill; hollowFactor scales metal volume
  const sectionMm2 = W * thicknessMm * 0.55 * style.hollowFactor;
  const volumeMm3 = chainLengthMm * sectionMm2;
  const density14kGPerMm3 = 13.5 / 1000 / 1000;
  const weightEstimate14kG = volumeMm3 * density14kGPerMm3 * style.weightScale;

  return {
    pitchMm: round2(pitchMm),
    effectivePitchMm: round2(effectivePitch),
    chainLengthMm: round2(chainLengthMm),
    linkCount,
    linkLengthAlongMm: round2(linkLengthAlongMm),
    thicknessMm: round2(thicknessMm),
    innerClearanceMm: round2(innerClearanceMm),
    clasp: {
      boxLengthMm: round2(claspLengthMm),
      boxWidthMm: round2(claspWidthMm),
      boxThicknessMm: round2(claspThicknessMm),
      tongueLengthMm: round2(tongueLengthMm),
      safetyLoopInnerDm: round2(safetyLoopIdMm),
    },
    weightEstimate14kG: round2(weightEstimate14kG),
    hollowFactor: style.hollowFactor,
    finish: style.finish,
    styleNotes: style.notes,
  };
}

function round2(x) {
  return Math.round(x * 100) / 100;
}

function buildAiPromptHint({ chainLengthIn, linkWidthMm, style, derived }) {
  return [
    `Miami Cuban link chain, uniform ${linkWidthMm} mm face width, ${chainLengthIn}" finished length (clasp closed), approximately ${derived.linkCount} links at ~${derived.effectivePitchMm} mm pitch.`,
    `${style.label}: ${style.finish}.`,
    `Box clasp envelope ~${derived.clasp.boxLengthMm}×${derived.clasp.boxWidthMm}×${derived.clasp.boxThicknessMm} mm; include figure-8 safety.`,
    `Studio macro product photo, 85mm lens, neutral seamless, realistic gold speculars, clasp detail visible.`,
  ].join(' ');
}

let _cached;

function getCubanPresets() {
  if (!_cached) _cached = buildPresetList();
  return _cached;
}

function getCubanPresetById(id) {
  return getCubanPresets().find((p) => p.id === id) || null;
}

function mmPerInch() {
  return 25.4;
}

function convertLength(value, from, to) {
  const v = Number(value);
  if (!Number.isFinite(v)) return null;
  let mm;
  if (from === 'mm') mm = v;
  else if (from === 'in') mm = v * 25.4;
  else return null;
  if (to === 'mm') return round2(mm);
  if (to === 'in') return round2(mm / 25.4);
  return null;
}

function matchClosestPreset(linkWidthMm, chainLengthIn) {
  const W = Number(linkWidthMm);
  const L = Number(chainLengthIn);
  if (!Number.isFinite(W) || !Number.isFinite(L)) return null;
  const presets = getCubanPresets();
  let best = null;
  let bestScore = Infinity;
  for (const p of presets) {
    const dw = Math.abs(p.linkWidthMm - W);
    const dl = Math.abs(p.chainLengthIn - L);
    const score = dw * 2.5 + dl * 0.45;
    if (score < bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return best;
}

module.exports = {
  CHAIN_LENGTHS_IN,
  STYLE_FAMILIES,
  WIDTHS_MM,
  getCubanPresets,
  getCubanPresetById,
  computeDerived,
  mmPerInch,
  convertLength,
  buildPresetList,
  matchClosestPreset,
};
