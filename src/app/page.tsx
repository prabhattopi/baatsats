'use client';

import { useState } from 'react';
import { Wifi, ArrowRight, RefreshCw, Zap, ShoppingBag, MessageSquareQuote, AlertTriangle } from 'lucide-react';
import { Language, VoiceState, ParsedTransaction } from '@/types/pos';
import { translations } from '@/utils/i18n';
import { soundEffects } from '@/utils/audioFeedback';
import { useAudioRecorder } from '@/hooks/useAudioRecorder';
import LanguageSelector from '@/components/LanguageSelector';
import VoiceTriggerButton from '@/components/VoiceTriggerButton';

// Baseline rate (Phase 4 will replace with live BTC/XOF oracle + LLaMA intent parsing)
const FCFA_TO_SATS_RATE = 1.71;

export default function MerchantTerminal() {
  const [lang, setLang] = useState<Language>('wo');
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [transaction, setTransaction] = useState<ParsedTransaction | null>(null);

  const {
    isRecording,
    recordingSeconds,
    startRecording,
    stopRecording,
    error: micError,
    clearError,
  } = useAudioRecorder();

  const t = translations[lang];

  // Quick numeric preview for Phase 3 (Phase 4 LLaMA-3.3-70B will parse written French/Wolof numbers like "trois mille cinq cents")
  const extractQuickPreview = (transcript: string): ParsedTransaction => {
    const numMatch = transcript.replace(/,/g, '').match(/\b(\d{2,7})\b/);
    const amountXOF = numMatch ? parseInt(numMatch[1], 10) : 1000;
    return {
      item: transcript.slice(0, 42) + (transcript.length > 42 ? '...' : ''),
      amountXOF,
      amountSats: Math.round(amountXOF * FCFA_TO_SATS_RATE),
      rawTranscript: transcript,
      timestamp: Date.now(),
    };
  };

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

        const response = await fetch('/api/transcribe', {
          method: 'POST',
          body: formData,
        });

        const data = await response.json();

        if (!response.ok || !data.transcript) {
          throw new Error(data.error || 'Transcription failed');
        }

        const parsed = extractQuickPreview(data.transcript);
        setTransaction(parsed);
        setVoiceState('ready');
        soundEffects.playSuccess();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Network error during transcription';
        setStatusMessage(msg);
        setVoiceState('error');
        soundEffects.playCancel();
      }
    }
  };

  const handleReset = () => {
    soundEffects.playCancel();
    setTransaction(null);
    setStatusMessage(null);
    clearError();
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

  const activeError = statusMessage || micError;

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
                  ? t.processing
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
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-amber-500 shrink-0" />
                <span className="font-bold text-slate-200 text-sm line-clamp-1">
                  {transaction.item}
                </span>
              </div>
              <button
                onClick={handleReset}
                className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg bg-slate-800"
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

            {/* Huge Amount Visual for Sandaga Outdoor Sunlight */}
            <div className="text-center py-1">
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

            {/* Action Button */}
            <button
              onClick={() =>
                alert(
                  `Phase 4 will use LLaMA-3.3-70B structured parsing + live BTC/XOF rate, and Phase 5 will generate the real Lightning Invoice!`
                )
              }
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