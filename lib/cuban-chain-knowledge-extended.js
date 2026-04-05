'use strict';

/**
 * Extended curriculum-style notes: bench workflow, QC, sales language, and imaging.
 * Concatenated for /api/cuban/reference?extended=1
 */
const EXTENDED = `
## Extended module A — Measurement protocols (retail vs. bench)
Retail listings often quote **clasp closed, straight pull** length. Bench repair may reference **cuttable units** (full links) vs. **partial links** depending on factory construction. When converting inches to link count:
1. Measure pitch on a sample segment with calipers (3–5 links, divide).
2. Divide circumference in mm by pitch; round to nearest whole link for uniform chains.
3. Add **clasp substitution length** — some clasps are longer than the link they replace; adjust count.

## Extended module B — Failure modes
- **Clasp tongue bend**: overload or side impulse; inspect **tongue thickness** and **metal temper**.
- **Box spread**: repeated opening cycles; **housing walls** too thin for width class.
- **Hollow crush**: point loads during storage; educate customer on **travel pouches** and **avoid stacked heavy objects**.
- **Stone loss on iced faces**: shared with any pavé — specify **repair minimums** for stone replacement batches.

## Extended module C — Photography briefs (catalog)
For each SKU capture: **top orthographic**, **45° hero**, **clasp macro**, **side profile** showing thickness, **wrist context** optional. Lighting: large soft source + **gridded rim** to separate edge from background. For AI prompts, include **alloy**, **width mm**, **length in**, **finish**, and **negative prompts** like “no plastic, no resin, no duplicate clasps”.

## Extended module D — Sales copy (accurate)
- Prefer **face width mm** + **length inches** + **approximate weight** (range) + **clasp type**.
- Avoid promising exact gram weight without physical unit.

## Extended module E — Sizing sessions
Neck vs. wrist: Miami Cuban commonly sold as **bracelet** or **necklace**; same link family but **length bands** differ. For choker vs. long chain, **drape weight** changes perceived comfort — heavier chains need **felt balance** at clasp.

## Extended module F — Manufacturing notes (high level)
Wire feed, die sequences, and **laser welding** chains differ by factory. CAD proxies in this app **do not** embed machine springback or **interlink clearance** tuned to a specific supplier’s tooling.

## Extended module G — Alloy color science (brief)
**Nickel-white** vs. **palladium-white** affects **rhodium** wear frequency. **Rose** copper content shifts **CNP** color. Document customer **metal allergy** questions with a professional jeweler.

## Extended module H — Legal / marketing
**Country of origin**, **alloy disclosure**, and **gem treatment** statements must follow local law. AI-generated images are **marketing aids**, not certificates of authenticity.

## Extended module I — 60-minute study outline (self-guided)
0:00–0:08 terminology (face width, pitch, clasp). 0:08–0:18 measure pitch and estimate link count. 0:18–0:30 style families and weight scaling. 0:30–0:42 clasp systems and safety. 0:42–0:52 photography + AI prompting. 0:52–1:00 repair caveats and customer handoff checklist.

## Extended module J — Prompt templates (copy/paste)
- “18k yellow Miami Cuban, {W} mm face, {L} in, {N} links, high polish, box clasp with figure-8 safety, studio macro, 85mm, neutral grey seamless.”
- “CAD technical orthographic top + side, dimensionally labeled, brushed platinum, soft AO.”

## Extended module K — Conversion tables (mental math)
- 7 in ≈ 177.8 mm; 8 in ≈ 203.2 mm; 9 in ≈ 228.6 mm; 10 in ≈ 254 mm.
- Face width 12 mm → pitch often ~14.9–15.4 mm depending on preset scale.

## Extended module L — Chain families (not modeled)
**Franco**, **rope**, **Figaro**, **mariner** — different kinematics; do not assume Miami pitch formulas.

## Extended module M — Service operations
**Shorten**: remove links near clasp, re-weld, **re-polish** localized heat zone. **Lengthen**: may require **matched links** from supplier; color match batch issues.

## Extended module N — Data integrity
This preset list is **deterministic** in software: same IDs always map to the same nominal dimensions. Physical chains vary; treat numbers as **starting points** for CAD and copy, not a guarantee.

## Extended module O — Glossary quick
**Figure-8**: Safety latch shape. **Box clasp**: Rectangular housing latch. **Face**: Broad flat facet of Miami link. **Pitch**: Advance per link. **Hollow factor**: Metal volume scalar for weight estimation.
`;

module.exports = { EXTENDED };
