# Where to open your dashboard

| Where | URL |
|--------|-----|
| **This machine (dev)** | [http://localhost:3010](http://localhost:3010) — run `cd matrix-ai-hub && npm run dev` |
| **Production** | **Vercel → your Hub project → Domains** — usually `https://<project-name>.vercel.app` |

## Public deploy without touching another Vercel project

1. Open [vercel.com/new](https://vercel.com/new) → **Add New…** → **Project** (a **new** project name, e.g. `matrix-ai-hub-public`).
2. Import the **same** Git repo that contains this monorepo.
3. **Root Directory** → `matrix-ai-hub` (required).
4. **Environment variables** (Production): same as local — at minimum `OPENAI_API_KEY`, `GROQ_API_KEY` (optional), `LLM_MODEL`, `WORKSHOP_API_BASE_URL`, `NEXT_PUBLIC_WORKSHOP_API` pointing at your **public HTTPS** workshop API.
5. **Deploy**. The live URL is on **Project → Domains** (and is public by default).

If you **already** have a project whose root is `matrix-ai-hub`, do **not** create a duplicate unless you want two URLs — just **Redeploy** that project and use its existing domain.

The Node **workshop** (`server.js`) is **not** this app; host it separately (Railway, Fly, etc.) and put that HTTPS origin in `WORKSHOP_API_BASE_URL`.
