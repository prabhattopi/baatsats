import { NextResponse } from 'next/server';
import type { FxRateData } from '@/types/pos';

// Official BCEAO fixed peg: 1 EUR = 655.957 XOF (West African CFA Franc)
const EUR_TO_XOF_PEG = 655.957;
const SATS_PER_BTC = 100_000_000;
const FALLBACK_BTC_EUR = 88_000;

export async function GET() {
  // 1. Primary: Bitcoin-native Mempool.space API (cached for 60s)
  try {
    const mempoolRes = await fetch('https://mempool.space/api/v1/prices', {
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(4000),
    });

    if (mempoolRes.ok) {
      const data = (await mempoolRes.json()) as { EUR?: number };
      if (data.EUR && data.EUR > 0) {
        const btcPriceXOF = Math.round(data.EUR * EUR_TO_XOF_PEG);
        const payload: FxRateData = {
          btcPriceEUR: data.EUR,
          btcPriceXOF,
          satsPerXOF: SATS_PER_BTC / btcPriceXOF,
          source: 'mempool.space',
          updatedAt: Date.now(),
        };
        return NextResponse.json(payload);
      }
    }
  } catch {
    // Fall through to secondary oracle
  }

  // 2. Secondary: CoinGecko public API
  try {
    const cgRes = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=eur',
      {
        next: { revalidate: 60 },
        signal: AbortSignal.timeout(4000),
      }
    );

    if (cgRes.ok) {
      const data = (await cgRes.json()) as { bitcoin?: { eur?: number } };
      const eurPrice = data.bitcoin?.eur;
      if (eurPrice && eurPrice > 0) {
        const btcPriceXOF = Math.round(eurPrice * EUR_TO_XOF_PEG);
        const payload: FxRateData = {
          btcPriceEUR: eurPrice,
          btcPriceXOF,
          satsPerXOF: SATS_PER_BTC / btcPriceXOF,
          source: 'coingecko',
          updatedAt: Date.now(),
        };
        return NextResponse.json(payload);
      }
    }
  } catch {
    // Fall through to offline resilient fallback
  }

  // 3. Offline-resilient fallback so Dakar market POS never blocks
  const fallbackXOF = Math.round(FALLBACK_BTC_EUR * EUR_TO_XOF_PEG);
  const fallbackPayload: FxRateData = {
    btcPriceEUR: FALLBACK_BTC_EUR,
    btcPriceXOF: fallbackXOF,
    satsPerXOF: SATS_PER_BTC / fallbackXOF,
    source: 'offline-fallback',
    updatedAt: Date.now(),
  };

  return NextResponse.json(fallbackPayload);
}