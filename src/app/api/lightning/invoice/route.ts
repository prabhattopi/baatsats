import { NextResponse } from 'next/server';

const DEFAULT_LIGHTNING_ADDRESS = process.env.LIGHTNING_ADDRESS || 'hello@getalby.com';
const ADDRESS_REGEX = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

interface LnurlPayMetadata {
  callback?: string;
  minSendable?: number;
  maxSendable?: number;
  commentAllowed?: number;
  tag?: string;
  status?: string;
  reason?: string;
}

interface LnurlCallbackResponse {
  pr?: string;
  verify?: string;
  status?: string;
  reason?: string;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      amountSats?: unknown;
      memo?: unknown;
      lightningAddress?: unknown;
    };

    const amountSats =
      typeof body.amountSats === 'number' && Number.isFinite(body.amountSats)
        ? Math.round(body.amountSats)
        : 0;

    if (amountSats < 1 || amountSats > 10_000_000) {
      return NextResponse.json(
        { error: 'Amount must be between 1 and 10,000,000 sats.' },
        { status: 400 }
      );
    }

    const rawAddress =
      typeof body.lightningAddress === 'string' && body.lightningAddress.trim().length > 0
        ? body.lightningAddress.trim().toLowerCase()
        : DEFAULT_LIGHTNING_ADDRESS;

    if (!ADDRESS_REGEX.test(rawAddress)) {
      return NextResponse.json(
        { error: 'Invalid Lightning Address format (expected user@domain.com).' },
        { status: 400 }
      );
    }

    const [username, domain] = rawAddress.split('@');
    const wellKnownUrl = `https://${domain}/.well-known/lnurlp/${encodeURIComponent(username)}`;

    // Step 1: Resolve LUD-16 LNURL-pay endpoint
    const metaRes = await fetch(wellKnownUrl, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(6000),
    });

    if (!metaRes.ok) {
      return NextResponse.json(
        { error: `Could not reach Lightning provider at ${domain} (${metaRes.status}).` },
        { status: 502 }
      );
    }

    const meta = (await metaRes.json()) as LnurlPayMetadata;
    if (meta.status === 'ERROR' || !meta.callback) {
      return NextResponse.json(
        { error: meta.reason || 'Lightning provider does not support LNURL-pay.' },
        { status: 502 }
      );
    }

    const amountMsat = amountSats * 1000;
    const minSendable = meta.minSendable ?? 1000;
    const maxSendable = meta.maxSendable ?? 100_000_000_000;

    if (amountMsat < minSendable || amountMsat > maxSendable) {
      return NextResponse.json(
        {
          error: `Amount out of range for ${rawAddress} (${Math.ceil(minSendable / 1000)} - ${Math.floor(maxSendable / 1000)} sats).`,
        },
        { status: 400 }
      );
    }

    // Step 2: Request real BOLT11 invoice from provider callback
    const callbackUrl = new URL(meta.callback);
    callbackUrl.searchParams.set('amount', String(amountMsat));

    const cleanMemo = typeof body.memo === 'string' ? body.memo.trim().slice(0, 80) : '';
    if (cleanMemo && meta.commentAllowed && meta.commentAllowed > 0) {
      callbackUrl.searchParams.set('comment', cleanMemo.slice(0, meta.commentAllowed));
    }

    const invoiceRes = await fetch(callbackUrl.toString(), {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(6000),
    });

    if (!invoiceRes.ok) {
      return NextResponse.json(
        { error: `Failed to generate BOLT11 invoice (${invoiceRes.status}).` },
        { status: 502 }
      );
    }

    const invoiceData = (await invoiceRes.json()) as LnurlCallbackResponse;
    if (invoiceData.status === 'ERROR' || !invoiceData.pr) {
      return NextResponse.json(
        { error: invoiceData.reason || 'Lightning provider returned no invoice.' },
        { status: 502 }
      );
    }

    return NextResponse.json({
      bolt11: invoiceData.pr,
      verifyUrl: typeof invoiceData.verify === 'string' ? invoiceData.verify : null,
      lightningAddress: rawAddress,
      amountSats,
      expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes standard window
    });
  } catch (error) {
    console.error('Lightning invoice error:', error instanceof Error ? error.message : 'Unknown');
    return NextResponse.json(
      { error: 'Unable to generate Lightning invoice. Check internet connection.' },
      { status: 500 }
    );
  }
}