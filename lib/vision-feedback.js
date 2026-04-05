'use strict';

const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');

const ROOT = path.join(__dirname, '..');
const FILE = path.join(ROOT, 'data', 'chain-vision-feedback.json');
const MAX = 48;

async function loadEntries() {
  try {
    const raw = await fs.readFile(FILE, 'utf8');
    const j = JSON.parse(raw);
    return Array.isArray(j) ? j : [];
  } catch {
    return [];
  }
}

async function appendEntry(entry) {
  const arr = await loadEntries();
  arr.push({
    t: Date.now(),
    correction: String(entry.correction || '').slice(0, 800),
    context: String(entry.context || '').slice(0, 800),
  });
  while (arr.length > MAX) arr.shift();
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(arr, null, 2), 'utf8');
  return arr.length;
}

/** Sync slice for prompt injection (last N). */
function getFeedbackPromptSlice(maxLines = 10) {
  try {
    if (!fsSync.existsSync(FILE)) return '';
    const raw = fsSync.readFileSync(FILE, 'utf8');
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr) || !arr.length) return '';
    const lines = arr
      .slice(-maxLines)
      .map((x) => `- (${new Date(x.t).toISOString().slice(0, 10)}) ${x.correction}${x.context ? ` — ${x.context}` : ''}`);
    return `\nUser preference memory (honor these biases when estimating):\n${lines.join('\n')}\n`;
  } catch {
    return '';
  }
}

module.exports = {
  loadEntries,
  appendEntry,
  getFeedbackPromptSlice,
};
