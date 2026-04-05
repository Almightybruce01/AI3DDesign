'use strict';

/**
 * Technical reference for Miami Cuban link chains: manufacturing vocabulary, measurement
 * conventions, clasp systems, and image-generation guidelines. Used by API + UI tooltips.
 * (Condensed reference — not a substitute for bench trials and assay.)
 */
const CUBAN_CHAIN_REFERENCE = `
# Miami Cuban link chain — technical reference (Matrix Workshop)

## 1) Nomenclature
- **Face width (W)**: The primary retail dimension in millimetres — the visible width of a single link looking at the flat “top” of the chain (sometimes called “link width” or “gauge” in listings). This app treats **8–26 mm** as the catalogued face-width band.
- **Thickness / profile height**: The vertical stack height of the link cross-section when the chain lies on a flat surface. Typically **0.34–0.48 × W** for solid Miami profiles; hollow/semi-hollow runs **~0.28–0.38 × W** apparent thickness depending on wall thickness.
- **Pitch (P)**: Center-to-center advance along the closed loop per link — drives **link count** for a given finished length. Miami Cuban commonly sits near **P ≈ (1.18–1.32) × W** depending on tightness of manufacture and edge radii.
- **Interior opening**: Clear span the next link passes through — must clear **weld bead + polish** without binding; modeled indirectly via pitch and profile curves.
- **Finished length**: Inches (16–30 in this lab) measured **clasp closed**, straight but following curvature, typically **inner circumference** or **end-to-end** per bench standard — always confirm with your customer which measuring protocol they use (many retailers quote end-to-end clasp closed).

## 2) Link families (style presets)
- **Classic solid Miami**: Full-profile metal; heaviest; crisp facets; pitch tends toward the **tighter** end of the band.
- **Semi-hollow / semi-solid**: Reduced core volume; weight savings; walls must still support hinge loads near clasp.
- **Hollow Miami**: Large air core; **lowest g/mm**; springback and crush risk in service — specify **wall thickness** and **min bend radius** for repair operations.
- **Iced / gem-set variants**: Face may carry pavé or channel rows; **metal removal** lowers structural margin — stone protrusion and bearing points interact with clasp alignment.
- **Two-tone / tri-color**: Often achieved via soldered overlays or segmented construction — electrical plating thickness for display models vs. wear layers.
- **Tapered / graduated**: Face width changes along the neck — this lab’s presets are **uniform width**; use custom CAD for graduated layouts.
- **Edge profiles**: “Flat edge”, “bevel”, “knife edge”, “rolled barrel” — affects specular line and perceived width.

## 3) Clasp systems (closing the loop)
- **Box clasp with figure-8 safety**: Common on heavier Cuban chains; the **box** is an elongated rectangular housing; **tongue** snaps into a latch plate; **outer safety** loops back through a sister link or sister ring.
- **Hidden / integrated box**: Lower visual height; requires precise **lateral clearance** vs. neighboring link faces.
- **Double-button / twin latch**: Redundancy for high-inertia chains.

### Sizing heuristics (defaults in presets)
- **Clasp body length** along chain direction often **~1.45–1.75 × W** for Miami box clasps at larger widths.
- **Clasp body width** across the wrist plane often **~1.05–1.20 × W**.
- **Tongue thickness** must exceed flexure limits; **slot clearance** 0.15–0.35 mm per side depending on finish and lubrication (none for precious metals beyond polish).

## 4) Materials and weight estimation
- **Density reference** (approximate at room temperature): 14k gold ~**13.5 g/cm³**, 18k ~**15.2–15.6 g/cm³**, platinum ~**21.4 g/cm³** — exact values depend on alloy mix.
- **Weight scales** roughly with **metal volume**. For uniform Miami chains, volume per unit length scales like **O(W × profile_height × fill_factor)**; hollow presets apply a **fill factor** < 1.
- Bench rule: compare **grams per inch** against supplier certificates; large deviations often indicate hollow vs. solid mismatch or short length measurement.

## 5) Tolerances and inspection
- **Length tolerance**: Retail often ±0.5–1.0% or ±1/16" — specify.
- **Link-to-link articulation**: binding often from **ovalization** after impacts — check **minimum edge radius** and **symmetry**.
- **Clasp seating**: inspect under **side load** and **twist**; heavy chains transfer large moments into the box housing.

## 6) CAD / mesh guidance (this codebase)
- **Single-link preview**: Extruded stadium profile with bevel — **layout proxy**, not a replacement for springback-aware manufacturing solids.
- **Clasp preview**: Separated **male/female** proxies for orientation; boolean-ready meshes in professional workflows would add tongue/slot detail and drill relief.

## 7) Photoreal prompts (AI studio)
- Always specify: **face width in mm**, **approximate link count**, **metal alloy**, **finish** (high polish / satin / two-tone), **clasp type**, **lighting** (studio softbox vs. editorial), **camera** (85–105mm macro), and **background** (seamless vs. luxury set).
- Avoid contradictory cues: “paper-thin hollow” + “full icy coverage on all faces” — gem-set removes metal; reconcile mass estimates.

## 8) Unit conversions
- **1 inch = 25.4 mm** (exact).
- **Chain length in mm = inches × 25.4**.

## 9) Repair and modification caveats
- **Sizing down**: removing links changes **clasp balance**; the clasp region may need **counterweight** or **alternate clasp**.
- **Welding**: re-joining hollow links risks **burn-through**; laser weld preferred with **argon** coverage.

## 10) Regulatory / hallmarking
- Jurisdictions differ on **fineness marks**, **maker’s marks**, and **responsible jewelry** disclosures — outside CAD scope but part of commercial deliverables.

---
End of embedded reference snapshot. Presets combine **chain length**, **face width**, and **style multipliers** to derive pitch, approximate link count, clasp envelope, and weight bands.
`;

module.exports = {
  CUBAN_CHAIN_REFERENCE,
};
