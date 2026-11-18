'use client';

import { generateSecretKey, getPublicKey, finalizeEvent, nip19 } from 'nostr-tools';
import type { Event, Filter } from 'nostr-tools';
import { SimplePool } from 'nostr-tools/pool';
import type { ParsedTransaction, SettledReceipt } from '@/types/pos';

const NOSTR_SK_STORAGE_KEY = 'baatsats_merchant_nostr_sk_hex';
const NOSTR_PROFILE_PUBLISHED_KEY = 'baatsats_merchant_profile_published_v1';

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

// Publishes Kind 0 Nostr profile metadata so njump.me shows a named Dakar merchant instead of <unnamed>
export async function ensureMerchantNostrProfile(lightningAddress: string): Promise<void> {
  if (typeof window === 'undefined' || !navigator.onLine) return;
  try {
    if (window.localStorage.getItem(NOSTR_PROFILE_PUBLISHED_KEY) === lightningAddress) {
      return;
    }
  } catch {
    // Continue
  }

  const identity = getOrCreateMerchantNostrIdentity();
  const metadata = {
    name: 'BaatSats Merchant • Dakar',
    display_name: 'BaatSats Sandaga POS',
    about: 'Voice-first Wolof/French Bitcoin Lightning merchant at Marché Sandaga, Dakar.',
    lud16: lightningAddress,
  };

  const profileEvent = finalizeEvent(
    {
      kind: 0,
      created_at: Math.floor(Date.now() / 1000),
      tags: [['t', 'baatsats']],
      content: JSON.stringify(metadata),
    },
    identity.secretKey
  );

  const pool = new SimplePool();
  try {
    await Promise.race([
      Promise.allSettled(pool.publish(PUBLIC_NOSTR_RELAYS, profileEvent)),
      new Promise((resolve) => setTimeout(resolve, 2500)),
    ]);
    window.localStorage.setItem(NOSTR_PROFILE_PUBLISHED_KEY, lightningAddress);
  } catch {
    // Ignore network failures
  } finally {
    try {
      pool.close(PUBLIC_NOSTR_RELAYS);
    } catch {
      // Ignore
    }
  }
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

// Fetches existing BaatSats receipts from public Nostr relays for this merchant's npub
export async function fetchMerchantReceiptsFromRelays(
  defaultLightningAddress: string
): Promise<SettledReceipt[]> {
  if (typeof window === 'undefined' || !navigator.onLine) return [];

  const identity = getOrCreateMerchantNostrIdentity();
  const pool = new SimplePool();

  try {
    const filter: Filter = {
      kinds: [1],
      authors: [identity.pubkeyHex],
      '#t': ['baatsats'],
      limit: 50,
    };

    const events: Event[] = await new Promise((resolve) => {
      const collected = new Map<string, Event>();
      const timer = setTimeout(() => {
        try {
          sub.close();
        } catch {
          // Ignore
        }
        resolve(Array.from(collected.values()));
      }, 3000);

      const sub = pool.subscribeMany(PUBLIC_NOSTR_RELAYS, filter, {
        onevent(ev) {
          collected.set(ev.id, ev);
        },
        oneose() {
          clearTimeout(timer);
          try {
            sub.close();
          } catch {
            // Ignore
          }
          resolve(Array.from(collected.values()));
        },
      });
    });

    const recovered: SettledReceipt[] = [];

    for (const ev of events) {
      const jsonMatch = ev.content.match(/\{[\s\S]*"protocol"\s*:\s*"baatsats-pos-v1"[\s\S]*\}/);
      if (!jsonMatch) continue;

      try {
        const payload = JSON.parse(jsonMatch[0]) as {
          item?: string;
          quantity?: number;
          amount_xof?: number;
          amount_sats?: number;
          timestamp?: number;
        };

        if (typeof payload.amount_sats === 'number' && payload.amount_sats > 0) {
          recovered.push({
            id: ev.id.slice(0, 16),
            item: payload.item || 'BaatSats Sale',
            quantity: payload.quantity || 1,
            amountXOF: payload.amount_xof || 0,
            amountSats: payload.amount_sats,
            lightningAddress: defaultLightningAddress,
            nostrEventId: ev.id,
            nostrNoteId: nip19.noteEncode(ev.id),
            nostrPubkey: identity.npub,
            relaysPublished: 1,
            syncStatus: 'synced',
            settledAt: (payload.timestamp || ev.created_at) * 1000,
          });
        }
      } catch {
        // Skip malformed event
      }
    }

    return recovered;
  } catch {
    return [];
  } finally {
    try {
      pool.close(PUBLIC_NOSTR_RELAYS);
    } catch {
      // Ignore
    }
  }
}