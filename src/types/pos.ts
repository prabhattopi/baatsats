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

export interface LightningInvoiceData {
  bolt11: string;
  verifyUrl?: string | null;
  lightningAddress: string;
  amountSats: number;
  expiresAt: number;
}

export interface SettledReceipt {
  id: string;
  item: string;
  quantity: number;
  amountXOF: number;
  amountSats: number;
  lightningAddress: string;
  nostrEventId?: string;
  nostrNoteId?: string;
  nostrPubkey?: string;
  relaysPublished: number;
  syncStatus: 'synced' | 'offline-queued';
  settledAt: number;
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
  scanToPay: string;
  waitingPayment: string;
  paymentConfirmed: string;
  copyInvoice: string;
  copied: string;
  simulatePay: string;
  newSale: string;
  todaysSales: string;
  verifyOnNostr: string;
  exportCreditProof: string;
  offlineSaved: string;
}