#!/usr/bin/env node
/**
 * End-to-end AI stack check: env, vision/text model resolution, training file.
 * Run from repo root: npm run verify:ai
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const require = createRequire(import.meta.url);

dotenv.config({ path: path.join(root, '.env') });

const errors = [];
const ok = [];

function main() {
  const { visionModel, complexTextModel, DEFAULT_VISION_MODEL } = require(path.join(root, 'lib/model-defaults.js'));

  const hubJsonl = path.join(root, 'matrix-ai-hub/training/matrix-workshop-sft.jsonl');
  if (!fs.existsSync(hubJsonl)) {
    errors.push(`Missing ${hubJsonl}`);
  } else {
    try {
      execSync('node scripts/validate-sft-jsonl.mjs training/matrix-workshop-sft.jsonl', {
        cwd: path.join(root, 'matrix-ai-hub'),
        stdio: 'pipe',
        encoding: 'utf8',
      });
      ok.push('SFT JSONL validated (matrix-ai-hub)');
    } catch {
      errors.push('SFT JSONL invalid — run: cd matrix-ai-hub && npm run validate-sft');
    }
  }

  const oai = (process.env.OPENAI_API_KEY || '').trim();
  const groq = (process.env.GROQ_API_KEY || '').trim();
  const llm = (process.env.LLM_MODEL || '').trim();

  if (!oai && !groq) {
    errors.push('Set OPENAI_API_KEY and/or GROQ_API_KEY in .env');
  } else {
    ok.push(oai ? 'OPENAI_API_KEY set' : 'OPENAI_API_KEY missing (add for vision, DALL·E, Complex photo)');
    if (groq) ok.push('GROQ_API_KEY set');
  }

  if (llm.startsWith('ft:')) {
    ok.push(`LLM_MODEL fine-tune: ${llm.slice(0, 28)}…`);
  } else {
    ok.push('LLM_MODEL: add ft:… after fine-tune for elite text (optional)');
  }

  const vm = visionModel(process.env);
  const ct = complexTextModel(process.env);
  ok.push(`Vision default path: ${vm}${vm === DEFAULT_VISION_MODEL ? ' (pinned snapshot)' : ''}`);
  ok.push(`Complex text-only: ${ct}`);

  console.log('\n[verify:ai] Matrix Workshop AI stack\n');
  ok.forEach((m) => console.log('  ✓', m));
  errors.forEach((m) => console.log('  ✗', m));

  if (errors.length) {
    console.log('\n[verify:ai] FAILED.\n');
    process.exit(1);
  }
  console.log('\n[verify:ai] All checks passed.\n');
  process.exit(0);
}

main();
