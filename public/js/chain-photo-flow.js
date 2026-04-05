import { runWithBuildOverlay, fetchEstimate } from '/js/build-overlay.js';

const $ = (s, r = document) => r.querySelector(s);

function toast(msg) {
  const t = $('#toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._id);
  toast._id = setTimeout(() => t.classList.remove('show'), 3800);
}

let lastFile = null;
let lastAnalysis = null;
let lastMeshRel = 'generated/cuban_last.stl';
let lastExportSlug = 'last';

window.addEventListener('cuban-built', (e) => {
  if (e.detail?.exportSlug) lastExportSlug = e.detail.exportSlug;
  if (e.detail?.stl) lastMeshRel = String(e.detail.stl).replace(/^\//, '');
});

function setPreview(file) {
  if (!file) return;
  lastFile = file;
  const img = $('#chain-photo-preview');
  if (!img) return;
  img.classList.remove('hidden');
  img.src = URL.createObjectURL(file);
}

function wireFileInput(el) {
  if (!el) return;
  el.addEventListener('change', (e) => {
    const f = e.target.files?.[0];
    if (f) setPreview(f);
    e.target.value = '';
  });
}

async function postForm(url, fd) {
  const res = await fetch(url, { method: 'POST', body: fd });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.success) throw new Error(j.error || res.statusText);
  return j;
}

/** Need any configured LLM; photo uses GPT-4o when OPENAI_API_KEY is set, else text-only Groq→OpenAI fallback. */
async function requireChainLlm() {
  const res = await fetch('/api/ai/config');
  const j = await res.json().catch(() => ({}));
  if (!j.success || !j.providers?.openai) {
    throw new Error(
      'Set GROQ_API_KEY or OPENAI_API_KEY in .env and restart the server.',
    );
  }
  if (!j.providers?.groqKey && !j.providers?.complexBriefPhoto) {
    throw new Error('Set at least GROQ_API_KEY or OPENAI_API_KEY for chain analysis.');
  }
}

function updateDownloadsFromBuild(j) {
  lastMeshRel = (j.stl || '').replace(/^\//, '') || lastMeshRel;
  if (j.exportSlug) lastExportSlug = j.exportSlug;
  const o = $('#dl-obj');
  const st = $('#dl-stl');
  const cd = $('#dl-cad');
  const slug = j.exportSlug || 'piece';
  if (o && j.obj) {
    o.href = j.obj;
    o.setAttribute('download', `cuban_${slug}.obj`);
  }
  if (st && j.stl) {
    st.href = j.stl;
    st.setAttribute('download', `cuban_${slug}.stl`);
  }
  if (cd && j.cad) {
    cd.href = j.cad;
    cd.setAttribute('download', `cuban_${slug}.cad`);
  }
}

function showAnalysis(obj) {
  const pre = $('#chain-photo-analysis');
  if (!pre) return;
  pre.classList.remove('hidden');
  pre.textContent = JSON.stringify(obj, null, 2);
}

function initChainPhoto() {
  const drop = $('#chain-photo-drop');
  wireFileInput($('#chain-photo-file'));
  wireFileInput($('#chain-photo-cam'));

  if (drop) {
    ['dragenter', 'dragover'].forEach((ev) =>
      drop.addEventListener(ev, (e) => {
        e.preventDefault();
        drop.classList.add('chain-photo-drop-active');
      }),
    );
    ['dragleave', 'drop'].forEach((ev) =>
      drop.addEventListener(ev, (e) => {
        e.preventDefault();
        drop.classList.remove('chain-photo-drop-active');
      }),
    );
    drop.addEventListener('drop', (e) => {
      const f = e.dataTransfer?.files?.[0];
      if (f && f.type.startsWith('image/')) setPreview(f);
    });
  }

  $('#chain-photo-analyze')?.addEventListener('click', async () => {
    if (!lastFile) return toast('Choose or drop a photo first.');
    $('#chain-photo-status').textContent = '';
    try {
      await requireChainLlm();
    } catch (e) {
      toast(String(e.message || e));
      return;
    }
    toast('Analyzing with GPT-4o vision…');
    try {
      const fd = new FormData();
      fd.append('chainPhoto', lastFile, lastFile.name || 'chain.jpg');
      fd.append('userNotes', $('#chain-photo-notes')?.value || '');
      const j = await postForm('/api/cuban/analyze-photo', fd);
      lastAnalysis = j.analysis;
      const ps = j.analysis?.printSpec;
      if (ps?.linkWidthMm != null) $('#chain-cal-width').value = String(ps.linkWidthMm);
      if (ps?.chainLengthIn != null) $('#chain-cal-length').value = String(ps.chainLengthIn);
      showAnalysis({ analysis: j.analysis, serverMatchedPreset: j.serverMatchedPreset, visionModel: j.visionModel });
      $('#chain-photo-status').textContent = j.serverMatchedPreset
        ? `Matched catalog: ${j.serverMatchedPreset.id} (${j.serverMatchedPreset.linkWidthMm} mm · ${j.serverMatchedPreset.chainLengthIn}").`
        : 'No close catalog match — custom dimensions will be used for print.';
      toast('Analysis ready.');
    } catch (e) {
      console.error(e);
      toast(String(e.message || e));
    }
  });

  $('#chain-photo-print')?.addEventListener('click', async () => {
    if (!lastFile) return toast('Choose or drop a photo first.');
    $('#chain-photo-status').textContent = '';
    try {
      await requireChainLlm();
    } catch (e) {
      toast(String(e.message || e));
      return;
    }
    try {
      const fd = new FormData();
      fd.append('chainPhoto', lastFile, lastFile.name || 'chain.jpg');
      fd.append('userNotes', $('#chain-photo-notes')?.value || '');
      const est = await fetchEstimate('photo_to_print', {});
      const j = await runWithBuildOverlay('Photo + notes → full chain mesh (link + clasp)', est, async () =>
        postForm('/api/cuban/photo-to-print', fd),
      );
      lastAnalysis = j.analysis;
      const psp = j.analysis?.printSpec;
      if (psp?.linkWidthMm != null) $('#chain-cal-width').value = String(psp.linkWidthMm);
      if (psp?.chainLengthIn != null) $('#chain-cal-length').value = String(psp.chainLengthIn);
      showAnalysis({ analysis: j.analysis, build: j.build });
      updateDownloadsFromBuild(j);
      window.dispatchEvent(new CustomEvent('matrix-load-obj', { detail: { url: j.obj } }));
      if (j.analysis?.matchedPresetId) {
        window.dispatchEvent(new CustomEvent('cuban-select-preset', { detail: { id: j.analysis.matchedPresetId } }));
      }
      $('#chain-photo-status').textContent =
        'Print pack ready — STL is in millimetres. Confirm scale in your slicer.';
      toast('Print-ready mesh loaded.');
    } catch (e) {
      console.error(e);
      toast(String(e.message || e));
    }
  });

  $('#chain-photo-refine')?.addEventListener('click', async () => {
    if (!lastFile) return toast('Choose or drop a photo first.');
    toast('Replicate photo-to-photo…');
    try {
      const fd = new FormData();
      fd.append('chainPhoto', lastFile, lastFile.name || 'chain.jpg');
      fd.append('instruction', $('#chain-photo-notes')?.value || 'improve lighting and sharpness, keep jewelry accurate');
      const j = await postForm('/api/cuban/photo-refine', fd);
      const img = $('#ai-preview');
      if (img) {
        img.src = '/' + j.imagePath + '?t=' + Date.now();
        img.classList.add('preview-img');
      }
      toast('Refined image in AI studio preview.');
    } catch (e) {
      console.error(e);
      toast(String(e.message || e));
    }
  });

  $('#chain-photo-semantic')?.addEventListener('click', async () => {
    const prompt =
      lastAnalysis?.dallePrompt ||
      $('#chain-photo-notes')?.value ||
      'Miami Cuban gold chain product photo';
    toast('Rendering catalog image…');
    try {
      const res = await fetch('/api/ai/chain-semantic-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          width: 1536,
          height: 960,
          provider: $('#ai-provider')?.value || 'auto',
          styleKey: 'cuban_studio',
        }),
      });
      const j = await res.json();
      if (!j.success) throw new Error(j.error || 'failed');
      const img = $('#ai-preview');
      if (img) {
        img.src = '/' + j.imagePath + '?t=' + Date.now();
        img.classList.add('preview-img');
      }
      $('#in-prompt').value = prompt;
      toast(`Done (${j.providerUsed || '?'})`);
    } catch (e) {
      console.error(e);
      toast(String(e.message || e));
    }
  });

  $('#chain-photo-apply-preset')?.addEventListener('click', () => {
    const id = lastAnalysis?.matchedPresetId;
    if (!id) return toast('Run analyze first, or pick a card in the grid.');
    window.dispatchEvent(new CustomEvent('cuban-select-preset', { detail: { id } }));
    toast(`Selected ${id} in catalog.`);
  });

  $('#chain-cal-rebuild')?.addEventListener('click', async () => {
    let analysis = lastAnalysis;
    const w = parseFloat($('#chain-cal-width')?.value);
    const len = parseFloat($('#chain-cal-length')?.value);
    if (!analysis) {
      if (!Number.isFinite(w) || !Number.isFinite(len)) {
        toast('Run Analyze first, or enter both caliper width (mm) and length (in).');
        return;
      }
      analysis = {
        chainType: 'miami_cuban',
        printSpec: { linkWidthMm: w, chainLengthIn: len, thicknessRatio: 0.44 },
      };
    }
    toast('Rebuilding mesh with caliper values…');
    try {
      const res = await fetch('/api/cuban/calibrate-rebuild', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          analysis,
          measuredLinkWidthMm: Number.isFinite(w) ? w : undefined,
          measuredChainLengthIn: Number.isFinite(len) ? len : undefined,
        }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || 'failed');
      lastAnalysis = j.analysis;
      showAnalysis({ analysis: j.analysis, build: j.build, matchedPreset: j.matchedPreset });
      updateDownloadsFromBuild(j);
      window.dispatchEvent(new CustomEvent('matrix-load-obj', { detail: { url: j.obj } }));
      if (j.matchedPreset?.id) {
        window.dispatchEvent(new CustomEvent('cuban-select-preset', { detail: { id: j.matchedPreset.id } }));
      }
      toast('Calibrated mesh loaded.');
    } catch (e) {
      console.error(e);
      toast(String(e.message || e));
    }
  });

  $('#chain-mesh-stats')?.addEventListener('click', async () => {
    try {
      const r = await fetch('/api/mesh/stats?path=' + encodeURIComponent(lastMeshRel));
      const j = await r.json();
      const out = $('#chain-mesh-stats-out');
      if (!out) return;
      if (!j.success || !j.stats) {
        out.textContent = j.error || 'Could not read STL';
        return;
      }
      const sz = j.stats.bbox.sizeMm.map((x) => x.toFixed(2)).join(' × ');
      out.textContent = `${j.stats.triangles.toLocaleString()} triangles · bbox ${sz} mm (${j.stats.binary ? 'binary' : 'ascii'} STL)`;
    } catch (e) {
      $('#chain-mesh-stats-out').textContent = String(e.message || e);
    }
  });

  $('#chain-export-pack')?.addEventListener('click', async () => {
    toast('Creating print pack…');
    try {
      const res = await fetch('/api/cuban/export-pack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exportSlug: lastExportSlug,
          analysis: lastAnalysis,
          label: 'Miami Cuban export',
        }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || 'failed');
      if (j.readmeUrl) window.open(j.readmeUrl, '_blank', 'noopener');
      if (j.zipUrl) window.open(j.zipUrl, '_blank', 'noopener');
      toast(j.zipUrl ? 'Pack ready — README and ZIP opened in new tabs.' : 'Pack folder created — see README link.');
    } catch (e) {
      console.error(e);
      toast(String(e.message || e));
    }
  });

  $('#chain-feedback-save')?.addEventListener('click', async () => {
    const correction = $('#chain-feedback-text')?.value?.trim();
    if (!correction) return toast('Type a short preference for future AI runs.');
    try {
      const res = await fetch('/api/cuban/vision-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ correction, context: 'cuban_photo' }),
      });
      const j = await res.json();
      if (!j.success) throw new Error(j.error || 'failed');
      $('#chain-feedback-text').value = '';
      toast(`Saved preference #${j.stored}.`);
    } catch (e) {
      toast(String(e.message || e));
    }
  });

  $('#chain-blender-open')?.addEventListener('click', async () => {
    toast('Launching Blender…');
    try {
      const res = await fetch('/api/blender/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mesh: lastMeshRel }),
      });
      const j = await res.json();
      if (!j.success) throw new Error(j.error || 'failed');
      $('#chain-photo-status').textContent = `Blender started (${j.blender}). If nothing opens, set BLENDER_PATH in .env.`;
      toast('Blender launch sent.');
    } catch (e) {
      console.error(e);
      toast(String(e.message || e));
    }
  });
}

initChainPhoto();
