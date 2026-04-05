#!/usr/bin/env node
/**
 * Validates training JSONL for OpenAI supervised fine-tuning (chat messages format).
 * Exits 1 on first error. Prints stats on success.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export function validateSftJsonlFile(jsonlPath) {
  const raw = fs.readFileSync(jsonlPath, 'utf8');
  const lines = raw.split(/\n/).filter((l) => l.trim().length > 0);
  const errors = [];
  let maxAssistant = 0;
  let maxUser = 0;
  let totalChars = 0;

  if (lines.length < 5) {
    errors.push(`Too few examples (${lines.length}); add more rows for reliable fine-tuning.`);
  }

  lines.forEach((line, i) => {
    const n = i + 1;
    let o;
    try {
      o = JSON.parse(line);
    } catch (e) {
      errors.push(`Line ${n}: invalid JSON — ${e.message}`);
      return;
    }
    const msgs = o.messages;
    if (!Array.isArray(msgs) || msgs.length < 2) {
      errors.push(`Line ${n}: messages must be array with at least 2 turns`);
      return;
    }
    const roles = msgs.map((m) => m.role);
    if (!roles.includes('user') || !roles.includes('assistant')) {
      errors.push(`Line ${n}: need at least one user and one assistant message`);
    }
    msgs.forEach((m, j) => {
      if (!m.role || typeof m.content === 'undefined') {
        errors.push(`Line ${n} msg ${j}: missing role or content`);
        return;
      }
      const c = m.content;
      const text = typeof c === 'string' ? c : JSON.stringify(c);
      if (typeof c === 'string' && c.length === 0) {
        errors.push(`Line ${n} msg ${j}: empty string content`);
      }
      totalChars += text.length;
      if (m.role === 'assistant' && typeof c === 'string') {
        maxAssistant = Math.max(maxAssistant, c.length);
      }
      if (m.role === 'user' && typeof c === 'string') {
        maxUser = Math.max(maxUser, c.length);
      }
    });
  });

  return {
    ok: errors.length === 0,
    errors,
    lineCount: lines.length,
    maxAssistantLen: maxAssistant,
    maxUserLen: maxUser,
    totalChars,
  };
}

const isMain =
  process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const p = process.argv[2];
  if (!p) {
    console.error('Usage: node scripts/validate-sft-jsonl.mjs <path.jsonl>');
    process.exit(1);
  }
  const r = validateSftJsonlFile(p);
  if (!r.ok) {
    console.error('[validate-sft-jsonl] FAILED');
    r.errors.forEach((e) => console.error(' ', e));
    process.exit(1);
  }
  console.log(
    `[validate-sft-jsonl] OK — ${r.lineCount} examples, max assistant chars ${r.maxAssistantLen}, max user chars ${r.maxUserLen}`,
  );
}
