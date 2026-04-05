const $ = (s) => document.querySelector(s);

function toast(msg) {
  const t = $('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._id);
  toast._id = setTimeout(() => t.classList.remove('show'), 4200);
}

$('#copilot-ask')?.addEventListener('click', async () => {
  const msg = ($('#copilot-in')?.value || '').trim();
  if (!msg) {
    toast('Type a question first.');
    return;
  }
  const out = $('#copilot-out');
  if (out) {
    out.textContent = 'Thinking…';
    out.classList.remove('hidden');
  }
  try {
    const res = await fetch('/api/ai/workshop-copilot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: msg,
        context: {
          page: 'matrix_workshop',
          note: 'User may combine jewelry build, Complex Studio, Cuban lab, viewport transforms.',
        },
      }),
    });
    const text = await res.text();
    let j;
    try {
      j = JSON.parse(text);
    } catch {
      throw new Error(`Copilot: not JSON (${res.status}). ${text.slice(0, 220)}`);
    }
    if (!j.success) throw new Error(j.error || 'copilot failed');
    if (out) {
      out.textContent = JSON.stringify(j.result, null, 2);
      out.classList.remove('hidden');
    }
    toast(`Copilot (${j.modelUsed || 'model'})`);
  } catch (e) {
    console.error(e);
    if (out) {
      out.textContent = String(e.message || e);
      out.classList.remove('hidden');
    }
    toast(String(e.message || e));
  }
});
