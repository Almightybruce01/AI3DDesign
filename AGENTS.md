# AI3DDesign — agent notes (jewelry / Matrix Workshop)

Use this when changing CAD generation or explaining exports to the user.

## Pipeline

- **`scripts/jewelry-build.mjs`** — opentype.js **or** traced SVG (`vectorSvgPath`) → `ExtrudeGeometry` + backing slab → **three-bvh-csg** subtracts **blind seats**. **`scripts/vector-import.mjs`** nests potrace paths into outers/holes for extrusion.
- **`POST /api/jewelry/vector-scan`** — multipart `image` → sharp preprocess → **potrace** → `generated/vector_<ts>.svg`; UI stores `vectorId` and **`POST /api/jewelry/build`** with `{ vectorId }` uses that outline instead of text.
- **`scripts/generate-3dprint-bruce-pendant.mjs`** — fixed **BRUCE** preset (6×2×0.5 in): `referenceIced: true`, `printTight: false`, bold font, letter overlap.
- **API** — `POST /api/jewelry/build` runs the same script via temp JSON (`server.js`).
- **AI previews** — `lib/ai-images.js` + `POST /api/ai/preview-image`: **OpenAI DALL·E 3** (if `OPENAI_API_KEY`), else **Replicate Flux Schnell** (if `REPLICATE_API_TOKEN`), else **local** HD procedural SVG→PNG. Optional **GPT-4o-mini** prompt expansion (`enhancePrompt`) when OpenAI key is set. Copy **`.env.example`** → `.env`.
- **User memory** — `data/user-memory.json` (gitignored): last prompts, default engine/look/prefix. **`GET /api/ai/config`**, **`GET/POST /api/user/memory`**. Workshop: **Save engine + look as default**.

## Key config flags

| Flag | Effect |
|------|--------|
| `printTight` | Fewer segments, sparse pavé, no bevel — smaller STL, faster slice, less “iced” detail. |
| `referenceIced` | Triple-row outline pavé, denser baguette grid, more frame/bail rounds — closer to photo reference, heavier CSG. |
| `letterAdvanceScale` | `< 1` pulls glyphs together so the plate reads as **one connected slab** (kerning). |
| `exactEnvelope` + `targetLengthMm` / `targetHeightMm` | Non-uniform XY scale to hit dimensions. |
| `eliteSeats` | Fancy round seats (lathe profile) vs simple cylinders. |
| `fontFile` | TTF path (e.g. `fonts/Roboto-Bold.ttf` for heavy block letters). |
| `vectorSvgPath` / `vectorId` (API) | Absolute path to traced SVG, or server resolves `generated/<vectorId>.svg`. |
| `vectorCurveSteps` | Subdivisions when flattening SVG bezels into polygons (default ~6 in build). |

## Seat logic

- **Outline pavé** — `makeOutlinePaveRings` walks resampled glyph outlines (outer + counters) with normal offsets (`rowOffsets`).
- **Baguettes** — `makeBaguetteSeats` places a grid **only where** the point lies inside the letter **outer** contour and **outside** inner contours (counters). This avoids cutters in holes of **B/R/O** etc.
- **Bail** — torus union on body + `makeBailSeats` on a circle above the plate.

## Outputs

- **`generated/<name>.obj`** — large mesh for preview; header includes `o <basename>`.
- **`.stl` / `.cad`** — binary STL (same bytes twice); use for slicers.

## Reference image

Product target for BRUCE: `assets/bruce_pendant_reference.png` (in-repo copy of the client photo). Goal: **same layout as the photo**, with **negative seats** instead of stones.

## Performance

Full `referenceIced` BRUCE builds can take **many minutes** (batched boolean union of hundreds of brushes). Do not assume fast iteration without `printTight` or reduced `roundCount`.

## Deployment

- **`server.js`** sets `ROOT = __dirname` and serves `public/`, `generated/`, `uploads/`, and `/nm` (Three) from that directory — **not** from `process.cwd()`. Ship the full repo tree next to `server.js` (`scripts/`, `lib/`, `fonts/`, `public/`, `node_modules/`). See **`DEPLOY.md`**, **`Dockerfile`**, and **`Procfile`**.
- **LLM routing** — Chat/completions use **`lib/openai-compatible.js`**: **`GROQ_API_KEY`** (free tier, fast, defaults API base to Groq) and/or **`OPENAI_API_KEY`** (vision, DALL·E, OpenAI models). Optional `OPENAI_BASE_URL`, or keyless **`OPENAI_ALLOW_NO_KEY=1`** for local Ollama. Not dependent on Cursor.

### AI model defaults (elite stack)

| Role | Env | Code |
|------|-----|------|
| **Vision** (Complex photo + chain photo) | `OPENAI_VISION_MODEL` | Default **`gpt-4o-2024-08-06`** via **`lib/model-defaults.js`** → `visionModel()` |
| **Text** (Hub chat, Complex text-only, copilot when using OpenAI) | `LLM_MODEL` | Fine-tuned **`ft:…`** after `npm run finetune` in **`matrix-ai-hub`** |
| **Override Complex JSON text** | `COMPLEX_TEXT_MODEL` | Rare; else same as `LLM_MODEL` / Groq / `gpt-4o` |

- **`npm run verify:ai`** (repo root) — checks `.env`, SFT JSONL, and resolved vision/text models.
- **`npm run finetune:sync`** (in **`matrix-ai-hub`**) — sync latest succeeded **`ft:`** id into root **`.env`**.
- **Matrix AI Hub UI** — `matrix-ai-hub/components/ChatPanel.tsx`: ChatGPT-style streaming, **Stop**, **New chat**, **Copy**, **markdown** (`react-markdown` + GFM); model badge from **`GET /api/health`**. Chat API uses **`ELITE_SYSTEM_PROMPT`** + optional **`LLM_SYSTEM_APPEND`**.
