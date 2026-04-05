# Fine-tune your own model (OpenAI example)

I **cannot** run training for you from Cursor (needs your API key, billing, and hours on OpenAI’s side). You can start from `matrix-workshop-sft.jsonl` and add rows from **your** ideal Q&A.

## 1. Install OpenAI CLI

```bash
pip install openai
# or: brew install openai/tap/openai-cli
```

## 2. Upload file

```bash
export OPENAI_API_KEY=sk-...
openai api files.create -p fine-tune -f matrix-ai-hub/training/matrix-workshop-sft.jsonl
```

Note the `id` (e.g. `file-abc123`).

## 3. Create job

```bash
openai api fine_tuning.jobs.create -t file-abc123 -m gpt-4o-mini-2024-07-18
```

Wait until status `succeeded`. Copy the resulting **model id** (`ft:...`).

## 4. Vercel env

In Matrix AI Hub project:

- `LLM_MODEL` = `ft:...`
- `OPENAI_API_KEY` = same org key
- `OPENAI_BASE_URL` = `https://api.openai.com/v1` (default)

Redeploy.

## Extend the dataset

Each line:

```json
{"messages":[{"role":"user","content":"..."},{"role":"assistant","content":"..."}]}
```

Add your real workshop questions and the answers you want duplicated. More **quality** beats raw length.
