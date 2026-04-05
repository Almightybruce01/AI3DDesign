# Deploying Matrix Workshop (AI3DDesign)

## What must live together

The Node process resolves **all** file paths from the directory that contains `server.js` (not from `process.cwd()`). Deploy the **whole repo** (or the Docker image built from it) so these paths exist next to `server.js`:

| Path | Role |
|------|------|
| `public/` | Workshop UI (`/`, `/css/`, `/js/`, `/nm/` maps to `node_modules`) |
| `scripts/` | `jewelry-build.mjs`, `complex-pendant-build.mjs`, cuban chain, etc. |
| `lib/` | AI helpers, presets, estimates |
| `fonts/` | TTF inputs for builds |
| `generated/` | Created at runtime (OBJ/STL/SVG exports); mount a volume in production if you need persistence |
| `uploads/` | Temp uploads; optional volume |
| `data/` | Optional `user-memory.json` (gitignored locally) |

Set secrets via the host: **`OPENAI_API_KEY`** (or any vendor’s key for an OpenAI-compatible API), **`OPENAI_BASE_URL`** if not OpenAI (e.g. `http://127.0.0.1:11434/v1` for Ollama + **`OPENAI_ALLOW_NO_KEY=1`**), **`REPLICATE_API_TOKEN`**, optional **`BLENDER_PATH`**, **`PORT`**.

## Matrix AI Hub (separate Vercel app)

The **`matrix-ai-hub/`** folder is a **standalone Next.js** dashboard (custom LLM chat + workshop vector proxy). Deploy it as **another Vercel project** with root directory `matrix-ai-hub` — see **`matrix-ai-hub/README.md`**. It does not replace the Node workshop.

## Docker

From the repo root:

```bash
docker build -t ai3ddesign-workshop .
docker run --rm -p 3000:3000 --env-file .env ai3ddesign-workshop
```

## Platform hosts

- **Heroku / Railway / Render**: use the included `Procfile` (`web: node server.js`). Set the root directory to the repository root so `npm install` / build and start run from the same tree as `server.js`.
- **Process managers (PM2, systemd)**: run `node server.js` with **`cwd`** set to the clone directory (recommended), or any cwd — paths are anchored to `server.js`’s folder now.

## Client build

The live workshop uses **native ES modules** from `public/js/` and `importmap` / `/nm/three`; no webpack bundle is required for production. The `npm run build` script is optional if you add a webpack config later.
