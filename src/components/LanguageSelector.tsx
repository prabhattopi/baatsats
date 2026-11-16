'use client';

import { Language } from '@/types/pos';

interface Props {
  currentLang: Language;
  onSelect: (lang: Language) => void;
}

export default function LanguageSelector({ currentLang, onSelect }: Props) {
  const languages: { code: Language; label: string }[] = [
    { code: 'wo', label: 'Wolof' },
    { code: 'fr', label: 'Français' },
    { code: 'en', label: 'EN' },
  ];

  return (
    <div className="flex bg-slate-900/90 p-1 rounded-xl border border-slate-800">
      {languages.map((lang) => (
        <button
          key={lang.code}
          onClick={() => onSelect(lang.code)}
          className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
            currentLang === lang.code
              ? 'bg-amber-500 text-slate-950 shadow-md font-bold'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          {lang.label}
        </button>
      ))}
    </div>
  );
}