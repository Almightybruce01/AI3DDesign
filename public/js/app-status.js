/**
 * Top-bar health pill + Status modal: app version, last server/code timestamps, explicit issues list.
 */

const $ = (id) => document.getElementById(id);

async function readJsonRes(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Not JSON (${res.status}): ${text.slice(0, 180)}`);
  }
}

function formatLocal(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'medium' });
  } catch {
    return String(iso);
  }
}

export async function refreshWorkshopHealthPill() {
  const el = $('workshop-health-pill');
  if (!el) return;
  try {
    const r = await fetch('/api/workshop/health');
    const j = await readJsonRes(r);
    const bits = [];
    if (j.openai) {
      if (j.groqKey && !j.openaiKey) bits.push('Groq ✓');
      else if (j.openaiKey && j.groqKey) bits.push('LLM ✓');
      else bits.push('OpenAI ✓');
    } else {
      bits.push('LLM —');
    }
    bits.push(j.replicate ? 'Rep ✓' : 'Rep —');
    bits.push(j.blenderVersion ? 'Blender ✓' : 'Blender —');
    bits.push(j.workshopCopilot ? 'Copilot ✓' : 'Copilot —');
    el.textContent = bits.join(' ');
    const n = Array.isArray(j.issues) ? j.issues.length : 0;
    const bv = j.blenderVersion ? j.blenderVersion.slice(0, 48) : '';
    el.title = [
      `Port ${j.port} · v${j.packageVersion || '?'}`,
      j.serverStartedAt ? `Server up since ${formatLocal(j.serverStartedAt)}` : '',
      j.serverEntryMtime ? `server.js mtime ${formatLocal(j.serverEntryMtime)}` : '',
      `Issues: ${n} — click for details`,
      bv ? `Blender: ${bv}` : '',
      j.blenderPath ? `Path: ${j.blenderPath}` : '',
    ]
      .filter(Boolean)
      .join('\n');
    el.classList.toggle('health-pill--warn', n > 0);
    el.classList.toggle('health-pill--ok', n === 0);
  } catch (e) {
    el.textContent = 'Server ?';
    el.title = String(e.message || e);
    el.classList.add('health-pill--warn');
    el.classList.remove('health-pill--ok');
  }
}

async function populateStatusModal() {
  const ver = $('app-status-version');
  const started = $('app-status-started');
  const mtime = $('app-status-mtime');
  const checked = $('app-status-checked');
  const ul = $('app-status-issues');
  const portEl = $('app-status-port');
  const plat = $('app-status-platform');
  if (!ul) return;
  checked.textContent = formatLocal(new Date().toISOString());
  try {
    const r = await fetch('/api/workshop/health');
    const j = await readJsonRes(r);
    if (ver) ver.textContent = j.packageVersion || '—';
    if (started) started.textContent = formatLocal(j.serverStartedAt);
    if (mtime) mtime.textContent = formatLocal(j.serverEntryMtime);
    if (portEl) portEl.textContent = String(j.port ?? '—');
    if (plat) plat.textContent = j.platform ? `${j.platform} · ${j.visionModel || ''}` : '—';
    const llmBase = $('app-status-llm-base');
    if (llmBase) llmBase.textContent = j.openaiBaseUrl || '—';
    ul.innerHTML = '';
    const list = Array.isArray(j.issues) ? j.issues : [];
    const notes = Array.isArray(j.notes) ? j.notes : [];
    if (list.length === 0 && notes.length === 0) {
      const li = document.createElement('li');
      li.textContent = 'No issues — LLM config and Blender CLI look good.';
      li.className = 'status-ok-line';
      ul.appendChild(li);
    } else {
      list.forEach((msg) => {
        const li = document.createElement('li');
        li.textContent = msg;
        ul.appendChild(li);
      });
      notes.forEach((msg) => {
        const li = document.createElement('li');
        li.textContent = msg;
        li.className = 'status-note-line';
        ul.appendChild(li);
      });
    }
  } catch (e) {
    if (ver) ver.textContent = '—';
    if (started) started.textContent = '—';
    if (mtime) mtime.textContent = '—';
    const llmBase = $('app-status-llm-base');
    if (llmBase) llmBase.textContent = '—';
    ul.innerHTML = '';
    const li = document.createElement('li');
    li.textContent = `Cannot reach server: ${e.message || e}`;
    ul.appendChild(li);
  }
}

function toggleStatusModal(show) {
  const m = $('app-status-modal');
  if (!m) return;
  m.classList.toggle('hidden', !show);
}

function wireStatusUi() {
  const openers = [$('btn-app-status'), $('workshop-health-pill')];
  openers.forEach((el) => {
    if (!el) return;
    const open = async () => {
      await populateStatusModal();
      toggleStatusModal(true);
    };
    el.addEventListener('click', open);
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open();
      }
    });
  });
  $('app-status-close')?.addEventListener('click', () => toggleStatusModal(false));
  $('app-status-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'app-status-modal') toggleStatusModal(false);
  });
}

refreshWorkshopHealthPill();
setInterval(refreshWorkshopHealthPill, 120000);
wireStatusUi();
