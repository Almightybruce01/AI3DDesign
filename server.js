require('dotenv').config();

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const { execFileSync, spawn } = require('child_process');
const sharp = require('sharp');
const potrace = require('potrace');
const { Potrace } = potrace;
const { generateJewelryPreviewImage } = require('./lib/ai-images');
const {
  formatEta,
  estimateJewelryBuildSeconds,
  estimateComplexBuildSeconds,
  estimateCubanBuildSeconds,
  estimateVectorScanSeconds,
  estimateComplexAnalyzeSeconds,
  estimatePhotoToPrintSeconds,
} = require('./lib/build-time-estimates');
const { loadMemory, saveMemory, publicMemorySlice } = require('./lib/user-memory');
const {
  getCubanPresets,
  getCubanPresetById,
  convertLength,
  matchClosestPreset,
} = require('./lib/cuban-chain-presets');
const { analyzeChainPhoto, refineChainImageReplicate } = require('./lib/chain-photo-ai');
const { CUBAN_CHAIN_REFERENCE } = require('./lib/cuban-chain-reference');
const { EXTENDED } = require('./lib/cuban-chain-knowledge-extended');
const { calibrateAnalysis } = require('./lib/calibrate-spec');
const { appendEntry, loadEntries } = require('./lib/vision-feedback');
const { writePrintPack } = require('./lib/print-pack');
const { stlStatsFromFile } = require('./lib/stl-stats');
const { analyzeComplexBrief } = require('./lib/complex-build-ai');
const { planToComplexBuildConfig } = require('./lib/complex-plan-map');
const { runWorkshopCopilot } = require('./lib/workshop-copilot-ai');
const { llmConfigured, openaiApiBase, visionModel, complexTextModel } = require('./lib/openai-compatible');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const SERVER_STARTED_AT = new Date().toISOString();
let PACKAGE_VERSION = '1.0.0';
try {
  PACKAGE_VERSION = JSON.parse(fsSync.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version || PACKAGE_VERSION;
} catch (_) {}

app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));
app.use(express.static(path.join(ROOT, 'public')));
app.use('/generated', express.static(path.join(ROOT, 'generated')));
app.use('/uploads', express.static(path.join(ROOT, 'uploads')));
app.use('/nm', express.static(path.join(ROOT, 'node_modules')));

const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(ROOT, 'uploads');
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (e) {
      cb(e);
    }
  },
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname),
});

const upload = multer({ storage });

async function ensureDirectories() {
  for (const dir of ['uploads', 'generated', 'public', 'fonts', 'data']) {
    try {
      await fs.mkdir(path.join(ROOT, dir), { recursive: true });
    } catch (e) {
      console.error(`mkdir ${dir}:`, e);
    }
  }
}

app.get('/', (req, res) => {
  res.sendFile(path.join(ROOT, 'public', 'index.html'));
});

app.get('/api/status', (req, res) => {
  res.json({
    status: 'Matrix Workshop — AI3DDesign',
    features: [
      'Jewelry text + vector scan (potrace → SVG → extrusion + blind seats)',
      'Miami Cuban lab: 100 technical presets (8–26 mm × 16–30 in) + link/clasp mesh',
      'Chain photo → GPT-4o vision → print-ready STL · optional Replicate photo-to-photo · Open in Blender',
      'Caliper calibration · STL stats · print packs · vision feedback memory · /api/workshop/health',
      'Complex Design Studio: GPT-4o brief → plate + baguette/round plan · hollow cage + digit-6 link · dual OBJ/STL',
      'Build ETA hints on jewelry / Cuban / complex / trace · AI catalog stills with or without stones',
      'Workshop AI copilot (/api/ai/workshop-copilot) · Blender detect & launch · viewport OBJ export + snap + bookmarks',
      'AI previews: OpenAI DALL·E 3 + Replicate Flux (optional keys) + local HD fallback',
      'Saved preferences in data/user-memory.json · GPT-4o-mini prompt expansion',
      'OBJ + STL(CAD) export · viewport tools',
    ],
  });
});

function copyStlToCad(stlPath, cadPath) {
  try {
    fsSync.copyFileSync(stlPath, cadPath);
  } catch (e) {
    console.error('copy stl->cad:', e);
  }
}

function runCubanChainBuild(body) {
  const presetId = body.presetId ? String(body.presetId) : '';
  let cfg = {};
  if (presetId) {
    const p = getCubanPresetById(presetId);
    if (!p) throw new Error(`Unknown Cuban preset: ${presetId}`);
    cfg = {
      linkWidthMm: p.linkWidthMm,
      thicknessMm: p.thicknessMm,
      linkLengthAlongMm: p.linkLengthAlongMm,
      clasp: p.clasp,
    };
  } else {
    const W = Number(body.linkWidthMm);
    if (!Number.isFinite(W) || W < 4 || W > 80) throw new Error('linkWidthMm required (or presetId)');
    const tr = Number(body.thicknessRatio) || 0.44;
    cfg = {
      linkWidthMm: W,
      thicknessMm: body.thicknessMm != null ? Number(body.thicknessMm) : W * tr,
      linkLengthAlongMm: body.linkLengthAlongMm != null ? Number(body.linkLengthAlongMm) : W * 1.16,
      clasp: body.clasp || {},
    };
  }
  const rawSlug = presetId ? exportSlug(presetId) : exportSlug(`w${cfg.linkWidthMm}mm`);
  const slug = String(rawSlug).replace(/^cuban_/, '') || rawSlug;
  const namedBase = path.join(ROOT, 'generated', `cuban_${slug}`);
  cfg.outBase = namedBase;
  const tmp = path.join(ROOT, 'generated', `_cuban_${Date.now()}.json`);
  fsSync.writeFileSync(tmp, JSON.stringify(cfg), 'utf8');
  const script = path.join(ROOT, 'scripts', 'cuban-chain-build.mjs');
  const out = execFileSync(process.execPath, [script, tmp], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  try {
    fsSync.unlinkSync(tmp);
  } catch (_) {}
  let result = null;
  for (const line of out
    .trim()
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)) {
    try {
      const j = JSON.parse(line);
      if (j && j.ok) result = j;
    } catch (_) {}
  }
  if (!result) throw new Error(out.slice(-400) || 'cuban build parse failed');
  copyStlToCad(`${namedBase}.stl`, `${namedBase}.cad`);
  const lastBase = path.join(ROOT, 'generated', 'cuban_last');
  for (const ext of ['obj', 'stl', 'cad']) {
    try {
      fsSync.copyFileSync(`${namedBase}.${ext}`, `${lastBase}.${ext}`);
    } catch (e) {
      console.error(`copy cuban ${ext}:`, e);
    }
  }
  return { result, slug, namedBase };
}

app.get('/api/cuban/presets', (req, res) => {
  try {
    res.json({ success: true, count: 100, presets: getCubanPresets() });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e.message || e) });
  }
});

app.get('/api/cuban/preset/:id', (req, res) => {
  try {
    const p = getCubanPresetById(req.params.id);
    if (!p) return res.status(404).json({ success: false, error: 'preset not found' });
    res.json({ success: true, preset: p });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e.message || e) });
  }
});

app.get('/api/cuban/reference', (req, res) => {
  const extended = req.query.extended === '1' || req.query.extended === 'true';
  const text = extended ? `${CUBAN_CHAIN_REFERENCE}\n${EXTENDED}` : CUBAN_CHAIN_REFERENCE;
  res.type('text/plain; charset=utf-8').send(text);
});

app.post('/api/cuban/convert', (req, res) => {
  try {
    const value = Number(req.body.value);
    const from = String(req.body.from || 'in').toLowerCase();
    const to = String(req.body.to || 'mm').toLowerCase();
    const out = convertLength(value, from, to);
    if (out == null) return res.status(400).json({ success: false, error: 'Invalid from/to (use mm|in)' });
    res.json({ success: true, value: out, from, to });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e.message || e) });
  }
});

app.post('/api/cuban/build', async (req, res) => {
  try {
    const est = estimateCubanBuildSeconds(req.body);
    const { result, slug } = runCubanChainBuild(req.body);
    io.emit('workshop', { type: 'cuban-build-complete', result, exportSlug: slug });
    res.json({
      success: true,
      obj: `/generated/cuban_${slug}.obj`,
      stl: `/generated/cuban_${slug}.stl`,
      cad: `/generated/cuban_${slug}.cad`,
      exportSlug: slug,
      build: result,
      estimatedSeconds: est,
      estimatedTime: formatEta(est),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, error: String(e.message || e) });
  }
});

function assertGeneratedMeshRel(rel) {
  const clean = path
    .normalize(String(rel || '').replace(/^\//, ''))
    .replace(/^(\.\.(\/|\\|$))+/, '');
  if (!clean.startsWith(`generated${path.sep}`) && !clean.startsWith('generated/')) {
    throw new Error('mesh path must be under generated/');
  }
  const full = path.join(ROOT, clean);
  const genRoot = path.join(ROOT, 'generated');
  if (!full.startsWith(genRoot)) throw new Error('Invalid mesh path');
  if (!fsSync.existsSync(full)) throw new Error(`File not found: ${clean}`);
  return { full, web: clean.replace(/\\/g, '/') };
}

app.post('/api/cuban/analyze-photo', upload.single('chainPhoto'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Send multipart field chainPhoto (PNG/JPEG/WebP).' });
    }
    const buf = await fs.readFile(req.file.path);
    const mime = req.file.mimetype || 'image/jpeg';
    const userNotes = String(req.body.userNotes || req.body.notes || '').slice(0, 4000);
    const ref = `${CUBAN_CHAIN_REFERENCE}\n${EXTENDED}`.slice(0, 12000);
    const { analysis, modelUsed } = await analyzeChainPhoto({
      imageBuffer: buf,
      mimeType: mime,
      userNotes,
      referenceSnippet: ref,
      env: process.env,
      presetIdSample: 'cuban_000 … cuban_099 (pick closest mm + inch)',
    });
    const ps = analysis.printSpec || {};
    const matched = matchClosestPreset(ps.linkWidthMm, ps.chainLengthIn);
    if (matched && !analysis.matchedPresetId) analysis.matchedPresetId = matched.id;
    await fs.unlink(req.file.path).catch(() => {});
    res.json({
      success: true,
      analysis,
      visionModel: modelUsed,
      serverMatchedPreset: matched,
    });
  } catch (e) {
    console.error(e);
    const code = e.code === 'NO_OPENAI' ? 400 : 500;
    res.status(code).json({ success: false, error: String(e.message || e) });
  }
});

app.post('/api/cuban/photo-to-print', upload.single('chainPhoto'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Send multipart field chainPhoto.' });
    }
    const buf = await fs.readFile(req.file.path);
    const mime = req.file.mimetype || 'image/jpeg';
    const userNotes = String(req.body.userNotes || req.body.notes || '').slice(0, 4000);
    const ref = `${CUBAN_CHAIN_REFERENCE}\n${EXTENDED}`.slice(0, 12000);
    const { analysis } = await analyzeChainPhoto({
      imageBuffer: buf,
      mimeType: mime,
      userNotes,
      referenceSnippet: ref,
      env: process.env,
      presetIdSample: 'cuban_000 … cuban_099',
    });
    const ps = analysis.printSpec || {};
    const matched = matchClosestPreset(ps.linkWidthMm, ps.chainLengthIn);
    if (matched && !analysis.matchedPresetId) analysis.matchedPresetId = matched.id;
    await fs.unlink(req.file.path).catch(() => {});

    let buildBody;
    const preset =
      analysis.matchedPresetId && getCubanPresetById(String(analysis.matchedPresetId));
    if (preset) {
      buildBody = { presetId: preset.id };
    } else {
      const W = Math.min(80, Math.max(4, Number(ps.linkWidthMm) || 12));
      const tr = Number(ps.thicknessRatio) || 0.44;
      buildBody = {
        linkWidthMm: W,
        thicknessMm: W * tr,
        linkLengthAlongMm: W * 1.16,
        clasp: {},
      };
    }
    const { result, slug } = runCubanChainBuild(buildBody);
    io.emit('workshop', { type: 'cuban-build-complete', result, exportSlug: slug, fromPhoto: true });
    res.json({
      success: true,
      analysis,
      build: result,
      obj: `/generated/cuban_${slug}.obj`,
      stl: `/generated/cuban_${slug}.stl`,
      cad: `/generated/cuban_${slug}.cad`,
      exportSlug: slug,
    });
  } catch (e) {
    console.error(e);
    const code = e.code === 'NO_OPENAI' ? 400 : 500;
    res.status(code).json({ success: false, error: String(e.message || e) });
  }
});

app.post('/api/cuban/photo-refine', upload.single('chainPhoto'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Send multipart field chainPhoto.' });
    }
    const buf = await fs.readFile(req.file.path);
    const instruction = String(req.body.instruction || '').slice(0, 1200);
    const out = await refineChainImageReplicate({
      imageBuffer: buf,
      instruction,
      env: process.env,
      root: ROOT,
      sharp,
    });
    await fs.unlink(req.file.path).catch(() => {});
    res.json({ success: true, imagePath: out.imagePath, predictionId: out.predictionId });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, error: String(e.message || e) });
  }
});

app.post('/api/ai/chain-semantic-image', async (req, res) => {
  try {
    const stored = await loadMemory(ROOT);
    const prompt = String(req.body.prompt || req.body.dallePrompt || '').slice(0, 2000);
    if (!prompt.trim()) return res.status(400).json({ success: false, error: 'prompt or dallePrompt required' });
    const w = Math.min(2560, Math.max(400, parseInt(req.body.width, 10) || 1536));
    const h = Math.min(2560, Math.max(300, parseInt(req.body.height, 10) || 960));
    const result = await generateJewelryPreviewImage({
      root: ROOT,
      sharp,
      userPrompt: prompt,
      width: w,
      height: h,
      provider: String(req.body.provider || 'auto').toLowerCase(),
      styleKey: String(req.body.styleKey || 'cuban_studio').toLowerCase(),
      enhancePrompt: false,
      memory: { promptPrefix: stored.promptPrefix || '' },
      env: process.env,
    });
    res.json({
      success: true,
      imagePath: result.imagePath,
      providerUsed: result.providerUsed,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, error: String(e.message || e) });
  }
});

function resolveBlenderExecutable() {
  if (process.env.BLENDER_PATH && fsSync.existsSync(process.env.BLENDER_PATH)) {
    return process.env.BLENDER_PATH;
  }
  const mac = '/Applications/Blender.app/Contents/MacOS/Blender';
  if (process.platform === 'darwin' && fsSync.existsSync(mac)) return mac;
  return 'blender';
}

app.get('/api/blender/detect', (req, res) => {
  const tryPaths = [];
  if (process.env.BLENDER_PATH) tryPaths.push(process.env.BLENDER_PATH);
  if (process.platform === 'darwin') {
    tryPaths.push('/Applications/Blender.app/Contents/MacOS/Blender');
  }
  tryPaths.push('blender');
  const seen = new Set();
  const unique = tryPaths.filter((p) => {
    if (!p || seen.has(p)) return false;
    seen.add(p);
    return true;
  });
  let pathUsed = null;
  let versionLine = null;
  for (const p of unique) {
    if (p !== 'blender' && !fsSync.existsSync(p)) continue;
    try {
      const out = execFileSync(p, ['--version'], { encoding: 'utf8', timeout: 12000, maxBuffer: 256 * 1024 });
      const first = out.trim().split('\n')[0];
      pathUsed = p;
      versionLine = first;
      break;
    } catch (_) {}
  }
  res.json({
    success: true,
    path: pathUsed,
    version: versionLine,
    tried: unique,
  });
});

app.post('/api/blender/open', async (req, res) => {
  try {
    const rel = String(req.body.mesh || req.body.path || 'generated/cuban_last.stl');
    const { full } = assertGeneratedMeshRel(rel);
    const py = path.join(ROOT, 'scripts', 'blender_import_launch.py');
    if (!fsSync.existsSync(py)) throw new Error('Missing scripts/blender_import_launch.py');
    const blender = resolveBlenderExecutable();
    if (process.platform === 'win32' && !process.env.BLENDER_PATH && blender === 'blender') {
      console.warn('Set BLENDER_PATH to blender.exe on Windows.');
    }
    const child = spawn(blender, ['--python', py, '--', full], {
      detached: true,
      stdio: 'ignore',
      cwd: ROOT,
    });
    child.unref();
    res.json({ success: true, launched: true, blender, mesh: rel });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, error: String(e.message || e) });
  }
});

app.post('/api/ai/workshop-copilot', async (req, res) => {
  try {
    const { result, modelUsed } = await runWorkshopCopilot({
      message: req.body.message || req.body.text || '',
      context: req.body.context || {},
      env: process.env,
    });
    res.json({ success: true, result, modelUsed });
  } catch (e) {
    console.error(e);
    const code = e.code === 'NO_OPENAI' ? 503 : 500;
    res.status(code).json({ success: false, error: String(e.message || e), code: e.code });
  }
});

app.get('/api/workshop/health', (req, res) => {
  const blenderDefault = resolveBlenderExecutable();
  const blenderFound = blenderDefault === 'blender' || fsSync.existsSync(blenderDefault);
  let blenderVersion = null;
  try {
    if (blenderFound || blenderDefault === 'blender') {
      const out = execFileSync(blenderDefault, ['--version'], {
        encoding: 'utf8',
        timeout: 8000,
        maxBuffer: 128 * 1024,
      });
      blenderVersion = out.trim().split('\n')[0] || null;
    }
  } catch (_) {}

  let serverEntryMtime = null;
  try {
    serverEntryMtime = new Date(fsSync.statSync(path.join(ROOT, 'server.js')).mtimeMs).toISOString();
  } catch (_) {}

  const issues = [];
  const notes = [];
  if (!llmConfigured(process.env)) {
    issues.push(
      'LLM not configured — set GROQ_API_KEY (free tier, fast, console.groq.com) or OPENAI_API_KEY, or OPENAI_BASE_URL + OPENAI_ALLOW_NO_KEY=1 for local Ollama. Vision / DALL·E still need OPENAI_API_KEY when using those features.',
    );
  }
  if (!process.env.REPLICATE_API_TOKEN) {
    notes.push('REPLICATE_API_TOKEN is not set — optional Replicate / Flux image features are off.');
  }
  if (!blenderVersion) {
    issues.push(
      `Blender CLI did not return a version (path: "${blenderDefault}"). Install Blender or set BLENDER_PATH in .env.`,
    );
  }

  res.json({
    ok: true,
    port: PORT,
    packageVersion: PACKAGE_VERSION,
    serverStartedAt: SERVER_STARTED_AT,
    serverEntryMtime,
    openai: llmConfigured(process.env),
    openaiKey: Boolean(process.env.OPENAI_API_KEY?.trim()),
    groqKey: Boolean(process.env.GROQ_API_KEY?.trim()),
    openaiBaseUrl: openaiApiBase(process.env),
    replicate: Boolean(process.env.REPLICATE_API_TOKEN),
    visionModel: visionModel(process.env),
    complexTextModel: complexTextModel(process.env),
    llmModel: (process.env.LLM_MODEL || '').trim() || null,
    workshopCopilot: llmConfigured(process.env),
    blenderPath: blenderDefault,
    blenderFound,
    blenderVersion,
    platform: process.platform,
    issues,
    notes,
  });
});

app.get('/api/mesh/stats', async (req, res) => {
  try {
    const rel = String(req.query.path || 'generated/cuban_last.stl');
    const { full } = assertGeneratedMeshRel(rel);
    const stats = await stlStatsFromFile(full);
    if (!stats) return res.status(400).json({ success: false, error: 'Could not parse STL' });
    res.json({ success: true, path: rel, stats });
  } catch (e) {
    res.status(400).json({ success: false, error: String(e.message || e) });
  }
});

app.post('/api/cuban/calibrate-rebuild', async (req, res) => {
  try {
    const body = req.body || {};
    const next = calibrateAnalysis(body.analysis, {
      measuredLinkWidthMm: body.measuredLinkWidthMm,
      measuredChainLengthIn: body.measuredChainLengthIn,
      thicknessRatio: body.thicknessRatio,
      note: body.note,
    });
    const ps = next.printSpec || {};
    const W = Number(ps.linkWidthMm);
    const L = Number(ps.chainLengthIn);
    if (!Number.isFinite(W) || W < 4) throw new Error('Invalid calibrated linkWidthMm');
    const tr = Number.isFinite(Number(ps.thicknessRatio)) ? Number(ps.thicknessRatio) : 0.44;
    const matched = matchClosestPreset(W, L);
    let buildBody;
    if (
      matched &&
      Math.abs(matched.linkWidthMm - W) < 0.35 &&
      Math.abs(matched.chainLengthIn - L) < 0.75
    ) {
      buildBody = { presetId: matched.id };
    } else {
      buildBody = {
        linkWidthMm: W,
        thicknessMm: W * tr,
        linkLengthAlongMm: W * 1.16,
        clasp: {},
      };
    }
    const { result, slug } = runCubanChainBuild(buildBody);
    io.emit('workshop', { type: 'cuban-build-complete', result, exportSlug: slug, calibrated: true });
    res.json({
      success: true,
      analysis: next,
      build: result,
      matchedPreset: matched,
      obj: `/generated/cuban_${slug}.obj`,
      stl: `/generated/cuban_${slug}.stl`,
      cad: `/generated/cuban_${slug}.cad`,
      exportSlug: slug,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, error: String(e.message || e) });
  }
});

app.post('/api/cuban/vision-feedback', async (req, res) => {
  try {
    const n = await appendEntry({
      correction: req.body.correction || req.body.text,
      context: req.body.context || '',
    });
    res.json({ success: true, stored: n });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e.message || e) });
  }
});

app.get('/api/cuban/vision-feedback', async (req, res) => {
  try {
    const entries = await loadEntries();
    res.json({ success: true, count: entries.length, entries });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e.message || e) });
  }
});

app.post('/api/cuban/export-pack', async (req, res) => {
  try {
    const slug = String(req.body.exportSlug || 'last').replace(/^cuban_/, '') || 'last';
    const pack = await writePrintPack(ROOT, {
      slug,
      analysis: req.body.analysis || null,
      label: req.body.label || '',
    });
    res.json({ success: true, ...pack });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, error: String(e.message || e) });
  }
});

function exportSlug(text) {
  const s = String(text || 'piece')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
    .slice(0, 48);
  return s || 'piece';
}

function copyExportToLast(namedBase, lastBase) {
  for (const ext of ['obj', 'stl', 'cad']) {
    const src = `${namedBase}.${ext}`;
    const dst = `${lastBase}.${ext}`;
    try {
      fsSync.copyFileSync(src, dst);
    } catch (e) {
      console.error(`copy ${src} -> ${dst}:`, e);
    }
  }
}

function copyComplexToLast(namedBase, lastBase) {
  for (const suf of ['_main', '_six']) {
    for (const ext of ['obj', 'stl']) {
      const src = `${namedBase}${suf}.${ext}`;
      const dst = `${lastBase}${suf}.${ext}`;
      try {
        fsSync.copyFileSync(src, dst);
      } catch (e) {
        console.error(`copy ${src} -> ${dst}:`, e);
      }
    }
  }
}

function runComplexPendantBuild(flatCfg) {
  const tmp = path.join(ROOT, 'generated', `_complex_job_${Date.now()}.json`);
  fsSync.writeFileSync(tmp, JSON.stringify(flatCfg), 'utf8');
  const buildScript = path.join(ROOT, 'scripts', 'complex-pendant-build.mjs');
  const out = execFileSync(process.execPath, [buildScript, tmp], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  try {
    fsSync.unlinkSync(tmp);
  } catch (_) {}
  const lines = out
    .trim()
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  let result = null;
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      result = JSON.parse(lines[i]);
      if (result && result.ok) break;
    } catch (_) {}
  }
  if (!result || !result.ok) throw new Error(out.slice(-500) || 'complex build parse failed');
  return result;
}

function resolveVectorSvgPath(body) {
  if (body.vectorId) {
    const id = String(body.vectorId).replace(/[^a-zA-Z0-9_-]/g, '');
    if (!id) return null;
    const p = path.join(ROOT, 'generated', `${id}.svg`);
    return fsSync.existsSync(p) ? p : null;
  }
  if (body.vectorSvgPath) {
    const p = String(body.vectorSvgPath).trim();
    if (path.isAbsolute(p)) return fsSync.existsSync(p) ? p : null;
    const rel = path.join(ROOT, p.replace(/^\//, ''));
    return fsSync.existsSync(rel) ? rel : null;
  }
  return null;
}

async function preprocessRasterForTrace(buffer, opts = {}) {
  const maxEdge = Math.min(4096, Math.max(256, parseInt(opts.maxEdge, 10) || 2000));
  let img = sharp(buffer);
  const meta = await img.metadata();
  const w = meta.width || 1;
  const h = meta.height || 1;
  const sc = Math.min(1, maxEdge / Math.max(w, h));
  const rw = Math.max(1, Math.round(w * sc));
  const rh = Math.max(1, Math.round(h * sc));
  img = img.resize(rw, rh, { fit: 'fill', kernel: sharp.kernel.lanczos3 });
  img = img.greyscale();
  img = img.normalize();
  if (opts.sharpen !== false && opts.sharpen !== '0') {
    img = img.sharpen({ sigma: 0.9, m1: 1, m2: 0.5, x1: 2 });
  }
  if (parseFloat(opts.blurPx) > 0) {
    img = img.blur(parseFloat(opts.blurPx));
  }
  if (opts.invert === true || opts.invert === '1' || opts.invert === 'true') {
    img = img.negate({ alpha: false });
  }
  return img.png({ compressionLevel: 6 }).toBuffer();
}

function tracePngBufferToSvg(pngBuffer, opts = {}) {
  const turdSize = Math.max(0, parseInt(opts.turdSize, 10));
  const optTolerance = Math.min(2.5, Math.max(0.05, parseFloat(opts.optTolerance) || 0.12));
  let threshold = opts.threshold;
  if (threshold === undefined || threshold === '' || threshold === null) {
    threshold = Potrace.THRESHOLD_AUTO;
  } else {
    threshold = Math.min(255, Math.max(0, parseInt(threshold, 10)));
  }
  return new Promise((resolve, reject) => {
    potrace.trace(
      pngBuffer,
      {
        turdSize: Number.isFinite(turdSize) ? turdSize : 1,
        optTolerance,
        threshold,
        blackOnWhite: opts.blackOnWhite !== false && opts.blackOnWhite !== '0',
        turnPolicy: Potrace.TURNPOLICY_MINORITY,
      },
      (err, svg) => (err ? reject(err) : resolve(svg)),
    );
  });
}

function runJewelryBuild(body, outBase) {
  const vectorSvgPath = resolveVectorSvgPath(body);
  const cfg = {
    text: body.text || 'LOVE',
    targetLengthMm: Number(body.targetLengthMm) || Number(body.targetWidthMm) || 48,
    targetHeightMm: body.targetHeightMm != null ? Number(body.targetHeightMm) : null,
    plateDepthMm: Number(body.plateDepthMm) || 2.2,
    seatDepthRatio: Number(body.seatDepthRatio) || 0.72,
    reliefRatio: body.reliefRatio != null ? Number(body.reliefRatio) : 0.14,
    exactEnvelope: body.exactEnvelope === true,
    eliteSeats: body.eliteSeats !== false,
    printTight: body.printTight === true,
    referenceIced: body.referenceIced === true,
    letterAdvanceScale:
      body.letterAdvanceScale != null ? Number(body.letterAdvanceScale) : undefined,
    fontFile: body.fontFile,
    addBail: body.addBail !== false,
    roundCount: parseInt(body.roundCount, 10) || 36,
    outBase,
    vectorSvgPath: vectorSvgPath || undefined,
    vectorCurveSteps:
      body.vectorCurveSteps != null ? parseInt(body.vectorCurveSteps, 10) : undefined,
  };
  const tmp = path.join(ROOT, 'generated', `_job_${Date.now()}.json`);
  fsSync.writeFileSync(tmp, JSON.stringify(cfg), 'utf8');
  const buildScript = path.join(ROOT, 'scripts', 'jewelry-build.mjs');
  const out = execFileSync(process.execPath, [buildScript, tmp], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  try {
    fsSync.unlinkSync(tmp);
  } catch (_) {}
  const lines = out
    .trim()
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  let result = null;
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      result = JSON.parse(lines[i]);
      if (result && result.ok) break;
    } catch (_) {}
  }
  if (!result || !result.ok) throw new Error(out.slice(-400) || 'build parse failed');
  return result;
}

app.post('/api/jewelry/vector-scan', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Send multipart field "image" (PNG/JPEG/WebP).' });
    }
    const raw = await fs.readFile(req.file.path);
    const pngBuf = await preprocessRasterForTrace(raw, {
      maxEdge: req.body.maxEdge,
      sharpen: req.body.sharpen,
      blurPx: req.body.blurPx,
      invert: req.body.invert,
    });
    const svg = await tracePngBufferToSvg(pngBuf, {
      turdSize: req.body.turdSize,
      optTolerance: req.body.optTolerance,
      threshold: req.body.threshold,
      blackOnWhite: req.body.blackOnWhite,
    });
    await fs.unlink(req.file.path).catch(() => {});
    const id = `vector_${Date.now()}`;
    const rel = path.join('generated', `${id}.svg`);
    const full = path.join(ROOT, rel);
    await fs.writeFile(full, svg, 'utf8');
    const vest = estimateVectorScanSeconds();
    res.json({
      success: true,
      vectorId: id,
      svgUrl: `/generated/${id}.svg`,
      note: 'Use vectorId with Build jewelry, or open SVG to verify edges. High-contrast silhouettes trace cleanest.',
      estimatedSeconds: vest,
      estimatedTime: formatEta(vest),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, error: String(e.message || e) });
  }
});

app.post('/api/jewelry/build', async (req, res) => {
  try {
    const fromVec = Boolean(resolveVectorSvgPath(req.body));
    const slug = fromVec ? exportSlug(`scan_${req.body.vectorId || 'piece'}`) : exportSlug(req.body.text);
    const namedBase = path.join(ROOT, 'generated', `jewelry_${slug}`);
    const lastBase = path.join(ROOT, 'generated', 'jewelry_last');
    const est = estimateJewelryBuildSeconds(req.body);
    const result = runJewelryBuild(req.body, namedBase);
    copyExportToLast(namedBase, lastBase);
    io.emit('workshop', { type: 'build-complete', result, exportSlug: slug });
    res.json({
      success: true,
      obj: `/generated/jewelry_${slug}.obj`,
      cad: `/generated/jewelry_${slug}.cad`,
      stl: `/generated/jewelry_${slug}.stl`,
      exportSlug: slug,
      build: result,
      estimatedSeconds: est,
      estimatedTime: formatEta(est),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, error: String(e.message || e) });
  }
});

/** Client progress bar: same heuristics as server build ETA. */
app.post('/api/build/estimate', (req, res) => {
  try {
    const type = String(req.body.type || 'jewelry').toLowerCase();
    if (type === 'jewelry') {
      const est = estimateJewelryBuildSeconds(req.body);
      return res.json({ success: true, estimatedSeconds: est, estimatedTime: formatEta(est) });
    }
    if (type === 'complex') {
      const plan = req.body.plan;
      let cfg = req.body;
      if (plan != null && typeof plan === 'object' && !Array.isArray(plan)) {
        cfg = planToComplexBuildConfig(plan, path.join(ROOT, 'generated', '_estimate'));
      }
      const est = estimateComplexBuildSeconds(cfg);
      return res.json({ success: true, estimatedSeconds: est, estimatedTime: formatEta(est) });
    }
    if (type === 'cuban') {
      let body = { ...req.body };
      if (body.presetId) {
        const p = getCubanPresetById(String(body.presetId));
        if (p) {
          body = {
            linkWidthMm: p.linkWidthMm,
            thicknessMm: p.thicknessMm,
            linkLengthAlongMm: p.linkLengthAlongMm,
            clasp: p.clasp || {},
          };
        }
      }
      const est = estimateCubanBuildSeconds(body);
      return res.json({ success: true, estimatedSeconds: est, estimatedTime: formatEta(est) });
    }
    if (type === 'vector') {
      const est = estimateVectorScanSeconds();
      return res.json({ success: true, estimatedSeconds: est, estimatedTime: formatEta(est) });
    }
    if (type === 'complex_analyze') {
      const est = estimateComplexAnalyzeSeconds(req.body.hasImage === true);
      return res.json({ success: true, estimatedSeconds: est, estimatedTime: formatEta(est) });
    }
    if (type === 'photo_to_print') {
      const est = estimatePhotoToPrintSeconds();
      return res.json({ success: true, estimatedSeconds: est, estimatedTime: formatEta(est) });
    }
    return res.status(400).json({ success: false, error: 'Unknown type' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, error: String(e.message || e) });
  }
});

app.post('/api/complex/analyze', upload.single('image'), async (req, res) => {
  try {
    let imageBuffer = null;
    let mimeType = 'image/jpeg';
    if (req.file) {
      imageBuffer = await fs.readFile(req.file.path);
      mimeType = req.file.mimetype || mimeType;
      await fs.unlink(req.file.path).catch(() => {});
    }
    const { plan, modelUsed } = await analyzeComplexBrief({
      text: req.body.text || '',
      imageBuffer,
      mimeType,
      env: process.env,
    });
    res.json({ success: true, plan, modelUsed });
  } catch (e) {
    console.error(e);
    const code = e.code === 'NO_OPENAI' ? 503 : 500;
    res.status(code).json({
      success: false,
      error: String(e.message || e),
      code: e.code || undefined,
    });
  }
});

app.post('/api/complex/build', async (req, res) => {
  try {
    const plan = req.body.plan;
    const overrides = req.body.overrides && typeof req.body.overrides === 'object' ? req.body.overrides : {};
    const label =
      req.body.subject || (plan && plan.subject) || req.body.label || 'piece';
    const slug = exportSlug(label);
    const namedBase = path.join(ROOT, 'generated', `complex_${slug}`);
    const lastBase = path.join(ROOT, 'generated', 'complex_last');
    let cfg;
    if (plan != null && typeof plan === 'object' && !Array.isArray(plan)) {
      cfg = planToComplexBuildConfig(plan, namedBase);
    } else {
      cfg = { ...req.body };
      delete cfg.plan;
      delete cfg.overrides;
      delete cfg.subject;
      delete cfg.label;
      cfg.outBase = namedBase;
    }
    Object.assign(cfg, overrides);
    cfg.outBase = namedBase;
    const est = estimateComplexBuildSeconds(cfg);
    const result = runComplexPendantBuild(cfg);
    copyComplexToLast(namedBase, lastBase);
    const pub = (rel) => {
      if (!rel) return null;
      const s = String(rel).replace(/\\/g, '/');
      return s.startsWith('/') ? s : `/${s}`;
    };
    io.emit('workshop', { type: 'complex-build-complete', result, exportSlug: slug });
    res.json({
      success: true,
      exportSlug: slug,
      build: result,
      mainObj: pub(result.mainObj),
      sixObj: pub(result.sixObj),
      mainStl: pub(result.mainStl),
      sixStl: pub(result.sixStl),
      lastMainObj: '/generated/complex_last_main.obj',
      lastSixObj: '/generated/complex_last_six.obj',
      estimatedSeconds: est,
      estimatedTime: formatEta(est),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, error: String(e.message || e) });
  }
});

app.post('/api/generate/bruce-pendant', async (req, res) => {
  try {
    const script = path.join(ROOT, 'scripts', 'generate-3dprint-bruce-pendant.mjs');
    execFileSync(process.execPath, [script], { cwd: ROOT, stdio: 'pipe' });
    io.emit('workshop', { type: 'build-complete', preset: 'BRUCE_3DPRINT' });
    res.json({
      success: true,
      files: {
        obj: 'generated/3dprint_bruce_pendant.obj',
        cad: 'generated/3dprint_bruce_pendant.cad',
        stl: 'generated/3dprint_bruce_pendant.stl',
      },
      note: '6×2×0.5 in envelope · blind seats · .cad/.stl are binary STL for slicers.',
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to generate pendant' });
  }
});

app.get('/api/ai/config', async (req, res) => {
  try {
    const mem = await loadMemory(ROOT);
    res.json({
      success: true,
      providers: {
        openai: llmConfigured(process.env),
        replicate: Boolean(process.env.REPLICATE_API_TOKEN),
        chainVision: llmConfigured(process.env),
        photoToPhoto: Boolean(process.env.REPLICATE_API_TOKEN),
        complexBrief: llmConfigured(process.env),
        openaiBaseUrl: openaiApiBase(process.env),
      },
      blender: {
        defaultPath:
          process.platform === 'darwin'
            ? '/Applications/Blender.app/Contents/MacOS/Blender'
            : process.platform === 'win32'
              ? 'C:\\\\Program Files\\\\Blender Foundation\\\\Blender 4.2\\\\blender.exe'
              : 'blender',
        envVar: 'BLENDER_PATH',
      },
      memory: publicMemorySlice(mem),
    });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e.message || e) });
  }
});

app.get('/api/user/memory', async (req, res) => {
  try {
    const mem = await loadMemory(ROOT);
    res.json({ success: true, memory: mem });
  } catch (e) {
    res.status(500).json({ success: false, error: String(e.message || e) });
  }
});

app.post('/api/user/memory', async (req, res) => {
  try {
    const next = await saveMemory(ROOT, req.body);
    res.json({ success: true, memory: publicMemorySlice(next) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, error: String(e.message || e) });
  }
});

/** Photoreal via OpenAI / Replicate when keys are set; else HD procedural. Optional GPT prompt expansion. */
app.post('/api/ai/preview-image', async (req, res) => {
  try {
    const stored = await loadMemory(ROOT);
    const useSaved = req.body.useSavedMemory === true || req.body.useSavedMemory === 'true';

    let provider = String(req.body.provider || (useSaved ? stored.imageProvider : '') || 'auto').toLowerCase();
    let styleKey = String(req.body.styleKey || req.body.style || (useSaved ? stored.imageStyleKey : '') || 'studio').toLowerCase();

    let enhance =
      req.body.enhancePrompt === true ||
      req.body.enhancePrompt === 'true' ||
      (useSaved && stored.enhancePromptByDefault);
    if (req.body.enhancePrompt === false || req.body.enhancePrompt === 'false') enhance = false;

    const userPrompt = String(req.body.prompt || 'luxury iced platinum nameplate').slice(0, 500);
    const w = Math.min(2560, Math.max(400, parseInt(req.body.width, 10) || 1536));
    const h = Math.min(2560, Math.max(300, parseInt(req.body.height, 10) || 960));

    const memoryForPrompt = {
      promptPrefix: useSaved
        ? stored.promptPrefix || ''
        : req.body.promptPrefix != null
          ? String(req.body.promptPrefix)
          : '',
    };

    let cubanPromptAppend = '';
    if (req.body.cubanPresetId) {
      const cp = getCubanPresetById(String(req.body.cubanPresetId));
      if (cp && cp.aiPromptHint) cubanPromptAppend = cp.aiPromptHint;
    }

    const stoneTreatment =
      String(req.body.stoneTreatment || req.body.renderStones || 'full').toLowerCase() === 'metal_only'
        ? 'metal_only'
        : 'full';

    const result = await generateJewelryPreviewImage({
      root: ROOT,
      sharp,
      userPrompt,
      width: w,
      height: h,
      provider,
      styleKey,
      enhancePrompt: enhance && llmConfigured(process.env),
      memory: memoryForPrompt,
      env: process.env,
      cubanPromptAppend,
      stoneTreatment,
    });

    const remember = req.body.rememberPrompt !== false && req.body.rememberPrompt !== 'false';
    if (remember && userPrompt.trim()) {
      await saveMemory(ROOT, { saveCurrentPrompt: true, currentPrompt: userPrompt });
    }

    res.json({
      success: true,
      imagePath: result.imagePath,
      width: result.width,
      height: result.height,
      providerUsed: result.providerUsed,
      enhancedPrompt: result.enhancedPrompt,
      finalPromptPreview: result.finalPrompt,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, error: String(e.message || e) });
  }
});

app.post('/api/generate/boar-image', async (req, res) => {
  try {
    const width = parseInt(req.body.width, 10) || 1024;
    const height = parseInt(req.body.height, 10) || 1024;
    const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs><radialGradient id="bg"><stop offset="0%" stop-color="#4a2c1a"/><stop offset="100%" stop-color="#1a0f08"/></radialGradient></defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <ellipse cx="${width / 2}" cy="${height / 2}" rx="160" ry="120" fill="#3d2817"/>
  <ellipse cx="${width / 2 - 120}" cy="${height / 2 - 40}" rx="80" ry="70" fill="#3d2817" transform="rotate(-17 ${width / 2 - 120} ${height / 2 - 40})"/>
  <path d="M ${width / 2 - 180} ${height / 2 - 35} L ${width / 2 - 220} ${height / 2 - 30}" stroke="#f4e4c1" stroke-width="6" fill="none"/>
  <rect x="${width / 2 + 40}" y="${height / 2 - 160}" width="20" height="80" fill="#c0c0c0" transform="rotate(15 ${width / 2 + 50} ${height / 2 - 120})"/>
</svg>`;
    const svgPath = `generated/boar_${Date.now()}.svg`;
    await fs.writeFile(svgPath, svgContent);
    res.json({ success: true, imagePath: svgPath, timestamp: Date.now() });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to generate image' });
  }
});

app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({
    success: true,
    file: {
      filename: req.file.filename,
      originalname: req.file.originalname,
      size: req.file.size,
      path: req.file.path,
    },
  });
});

io.on('connection', (socket) => {
  socket.on('generate-model', async () => {
    socket.emit('status', { message: 'Building…', progress: 0 });
    for (let i = 10; i <= 100; i += 10) {
      await new Promise((r) => setTimeout(r, 80));
      socket.emit('status', { message: `Progress ${i}%`, progress: i });
    }
    socket.emit('complete', { message: 'Done' });
  });
});

async function start() {
  await ensureDirectories();
  server.listen(PORT, () => {
    console.log(`Matrix Workshop → http://localhost:${PORT}`);
    if (process.cwd() !== ROOT) {
      console.warn(`[deploy] cwd (${process.cwd()}) differs from app root (${ROOT}) — paths still use app root.`);
    }
  });
}

start().catch(console.error);
