/**
 * Full-screen build progress (time-based bar; server work is opaque until HTTP returns).
 */

const $ = (id) => document.getElementById(id);

export function formatEtaClient(seconds) {
  const s = Math.round(Number(seconds) || 0);
  if (s < 55) return `~${s} sec`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (r < 8 || m >= 10) return `~${m} min`;
  return `~${m} min ${r} sec`;
}

export function showBuildOverlay(title, subtitle) {
  const ov = $('build-overlay');
  const ti = $('build-overlay-title');
  const su = $('build-overlay-sub');
  if (ti) ti.textContent = title || 'Working…';
  if (su) su.textContent = subtitle || '';
  if (ov) {
    ov.classList.remove('hidden');
    ov.setAttribute('aria-busy', 'true');
  }
  setBuildProgress(2, 'Connecting…');
}

export function setBuildProgress(pct, detail) {
  const fill = $('build-overlay-fill');
  const det = $('build-overlay-detail');
  if (fill) fill.style.width = `${Math.min(100, Math.max(0, pct))}%`;
  if (det && detail != null) det.textContent = detail;
}

export function hideBuildOverlay() {
  const ov = $('build-overlay');
  if (ov) {
    ov.classList.add('hidden');
    ov.setAttribute('aria-busy', 'false');
  }
}

export async function fetchEstimate(type, body = {}) {
  const res = await fetch('/api/build/estimate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, ...body }),
  });
  const text = await res.text();
  let j;
  try {
    j = JSON.parse(text);
  } catch {
    throw new Error(`Estimate: not JSON (${res.status}). ${text.slice(0, 160)}`);
  }
  if (!j.success) throw new Error(j.error || 'estimate failed');
  return j.estimatedSeconds;
}

/**
 * @param {string} title
 * @param {number} estimatedSeconds
 * @param {() => Promise<any>} work
 */
export async function runWithBuildOverlay(title, estimatedSeconds, work) {
  const target = Math.max(3, Number(estimatedSeconds) || 20);
  showBuildOverlay(title, `Typical total ${formatEtaClient(target)} · bar fills toward that, then hits 100% when the server finishes.`);
  const t0 = Date.now();
  const iv = setInterval(() => {
    const elapsedSec = (Date.now() - t0) / 1000;
    const pct = Math.min(95, (elapsedSec / target) * 100);
    const rem = Math.max(0, target - elapsedSec);
    setBuildProgress(
      pct,
      `${elapsedSec.toFixed(0)}s elapsed · ~${rem.toFixed(0)}s left to typical finish (stays at 95% until done)`,
    );
  }, 200);
  try {
    const result = await work();
    clearInterval(iv);
    setBuildProgress(100, 'Complete — loading result…');
    await new Promise((r) => setTimeout(r, 500));
    return result;
  } catch (e) {
    clearInterval(iv);
    setBuildProgress(0, String(e.message || e));
    await new Promise((r) => setTimeout(r, 900));
    throw e;
  } finally {
    hideBuildOverlay();
  }
}
