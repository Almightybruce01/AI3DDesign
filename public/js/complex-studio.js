import { runWithBuildOverlay, fetchEstimate } from '/js/build-overlay.js';

const $ = (id) => document.getElementById(id);

const PLAN_STORAGE_KEY = 'matrix_complex_last_plan';

function toast(msg) {
  const t = $('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._id);
  toast._id = setTimeout(() => t.classList.remove('show'), 5200);
}

async function readJsonRes(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Server returned non-JSON (${res.status}). ${text.slice(0, 220)}`);
  }
}

let lastPlan = null;
/** Cached from GET /api/ai/config — `null` = not loaded, `{ _failed: true }` = API unreachable */
let aiProviders = null;

async function loadAiConfig() {
  try {
    const res = await fetch('/api/ai/config');
    const j = await readJsonRes(res);
    if (j.success && j.providers) {
      aiProviders = j.providers;
      return true;
    }
    aiProviders = { _failed: true };
    return false;
  } catch (_) {
    aiProviders = { _failed: true };
    return false;
  }
}

function assertWorkshopLlmReady() {
  if (aiProviders?._failed) {
    toast(
      'Can’t reach the workshop API. Run the app from the AI3DDesign folder: node server.js — then open http://localhost:3000 (not a raw HTML file).',
    );
    return false;
  }
  if (aiProviders && aiProviders.complexBrief === false) {
    toast(
      'Server has no LLM keys: add GROQ_API_KEY or OPENAI_API_KEY to AI3DDesign/.env (same folder as server.js), save, restart node server.js.',
    );
    return false;
  }
  if (!aiProviders || aiProviders.complexBrief !== true) {
    toast('Loading AI status… try again in a second.');
    return false;
  }
  return true;
}

function savePlanToStorage(plan) {
  try {
    sessionStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify(plan));
  } catch (_) {}
}

function loadPlanFromStorage() {
  try {
    const raw = sessionStorage.getItem(PLAN_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function clearPlanStorage() {
  try {
    sessionStorage.removeItem(PLAN_STORAGE_KEY);
  } catch (_) {}
}

function applyPlanToUi(plan) {
  const pre = $('complex-plan-out');
  const st = $('complex-status');
  lastPlan = plan;
  if (pre) {
    pre.textContent = JSON.stringify(plan, null, 2);
    pre.classList.remove('hidden');
  }
  if (st) st.textContent = 'Plan loaded — use Build all parts when satisfied.';
}

$('complex-photo')?.addEventListener('change', (e) => {
  const f = e.target.files?.[0];
  const el = $('complex-photo-name');
  if (el) el.textContent = f ? f.name : '';
});

$('complex-analyze')?.addEventListener('click', async () => {
  const text = $('complex-brief')?.value?.trim() || '';
  if (!text) {
    toast('Type a brief first.');
    return;
  }
  const photo = $('complex-photo')?.files?.[0];
  await loadAiConfig();
  if (!assertWorkshopLlmReady()) return;

  if (photo && !aiProviders.complexBriefPhoto) {
    if (aiProviders.groqKey) {
      toast('No OpenAI key — reference photo will be ignored; analyzing from your text with Groq (add OPENAI_API_KEY for vision).');
    } else {
      toast('Reference photos need OPENAI_API_KEY (GPT-4o vision), or remove the photo.');
      return;
    }
  }
  const fd = new FormData();
  fd.append('text', text);
  if (photo) fd.append('image', photo);
  const st = $('complex-status');
  const pre = $('complex-plan-out');
  if (st) st.textContent = '';
  const overlayTitle = photo ? 'Analyzing brief (vision)' : 'Analyzing brief (LLM)';
  try {
    const est = await fetchEstimate('complex_analyze', { hasImage: !!photo });
    const j = await runWithBuildOverlay(overlayTitle, est, async () => {
      const res = await fetch('/api/complex/analyze', { method: 'POST', body: fd });
      const out = await readJsonRes(res);
      if (!out.success) throw new Error(out.error || 'analyze failed');
      return out;
    });
    lastPlan = j.plan;
    savePlanToStorage(j.plan);
    if (pre) {
      pre.textContent = JSON.stringify(j.plan, null, 2);
      pre.classList.remove('hidden');
    }
    if (st) {
      st.textContent = `Plan ready (${j.modelUsed || 'model'}). Use Build all parts when satisfied.`;
    }
    toast('Brief analyzed.');
  } catch (err) {
    console.error(err);
    lastPlan = null;
    clearPlanStorage();
    if (st) st.textContent = String(err.message || err);
    toast(String(err.message || err));
  }
});

$('complex-build')?.addEventListener('click', async () => {
  if (!lastPlan) {
    toast(
      'Click “Analyze brief (AI)” first — wait until JSON appears in the box above. (If you only see this message, analysis failed: check the status line or LLM keys in .env.)',
    );
    return;
  }
  const st = $('complex-status');
  const links = $('complex-links');
  if (st) st.textContent = '';
  try {
    const est = await fetchEstimate('complex', { plan: lastPlan });
    const j = await runWithBuildOverlay('Building complex pendant (CSG)', est, async () => {
      const res = await fetch('/api/complex/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: lastPlan, subject: lastPlan.subject }),
      });
      const out = await readJsonRes(res);
      if (!out.success) throw new Error(out.error || 'build failed');
      return out;
    });
    const eta = j.estimatedTime ? ` Typical build time ${j.estimatedTime}.` : '';
    if (st) {
      st.textContent = `Built: ${j.exportSlug || 'export'} — main + six link.${eta}`;
    }
    if (links) {
      links.innerHTML = [
        j.mainObj && `<a href="${j.mainObj}" download>Main OBJ</a>`,
        j.mainStl && `<a href="${j.mainStl}" download>Main STL</a>`,
        j.sixObj && `<a href="${j.sixObj}" download>Six OBJ</a>`,
        j.sixStl && `<a href="${j.sixStl}" download>Six STL</a>`,
      ]
        .filter(Boolean)
        .join('');
      links.classList.remove('hidden');
    }
    toast(`Complex pendant ready${j.estimatedTime ? ` · ${j.estimatedTime}` : ''}`);
  } catch (err) {
    console.error(err);
    if (st) st.textContent = String(err.message || err);
    toast(String(err.message || err));
  }
});

$('complex-load-main')?.addEventListener('click', () => {
  window.dispatchEvent(
    new CustomEvent('matrix-load-obj', { detail: { url: '/generated/complex_last_main.obj' } }),
  );
  toast('Loading complex_last_main.obj…');
});

(async function initComplexStudio() {
  await loadAiConfig();
  const stored = loadPlanFromStorage();
  if (stored && typeof stored === 'object') {
    applyPlanToUi(stored);
  }
})();
