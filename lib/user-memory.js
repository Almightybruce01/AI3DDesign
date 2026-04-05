'use strict';

const fs = require('fs').promises;
const path = require('path');
const DEFAULT = {
  version: 1,
  imageProvider: 'auto',
  imageStyleKey: 'studio',
  promptPrefix: '',
  enhancePromptByDefault: false,
  lastPrompts: [],
};

async function loadMemory(root) {
  const f = path.join(root, 'data', 'user-memory.json');
  try {
    const raw = JSON.parse(await fs.readFile(f, 'utf8'));
    return {
      ...DEFAULT,
      ...raw,
      lastPrompts: Array.isArray(raw.lastPrompts) ? raw.lastPrompts.map(String) : [],
    };
  } catch {
    return { ...DEFAULT };
  }
}

function pickMemoryPatch(body) {
  const pick = {};
  if (body == null || typeof body !== 'object') return pick;
  const allowedProviders = new Set(['auto', 'openai', 'replicate', 'local']);
  if (body.imageProvider != null && allowedProviders.has(String(body.imageProvider))) {
    pick.imageProvider = String(body.imageProvider);
  }
  const allowedStyles = new Set(['studio', 'editorial', 'cad_technical', 'luxury_dark']);
  if (body.imageStyleKey != null && allowedStyles.has(String(body.imageStyleKey))) {
    pick.imageStyleKey = String(body.imageStyleKey);
  }
  if (body.promptPrefix != null) pick.promptPrefix = String(body.promptPrefix).slice(0, 1200);
  if (typeof body.enhancePromptByDefault === 'boolean') pick.enhancePromptByDefault = body.enhancePromptByDefault;
  if (body.saveCurrentPrompt === true && body.currentPrompt) {
    pick._appendPrompt = String(body.currentPrompt).slice(0, 800);
  }
  return pick;
}

async function saveMemory(root, body) {
  const cur = await loadMemory(root);
  const patch = pickMemoryPatch(body);
  const next = { ...cur, ...patch };
  delete next._appendPrompt;
  if (patch._appendPrompt) {
    next.lastPrompts = [patch._appendPrompt, ...cur.lastPrompts.filter((p) => p !== patch._appendPrompt)].slice(0, 40);
  }
  const dir = path.join(root, 'data');
  await fs.mkdir(dir, { recursive: true });
  const f = path.join(dir, 'user-memory.json');
  await fs.writeFile(f, JSON.stringify(next, null, 2), 'utf8');
  return next;
}

function publicMemorySlice(mem) {
  return {
    imageProvider: mem.imageProvider,
    imageStyleKey: mem.imageStyleKey,
    promptPrefix: mem.promptPrefix,
    enhancePromptByDefault: mem.enhancePromptByDefault,
    lastPrompts: mem.lastPrompts.slice(0, 15),
  };
}

module.exports = { loadMemory, saveMemory, publicMemorySlice, DEFAULT };
