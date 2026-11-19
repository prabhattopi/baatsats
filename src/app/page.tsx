'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Wifi,
  WifiOff,
  ArrowRight,
  RefreshCw,
  Zap,
  ShoppingBag,
  MessageSquareQuote,
  AlertTriangle,
  Pencil,
  Check,
  Sparkles,
  Loader2,
  Wallet,
  TrendingUp,
} from 'lucide-react';
import {
  Language,
  VoiceState,
  ParsedTransaction,
  FxRateData,
  LightningInvoiceData,
  SettledReceipt,
} from '@/types/pos';
import { translations } from '@/utils/i18n';
import { soundEffects } from '@/utils/audioFeedback';
import { useAudioRecorder } from '@/hooks/useAudioRecorder';
import LanguageSelector from '@/components/LanguageSelector';
import VoiceTriggerButton from '@/components/VoiceTriggerButton';
import LightningInvoiceModal from '@/components/LightningInvoiceModal';
import SalesLedgerDrawer from '@/components/SalesLedgerDrawer';
import {
  getOrCreateMerchantNostrIdentity,
  ensureMerchantNostrProfile,
} from '@/utils/nostrReceipt';
import {
  getAllReceipts,
  saveReceiptToLedger,
  syncOfflineQueuedReceipts,
  hydrateLedgerFromNostr,
} from '@/utils/salesLedger';
const DEFAULT_SATS_PER_XOF = 1.71;
const LN_ADDRESS_STORAGE_KEY = 'baatsats_merchant_ln_address';

export default function MerchantTerminal() {
  const [lang, setLang] = useState<Language>('wo');
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [processingStep, setProcessingStep] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [transaction, setTransaction] = useState<ParsedTransaction | null>(null);

  const [fxRate, setFxRate] = useState<FxRateData | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(true);

  const [isEditingAmount, setIsEditingAmount] = useState(false);
  const [editAmountInput, setEditAmountInput] = useState('');

  // Lightning & Nostr Wallet State
  const [lightningAddress, setLightningAddress] = useState('hello@getalby.com');
  const [merchantNpub, setMerchantNpub] = useState('');
  const [showWalletConfig, setShowWalletConfig] = useState(false);
  const [lnInputDraft, setLnInputDraft] = useState('');
  const [isGeneratingInvoice, setIsGeneratingInvoice] = useState(false);
  const [activeInvoice, setActiveInvoice] = useState<LightningInvoiceData | null>(null);

  // Offline-First Sales Ledger State
  const [receipts, setReceipts] = useState<SettledReceipt[]>([]);
  const [showLedger, setShowLedger] = useState(false);
  const [isSyncingLedger, setIsSyncingLedger] = useState(false);

  const {
    isRecording,
    recordingSeconds,
    startRecording,
    stopRecording,
    error: micError,
    clearError,
  } = useAudioRecorder();

  const t = translations[lang];
  const satsPerXOF = fxRate?.satsPerXOF ?? DEFAULT_SATS_PER_XOF;

  const convertXofToSats = useCallback(
    (xof: number) => (xof > 0 ? Math.max(1, Math.round(xof * satsPerXOF)) : 0),
    [satsPerXOF]
  );

  const refreshLedger = useCallback(async () => {
    const items = await getAllReceipts();
    setReceipts(items);
  }, []);

  const handleSyncOfflineQueue = useCallback(async () => {
    setIsSyncingLedger(true);
    try {
      await syncOfflineQueuedReceipts();
      await refreshLedger();
    } finally {
      setIsSyncingLedger(false);
    }
  }, [refreshLedger]);

  useEffect(() => {
    let active = true;

    if (typeof navigator !== 'undefined') {
      setIsOnline(navigator.onLine);
    }

    fetch('/api/rates')
      .then((res) => res.json())
      .then((data: FxRateData) => {
        if (active && data.satsPerXOF) {
          setFxRate(data);
        }
      })
      .catch(() => {});

    try {
      const savedLn = window.localStorage.getItem(LN_ADDRESS_STORAGE_KEY);
      if (savedLn) setLightningAddress(savedLn);
      const id = getOrCreateMerchantNostrIdentity();
      setMerchantNpub(id.npub);
    } catch {
      // Storage fallback
    }

    refreshLedger();
    const savedAddress =
      (typeof window !== 'undefined' && window.localStorage.getItem(LN_ADDRESS_STORAGE_KEY)) ||
      'hello@getalby.com';

    refreshLedger().then(() => {
      hydrateLedgerFromNostr(savedAddress).then((imported) => {
        if (imported > 0) {
          refreshLedger();
        }
      });
      ensureMerchantNostrProfile(savedAddress);
    });

    const onOnline = () => {
      setIsOnline(true);
      handleSyncOfflineQueue();
    };
    const onOffline = () => setIsOnline(false);

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    return () => {
      active = false;
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [refreshLedger, handleSyncOfflineQueue]);

  const handleVoiceToggle = async () => {
    if (!isRecording && (voiceState === 'idle' || voiceState === 'error')) {
      setStatusMessage(null);
      clearError();
      const started = await startRecording();
      if (started) {
        setVoiceState('listening');
      } else {
        setVoiceState('error');
        soundEffects.playCancel();
      }
      return;
    }

    if (isRecording) {
      setVoiceState('processing');
      setProcessingStep('Whisper ASR...');
      const audioBlob = await stopRecording();

      if (!audioBlob) {
        setVoiceState('error');
        soundEffects.playCancel();
        return;
      }

      try {
        const formData = new FormData();
        formData.append('audio', audioBlob);
        formData.append('lang', lang);

        const transcribeRes = await fetch('/api/transcribe', {
          method: 'POST',
          body: formData,
        });

        const transcribeData = await transcribeRes.json();
        if (!transcribeRes.ok || !transcribeData.transcript) {
          throw new Error(transcribeData.error || 'Transcription failed');
        }

        setProcessingStep('AI Agent...');
        const parseRes = await fetch('/api/parse-intent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            transcript: transcribeData.transcript,
            lang,
          }),
        });

        const parsedData = await parseRes.json();
        if (!parseRes.ok) {
          throw new Error(parsedData.error || 'Intent parsing failed');
        }

        const amountXOF = typeof parsedData.amountXOF === 'number' ? parsedData.amountXOF : 0;

        setTransaction({
          item: parsedData.item,
          quantity: parsedData.quantity || 1,
          amountXOF,
          amountSats: convertXofToSats(amountXOF),
          rawTranscript: transcribeData.transcript,
          confidence: parsedData.confidence,
          timestamp: Date.now(),
        });

        setIsEditingAmount(false);
        setVoiceState('ready');
        soundEffects.playSuccess();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Network error during AI processing';
        setStatusMessage(msg);
        setVoiceState('error');
        soundEffects.playCancel();
      }
    }
  };

  const handleGenerateLightningInvoice = async () => {
    if (!transaction || transaction.amountSats < 1 || isGeneratingInvoice) return;
    setIsGeneratingInvoice(true);
    setStatusMessage(null);

    try {
      const res = await fetch('/api/lightning/invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountSats: transaction.amountSats,
          memo: `BaatSats: ${transaction.quantity}x ${transaction.item} (${transaction.amountXOF} FCFA)`,
          lightningAddress,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.bolt11) {
        throw new Error(data.error || 'Failed to create Lightning invoice');
      }

      soundEffects.playMicStart();
      setActiveInvoice(data as LightningInvoiceData);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Lightning network error';
      setStatusMessage(msg);
      soundEffects.playCancel();
    } finally {
      setIsGeneratingInvoice(false);
    }
  };

  const handleReceiptSettled = async (newReceipt: SettledReceipt) => {
    await saveReceiptToLedger(newReceipt);
    await refreshLedger();
    setActiveInvoice(null);
    setTransaction(null);
    setVoiceState('idle');
  };

  const handleReset = () => {
    soundEffects.playCancel();
    setTransaction(null);
    setActiveInvoice(null);
    setStatusMessage(null);
    setIsEditingAmount(false);
    clearError();
    setVoiceState('idle');
  };

  const handleQuickAdd = (amount: number, itemLabel: string) => {
    soundEffects.playMicStart();
    setTransaction({
      item: itemLabel,
      quantity: 1,
      amountXOF: amount,
      amountSats: convertXofToSats(amount),
      confidence: 'high',
      timestamp: Date.now(),
    });
    setStatusMessage(null);
    setIsEditingAmount(false);
    setVoiceState('ready');
    soundEffects.playSuccess();
  };

  const setCardAmount = (validXOF: number) => {
    if (!transaction) return;
    setTransaction({
      ...transaction,
      amountXOF: validXOF,
      amountSats: convertXofToSats(validXOF),
      confidence: validXOF > 0 ? 'high' : transaction.confidence,
    });
    setIsEditingAmount(false);
    soundEffects.playSuccess();
  };

  const startAmountEdit = () => {
    if (!transaction) return;
    setEditAmountInput(transaction.amountXOF > 0 ? String(transaction.amountXOF) : '');
    setIsEditingAmount(true);
  };

  const saveAmountEdit = () => {
    if (!transaction) return;
    const numeric = parseInt(editAmountInput.replace(/\D/g, ''), 10);
    const validXOF = numeric && numeric > 0 ? Math.min(numeric, 10_000_000) : transaction.amountXOF;
    setCardAmount(validXOF);
  };

  const saveWalletSettings = () => {
    const clean = lnInputDraft.trim().toLowerCase();
    if (clean.includes('@') && clean.includes('.')) {
      setLightningAddress(clean);
      try {
        window.localStorage.setItem(LN_ADDRESS_STORAGE_KEY, clean);
      } catch {
        // Ignore
      }
    }
    setShowWalletConfig(false);
    soundEffects.playSuccess();
  };

  const activeError = statusMessage || micError;
  const totalEarnedSats = receipts.reduce((sum, r) => sum + r.amountSats, 0);
  const totalEarnedXOF = receipts.reduce((sum, r) => sum + r.amountXOF, 0);

  return (
    <main className="flex min-h-screen flex-col justify-between p-4 max-w-md mx-auto select-none">
      {/* Top Header */}
      <header className="w-full flex justify-between items-center pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500 font-black shadow-inner">
            ⚡
          </div>
          <div>
            <h1 className="text-base font-black tracking-tight flex items-center gap-1.5">
              {t.appName}
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-mono">
                POS
              </span>
            </h1>
            <p className="text-[11px] text-slate-400">{t.marketSubtitle}</p>
          </div>
        </div>

        <LanguageSelector currentLang={lang} onSelect={setLang} />
      </header>

      {/* Live Oracle & Lightning Wallet Bar */}
      <div className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg bg-slate-900/60 border border-slate-800/80 mt-2.5">
        <div className="flex items-center gap-1.5 text-[11px] text-slate-300 font-mono">
          {isOnline ? (
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          ) : (
            <WifiOff className="w-3.5 h-3.5 text-amber-400" />
          )}
          <span>1k F ≈ {Math.round(1000 * satsPerXOF).toLocaleString()} sats</span>
        </div>
        <button
          onClick={() => {
            setLnInputDraft(lightningAddress);
            setShowWalletConfig((prev) => !prev);
          }}
          className="text-[11px] font-mono text-amber-400 hover:text-amber-300 flex items-center gap-1"
          title="Configure Lightning Address & Nostr Identity"
        >
          <Wallet className="w-3 h-3" />
          <span className="max-w-[130px] truncate">{lightningAddress}</span>
        </button>
      </div>

      {/* Live Cumulative Earnings & Ledger Trigger Pill */}
      <button
        onClick={() => setShowLedger(true)}
        className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-emerald-950/35 hover:bg-emerald-950/55 border border-emerald-500/30 my-2 transition-colors"
      >
        <div className="flex items-center gap-2 text-xs">
          <TrendingUp className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="font-bold text-slate-200">{t.todaysSales}:</span>
          <span className="font-mono font-black text-emerald-400">
            +{totalEarnedSats.toLocaleString()} Sats
          </span>
        </div>
        <span className="text-[11px] font-mono text-slate-300 bg-slate-900/80 px-2 py-0.5 rounded-md border border-slate-800">
          {totalEarnedXOF.toLocaleString()} F ({receipts.length})
        </span>
      </button>

      {/* Collapsible Merchant Lightning + Nostr Identity Drawer */}
      {showWalletConfig && (
        <div className="w-full mb-2 p-3.5 rounded-2xl bg-slate-900 border border-amber-500/40 space-y-2.5 text-xs animate-in fade-in duration-150">
          <div className="flex items-center justify-between">
            <span className="font-bold text-amber-400 flex items-center gap-1.5">
              <Wifi className="w-3.5 h-3.5" /> Merchant Receiving Wallet (LUD-16)
            </span>
          </div>
          <div className="flex gap-2">
            <input
              type="email"
              value={lnInputDraft}
              onChange={(e) => setLnInputDraft(e.target.value)}
              placeholder="merchant@getalby.com"
              className="flex-1 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 font-mono text-xs focus:outline-none focus:border-amber-500"
            />
            <button
              onClick={saveWalletSettings}
              className="px-3 py-1.5 rounded-lg bg-amber-500 text-slate-950 font-bold"
            >
              Save
            </button>
          </div>
          {merchantNpub && (
            <p className="text-[10px] font-mono text-slate-400 truncate">
              Nostr ID: <span className="text-purple-400">{merchantNpub}</span>
            </p>
          )}
        </div>
      )}

      {/* Center Stage: Voice Trigger or Parsed Invoice Card */}
      <div className="flex-1 flex flex-col items-center justify-center">
        {!transaction ? (
          <div className="w-full text-center space-y-3">
            <VoiceTriggerButton
              state={voiceState}
              recordingSeconds={recordingSeconds}
              onPress={handleVoiceToggle}
              langHint={
                voiceState === 'idle'
                  ? t.tapToSpeak
                  : voiceState === 'listening'
                  ? t.listening
                  : voiceState === 'processing'
                  ? `${t.processing} (${processingStep})`
                  : t.tapToSpeak
              }
            />

            {voiceState === 'error' && activeError ? (
              <div className="p-3 mx-2 rounded-xl bg-rose-950/80 border border-rose-500/50 text-xs text-rose-200 flex items-center justify-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span className="font-medium">{activeError}</span>
              </div>
            ) : (
              voiceState === 'idle' && (
                <div className="p-3 mx-2 rounded-xl bg-slate-900/80 border border-slate-800/80 text-xs text-slate-400">
                  <p className="font-medium text-slate-300">💡 {t.voiceHint}</p>
                </div>
              )
            )}
          </div>
        ) : (
          /* Parsed Bill Card (Tactile High-Contrast) */
          <div className="w-full bg-slate-900 border-2 border-amber-500/60 rounded-3xl p-5 shadow-2xl shadow-amber-500/10 space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-start border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <ShoppingBag className="w-5 h-5 text-amber-500 shrink-0" />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    {transaction.quantity > 1 && (
                      <span className="px-1.5 py-0.5 rounded-md bg-amber-500 text-slate-950 font-mono font-black text-xs shrink-0">
                        {transaction.quantity}×
                      </span>
                    )}
                    <span className="font-bold text-slate-100 text-sm truncate">
                      {transaction.item}
                    </span>
                  </div>
                  {transaction.confidence && (
                    <span className="text-[10px] text-emerald-400 flex items-center gap-1 font-mono mt-0.5">
                      <Sparkles className="w-2.5 h-2.5" />
                      AI Parsed • {transaction.confidence.toUpperCase()}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={handleReset}
                className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg bg-slate-800 shrink-0"
                title={t.cancel}
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>

            {/* Live Whisper Transcript Badge */}
            {transaction.rawTranscript && (
              <div className="p-2.5 rounded-xl bg-slate-950/90 border border-slate-800 flex items-start gap-2 text-left">
                <MessageSquareQuote className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-slate-300 italic">
                  &ldquo;{transaction.rawTranscript}&rdquo;
                </p>
              </div>
            )}

            {/* Huge Amount Visual + 1-Tap Override */}
            <div className="text-center py-1">
              <p className="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-1">
                {t.amountDue}
              </p>

              {isEditingAmount ? (
                <div className="flex items-center justify-center gap-2 my-1">
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="3500"
                    value={editAmountInput}
                    onChange={(e) => setEditAmountInput(e.target.value.replace(/\D/g, ''))}
                    onKeyDown={(e) => e.key === 'Enter' && saveAmountEdit()}
                    autoFocus
                    className="w-40 px-3 py-2 text-center text-2xl font-black bg-slate-950 border-2 border-amber-500 rounded-xl text-white focus:outline-none"
                  />
                  <button
                    onClick={saveAmountEdit}
                    className="p-3 rounded-xl bg-emerald-500 text-slate-950 font-bold active:scale-95"
                    aria-label="Confirm amount"
                  >
                    <Check className="w-5 h-5" />
                  </button>
                </div>
              ) : (
                <div className="inline-flex items-center justify-center gap-2">
                  <div
                    onClick={startAmountEdit}
                    className={`text-4xl font-black tracking-tight cursor-pointer ${
                      transaction.amountXOF > 0 ? 'text-white' : 'text-slate-500'
                    }`}
                  >
                    {transaction.amountXOF.toLocaleString()}{' '}
                    <span className="text-amber-500 text-2xl font-bold">{t.currency}</span>
                  </div>
                  <button
                    onClick={startAmountEdit}
                    className="p-1.5 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-slate-300"
                    title="Edit amount"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {transaction.amountXOF === 0 && !isEditingAmount ? (
                <div className="mt-2 space-y-2">
                  <p className="text-[11px] text-amber-300/90">{t.noAmountHint}</p>
                  <div className="flex justify-center gap-1.5 flex-wrap">
                    {[500, 1000, 2500, 5000].map((chip) => (
                      <button
                        key={chip}
                        onClick={() => setCardAmount(chip)}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-amber-400 font-mono text-xs font-bold transition-colors"
                      >
                        {chip.toLocaleString()} F
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="block">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 mt-2 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-mono font-bold">
                    <Zap className="w-3.5 h-3.5 fill-amber-400" />
                    <span>≈ {transaction.amountSats.toLocaleString()} Sats</span>
                  </div>
                </div>
              )}
            </div>

            {statusMessage && (
              <div className="p-2.5 rounded-xl bg-rose-950/80 border border-rose-500/50 text-xs text-rose-200 text-center">
                {statusMessage}
              </div>
            )}

            {/* Action Button: Generate Real BOLT11 Lightning Invoice */}
            <button
              disabled={transaction.amountXOF <= 0 || isGeneratingInvoice}
              onClick={handleGenerateLightningInvoice}
              className="w-full py-4 rounded-2xl bg-amber-500 hover:bg-amber-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-black text-base flex items-center justify-center gap-2 shadow-lg shadow-amber-500/30 disabled:shadow-none transition-transform active:scale-95"
            >
              {isGeneratingInvoice ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>BOLT11...</span>
                </>
              ) : (
                <>
                  <span>{t.generateInvoice}</span>
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Fast Preset Buttons (Quick Amounts for Dakar Street Trade) */}
      <footer className="w-full pt-3 pb-2 space-y-2 border-t border-slate-900">
        <p className="text-[11px] font-semibold text-slate-500 px-1">{t.quickAmounts}</p>
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: '500 F', amount: 500, name: 'Attaya / Thé' },
            { label: '1,500 F', amount: 1500, name: 'Dibi Agneau' },
            { label: '5,000 F', amount: 5000, name: 'Tissu Thioup' },
          ].map((preset) => (
            <button
              key={preset.amount}
              onClick={() => handleQuickAdd(preset.amount, preset.name)}
              className="py-2.5 px-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-bold text-slate-300 flex flex-col items-center active:scale-95 transition-all"
            >
              <span className="text-amber-400">{preset.label}</span>
              <span className="text-[10px] text-slate-500 font-normal truncate max-w-full">
                {preset.name}
              </span>
            </button>
          ))}
        </div>
      </footer>

      {/* Real BOLT11 Lightning QR & Nostr Receipt Settlement Modal */}
      {activeInvoice && transaction && (
        <LightningInvoiceModal
          transaction={transaction}
          invoice={activeInvoice}
          t={t}
          onClose={() => setActiveInvoice(null)}
          onSettled={handleReceiptSettled}
        />
      )}

      {/* Offline-First Sales Ledger & Micro-Loan Credit Passport Drawer */}
      {showLedger && (
        <SalesLedgerDrawer
          receipts={receipts}
          merchantNpub={merchantNpub}
          t={t}
          onClose={() => setShowLedger(false)}
          onSyncNow={handleSyncOfflineQueue}
          onSeedComplete={refreshLedger}
          isSyncing={isSyncingLedger}
        />
      )}
    </main>
  );
}