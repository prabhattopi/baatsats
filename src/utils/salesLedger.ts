'use client';

import type { SettledReceipt } from '@/types/pos';
import {
  publishNostrSaleReceipt,
  getOrCreateMerchantNostrIdentity,
  fetchMerchantReceiptsFromRelays,
} from '@/utils/nostrReceipt';

const DB_NAME = 'baatsats_pos_db';
const STORE_NAME = 'settled_receipts';
const DB_VERSION = 1;
const FALLBACK_STORAGE_KEY = 'baatsats_receipts_fallback_v1';

function openLedgerDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB unavailable'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('settledAt', 'settledAt', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB'));
  });
}

export async function saveReceiptToLedger(receipt: SettledReceipt): Promise<void> {
  try {
    const db = await openLedgerDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(receipt);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    if (typeof window !== 'undefined') {
      const existing = getFallbackReceipts();
      const updated = [receipt, ...existing.filter((r) => r.id !== receipt.id)].slice(0, 200);
      window.localStorage.setItem(FALLBACK_STORAGE_KEY, JSON.stringify(updated));
    }
  }
}

function getFallbackReceipts(): SettledReceipt[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(FALLBACK_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SettledReceipt[]) : [];
  } catch {
    return [];
  }
}

export async function getAllReceipts(): Promise<SettledReceipt[]> {
  try {
    const db = await openLedgerDb();
    const receipts = await new Promise<SettledReceipt[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => resolve((req.result as SettledReceipt[]) || []);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return receipts.sort((a, b) => b.settledAt - a.settledAt);
  } catch {
    return getFallbackReceipts().sort((a, b) => b.settledAt - a.settledAt);
  }
}

// Restores any past receipts published under this merchant's npub on Nostr relays
export async function hydrateLedgerFromNostr(defaultLightningAddress: string): Promise<number> {
  const [localReceipts, relayReceipts] = await Promise.all([
    getAllReceipts(),
    fetchMerchantReceiptsFromRelays(defaultLightningAddress),
  ]);

  const existingIds = new Set(localReceipts.map((r) => r.id));
  const existingEventIds = new Set(
    localReceipts.map((r) => r.nostrEventId).filter((id): id is string => Boolean(id))
  );

  let imported = 0;
  for (const remote of relayReceipts) {
    if (
      !existingIds.has(remote.id) &&
      (!remote.nostrEventId || !existingEventIds.has(remote.nostrEventId))
    ) {
      await saveReceiptToLedger(remote);
      imported += 1;
    }
  }

  return imported;
}

export async function syncOfflineQueuedReceipts(): Promise<number> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return 0;

  const all = await getAllReceipts();
  const pending = all.filter((r) => r.syncStatus === 'offline-queued');
  if (pending.length === 0) return 0;

  let syncedCount = 0;

  for (const item of pending) {
    try {
      const proof = await publishNostrSaleReceipt({
        transaction: {
          item: item.item,
          quantity: item.quantity,
          amountXOF: item.amountXOF,
          amountSats: item.amountSats,
          timestamp: item.settledAt,
        },
        lightningAddress: item.lightningAddress,
        bolt11: 'offline-settled',
        settlementMode: 'demo-settled',
      });

      if (proof.relaysPublished > 0) {
        const updated: SettledReceipt = {
          ...item,
          nostrEventId: proof.eventId,
          nostrNoteId: proof.noteId,
          nostrPubkey: proof.pubkey,
          relaysPublished: proof.relaysPublished,
          syncStatus: 'synced',
        };
        await saveReceiptToLedger(updated);
        syncedCount += 1;
      }
    } catch {
      // Keep queued for next online reconnection
    }
  }

  return syncedCount;
}

export function buildMicroLoanCreditPassport(receipts: SettledReceipt[]) {
  const identity = getOrCreateMerchantNostrIdentity();
  const totalSats = receipts.reduce((sum, r) => sum + r.amountSats, 0);
  const totalXOF = receipts.reduce((sum, r) => sum + r.amountXOF, 0);
  const nostrVerifiedCount = receipts.filter((r) => r.relaysPublished > 0).length;

  return {
    schema: 'baatsats-microcredit-passport-v1',
    generatedAt: new Date().toISOString(),
    marketLocation: 'Marché Sandaga, Dakar, Senegal',
    merchantNostrPubkey: identity.npub,
    verificationUrl: `https://njump.me/${identity.npub}`,
    summary: {
      totalTransactions: receipts.length,
      nostrCryptographicallyVerified: nostrVerifiedCount,
      cumulativeRevenueXOF: totalXOF,
      cumulativeRevenueSats: totalSats,
    },
    verifiableReceipts: receipts.map((r) => ({
      id: r.id,
      item: r.item,
      quantity: r.quantity,
      amountXOF: r.amountXOF,
      amountSats: r.amountSats,
      settledAt: new Date(r.settledAt).toISOString(),
      syncStatus: r.syncStatus,
      nostrNoteId: r.nostrNoteId || null,
      njumpProofUrl: r.nostrNoteId ? `https://njump.me/${r.nostrNoteId}` : null,
      relaysPublished: r.relaysPublished,
    })),
  };
}