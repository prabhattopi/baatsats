'use client';

import { useState } from 'react';
import { Wifi, ArrowRight, RefreshCw, Zap, ShoppingBag } from 'lucide-react';
import { Language, VoiceState, ParsedTransaction } from '@/types/pos';
import { translations } from '@/utils/i18n';
import { soundEffects } from '@/utils/audioFeedback';
import LanguageSelector from '@/components/LanguageSelector';
import VoiceTriggerButton from '@/components/VoiceTriggerButton';

// Mock Conversion Rate: 1 BTC = $95,000 | 1 USD = 615 FCFA | 1 FCFA ≈ 1.71 Sats
const FCFA_TO_SATS_RATE = 1.71;

export default function MerchantTerminal() {
  const [lang, setLang] = useState<Language>('wo');
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [transaction, setTransaction] = useState<ParsedTransaction | null>(null);

  const t = translations[lang];

  // Simulated Voice Trigger Flow (Phase 2 Tactile Verification)
  const handleVoiceToggle = () => {
    if (voiceState === 'idle') {
      setVoiceState('listening');

      // Simulating a merchant finishing voice input after 2.5 seconds
      setTimeout(() => {
        setVoiceState('processing');

        // Simulating AI Agent parsing Wolof intent
        setTimeout(() => {
          const mockParsed: ParsedTransaction = {
            item: lang === 'wo' ? '2 Tééré Thiéboudienne' : '2 Plats Tieboudienne',
            amountXOF: 3500,
            amountSats: Math.round(3500 * FCFA_TO_SATS_RATE),
            timestamp: Date.now(),
          };
          setTransaction(mockParsed);
          setVoiceState('ready');
          soundEffects.playSuccess();
        }, 1200);
      }, 2500);
    } else if (voiceState === 'listening') {
      // Manual stop by merchant
      setVoiceState('processing');
    }
  };

  const handleReset = () => {
    soundEffects.playCancel();
    setTransaction(null);
    setVoiceState('idle');
  };

  const handleQuickAdd = (amount: number, itemLabel: string) => {
    soundEffects.playMicStart();
    setTransaction({
      item: itemLabel,
      amountXOF: amount,
      amountSats: Math.round(amount * FCFA_TO_SATS_RATE),
      timestamp: Date.now(),
    });
    setVoiceState('ready');
    soundEffects.playSuccess();
  };

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

      {/* Network & Node Pill */}
      <div className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg bg-slate-900/60 border border-slate-800/80 my-3">
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>Lightning Network</span>
        </div>
        <div className="text-[11px] font-mono text-amber-400 flex items-center gap-1">
          <Wifi className="w-3 h-3" />
          <span>Mutinynet 0-Fee</span>
        </div>
      </div>

      {/* Center Stage: Voice Trigger or Parsed Invoice Card */}
      <div className="flex-1 flex flex-col items-center justify-center">
        {!transaction ? (
          <div className="w-full text-center space-y-2">
            <VoiceTriggerButton
              state={voiceState}
              onPress={handleVoiceToggle}
              langHint={
                voiceState === 'idle'
                  ? t.tapToSpeak
                  : voiceState === 'listening'
                  ? t.listening
                  : t.processing
              }
            />
            {voiceState === 'idle' && (
              <div className="p-3 mx-2 rounded-xl bg-slate-900/80 border border-slate-800/80 text-xs text-slate-400">
                <p className="font-medium text-slate-300">💡 {t.voiceHint}</p>
              </div>
            )}
          </div>
        ) : (
          /* Parsed Bill Card (Tactile High-Contrast) */
          <div className="w-full bg-slate-900 border-2 border-amber-500/60 rounded-3xl p-5 shadow-2xl shadow-amber-500/10 space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-start border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-amber-500" />
                <span className="font-bold text-slate-200 text-sm">{transaction.item}</span>
              </div>
              <button
                onClick={handleReset}
                className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg bg-slate-800"
                title={t.cancel}
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>

            {/* Huge Amount Visual for Sandaga Outdoor Sunlight */}
            <div className="text-center py-2">
              <p className="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-1">
                {t.amountDue}
              </p>
              <div className="text-4xl font-black text-white tracking-tight">
                {transaction.amountXOF.toLocaleString()}{' '}
                <span className="text-amber-500 text-2xl font-bold">{t.currency}</span>
              </div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 mt-2 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-mono font-bold">
                <Zap className="w-3.5 h-3.5 fill-amber-400" />
                <span>≈ {transaction.amountSats.toLocaleString()} Sats</span>
              </div>
            </div>

            {/* Action Button: Ready for Lightning Invoicing */}
            <button
              onClick={() => alert(`Phase 3 will connect live Lightning Invoice for ${transaction.amountSats} Sats!`)}
              className="w-full py-4 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-base flex items-center justify-center gap-2 shadow-lg shadow-amber-500/30 transition-transform active:scale-95"
            >
              <span>{t.generateInvoice}</span>
              <ArrowRight className="w-5 h-5" />
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
    </main>
  );
}