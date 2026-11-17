export type Language = 'wo' | 'fr' | 'en';

export type VoiceState = 'idle' | 'listening' | 'processing' | 'ready' | 'error';

export interface ParsedTransaction {
  item: string;
  amountXOF: number;
  amountSats: number;
  rawTranscript?: string;
  customerNote?: string;
  timestamp: number;
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
  generateInvoice: string;
  cancel: string;
  quickAmounts: string;
  currency: string;
}