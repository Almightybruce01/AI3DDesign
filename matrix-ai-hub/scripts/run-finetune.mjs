#!/usr/bin/env node
/**
 * Uploads training/matrix-workshop-sft.jsonl and starts an OpenAI fine-tuning job.
 * Validates JSONL, polls until success/failure, retries alternate base models on failure.
 *
 * Env:
 *   OPENAI_API_KEY (required)
 *   FINETUNE_TRY_MODELS — comma-separated base models (default: gpt-4o-mini-2024-07-18,gpt-4o-2024-08-06)
 *   FINETUNE_POLL_SEC — seconds between status polls (default 20)
 *   FINETUNE_MAX_WAIT_MIN — max wait per job in minutes (default 120); 0 = no poll (queue only)
 *   FINETUNE_RETRIES — upload+create retries per model on 429/5xx (default 3)
 *
 * Loads env from: matrix-ai-hub/.env.local → matrix-ai-hub/.env → parent AI3DDesign/.env
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import { validateSftJsonlFile } from './validate-sft-jsonl.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const hubRoot = path.join(__dirname, '..');
const repoRoot = path.join(hubRoot, '..');

dotenv.config({ path: path.join(hubRoot, '.env.local') });
dotenv.config({ path: path.join(hubRoot, '.env') });
dotenv.config({ path: path.join(repoRoot, '.env') });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const apiKey = process.env.OPENAI_API_KEY?.trim();
const jsonlPath = path.join(hubRoot, 'training/matrix-workshop-sft.jsonl');

const DEFAULT_MODELS = 'gpt-4o-mini-2024-07-18,gpt-4o-2024-08-06';
const tryModels = (process.env.FINETUNE_TRY_MODELS || DEFAULT_MODELS)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const pollSec = Math.max(5, Number.parseInt(process.env.FINETUNE_POLL_SEC ?? '20', 10) || 20);
const maxWaitRaw = process.env.FINETUNE_MAX_WAIT_MIN;
const maxWaitMin =
  maxWaitRaw === undefined || maxWaitRaw === ''
    ? 120
    : Math.max(0, Number.parseFloat(maxWaitRaw));
const uploadRetries = Math.max(1, parseInt(process.env.FINETUNE_RETRIES || '3', 10) || 3);

if (!apiKey) {
  console.error(`
[matrix-ai-hub] Missing OPENAI_API_KEY.

Add your key to one of:
  - ${path.join(repoRoot, '.env')}
  - ${path.join(hubRoot, '.env.local')}

Then run:  npm run finetune
`);
  process.exit(1);
}

if (!fs.existsSync(jsonlPath)) {
  console.error('Missing dataset:', jsonlPath);
  process.exit(1);
}

const v = validateSftJsonlFile(jsonlPath);
if (!v.ok) {
  console.error('[finetune] JSONL validation failed:');
  v.errors.forEach((e) => console.error(' ', e));
  process.exit(1);
}
console.log(
  `[finetune] JSONL OK — ${v.lineCount} examples (max assistant ${v.maxAssistantLen} chars)`,
);

const openai = new OpenAI({ apiKey });

async function withRetries(fn, label) {
  let lastErr;
  for (let attempt = 1; attempt <= uploadRetries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const msg = e?.message || String(e);
      const retriable =
        /429|500|502|503|504|timeout|ECONNRESET/i.test(msg) || e?.status >= 500;
      console.warn(`[finetune] ${label} attempt ${attempt}/${uploadRetries} failed:`, msg.slice(0, 200));
      if (!retriable && attempt === 1) throw e;
      if (attempt < uploadRetries) await sleep(2000 * attempt);
    }
  }
  throw lastErr;
}

async function uploadFile() {
  return withRetries(async () => {
    const file = await openai.files.create({
      file: fs.createReadStream(jsonlPath),
      purpose: 'fine-tune',
    });
    return file;
  }, 'files.create');
}

async function createJob(trainingFileId, baseModel) {
  return withRetries(async () => {
    return openai.fineTuning.jobs.create({
      training_file: trainingFileId,
      model: baseModel,
    });
  }, `jobs.create(${baseModel})`);
}

async function pollJob(jobId) {
  const deadline = maxWaitMin <= 0 ? 0 : Date.now() + maxWaitMin * 60 * 1000;
  if (maxWaitMin <= 0) {
    console.log('[finetune] FINETUNE_MAX_WAIT_MIN=0 — skipping poll (check dashboard).');
    return await openai.fineTuning.jobs.retrieve(jobId);
  }
  const terminal = new Set(['succeeded', 'failed', 'cancelled']);
  let job = await openai.fineTuning.jobs.retrieve(jobId);
  while (!terminal.has(job.status)) {
    if (Date.now() > deadline) {
      console.warn(
        `[finetune] Poll timeout after ${maxWaitMin}m — job still ${job.status}. Check https://platform.openai.com/finetune`,
      );
      return job;
    }
    await sleep(pollSec * 1000);
    job = await openai.fineTuning.jobs.retrieve(jobId);
    process.stdout.write(`\r[finetune] ${jobId} status: ${job.status}                    `);
  }
  console.log('');
  return job;
}

let lastFileId = null;

for (const baseModel of tryModels) {
  console.log('\n[finetune] Trying base model:', baseModel);

  console.log('Uploading', jsonlPath, '…');
  const file = await uploadFile();
  lastFileId = file.id;
  console.log('File id:', file.id);

  let job;
  try {
    console.log('Starting fine-tune job…');
    job = await createJob(file.id, baseModel);
  } catch (e) {
    console.error(`[finetune] Could not start job for ${baseModel}:`, e?.message || e);
    continue;
  }

  console.log(`Job id: ${job.id}  initial status: ${job.status}`);

  if (maxWaitMin <= 0) {
    console.log(`
[finetune] FINETUNE_MAX_WAIT_MIN=0 — job queued only (no polling).
Watch: https://platform.openai.com/finetune
When succeeded, set LLM_MODEL=<fine_tuned_model> in ${path.join(repoRoot, '.env')}
`);
    process.exit(0);
  }

  job = await pollJob(job.id);

  if (job.status === 'succeeded') {
    const mid = job.fine_tuned_model || job.model;
    console.log(`
=== SUCCEEDED ===
  fine_tuned_model: ${mid}
  base:             ${baseModel}

Set in ${path.join(repoRoot, '.env')}:
  LLM_MODEL=${mid}

Vercel (hub): same LLM_MODEL + OPENAI_API_KEY
`);
    process.exit(0);
  }

  console.error(`\n[finetune] Job ended with status: ${job.status}`);
  if (job.error) console.error('  error object:', JSON.stringify(job.error, null, 2));
  if (job.failed_reason) console.error('  failed_reason:', job.failed_reason);
  console.error('  See events: https://platform.openai.com/finetune\n');
}

console.error('[finetune] All base models exhausted. Fix data/billing or check OpenAI status.');
if (lastFileId) console.error('Last uploaded file id:', lastFileId);
process.exit(1);
