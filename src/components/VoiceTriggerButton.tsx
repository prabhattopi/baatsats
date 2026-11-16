'use client';

import { Mic, Loader2, Sparkles, CheckCircle2 } from 'lucide-react';
import { VoiceState } from '@/types/pos';
import { soundEffects } from '@/utils/audioFeedback';

interface Props {
  state: VoiceState;
  onPress: () => void;
  langHint: string;
}

export default function VoiceTriggerButton({ state, onPress, langHint }: Props) {
  const handleClick = () => {
    if (state === 'idle') {
      soundEffects.playMicStart();
    }
    onPress();
  };

  return (
    <div className="flex flex-col items-center justify-center my-6 space-y-4">
      {/* Outer Pulse Rings */}
      <div className="relative flex items-center justify-center">
        {state === 'listening' && (
          <>
            <span className="absolute w-44 h-44 rounded-full bg-amber-500/20 animate-ping" />
            <span className="absolute w-36 h-36 rounded-full bg-amber-500/30 animate-pulse" />
          </>
        )}

        {/* Primary Action Button */}
        <button
          onClick={handleClick}
          aria-label="Voice Action Button"
          className={`relative z-10 w-28 h-28 rounded-full flex flex-col items-center justify-center shadow-2xl transition-all transform active:scale-95 ${
            state === 'listening'
              ? 'bg-red-500 text-white shadow-red-500/50 ring-4 ring-red-400'
              : state === 'processing'
              ? 'bg-amber-600 text-white shadow-amber-500/50'
              : state === 'ready'
              ? 'bg-emerald-500 text-slate-950 shadow-emerald-500/40 ring-4 ring-emerald-400'
              : 'bg-amber-500 text-slate-950 shadow-amber-500/30 hover:bg-amber-400'
          }`}
        >
          {state === 'idle' && <Mic className="w-12 h-12 stroke-[2.2]" />}
          {state === 'listening' && (
            <div className="flex flex-col items-center">
              <span className="w-4 h-4 rounded-sm bg-white mb-1 animate-pulse" />
              <span className="text-[10px] font-black uppercase tracking-wider">STOP</span>
            </div>
          )}
          {state === 'processing' && <Loader2 className="w-12 h-12 animate-spin" />}
          {state === 'ready' && <CheckCircle2 className="w-12 h-12" />}
        </button>
      </div>

      {/* Dynamic Status / Helper Label */}
      <div className="text-center px-4">
        <p className="text-sm font-bold text-slate-200">{langHint}</p>
        {state === 'idle' && (
          <p className="text-xs text-slate-500 mt-1 flex items-center justify-center gap-1">
            <Sparkles className="w-3 h-3 text-amber-500" /> Dakar AI Agent Active
          </p>
        )}
      </div>
    </div>
  );
}