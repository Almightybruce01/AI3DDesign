# Training your own “big” model (not on Vercel)

Vercel runs **short serverless functions** — no multi-hour GPU jobs, no 70B+ weight training in production.

## Practical setup

1. **Train / fine-tune elsewhere** (pick one):
   - **OpenAI fine-tuning** — upload JSONL, job runs on their GPUs; you get a model id `ft:...` → set `LLM_MODEL` + `OPENAI_API_KEY` + default `OPENAI_BASE_URL` in Matrix AI Hub.
   - **Together / Fireworks / Groq / Anyscale** — hosted weights; set `OPENAI_BASE_URL` to their OpenAI-compatible endpoint and `LLM_MODEL` to their model string.
   - **Self-hosted GPU** (RunPod, Lambda, vast.ai, your own box) — run **vLLM**, **text-generation-inference**, or **Ollama** with a large checkpoint; expose HTTPS; set `OPENAI_BASE_URL` to `https://your-gpu-host/v1` (or tunnel with Cloudflare).
   - **LoRA / full fine-tune** — use **Axolotl**, **Llama-Factory**, or **Unsloth** on a rented A100/H100; export merged weights; serve with vLLM. Jobs often run **hours** (your 12h budget is normal).

2. **Wire Matrix AI Hub** — only needs:
   - `OPENAI_API_KEY` (if your inference server requires it)
   - `OPENAI_BASE_URL`
   - `LLM_MODEL`

3. **Wire Matrix Workshop** (this repo’s `server.js`) — same variables if you want the dashboard and workshop to share one inference stack; or keep workshop on OpenAI and hub on your custom endpoint.

## Data for jewelry CAD

Curate JSONL or chat examples: briefs → structured plans, vector troubleshooting, STL export checklists. Quality beats raw size.

## Security

Never commit API keys. Use Vercel **Environment Variables** (Production / Preview).
