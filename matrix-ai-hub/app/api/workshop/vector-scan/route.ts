import { NextResponse } from 'next/server';

const MAX_MB = 12;

/**
 * Server-side proxy: browser → Vercel → your Matrix Workshop (potrace / sharp).
 * Avoids CORS surprises and keeps workshop URL configurable in one place.
 */
export async function POST(req: Request) {
  const workshop = process.env.WORKSHOP_API_BASE_URL || process.env.NEXT_PUBLIC_WORKSHOP_API;
  if (!workshop) {
    return NextResponse.json(
      { success: false, error: 'Set WORKSHOP_API_BASE_URL (server) or NEXT_PUBLIC_WORKSHOP_API to your Node workshop URL.' },
      { status: 503 },
    );
  }

  const base = workshop.replace(/\/$/, '');
  const ct = req.headers.get('content-type') || '';
  if (!ct.includes('multipart/form-data')) {
    return NextResponse.json({ success: false, error: 'Expected multipart/form-data' }, { status: 400 });
  }

  const incoming = await req.formData();
  const image = incoming.get('image');
  if (!(image instanceof Blob)) {
    return NextResponse.json({ success: false, error: 'Missing image field' }, { status: 400 });
  }
  if (image.size > MAX_MB * 1024 * 1024) {
    return NextResponse.json({ success: false, error: `Image too large (max ${MAX_MB}MB)` }, { status: 400 });
  }

  const out = new FormData();
  out.append('image', image, 'upload.png');
  const inv = incoming.get('invert');
  if (inv === '1' || inv === 'true') out.append('invert', '1');

  const r = await fetch(`${base}/api/jewelry/vector-scan`, {
    method: 'POST',
    body: out,
  });

  const text = await r.text();
  try {
    const j = JSON.parse(text);
    return NextResponse.json(j, { status: r.status });
  } catch {
    return NextResponse.json(
      { success: false, error: 'Workshop returned non-JSON', raw: text.slice(0, 400) },
      { status: 502 },
    );
  }
}
