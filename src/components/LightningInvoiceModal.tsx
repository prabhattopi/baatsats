'use client';

import { useState, useEffect, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  Zap,
  Copy,
  Check,
  X,
  Loader2,
  CheckCircle2,
  ShieldCheck,
  Radio,
  Sparkles,
  ExternalLink,
  CloudOff,
} from 'lucide-react';
import type {
  ParsedTransaction,
  LightningInvoiceData,
  SettledReceipt,
  TranslationDictionary,
} from '@/types/pos';
import { soundEffects } from '@/utils/audioFeedback';
import { publishNostrSaleReceipt, getOrCreateMerchantNostrIdentity } from '@/utils/nostrReceipt';

interface Props {
  transaction: ParsedTransaction;
  invoice: LightningInvoiceData;
  t: TranslationDictionary;
  onClose: () => void;
  onSettled: (receipt: SettledReceipt) => void;
}

export default function LightningInvoiceModal({
  transaction,
  invoice,
  t,
  onClose,
  onSettled,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [isSettling, setIsSettling] = useState(false);
  const [receipt, setReceipt] = useState<SettledReceipt | null>(null);

  const finalizeSettlement = useCallback(
    async (mode: 'lightning-verified' | 'demo-settled') => {
      if (isSettling || receipt) return;
      setIsSettling(true);
      soundEffects.playSuccess();

      const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;

      if (isOffline) {
        const identity = getOrCreateMerchantNostrIdentity();
        const offlineReceipt: SettledReceipt = {
          id: `offline_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          item: transaction.item,
          quantity: transaction.quantity,
          amountXOF: transaction.amountXOF,
          amountSats: transaction.amountSats,
          lightningAddress: invoice.lightningAddress,
          nostrPubkey: identity.npub,
          relaysPublished: 0,
          syncStatus: 'offline-queued',
          settledAt: Date.now(),
        };
        setReceipt(offlineReceipt);
        setIsSettling(false);
        return;
      }

      const nostrProof = await publishNostrSaleReceipt({
        transaction,
        lightningAddress: invoice.lightningAddress,
        bolt11: invoice.bolt11,
        settlementMode: mode,
      });

      const completedReceipt: SettledReceipt = {
        id: nostrProof.eventId.slice(0, 16),
        item: transaction.item,
        quantity: transaction.quantity,
        amountXOF: transaction.amountXOF,
        amountSats: transaction.amountSats,
        lightningAddress: invoice.lightningAddress,
        nostrEventId: nostrProof.eventId,
        nostrNoteId: nostrProof.noteId,
        nostrPubkey: nostrProof.pubkey,
        relaysPublished: nostrProof.relaysPublished,
        syncStatus: nostrProof.relaysPublished > 0 ? 'synced' : 'offline-queued',
        settledAt: Date.now(),
      };

      setReceipt(completedReceipt);
      setIsSettling(false);
    },
    [isSettling, receipt, transaction, invoice]
  );

  // Poll LUD-21 verify endpoint every 3 seconds if online
  useEffect(() => {
    if (!invoice.verifyUrl || receipt || isSettling) return;

    const interval = setInterval(async () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      try {
        const res = await fetch('/api/lightning/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ verifyUrl: invoice.verifyUrl }),
        });
        const data = (await res.json()) as { settled?: boolean };
        if (data.settled) {
          clearInterval(interval);
          await finalizeSettlement('lightning-verified');
        }
      } catch {
        // Continue polling
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [invoice.verifyUrl, receipt, isSettling, finalizeSettlement]);

  const handleCopyBolt11 = async () => {
    try {
      await navigator.clipboard.writeText(invoice.bolt11);
      setCopied(true);
      soundEffects.playMicStart();
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard fallback
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-md bg-slate-900 border-2 border-amber-500/60 rounded-3xl p-5 shadow-2xl space-y-4">
        {/* Top Bar */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-500 fill-amber-500" />
            <span className="font-black text-sm text-white">
              {receipt ? t.paymentConfirmed : 'BOLT11 Lightning Invoice'}
            </span>
          </div>
          {!receipt && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
              aria-label="Close invoice"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {!receipt ? (
          <>
            <div className="text-center">
              <p className="text-xs text-slate-400">
                {transaction.quantity > 1 ? `${transaction.quantity}× ` : ''}
                {transaction.item}
              </p>
              <p className="text-3xl font-black text-white mt-0.5">
                {transaction.amountSats.toLocaleString()}{' '}
                <span className="text-amber-500 text-lg">Sats</span>
              </p>
              <p className="text-xs font-mono text-slate-400">
                {transaction.amountXOF.toLocaleString()} {t.currency} • {invoice.lightningAddress}
              </p>
            </div>

            <div className="flex flex-col items-center justify-center bg-white p-4 rounded-2xl mx-auto w-fit shadow-inner">
              <QRCodeSVG
                value={invoice.bolt11.toUpperCase()}
                size={200}
                bgColor="#ffffff"
                fgColor="#090d16"
                level="M"
              />
            </div>

            <p className="text-center text-xs text-slate-300 font-medium">{t.scanToPay}</p>

            <button
              onClick={handleCopyBolt11}
              className="w-full py-2.5 px-3 rounded-xl bg-slate-950 border border-slate-800 hover:border-amber-500/50 text-xs font-mono text-slate-300 flex items-center justify-between gap-2"
            >
              <span className="truncate">{invoice.bolt11}</span>
              <span className="flex items-center gap-1 text-amber-400 font-sans font-bold shrink-0">
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? t.copied : t.copyInvoice}
              </span>
            </button>

            <div className="flex items-center justify-center gap-2 text-xs text-amber-400 py-1">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>{t.waitingPayment}</span>
            </div>

            <button
              onClick={() => finalizeSettlement('demo-settled')}
              disabled={isSettling}
              className="w-full py-3 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 font-bold text-xs flex items-center justify-center gap-2 transition-colors"
            >
              {isSettling ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Signing Nostr Receipt...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>{t.simulatePay}</span>
                </>
              )}
            </button>
          </>
        ) : (
          /* Settled Confirmation + Direct Nostr Explorer Proof */
          <div className="space-y-4 text-center py-2 animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 border-2 border-emerald-500 flex items-center justify-center mx-auto text-emerald-400">
              <CheckCircle2 className="w-10 h-10" />
            </div>

            <div>
              <h3 className="text-xl font-black text-white">{t.paymentConfirmed}</h3>
              <p className="text-sm text-emerald-400 font-mono font-bold mt-1">
                +{receipt.amountSats.toLocaleString()} Sats ({receipt.amountXOF.toLocaleString()} FCFA)
              </p>
            </div>

            <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 text-left space-y-2 text-xs">
              <div className="flex items-center justify-between text-purple-400 font-bold">
                <span className="flex items-center gap-1.5">
                  {receipt.syncStatus === 'synced' ? (
                    <>
                      <ShieldCheck className="w-4 h-4" />
                      Nostr Signed Receipt
                    </>
                  ) : (
                    <>
                      <CloudOff className="w-4 h-4 text-amber-400" />
                      <span className="text-amber-300">Offline Queued</span>
                    </>
                  )}
                </span>
                <span className="flex items-center gap-1 text-[10px] font-mono bg-purple-500/10 px-2 py-0.5 rounded-full">
                  <Radio className="w-3 h-3" />
                  {receipt.relaysPublished}/3 Relays
                </span>
              </div>

              {receipt.nostrNoteId ? (
                <p className="font-mono text-[11px] text-slate-400 break-all">
                  Event: <span className="text-slate-200">{receipt.nostrNoteId}</span>
                </p>
              ) : (
                <p className="text-[11px] text-amber-300/90">{t.offlineSaved}</p>
              )}

              {receipt.nostrNoteId && receipt.relaysPublished > 0 && (
                <a
                  href={`https://njump.me/${receipt.nostrNoteId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 w-full py-2 px-3 rounded-xl bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/40 text-purple-300 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
                >
                  <span>{t.verifyOnNostr}</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>

            <button
              onClick={() => onSettled(receipt)}
              className="w-full py-4 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-base shadow-lg shadow-amber-500/30 active:scale-95 transition-transform"
            >
              {t.newSale}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}