'use client';

import { generateSecretKey, getPublicKey, finalizeEvent, nip19 } from 'nostr-tools';
import { SimplePool } from 'nostr-tools/pool';
import type { ParsedTransaction } from '@/types/pos';

const NOSTR_SK_STORAGE_KEY = 'baatsats_merchant_nostr_sk_hex';

export const PUBLIC_NOSTR_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.primal.net',
];

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim();
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export interface MerchantNostrIdentity {
  secretKey: Uint8Array;
  pubkeyHex: string;
  npub: string;
}

export function getOrCreateMerchantNostrIdentity(): MerchantNostrIdentity {
  if (typeof window === 'undefined') {
    const sk = generateSecretKey();
    const pk = getPublicKey(sk);
    return { secretKey: sk, pubkeyHex: pk, npub: nip19.npubEncode(pk) };
  }

  try {
    const existingHex = window.localStorage.getItem(NOSTR_SK_STORAGE_KEY);
    if (existingHex && /^[0-9a-fA-F]{64}$/.test(existingHex)) {
      const sk = hexToBytes(existingHex);
      const pk = getPublicKey(sk);
      return { secretKey: sk, pubkeyHex: pk, npub: nip19.npubEncode(pk) };
    }
  } catch {
    // Fallback to fresh ephemeral keypair
  }

  const freshSk = generateSecretKey();
  const freshPk = getPublicKey(freshSk);
  try {
    window.localStorage.setItem(NOSTR_SK_STORAGE_KEY, bytesToHex(freshSk));
  } catch {
    // Storage quota fallback
  }

  return {
    secretKey: freshSk,
    pubkeyHex: freshPk,
    npub: nip19.npubEncode(freshPk),
  };
}

export async function publishNostrSaleReceipt(params: {
  transaction: ParsedTransaction;
  lightningAddress: string;
  bolt11: string;
  settlementMode: 'lightning-verified' | 'demo-settled';
}): Promise<{
  eventId: string;
  noteId: string;
  pubkey: string;
  relaysPublished: number;
}> {
  const identity = getOrCreateMerchantNostrIdentity();
  const createdAt = Math.floor(Date.now() / 1000);

  // Privacy by Design: Publish structured POS proof without any customer PII
  const receiptPayload = {
    protocol: 'baatsats-pos-v1',
    market: 'Dakar-Sandaga',
    item: params.transaction.item,
    quantity: params.transaction.quantity,
    amount_xof: params.transaction.amountXOF,
    amount_sats: params.transaction.amountSats,
    settlement: params.settlementMode,
    timestamp: createdAt,
  };

  const signedEvent = finalizeEvent(
    {
      kind: 1,
      created_at: createdAt,
      tags: [
        ['t', 'baatsats'],
        ['t', 'dakarbitcoinhack'],
        ['t', 'lightning'],
        ['amount_sats', String(params.transaction.amountSats)],
        ['currency', 'XOF'],
      ],
      content: `⚡ BaatSats POS Receipt (${params.transaction.quantity}× ${params.transaction.item}): ${params.transaction.amountXOF.toLocaleString()} FCFA (${params.transaction.amountSats.toLocaleString()} sats)\n${JSON.stringify(receiptPayload)}`,
    },
    identity.secretKey
  );

  const noteId = nip19.noteEncode(signedEvent.id);
  const pool = new SimplePool();

  let relaysPublished = 0;
  try {
    const publishPromises = pool.publish(PUBLIC_NOSTR_RELAYS, signedEvent);
    const results = await Promise.race([
      Promise.allSettled(publishPromises),
      new Promise<PromiseSettledResult<string>[]>((resolve) =>
        setTimeout(() => resolve([]), 3500)
      ),
    ]);
    relaysPublished = results.filter((r) => r.status === 'fulfilled').length;
  } catch {
    // Cryptographic signature is still valid offline
  } finally {
    try {
      pool.close(PUBLIC_NOSTR_RELAYS);
    } catch {
      // Ignore socket close error
    }
  }

  return {
    eventId: signedEvent.id,
    noteId,
    pubkey: identity.npub,
    relaysPublished,
  };
}