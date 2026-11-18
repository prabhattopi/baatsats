'use client';

import {
  X,
  TrendingUp,
  ShieldCheck,
  Download,
  ExternalLink,
  Clock,
  RefreshCw,
} from 'lucide-react';
import type { SettledReceipt, TranslationDictionary } from '@/types/pos';
import { buildMicroLoanCreditPassport } from '@/utils/salesLedger';
import { soundEffects } from '@/utils/audioFeedback';

interface Props {
  receipts: SettledReceipt[];
  merchantNpub: string;
  t: TranslationDictionary;
  onClose: () => void;
  onSyncNow: () => void;
  isSyncing: boolean;
}

export default function SalesLedgerDrawer({
  receipts,
  merchantNpub,
  t,
  onClose,
  onSyncNow,
  isSyncing,
}: Props) {
  const totalSats = receipts.reduce((sum, r) => sum + r.amountSats, 0);
  const totalXOF = receipts.reduce((sum, r) => sum + r.amountXOF, 0);
  const pendingCount = receipts.filter((r) => r.syncStatus === 'offline-queued').length;

  const handleDownloadPassport = () => {
    soundEffects.playSuccess();
    const passport = buildMicroLoanCreditPassport(receipts);
    const blob = new Blob([JSON.stringify(passport, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `baatsats-credit-passport-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-md max-h-[88vh] flex flex-col bg-slate-900 border-2 border-slate-700 rounded-3xl p-5 shadow-2xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3 shrink-0">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-emerald-400" />
            <div>
              <h2 className="font-black text-sm text-white">{t.todaysSales}</h2>
              <p className="text-[10px] font-mono text-slate-400">
                IndexedDB Offline-First Ledger
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
            aria-label="Close ledger"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Cumulative Balance Summary Card */}
        <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-950 to-slate-900 border border-amber-500/30 shrink-0 space-y-2">
          <div className="flex items-baseline justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                Cumulative Revenue
              </p>
              <p className="text-3xl font-black text-white mt-0.5">
                {totalSats.toLocaleString()}{' '}
                <span className="text-amber-500 text-base font-bold">Sats</span>
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold text-emerald-400">
                {totalXOF.toLocaleString()} {t.currency}
              </p>
              <p className="text-[11px] text-slate-400">{receipts.length} sales</p>
            </div>
          </div>

          {merchantNpub && (
            <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
              <span className="font-mono text-slate-400 truncate max-w-[210px]">
                {merchantNpub}
              </span>
              <a
                href={`https://njump.me/${merchantNpub}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-purple-400 hover:text-purple-300 font-semibold flex items-center gap-1 shrink-0"
              >
                <span>Profile</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}
        </div>

        {/* Offline Sync Banner if any queued receipts exist */}
        {pendingCount > 0 && (
          <div className="px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between text-xs shrink-0">
            <span className="text-amber-300 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              {pendingCount} offline receipt(s) pending sync
            </span>
            <button
              onClick={onSyncNow}
              disabled={isSyncing}
              className="px-2.5 py-1 rounded-lg bg-amber-500 text-slate-950 font-bold flex items-center gap-1"
            >
              <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>Sync</span>
            </button>
          </div>
        )}

        {/* Scrollable Receipt List */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {receipts.length === 0 ? (
            <div className="text-center py-8 text-xs text-slate-500">
              No settled transactions yet. Complete a voice sale to build your Nostr credit ledger.
            </div>
          ) : (
            receipts.map((item) => (
              <div
                key={item.id}
                className="p-3 rounded-xl bg-slate-950/90 border border-slate-800 flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-200 truncate">
                    {item.quantity > 1 ? `${item.quantity}× ` : ''}
                    {item.item}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-400 font-mono">
                    <span>
                      {new Date(item.settledAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    {item.syncStatus === 'synced' ? (
                      <span className="text-purple-400 flex items-center gap-0.5">
                        <ShieldCheck className="w-3 h-3" /> Nostr ({item.relaysPublished}/3)
                      </span>
                    ) : (
                      <span className="text-amber-400">Offline Queued</span>
                    )}
                  </div>
                </div>

                <div className="text-right shrink-0 flex items-center gap-2">
                  <div>
                    <p className="text-xs font-black text-amber-400 font-mono">
                      +{item.amountSats.toLocaleString()} sats
                    </p>
                    <p className="text-[10px] text-slate-400">
                      {item.amountXOF.toLocaleString()} F
                    </p>
                  </div>
                  {item.nostrNoteId && (
                    <a
                      href={`https://njump.me/${item.nostrNoteId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded-lg bg-purple-500/15 text-purple-300 hover:bg-purple-500/30"
                      title={t.verifyOnNostr}
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Export Micro-Loan Credit Passport Button */}
        <button
          onClick={handleDownloadPassport}
          disabled={receipts.length === 0}
          className="w-full py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-black text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 shrink-0 transition-transform active:scale-95"
        >
          <Download className="w-4 h-4" />
          <span>{t.exportCreditProof}</span>
        </button>
      </div>
    </div>
  );
}