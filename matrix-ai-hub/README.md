# Matrix AI Hub

**Separate** Next.js dashboard for your **custom / fine-tuned / large** LLM plus a **proxy** to Matrix Workshop (potrace vector trace, jewelry CSG, STL).

This folder is designed to be deployed as **its own Vercel project**, not mixed with the Node `AI3DDesign` server.

## Deploy on Vercel (clean project)

1. Push this repo to GitHub (either the whole monorepo or **only this folder** in a new repo — see below).
2. Vercel → **Add New Project** → Import repo.
3. **Root Directory**: set to `matrix-ai-hub` if the repo contains the parent `AI3DDesign` folder.
4. **Environment variables** (Production):
   - `OPENAI_API_KEY` — your inference provider key (or omit if using `OPENAI_ALLOW_NO_KEY=1` on a keyless compatible host).
   - `OPENAI_BASE_URL` — e.g. `https://api.openai.com/v1` or your OpenAI-compatible endpoint.
   - `LLM_MODEL` — e.g. `gpt-4o` or your fine-tuned id `ft:...`.
   - `WORKSHOP_API_BASE_URL` — public URL of your Matrix Workshop Node server (no trailing slash), e.g. `https://workshop.yourdomain.com`.
   - `NEXT_PUBLIC_WORKSHOP_API` — same URL, for SVG links in the browser.
5. Deploy.

## Repo layout options

| Approach | Notes |
|----------|--------|
| **Monorepo** | Keep `matrix-ai-hub/` inside AI3DDesign; Vercel **Root Directory** = `matrix-ai-hub`. |
| **Split repo** | Copy this folder to a new GitHub repo root; deploy entire repo (root = project). |

## Local dev

```bash
cd matrix-ai-hub
cp .env.example .env.local
# edit .env.local
npm install
npm run dev
```

Open [http://localhost:3010](http://localhost:3010).

## What runs where

| Capability | Where |
|------------|--------|
| Chat streaming to your model | Vercel (this app) `/api/chat` |
| Potrace SVG, jewelry build, STL | Your **Node** workshop — must be deployed separately (VPS, Railway, Fly, etc.) |
| Multi-hour model training | **Not** Vercel — see `docs/TRAINING_PIPELINE.md` |

## CORS

The vector proxy calls your workshop **from Vercel servers**. Ensure your workshop is reachable over HTTPS and allows the request (your existing `cors()` setup is typically enough).
