#!/usr/bin/env node
/**
 * Pushes selected keys from repo-root .env to Vercel (production).
 * Run: cd matrix-ai-hub && npm run sync-env
 * Flags: --dry-run (print only), --force-localhost (sync WORKSHOP_* even if localhost)
 * Requires: vercel CLI linked (`npx vercel whoami`).
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const hubRoot = path.join(__dirname, '..');
const repoRoot = path.join(hubRoot, '..');
const envPath = path.join(repoRoot, '.env');

const KEYS = [
  'OPENAI_API_KEY',
  'GROQ_API_KEY',
  'LLM_PRIMARY',
  'GROQ_CHAT_MODEL',
  'OPENAI_BASE_URL',
  'OPENAI_ALLOW_NO_KEY',
  'LLM_MODEL',
  'OPENAI_VISION_MODEL',
  'OPENAI_CHAT_MODEL',
  'REPLICATE_API_TOKEN',
  'LLM_SYSTEM_APPEND',
  'LLM_VISION_FALLBACK_NOTES',
  'WORKSHOP_API_BASE_URL',
  'NEXT_PUBLIC_WORKSHOP_API',
];

const argv = new Set(process.argv.slice(2));
const dryRun = argv.has('--dry-run');
const forceLocalhost = argv.has('--force-localhost');

function vercelBin() {
  const local = path.join(hubRoot, 'node_modules', '.bin', 'vercel');
  if (fs.existsSync(local)) return local;
  return 'npx';
}

function addToVercel(name, value, sensitive) {
  const bin = vercelBin();
  const args =
    bin === 'npx'
      ? [
          '--yes',
          'vercel',
          '--non-interactive',
          'env',
          'add',
          name,
          'production',
          '--value',
          value,
          '--yes',
          '--force',
        ]
      : ['--non-interactive', 'env', 'add', name, 'production', '--value', value, '--yes', '--force'];
  if (sensitive) args.push('--sensitive');
  execFileSync(bin, args, { cwd: hubRoot, stdio: ['ignore', 'inherit', 'inherit'], env: process.env });
}

function loadEnv(file) {
  if (!fs.existsSync(file)) {
    console.error('Missing', file);
    process.exit(1);
  }
  return dotenv.parse(fs.readFileSync(file));
}

const env = loadEnv(envPath);
const skippedEmpty = [];
const skippedLocalhost = [];
let n = 0;

for (const key of KEYS) {
  const raw = String(env[key] ?? '').trim();
  if (!raw) {
    skippedEmpty.push(key);
    continue;
  }
  if (
    !forceLocalhost &&
    (key === 'WORKSHOP_API_BASE_URL' || key === 'NEXT_PUBLIC_WORKSHOP_API') &&
    /localhost|127\.0\.0\.1/i.test(raw)
  ) {
    console.warn('[skip]', key, '(localhost — use a public HTTPS URL, or pass --force-localhost)');
    skippedLocalhost.push(key);
    continue;
  }
  const sensitive = /KEY|TOKEN|SECRET|PASSWORD/i.test(key);
  console.log('[vercel env]', key, sensitive ? '(sensitive)' : '');
  if (dryRun) {
    n += 1;
    continue;
  }
  addToVercel(key, raw, sensitive);
  n += 1;
}

const vercelHint =
  vercelBin() === 'npx' ? 'npx vercel deploy --prod --yes' : './node_modules/.bin/vercel deploy --prod --yes';

if (skippedEmpty.length) {
  console.log('\n[info] Empty in .env (not synced):', skippedEmpty.join(', '));
}
if (skippedLocalhost.length) {
  console.log('[info] Skipped localhost workshop URLs:', skippedLocalhost.join(', '));
}

console.log(
  '\nDone.',
  dryRun ? `[dry-run] would sync ${n} variable(s).` : `Synced ${n} variable(s) to production.`,
  'Redeploy:',
  vercelHint,
);
