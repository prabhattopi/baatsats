export type Language = 'wo' | 'fr' | 'en';

export type VoiceState = 'idle' | 'listening' | 'processing' | 'ready' | 'error';

export interface ParsedTransaction {
  item: string;
  quantity: number;
  amountXOF: number;
  amountSats: number;
  rawTranscript?: string;
  confidence?: 'high' | 'medium' | 'low';
  timestamp: number;
}

export interface FxRateData {
  btcPriceXOF: number;
  btcPriceEUR: number;
  satsPerXOF: number;
  source: 'mempool.space' | 'coingecko' | 'offline-fallback';
  updatedAt: number;
}

export interface TranslationDictionary {
  appName: string;
  marketSubtitle: string;
  tapToSpeak: string;
  listening: string;
  processing: string;
  invoiceReady: string;
  voiceHint: string;
  amountDue: string;
  noAmountHint: string;
  generateInvoice: string;
  cancel: string;
  quickAmounts: string;
  currency: string;
}