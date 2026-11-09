import { Mic, Zap, ShieldCheck, Wifi } from 'lucide-react';

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-6 max-w-md mx-auto">
      {/* Header / Network Status */}
      <header className="w-full flex justify-between items-center py-4 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-amber-500/20 border border-amber-500 flex items-center justify-center text-amber-500 font-black">
            ⚡
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">BaatSats</h1>
            <p className="text-xs text-slate-400">Dakar Pilot • Sandaga Market</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-950/80 border border-emerald-500/30 text-emerald-400 text-xs font-medium">
          <Wifi className="w-3.5 h-3.5" />
          <span>Lightning OK</span>
        </div>
      </header>

      {/* Hero / Phase 1 Status */}
      <div className="w-full text-center my-auto space-y-6">
        <div className="inline-flex p-4 rounded-3xl bg-slate-900 border border-slate-800 text-amber-500 shadow-xl shadow-amber-500/5">
          <Mic className="w-16 h-16 animate-pulse" />
        </div>
        
        <div className="space-y-2">
          <span className="text-xs uppercase tracking-widest text-amber-500 font-semibold">Phase 1 Complete</span>
          <h2 className="text-2xl font-black">Voice-First Bitcoin POS</h2>
          <p className="text-sm text-slate-400 px-4">
            Wolof & French conversational micro-billing on Bitcoin Lightning & Nostr.
          </p>
        </div>

        {/* System Badges */}
        <div className="grid grid-cols-2 gap-3 text-left">
          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 flex items-center gap-3">
            <Zap className="w-5 h-5 text-amber-500 shrink-0" />
            <div>
              <p className="text-xs font-semibold">Tailwind v4</p>
              <p className="text-[10px] text-slate-400">CSS-First Engine</p>
            </div>
          </div>
          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 flex items-center gap-3">
            <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
            <div>
              <p className="text-xs font-semibold">Native PWA</p>
              <p className="text-[10px] text-slate-400">Offline Shell Ready</p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Instructions */}
      <footer className="w-full py-4 text-center text-xs text-slate-500 border-t border-slate-900">
        Btrust Dakar Bitcoin Hack 2026 • Ready for Phase 2
      </footer>
    </main>
  );
}