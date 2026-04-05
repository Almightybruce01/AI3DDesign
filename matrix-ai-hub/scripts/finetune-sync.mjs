#!/usr/bin/env node
/**
 * Checks OpenAI fine-tuning jobs, polls until success/failure (optional),
 * and writes LLM_MODEL to repo root .env when a job succeeds.
 *
 * Usage:
 *   node scripts/finetune-sync.mjs              # list + poll latest job up to FINETUNE_SYNC_MAX_MIN (default 90)
 *   node scripts/finetune-sync.mjs --no-poll    # list only
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import OpenAI from 'openai';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const hubRoot = path.join(__dirname, '..');
const repoRoot = path.join(hubRoot, '..');
const envPath = path.join(repoRoot, '.env');

dotenv.config({ path: path.join(hubRoot, '.env.local') });
dotenv.config({ path: path.join(hubRoot, '.env') });
dotenv.config({ path: envPath });

const apiKey = process.env.OPENAI_API_KEY?.trim();
const noPoll = process.argv.includes('--no-poll');
const maxMin = Math.max(
  0,
  Number.parseFloat(process.env.FINETUNE_SYNC_MAX_MIN ?? '90') || 90,
);
const pollSec = Math.max(10, Number.parseInt(process.env.FINETUNE_SYNC_POLL_SEC ?? '25', 10) || 25);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function writeLlmModelToEnv(modelId) {
  let raw = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  const line = `LLM_MODEL=${modelId}`;
  if (/^LLM_MODEL=/m.test(raw)) {
    raw = raw.replace(/^LLM_MODEL=.*$/m, line);
  } else {
    raw = raw.replace(/\n?$/, `\n${line}\n`);
  }
  fs.writeFileSync(envPath, raw, 'utf8');
  console.log(`[finetune-sync] Updated ${envPath}`);
  console.log(`[finetune-sync] LLM_MODEL=${modelId}`);
}

async function main() {
  if (!apiKey) {
    console.error('[finetune-sync] Missing OPENAI_API_KEY in .env');
    process.exit(1);
  }

  const openai = new OpenAI({ apiKey });

  const list = await openai.fineTuning.jobs.list({ limit: 15 });
  const jobs = list.data || [];
  if (!jobs.length) {
    console.log('[finetune-sync] No fine-tuning jobs found on this API key.');
    process.exit(0);
  }

  console.log('[finetune-sync] Recent jobs (newest first):');
  for (const j of jobs) {
    const mid = j.fine_tuned_model || '—';
    console.log(`  ${j.id}  ${j.status?.padEnd(14)} ${j.model} → ${mid}`);
    if (j.status === 'failed' && j.error) console.log('     error:', JSON.stringify(j.error));
  }

  const latest = jobs[0];
  const terminal = new Set(['succeeded', 'failed', 'cancelled']);

  if (latest.status === 'succeeded' && latest.fine_tuned_model) {
    const current = (process.env.LLM_MODEL || '').trim();
    if (current === latest.fine_tuned_model) {
      console.log('\n[finetune-sync] .env LLM_MODEL already matches latest succeeded job.');
      process.exit(0);
    }
    writeLlmModelToEnv(latest.fine_tuned_model);
    console.log('\n[finetune-sync] Done — restart workshop + hub to pick up LLM_MODEL.');
    process.exit(0);
  }

  if (terminal.has(latest.status) && latest.status !== 'succeeded') {
    console.log(
      `\n[finetune-sync] Latest job is ${latest.status}. Start a new job: cd matrix-ai-hub && npm run finetune:queue (or npm run finetune to wait).`,
    );
    process.exit(1);
  }

  if (noPoll) {
    console.log('\n[finetune-sync] Job still running; re-run without --no-poll to wait and sync .env');
    process.exit(0);
  }

  const deadline = Date.now() + maxMin * 60 * 1000;
  let job = await openai.fineTuning.jobs.retrieve(latest.id);
  console.log(`\n[finetune-sync] Polling ${job.id} (max ${maxMin} min)…`);

  while (!terminal.has(job.status)) {
    if (Date.now() > deadline) {
      console.warn(`[finetune-sync] Timeout — still ${job.status}. Check https://platform.openai.com/finetune`);
      process.exit(2);
    }
    process.stdout.write(`\r[finetune-sync] ${job.id}  ${job.status}                    `);
    await sleep(pollSec * 1000);
    job = await openai.fineTuning.jobs.retrieve(latest.id);
  }
  console.log('');

  if (job.status === 'succeeded' && job.fine_tuned_model) {
    writeLlmModelToEnv(job.fine_tuned_model);
    console.log('[finetune-sync] Done — restart `npm start` (workshop) and hub dev server.');
    process.exit(0);
  }

  console.error('[finetune-sync] Job ended:', job.status);
  if (job.error) console.error(JSON.stringify(job.error, null, 2));
  if (job.failed_reason) console.error('failed_reason:', job.failed_reason);
  process.exit(1);
}

main().catch((e) => {
  console.error('[finetune-sync]', e?.message || e);
  process.exit(1);
});
