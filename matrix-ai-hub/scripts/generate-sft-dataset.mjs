#!/usr/bin/env node
/**
 * Regenerates training/matrix-workshop-sft.jsonl from structured examples.
 * Run: node scripts/generate-sft-dataset.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(__dirname, '..', 'training', 'matrix-workshop-sft.jsonl');

const rows = [];

function add(user, assistant) {
  rows.push(
    JSON.stringify({
      messages: [
        { role: 'user', content: user },
        { role: 'assistant', content: assistant },
      ],
    }),
  );
}

// --- Original core (paraphrased / retained intent)
add(
  'What does printTight do on a jewelry build?',
  '`printTight: true` reduces mesh complexity: fewer segments, sparser pavé cutters, no bevel — smaller STL, faster slicing, less “iced” detail. Use it for iteration. Turn it off when you want maximum reference-style icing (heavier mesh, longer CSG).',
);
add(
  'I want the BRUCE pendant to look like the reference photo — what flags?',
  'Use `referenceIced: true` and keep `printTight: false` for the BRUCE-style preset. Expect long build times (many minutes): batched boolean union of hundreds of seat brushes. For faster tests, temporarily use `printTight: true` or lower `roundCount`, then switch back for final export.',
);
add(
  'How do I use a logo outline instead of text?',
  'Run **Trace to SVG** (`POST /api/jewelry/vector-scan`) on a high-contrast silhouette PNG/JPEG/WebP. That writes `generated/vector_<id>.svg`. Enable “Use last trace” and call `POST /api/jewelry/build` with `vectorId` — the extrusion follows the traced path instead of opentype glyphs. Tune invert/threshold if edges are noisy.',
);
add(
  'What files do I give the slicer?',
  'Use the binary **STL** (or `.cad`, same bytes). OBJ is for viewport/preview and DCC import. Always verify scale is in millimetres for printing.',
);
add(
  'Seat depth ratio 0.68 — what does that mean?',
  'It controls how deep blind stone pockets are **relative to plate thickness** (solid back, no through-holes). Typical range ~0.35–0.92. Higher = deeper seats; if too deep vs plate you risk breaking through — reduce ratio or increase plate depth.',
);
add(
  'Why are baguette seats missing inside letter holes?',
  'Baguette grid is placed only where a point is inside the letter **outer** contour and **outside** inner contours (counters). That avoids cutters in holes of B, R, O, etc. Outline pavé follows outer+counter rims separately.',
);
add(
  'Miami Cuban — what face widths and lengths does the lab support?',
  'Presets span roughly **8–26 mm** face width and **16–30 in** finished length (retail-style). You get link mesh plus box clasp proxies. Use caliper fields if vision analysis needs scaling.',
);
add(
  'How do I get photoreal catalog images?',
  'Set `OPENAI_API_KEY` for DALL·E 3 and/or `REPLICATE_API_TOKEN` for Flux. Without keys, the app falls back to local HD procedural PNG. Optional GPT-4o-mini prompt expansion when OpenAI is configured. Describe metal, stones, lighting, and style (studio vs editorial) in the preview request.',
);
add(
  'Complex Design Studio — what does analyze return?',
  '**Analyze brief** calls GPT-4o vision (optional photo) and returns a **JSON manufacturing plan**: plate dimensions, hollow/cage, stone layout notes, digit link, parts list. **Build** runs the server CSG and outputs main plate + digit link OBJ/STL under `generated/`.',
);
add(
  'Should I use Blender or Matrix for final production?',
  'The browser preview is mesh-based. For NURBS history, constraints, and manufacturing-grade booleans, export STL/OBJ and continue in **Blender, Rhino, or MatrixGold**. Use Matrix AI Hub to plan dimensions and exports, then refine in desktop CAD.',
);
add(
  'letterAdvanceScale less than 1?',
  'Values **< 1** pull glyphs closer horizontally so the word reads as **one connected slab** (kerning). Useful for nameplates that must look like a single plate, not separate letters.',
);
add(
  'What is vectorCurveSteps?',
  'Subdivision when flattening SVG Bézier curves into polygons before extrusion. Higher = smoother curves but more vertices. Default is modest (~6 in the build pipeline); raise if silhouettes look faceted.',
);
add(
  'I need exact outer dimensions — how?',
  'Use `exactEnvelope` with `targetLengthMm` / `targetHeightMm` (or width mm in the API) so the build applies non-uniform XY scale to hit dimensions after font/vector normalization.',
);
add(
  'eliteSeats vs simple cylinders?',
  '`eliteSeats` uses fancier lathe-style round seat profiles where implemented; otherwise simple cylindrical blind pockets. Elite looks closer to bench expectations; simple is lighter mesh.',
);
add(
  'Why is my build taking 20+ minutes?',
  'Full **referenceIced** builds union many CSG brushes (outline pavé, baguette grid, bail). That’s expected. For iteration enable `printTight`, reduce `roundCount`, or test smaller text until the design is locked.',
);
add(
  'Chain photo flow — what does the vision model output?',
  'GPT-4o vision estimates link width, length, style hints, and suggests print specs + preset id matches. It’s guidance — verify with calipers. Replicate can do photo→photo edits if `REPLICATE_API_TOKEN` is set.',
);
add(
  'Export from the viewport?',
  'Forge view can export **scene OBJ** from the UI. Server builds write jewelry/Cuban/complex meshes to `generated/` with STL/CAD for slicing.',
);
add(
  'Invert on vector scan?',
  'Toggle **invert luminance** if potrace misses the plate or traces background instead of the silhouette. Use a high-contrast source image for cleanest SVG.',
);
add(
  'What model for Matrix AI Hub chat?',
  'Set `LLM_MODEL` in Vercel to your fine-tuned id (e.g. `ft:...`) or a frontier model. `OPENAI_BASE_URL` can point to any OpenAI-compatible host (OpenRouter, Together, local Ollama with tunnel). The hub injects a long Matrix Workshop system prompt server-side.',
);
add(
  'Can I train on my own chats?',
  'Fine-tuning uses **JSONL** you upload (OpenAI fine-tuning API). This repo includes `training/matrix-workshop-sft.jsonl` as a starter dataset — extend it with your real prompts and ideal answers, then create a fine-tune job.',
);

// --- Expanded: execution, photo+text, dashboard, print-ready
add(
  'I uploaded a reference photo and typed dimensions — I want the Complex plan to match both exactly.',
  'Use **Complex Design Studio → Analyze** with the photo attached and your text specifying mm targets. The vision model reads silhouette, bail, and stone density; your text overrides ambiguous numbers. After Analyze, inspect the JSON plate `outerWidthMm` / `outerHeightMm` / `totalDepthMm` — edit fields if needed, then **Build**. For final print, download STL from `generated/` and confirm mm scale in the slicer.',
);
add(
  'No stones — metal-only pendant for FDM test print. What do I tell the AI?',
  'In the brief say explicitly **metal only, no gemstones, no pavé**. In the returned JSON, keep stone fields structurally valid but set `cadNotes` to note “FDM test — omit stone seats in post” if your pipeline still generates seats — or request `printTight: true` and minimal `outlineRoundCount` / disable heavy outline pavé via build flags after you map the plan in Complex. For slicer: orient flat on build plate, brim if narrow.',
);
add(
  'Analyze this: iced nameplate with connected letters like one slab, 45mm wide, 12mm tall plate.',
  'Set **text_outline** or font build with `letterAdvanceScale` slightly below 1 so letters merge visually. Target envelope use `exactEnvelope` + `targetLengthMm: 45`, `targetHeightMm: 12`. For iced look: `referenceIced: true`, `printTight: false` for final; iterate with `printTight: true` first. Expect longer CSG time.',
);
add(
  'Photo shows a thin script necklace — how does vision map to plate depth?',
  'Vision estimates **relative** thickness vs width from the image; you still set authoritative `totalDepthMm` and `wallThicknessMm` in the brief or edit JSON (typical nameplate depths 1.2–3.5 mm class range — adjust for print tech). Prefer user-supplied mm when provided.',
);
add(
  'I need OBJ for Blender to sharpen edges — where?',
  'Server writes **`generated/*.obj`** for preview and DCC import; **STL** for printing. After Complex build, open `complex_*_main.obj` in Blender, add Edge Split / bevel as needed, then re-export STL for print if you changed mesh.',
);
add(
  'Dashboard workflow: trace → build → Complex — order?',
  '1) **Trace** high-contrast logo → get `vectorId`. 2) **Jewelry build** with `vectorId` for silhouette plate. 3) Optional **Complex** for multi-part digit + plate assemblies from a natural brief + photo. 4) Download STL/OBJ from `generated/` or Forge export. 5) Desktop CAD for NURBS if required.',
);
add(
  'User says: make it exactly like the picture — no extra questions.',
  'Operational rule: **execute from image + any stated numbers**. Choose defaults only where the brief is silent (document assumptions in `researchNotes` / `cadNotes`). Return build flags: vector vs font, `referenceIced` vs `printTight`, and explicit mm envelope. Do not ask clarifying questions in automated JSON — encode best-effort manufacturing plan.',
);
add(
  'What is the difference between OBJ and STL for my jeweler?',
  '**STL** = print/slice standard (triangle soup). **OBJ** = often easier for Blender/Rhino import, materials/groups in some pipelines. For manufacturing meeting: send **STL in mm** + a screenshot or key dimensions.',
);
add(
  'Ring vs pendant in Complex — supported parts?',
  'Complex preset targets **pendant plate + digit link** style parts list (`parts` array). Rings are not the same generator — use jewelry nameplate/vector flows or desktop CAD for shanks; Hub can still advise dimensions and export meshes that exist in stack.',
);
add(
  'Slicer shows wrong size — fix?',
  'Confirm **mm** not inches in CAD export. In Blender: **Apply Scale**, check scene units metric. Our builds aim for mm; if scale is off, uniformly scale mesh to match caliper before slice.',
);
add(
  'How do I iterate fast before final iced build?',
  'Use **`printTight: true`**, lower `roundCount`, smaller preview text, or shorter vector curve steps test. Once silhouette and dimensions lock, switch to `referenceIced` + `printTight: false` for final STL.',
);
add(
  'Replicate Flux vs DALL·E for catalog stills?',
  '**DALL·E 3** via `OPENAI_API_KEY` — strong prompt following, controlled scenes. **Flux** via `REPLICATE_API_TOKEN` — fast/cheap variants. Both benefit from expanded prompts (metal, stones, lighting). Keys optional; else procedural fallback PNG.',
);
add(
  'Potrace traces jagged edges — settings?',
  'Improve source: higher resolution, clean threshold, invert if needed. Increase **`vectorCurveSteps`** for smoother polygons. Simplify artwork to solid black/white before trace.',
);
add(
  'Bail placement from photo?',
  'Vision can infer **top center** bail vs integrated; confirm in JSON `connector` / `cadNotes`. If wrong, edit brief: “bail centered, 2mm hole clearance” and re-analyze.',
);
add(
  'I want baguettes only in the center, rounds on outline only.',
  'Describe that in the brief. Implementation maps to `stones.interior` vs `stones.outline` patterns in the plan; build pipeline places baguette grid only inside outers minus counters, outline pavé on rims — align counts with `outlineRoundCount` and baguette row fields after Analyze.',
);
add(
  'Legal: customer sent Disney character outline.',
  'Do not reproduce protected characters without rights. Use **generic** design language in `researchNotes`; suggest original silhouette or licensed artwork from the customer. Vector path may still be user-owned — compliance is on the operator.',
);
add(
  'OpenAI fine-tune vs base model in Hub?',
  '`LLM_MODEL=ft:...` routes chat to your fine-tuned weights on top of the bundled elite system prompt — better vocabulary fit for Matrix Workshop. Vision for Complex still uses **`OPENAI_VISION_MODEL`** (default `gpt-4o`) unless you change it — fine-tuned mini models are not a drop-in for image inputs.',
);
add(
  'What does cage back do?',
  '`hollow` + `cagedBack` reduces metal volume with an internal grid pattern (`cageGridCols`/`cageGridRows`) — lighter print, different weight; adjust for casting vs print resin constraints.',
);
add(
  'Export “last build” paths?',
  'Complex often writes **`generated/complex_last_main.obj`** and sibling STL; jewelry builds use named slugs under `generated/`. Check server response JSON for exact filenames.',
);
add(
  'Groq only — can I still use Complex with photo?',
  '**No** — photo analysis requires **`OPENAI_API_KEY`** for GPT-4o vision on `/api/complex/analyze`. Groq covers text-only paths. Add OpenAI key for image briefs.',
);
add(
  'Temperature for analyze?',
  'Server uses low-ish temperature for structured JSON. You mainly control outcomes via **clear brief text** and **high-quality photo** (straight-on, lit, minimal glare).',
);
add(
  'MatrixGold vs this stack?',
  'MatrixGold is professional NURBS/jewelry CAD. This stack is **web mesh CSG** for fast iteration and STL/OBJ export. Use Hub for specs and meshes; transfer to Matrix for production trees.',
);
add(
  'I need sharp STL for resin — workflow?',
  'Generate STL from server → import to Blender → **Shade Auto Smooth** off if you want crisp facets, or bevel controlled edges → export STL in mm → resin slice with supports on hidden faces.',
);
add(
  'Font: Roboto-Bold for heavy letters — how?',
  'Set `fontFile` to your bundled TTF path (e.g. `fonts/Roboto-Bold.ttf`) in build config; combine with `letterAdvanceScale` for single-slab look.',
);
add(
  'What is three-bvh-csg?',
  'Library used for **boolean CSG** on mesh (union/subtract) to cut blind seats — performance-oriented for web builds; heavy icing = many operations.',
);
add(
  'Can the AI output G-code?',
  'No — output is **STL/CAD/OBJ** for external slicers (Chitubox, Lychee, PrusaSlicer, etc.). Hub advises orientation and supports conceptually.',
);
add(
  'Vercel env: minimum for Hub chat + trace proxy?',
  'Set **`GROQ_API_KEY`** or **`OPENAI_API_KEY`**, optional **`LLM_MODEL`**, **`WORKSHOP_API_BASE_URL`** to your deployed Node workshop URL, and **`NEXT_PUBLIC_WORKSHOP_API`** same for browser-side links.',
);
add(
  'Complex JSON invalid — what now?',
  'Re-run Analyze with shorter brief or disable JSON mode only if server allows (`DISABLE_OPENAI_JSON_MODE`) — default expects strict JSON. Ensure the model returns a single object matching schema keys.',
);
add(
  'Stone diameter 1.0mm too dense for outline — change?',
  'Lower **`roundStoneDiameterMm`** increases count risk — for fewer seats increase diameter or reduce `outlineRoundCount` / use `printTight` to simplify.',
);
add(
  'Digit link “6” height vs plate?',
  '`connector.sixHeightMm` and **`chainClearanceMm`** position relative to plate — tune for bail and chain fit; verify in preview mesh before final print.',
);
add(
  'I said 50mm wide in text but photo looks wider — trust which?',
  '**Trust explicit user mm** in text over visual guess when they conflict; note discrepancy in `researchNotes` and scale plan to stated mm.',
);
add(
  'Night build — will it timeout?',
  'Long **referenceIced** jobs can run many minutes; keep the process alive. If HTTP times out, run builds via CLI scripts (`scripts/jewelry-build.mjs` pattern) or increase proxy timeouts on deploy.',
);
add(
  'AI preview image is not photoreal — why?',
  'Missing **`OPENAI_API_KEY`** (DALL·E) and **`REPLICATE_API_TOKEN`** triggers **procedural SVG/PNG** fallback. Add keys for photoreal catalog stills.',
);
add(
  'Compare printTight and referenceIced in one sentence.',
  '**printTight** = faster, lighter, less detail; **referenceIced** = closer to full iced reference look, much heavier mesh and time.',
);
add(
  'Hub chat streaming — model?',
  '`/api/chat` streams tokens from your configured OpenAI-compatible **`model`** (`LLM_MODEL` or defaults). System prompt is **`ELITE_SYSTEM_PROMPT`** plus optional `LLM_SYSTEM_APPEND`.',
);
add(
  'I want zero pavé — only polished metal plate.',
  'State **no pavé / metal only** in brief; after Analyze, verify build flags route to minimal seat generation — you may need to adjust mapped config in `complex-plan-map` / build step for your pipeline version; use `printTight` to reduce decorative cutters.',
);
add(
  'SVG from Illustrator — tips?',
  'Export simple closed paths, no strokes-only; flatten transforms; high-contrast fill. Import path may still need **`vectorCurveSteps`** tuning.',
);
add(
  'Photographing chain for caliper flow?',
  'Straight segment, neutral background, scale reference or known link count; **Chain photo** vision assists presets — calipers still win for final width.',
);
add(
  'What is FORGE view?',
  'Three.js **viewport** for inspecting meshes, bookmarks, exporting scene OBJ — complementary to server-generated jewelry/Cuban/complex assets.',
);
add(
  'Docker / deploy workshop for vector-scan?',
  'Run Node **`server.js`** where `potrace` and image deps exist; point Hub **`WORKSHOP_API_BASE_URL`** at that origin. See `DEPLOY.md` patterns.',
);
add(
  'JSON `catalogImagePrompt` purpose?',
  'Single English string for **catalog render** generation — DALL·E/Flux; make it specific: metal color, finish, stone types, lighting.',
);
add(
  'Blind seats vs through holes?',
  'Seats are **blind pockets** (negative), solid back — not drill-through unless your downstream CAD modifies mesh.',
);
add(
  'Why counters matter for baguettes?',
  'Inner contours define **holes** in letters; baguette grid excludes those regions so cutters do not appear inside counters.',
);
add(
  'elite prompt expansion — which model?',
  '`lib/ai-images.js` uses **`OPENAI_CHAT_MODEL` or `LLM_MODEL`** for prompt expansion when OpenAI routing is active — your fine-tune can shape catalog language.',
);
add(
  'I need the build to stop asking me to confirm settings.',
  'Automation stance: set flags in API payload or UI once, then **Build** — Hub text AI should propose concrete `printTight` / `referenceIced` / `vectorId` without conversational prompts when you say “use defaults for speed” or supply full specs.',
);
add(
  'Photo: pendant on bust — analyze?',
  'Vision can still extract **plate aspect ratio** and stone pattern hints; absolute scale is weak without reference — **provide mm** in text for authoritative size.',
);
add(
  'Text only brief: “45mm wide nameplate, iced outline, TB letters”.',
  'Map to **`outlineText`: "TB"**, target width via **`exactEnvelope`**, iced via **`referenceIced: true`**, iteration with **`printTight`** until layout ok.',
);
add(
  'Error: vectorId not found.',
  'Re-run **vector-scan** to regenerate `generated/vector_<id>.svg`; ensure the server stores the latest `vectorId` client-side before build.',
);
add(
  'Combine Cuban + pendant?',
  'Different generators — export both meshes and assemble in Blender/Rhino; Hub gives each mesh separately.',
);
add(
  'mm to inches for retail chain length?',
  'Convert explicitly: 1 in = 25.4 mm — use inches only in user-facing chain length fields where presets expect retail inches.',
);
add(
  'Sharp dashboard editing — meaning?',
  'Download **OBJ/STL**, import to desktop CAD, apply fillets/bevels where mesh CSG is coarse; browser preview is for iteration not final Class-A surfaces.',
);
add(
  'LLM_SYSTEM_APPEND — use case?',
  'Append **shop-specific rules** (all jobs 14k gold, default bail size, NDA language) to the Hub system prompt without forking code.',
);
add(
  'GPT-4o vs fine-tuned mini for text Complex?',
  'With **`OPENAI_API_KEY`**, text-only Complex can use **`LLM_MODEL`** fine-tune for shop-tuned JSON style; photo path stays on **`OPENAI_VISION_MODEL`**.',
);
add(
  'Security: API keys in repo?',
  'Never commit **`.env`** — use `.env.example` templates; Vercel/Railway secrets for deploy.',
);
add(
  'Batch multiple nameplates?',
  'Run separate build jobs with distinct slugs; CSG is per job — script loops on your side.',
);
add(
  'STL binary twice?',
  '**.cad** duplicates **STL bytes** in this stack for some importer compatibility — same geometry.',
);
add(
  'User wants “exactly the sketch” — process?',
  'Raster sketch → **vector-scan** → SVG extrusion; if sketch is messy, clean up contrast in Photoshop/Procreate first.',
);
add(
  'Analyze then edit JSON before build — recommended?',
  'Yes — **always review** plate mm and stone fields; vision can misread glare. Editing JSON (where UI allows) reduces rebuild cycles.',
);
add(
  'Primary features: photo, text, vectors, 3D print — tie together.',
  '**Photo+text** → Complex Analyze JSON → **Build** → STL. **Vector** → vector-scan → build with **`vectorId`**. **Font** → jewelry-build with opentype. All export **print-ready STL in mm** for slicer; **OBJ** for editing “sharp” in Blender/dashboard mesh tools.',
);

// --- Reliability, vision vs fine-tune, “no questions” execution
add(
  'My fine-tune job failed with internal error — what do I do?',
  'Re-run **`npm run finetune`** from `matrix-ai-hub` — the script validates JSONL, retries uploads, and can try **`FINETUNE_TRY_MODELS`** (default: `gpt-4o-mini-2024-07-18`, then `gpt-4o-2024-08-06`). Check billing and https://status.openai.com. Poll logs print `failed_reason` when OpenAI returns it.',
);
add(
  'Does my fine-tuned model analyze photos in Complex?',
  '**Not automatically.** Fine-tuning teaches **text** style on `ft:…` models. **Photo analysis** in Complex uses **`OPENAI_VISION_MODEL`** (default **`gpt-4o`**) at runtime — that is separate from your `LLM_MODEL` fine-tune. Vision fine-tuning on OpenAI uses special image JSONL and excludes many real product photos (e.g. faces); for jewelry, rely on **gpt-4o vision + strong brief text**.',
);
add(
  'User: “Build exactly this — 38mm wide, 2.2mm thick, iced outline, no questions.”',
  'Return one concrete plan: `exactEnvelope` / plate mm to 38mm width, `totalDepthMm` ~2.2, `referenceIced: true`, `printTight: false` for final or `printTight: true` for first test. List STL path `generated/` and remind: OBJ for Blender sharp edits. No clarifying questions — state assumptions in `cadNotes` only.',
);
add(
  'How do I make vision follow my numbers when the photo is ambiguous?',
  'Put **authoritative mm in the text field** every time. The server merges image + text; **text overrides** for dimensions. Repeat critical numbers in the first line of the brief.',
);
add(
  'What is OPENAI_VISION_MODEL for?',
  'Sets the **multimodal** model for `/api/complex/analyze` when an image is attached. Default **`gpt-4o`**. Keep it on a vision-capable snapshot; your **`LLM_MODEL`** fine-tune applies to **text-only** Complex and Hub chat.',
);
add(
  'Dashboard: where is the mesh after Complex build?',
  'Check server response and `generated/` for **`complex_*_main.stl`** / **`.obj`**; Forge loads previews; download STL for print and OBJ for editing.',
);
add(
  'Fine-tune vs prompt — which wins?',
  '**System prompts** (elite Matrix prompt + Complex JSON schema) define hard rules. **Fine-tune** nudges tone and vocabulary. Both together: set `LLM_MODEL=ft:…` after a succeeded job.',
);
add(
  'Job status cancelled — why?',
  'You may have cancelled in the dashboard, hit org limits, or a rare OpenAI queue issue. Create a new job with **`npm run finetune`**; the script uploads a fresh file each run.',
);
add(
  'Train to the max — minimum examples?',
  'OpenAI supervised SFT needs **enough diverse lines**; this repo generates **many** Q&A pairs via `npm run generate-sft`. Re-run **`npm run generate-sft`** then **`npm run finetune`** after editing the generator.',
);
add(
  'Why validate JSONL before upload?',
  'Catches bad lines early so OpenAI does not reject the file at validation — `npm run validate-sft` runs the same checks as **`run-finetune`**.',
);
add(
  'Slicer says non-manifold — whose fault?',
  'Mesh CSG can produce edge cases — run **Mesh → Clean Up** in Blender, or **Make Manifold** in your slicer; export STL in mm from the workshop first.',
);
add(
  'I want the AI to never ask me to upload a different file.',
  'In Hub, the model should **proceed with what you sent**: suggest invert/threshold **as optional fixes**, not blockers. For trace noise, recommend **`vectorCurveSteps`** and re-trace only if build fails.',
);
add(
  'Complex Analyze returned JSON missing a key — fix?',
  'Re-run Analyze with a one-line reminder: “Include all schema keys from the template.” If your server uses JSON mode, keep prompts short; extremely long briefs can truncate — stay under a few thousand characters.',
);

fs.writeFileSync(out, rows.join('\n') + '\n', 'utf8');
console.log('Wrote', rows.length, 'examples to', out);
