# Best setup — Matrix Workshop + AI (now)

## Sites to open (bookmarks)

| What | URL |
|------|-----|
| **Groq API keys (free, fast chat)** | https://console.groq.com/keys |
| **OpenAI (vision, DALL·E, optional fine-tunes)** | https://platform.openai.com/api-keys |
| **Replicate (Flux / photo tools, optional)** | https://replicate.com/account/api-tokens |
| **Vercel (host Matrix AI Hub)** | https://vercel.com/new |
| **Local workshop** | http://localhost:3000 |
| **Local Matrix AI Hub** | http://localhost:3010 |

---

## 1. Install the workshop (this repo)

```bash
cd /path/to/AI3DDesign
cp .env.example .env
npm install
```

---

## 2. Configure `.env` (best combo)

**Minimum for strong free text AI (copilot, text-only Complex, etc.):**

1. Open **https://console.groq.com/keys** → create API key.
2. In `.env` add:
   ```env
   GROQ_API_KEY=gsk_...
   ```

**Best overall (text + vision + catalog images):**

3. Open **https://platform.openai.com/api-keys** → create secret key.
4. In `.env` add:
   ```env
   OPENAI_API_KEY=sk-...
   ```
   Use OpenAI for: chain **photo** vision, Complex **with photo**, DALL·E previews, etc.

**Optional:**

```env
REPLICATE_API_TOKEN=r8_...   # Flux / instruct-pix2pix — https://replicate.com/account/api-tokens
```

---

## 3. Run the workshop

```bash
npm start
```

Open **http://localhost:3000** — Build jewelry, Complex Studio, Cuban lab, vector trace, Forge view.

---

## 4. Matrix AI Hub (separate dashboard + same LLM rules)

```bash
cd matrix-ai-hub
cp .env.example .env.local
```

Paste the **same** `GROQ_API_KEY` and/or `OPENAI_API_KEY` into `.env.local`.  
Optional: `WORKSHOP_API_BASE_URL=http://localhost:3000` and `NEXT_PUBLIC_WORKSHOP_API=http://localhost:3000` so vector trace proxies to your local server.

```bash
npm install
npm run dev
```

Open **http://localhost:3010**.

---

## 5. Deploy Matrix AI Hub to Vercel (public URL)

1. Push this repo to **GitHub**.
2. Go to **https://vercel.com/new** → Import that repo.
3. **Root Directory** → `matrix-ai-hub` (if the repo is the full monorepo).
4. **Environment variables** (Production):
   - `GROQ_API_KEY` = your Groq key  
   - `OPENAI_API_KEY` = your OpenAI key (recommended for full features)  
   - `WORKSHOP_API_BASE_URL` = `https://your-workshop-public-url` (Node server you deploy separately)  
   - `NEXT_PUBLIC_WORKSHOP_API` = same URL  
5. Deploy. Your app URL will be **`https://<project-name>.vercel.app`** (shown on the project’s **Domains** page).

Deploy the **Node workshop** separately (Railway, Fly.io, Render, VPS, Docker) using **`DEPLOY.md`** — Vercel does not run `server.js` for this project.

---

## Quick reference: what each key does

| Key | Role |
|-----|------|
| **GROQ_API_KEY** | Free, fast **text** LLM (default when OpenAI key absent). |
| **OPENAI_API_KEY** | **Vision** (chain photo, image briefs), **DALL·E**, OpenAI chat models. |
| **REPLICATE_API_TOKEN** | Flux / optional photo→photo. |

No Cursor account required for any of this.
