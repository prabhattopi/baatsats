import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { verifyUrl?: unknown };
    const verifyUrl = typeof body.verifyUrl === 'string' ? body.verifyUrl.trim() : '';

    if (!verifyUrl) {
      return NextResponse.json({ settled: false });
    }

    // Security by Design: Strict HTTPS check to prevent SSRF
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(verifyUrl);
    } catch {
      return NextResponse.json({ settled: false }, { status: 400 });
    }

    if (parsedUrl.protocol !== 'https:') {
      return NextResponse.json({ settled: false }, { status: 400 });
    }

    const res = await fetch(parsedUrl.toString(), {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(4000),
    });

    if (!res.ok) {
      return NextResponse.json({ settled: false });
    }

    const data = (await res.json()) as { settled?: boolean };
    return NextResponse.json({ settled: Boolean(data.settled) });
  } catch {
    return NextResponse.json({ settled: false });
  }
}