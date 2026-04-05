import { runWithBuildOverlay, fetchEstimate } from '/js/build-overlay.js';

const $ = (id) => document.getElementById(id);

function toast(msg) {
  const t = $('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._id);
  toast._id = setTimeout(() => t.classList.remove('show'), 3200);
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
  const fd = new FormData();
  fd.append('text', text);
  const photo = $('complex-photo')?.files?.[0];
  if (photo) fd.append('image', photo);
  const st = $('complex-status');
  const pre = $('complex-plan-out');
  if (st) st.textContent = '';
  try {
    const est = await fetchEstimate('complex_analyze', { hasImage: !!photo });
    const j = await runWithBuildOverlay('Analyzing brief (GPT-4o vision)', est, async () => {
      const res = await fetch('/api/complex/analyze', { method: 'POST', body: fd });
      const out = await readJsonRes(res);
      if (!out.success) throw new Error(out.error || 'analyze failed');
      return out;
    });
    lastPlan = j.plan;
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
    if (st) st.textContent = String(err.message || err);
    toast(String(err.message || err));
  }
});

$('complex-build')?.addEventListener('click', async () => {
  if (!lastPlan) {
    toast('Run “Analyze brief” first (server needs an LLM: OPENAI_API_KEY or OPENAI_BASE_URL + OPENAI_ALLOW_NO_KEY=1).');
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
