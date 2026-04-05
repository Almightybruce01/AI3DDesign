import { runWithBuildOverlay, fetchEstimate } from '/js/build-overlay.js';

const $ = (s, r = document) => r.querySelector(s);

function toast(msg) {
  const t = $('#toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._id);
  toast._id = setTimeout(() => t.classList.remove('show'), 3400);
}

let presets = [];
let selected = null;
let styleOptions = [];

function hueFromPreset(p) {
  return (p.linkWidthMm * 11 + p.chainLengthIn * 17 + p.styleId.length * 5) % 360;
}

function cardBackground(p) {
  const h = hueFromPreset(p);
  const h2 = (h + 48) % 360;
  return `linear-gradient(155deg, hsl(${h}, 32%, 16%), hsl(${h2}, 26%, 10%) 55%, #0a0b0d)`;
}

function matchesFilters(p) {
  const L = $('#cuban-filter-length').value;
  const W = $('#cuban-filter-width').value;
  const S = $('#cuban-filter-style').value;
  const q = ($('#cuban-search').value || '').trim().toLowerCase();
  if (L && String(p.chainLengthIn) !== L) return false;
  if (W && String(p.linkWidthMm) !== W) return false;
  if (S && p.styleId !== S) return false;
  if (q) {
    const blob = `${p.id} ${p.styleId} ${p.styleLabel} ${p.chainLengthIn} ${p.linkWidthMm} ${p.aiPromptHint || ''}`.toLowerCase();
    if (!blob.includes(q)) return false;
  }
  return true;
}

function renderGrid() {
  const grid = $('#cuban-grid');
  if (!grid) return;
  grid.innerHTML = '';
  const list = presets.filter(matchesFilters);
  for (const p of list) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'cuban-card' + (selected?.id === p.id ? ' cuban-card-active' : '');
    el.style.background = cardBackground(p);
    el.innerHTML = `
      <span class="cuban-card-id">${p.id}</span>
      <span class="cuban-card-mm">${p.linkWidthMm} mm</span>
      <span class="cuban-card-in">${p.chainLengthIn}"</span>
      <span class="cuban-card-style">${escapeHtml(p.styleLabel)}</span>
    `;
    el.addEventListener('click', () => {
      $$('.cuban-card').forEach((c) => c.classList.remove('cuban-card-active'));
      el.classList.add('cuban-card-active');
      selectPreset(p);
    });
    grid.appendChild(el);
  }
  const hint = $('#cuban-detail-hint');
  if (hint) hint.textContent = list.length ? `${list.length} setups match filters.` : 'No matches — clear filters.';
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function selectPreset(p) {
  selected = p;

  const detail = $('#cuban-detail');
  if (detail) detail.classList.remove('hidden');
  const title = $('#cuban-detail-title');
  if (title) title.textContent = `${p.id}`;
  const badge = $('#cuban-detail-badge');
  if (badge) badge.textContent = `${p.styleLabel}`;

  const spec = $('#cuban-spec');
  if (spec) {
    const rows = [
      ['Chain length', `${p.chainLengthIn} in (${p.chainLengthMm} mm)`],
      ['Face width (link)', `${p.linkWidthMm} mm`],
      ['Pitch (nominal)', `${p.pitchMm} mm`],
      ['Effective pitch', `${p.effectivePitchMm} mm`],
      ['Approx. link count', String(p.linkCount)],
      ['Link length (along chain)', `${p.linkLengthAlongMm} mm`],
      ['Thickness (profile)', `${p.thicknessMm} mm`],
      ['Inner clearance (model)', `${p.innerClearanceMm} mm`],
      ['Est. weight 14k (proxy)', `${p.weightEstimate14kG} g`],
      ['Clasp L × W × T', `${p.clasp.boxLengthMm} × ${p.clasp.boxWidthMm} × ${p.clasp.boxThicknessMm} mm`],
      ['Tongue length', `${p.clasp.tongueLengthMm} mm`],
      ['Safety loop Ø', `${p.clasp.safetyLoopInnerDm} mm`],
      ['Finish', p.finish || '—'],
    ];
    spec.innerHTML = rows.map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`).join('');
  }

  const cin = $('#cuban-conv-in');
  if (cin) {
    cin.value = String(p.chainLengthIn);
    delete cin.dataset.touched;
  }
  runConverter();
}

function $$(s, r = document) {
  return [...r.querySelectorAll(s)];
}

async function runConverter() {
  const v = parseFloat($('#cuban-conv-in')?.value);
  const out = $('#cuban-conv-out');
  if (!out) return;
  if (!Number.isFinite(v)) {
    out.value = '';
    return;
  }
  try {
    const res = await fetch('/api/cuban/convert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: v, from: 'in', to: 'mm' }),
    });
    const j = await res.json();
    out.value = j.success ? `${j.value} mm` : '';
  } catch {
    out.value = '';
  }
}

async function initCuban() {
  const grid = $('#cuban-grid');
  if (!grid) return;

  try {
    const res = await fetch('/api/cuban/presets');
    const j = await res.json();
    if (!j.success) throw new Error(j.error || 'presets');
    presets = j.presets || [];
  } catch (e) {
    toast(String(e.message || e));
    return;
  }

  const lengths = [...new Set(presets.map((p) => p.chainLengthIn))].sort((a, b) => a - b);
  const widths = [...new Set(presets.map((p) => p.linkWidthMm))].sort((a, b) => a - b);
  styleOptions = [...new Set(presets.map((p) => p.styleId))];

  const lenSel = $('#cuban-filter-length');
  const widSel = $('#cuban-filter-width');
  const stySel = $('#cuban-filter-style');
  for (const n of lengths) {
    const o = document.createElement('option');
    o.value = String(n);
    o.textContent = `${n}"`;
    lenSel.appendChild(o);
  }
  for (const n of widths) {
    const o = document.createElement('option');
    o.value = String(n);
    o.textContent = `${n} mm`;
    widSel.appendChild(o);
  }
  const styleLabels = {};
  for (const p of presets) styleLabels[p.styleId] = p.styleLabel;
  for (const sid of styleOptions) {
    const o = document.createElement('option');
    o.value = sid;
    o.textContent = styleLabels[sid] || sid;
    stySel.appendChild(o);
  }

  [lenSel, widSel, stySel].forEach((el) => el.addEventListener('change', renderGrid));
  $('#cuban-search')?.addEventListener('input', () => {
    window.clearTimeout(initCuban._searchT);
    initCuban._searchT = setTimeout(renderGrid, 120);
  });

  $('#cuban-conv-in')?.addEventListener('input', () => {
    $('#cuban-conv-in').dataset.touched = '1';
    runConverter();
  });

  $('#cuban-build')?.addEventListener('click', async () => {
    if (!selected) return toast('Select a preset card first.');
    try {
      const est = await fetchEstimate('cuban', { presetId: selected.id });
      const j = await runWithBuildOverlay('Building Cuban link + clasp', est, async () => {
        const res = await fetch('/api/cuban/build', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ presetId: selected.id }),
        });
        const out = await res.json();
        if (!out.success) throw new Error(out.error || 'build failed');
        return out;
      });
      window.dispatchEvent(new CustomEvent('matrix-load-obj', { detail: { url: j.obj } }));
      const o = $('#dl-obj');
      const st = $('#dl-stl');
      const cd = $('#dl-cad');
      if (o) {
        o.href = j.obj;
        o.setAttribute('download', `cuban_${j.exportSlug || 'piece'}.obj`);
      }
      if (st) {
        st.href = j.stl;
        st.setAttribute('download', `cuban_${j.exportSlug || 'piece'}.stl`);
      }
      if (cd) {
        cd.href = j.cad;
        cd.setAttribute('download', `cuban_${j.exportSlug || 'piece'}.cad`);
      }
      window.dispatchEvent(
        new CustomEvent('cuban-built', { detail: { exportSlug: j.exportSlug, stl: j.stl } }),
      );
      const eta = j.estimatedTime ? ` Typical ${j.estimatedTime}.` : '';
      toast(`Cuban mesh ready.${eta} Check viewport & downloads.`);
    } catch (e) {
      console.error(e);
      toast(String(e.message || e));
    }
  });

  $('#cuban-fill-prompt')?.addEventListener('click', () => {
    if (!selected) return toast('Select a preset first.');
    const ta = $('#in-prompt');
    if (ta) {
      ta.value = selected.aiPromptHint || '';
      ta.focus();
    }
    const st = $('#ai-style');
    if (st && [...st.options].some((o) => o.value === 'cuban_studio')) st.value = 'cuban_studio';
    toast('Prompt filled — choose Cuban style in Look if needed.');
  });

  $('#cuban-gen-img')?.addEventListener('click', async () => {
    if (!selected) return toast('Select a preset first.');
    const prompt = $('#in-prompt')?.value || selected.aiPromptHint || 'Miami Cuban chain';
    toast('Generating image…');
    try {
      const res = await fetch('/api/ai/preview-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          width: 1536,
          height: 960,
          provider: $('#ai-provider')?.value || 'auto',
          styleKey: $('#ai-style')?.value || 'cuban_studio',
          enhancePrompt: $('#ai-enhance')?.checked,
          useSavedMemory: $('#ai-use-saved')?.checked,
          rememberPrompt: $('#ai-remember-prompt')?.checked,
          cubanPresetId: selected.id,
        }),
      });
      const j = await res.json();
      if (!j.success) throw new Error(j.error || 'preview failed');
      const img = $('#ai-preview');
      if (img) {
        img.src = '/' + j.imagePath + '?t=' + Date.now();
        img.classList.add('preview-img');
      }
      toast(`Image done (${j.providerUsed || '?'})`);
    } catch (e) {
      console.error(e);
      toast(String(e.message || e));
    }
  });

  $('#cuban-copy-spec')?.addEventListener('click', async () => {
    if (!selected) return toast('Select a preset first.');
    const blob = JSON.stringify(selected, null, 2);
    try {
      await navigator.clipboard.writeText(blob);
      toast('Spec JSON copied.');
    } catch {
      toast('Clipboard failed — copy manually from console.');
      console.log(blob);
    }
  });

  selected = presets[0] || null;
  renderGrid();
  if (selected) selectPreset(selected);
}

window.addEventListener('cuban-select-preset', (ev) => {
  const id = ev.detail?.id;
  if (!id || !presets.length) return;
  const p = presets.find((x) => x.id === id);
  if (!p) return;
  selected = p;
  renderGrid();
  selectPreset(p);
});

initCuban();
