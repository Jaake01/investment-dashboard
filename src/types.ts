export type AssetClass = 'us_stock' | 'tw_stock' | 'crypto' | 'cash' | 'other';

// Canonical display order used everywhere asset classes are listed (tabs,
// treemap blocks, dropdowns): crypto, us_stock, tw_stock, cash, other.
export const ASSET_CLASSES: AssetClass[] = ['crypto', 'us_stock', 'tw_stock', 'cash', 'other'];

export const ASSET_CLASS_LABELS: Record<AssetClass, string> = {
  us_stock: '美股',
  tw_stock: '台股',
  crypto: '加密貨幣',
  cash: '現金',
  other: '其他',
};

export type Currency = 'USD' | 'TWD' | 'USDC';

export const CURRENCY_LABELS: Record<Currency, string> = {
  USD: 'USD',
  TWD: 'TWD',
  USDC: 'U',
};

// USDC is a USD-pegged stablecoin, treated as 1:1 with USD for conversion purposes.
export const CURRENCY_FOR_ASSET_CLASS: Record<AssetClass, Currency> = {
  us_stock: 'USD',
  tw_stock: 'TWD',
  crypto: 'USDC',
  cash: 'TWD',
  other: 'TWD',
};

export interface Holding {
  id: string;
  symbol: string;
  name?: string;
  shares: number;
  avgCost: number;
  assetClass: AssetClass;
  source: 'manual' | 'import';
  notes?: string;
}

export type PriceProviderId = 'finnhub' | 'twelvedata' | 'none';

export type Theme = 'light' | 'dark' | 'system';

export interface Settings {
  sheetUrl: string;
  priceProvider: PriceProviderId;
  // Each provider remembers its own key, so switching priceProvider doesn't
  // require re-pasting whichever one you used before.
  finnhubApiKey: string;
  twelveDataApiKey: string;
  // Optional: CSV published from a Google Sheet tab using GOOGLEFINANCE, for
  // TW stock quotes — Finnhub/Twelve Data's free tiers don't reliably cover
  // TWSE. Takes priority over priceProvider for tw_stock holdings.
  twQuoteSheetUrl: string;
  // Optional: CSV published from a "現金帳戶" Google Sheet tab — an
  // append-only cash ledger (date/currency/type/amount/note) kept in sync
  // with the 交易紀錄 tab via an Apps Script trigger. Summed by currency to
  // show current cash balances, independent of any 現金-class Holding.
  cashLedgerSheetUrl: string;
  // 'system' follows the OS/browser prefers-color-scheme; 'light'/'dark' force it.
  theme: Theme;
}

// The API key for whichever provider is currently selected.
export function activeApiKeyFor(settings: Settings): string {
  if (settings.priceProvider === 'finnhub') return settings.finnhubApiKey;
  if (settings.priceProvider === 'twelvedata') return settings.twelveDataApiKey;
  return '';
}

// The API key fields are real secrets — Firestore security rules only gate
// client access, not the project owner's own Console/admin access, so these
// three never leave the browser. Everything else in Settings is safe to sync.
const NON_SYNCABLE_SETTINGS_KEYS = ['finnhubApiKey', 'twelveDataApiKey'] as const;
export type SyncableSettings = Omit<Settings, (typeof NON_SYNCABLE_SETTINGS_KEYS)[number]>;

export function toSyncableSettings(settings: Settings): SyncableSettings {
  const copy: Partial<Settings> = { ...settings };
  for (const key of NON_SYNCABLE_SETTINGS_KEYS) delete copy[key];
  return copy as SyncableSettings;
}

export interface PriceEntry {
  symbol: string;
  price: number;
  updatedAt: string;
  // Day change %, when the price source provides one (not all do — e.g. the
  // GOOGLEFINANCE TW quote sheet has no previous-close data).
  changePercent?: number;
}

export interface FxRate {
  usdToTwd: number;
  // Optional since it's fetched independently of usdToTwd — one can succeed
  // while the other fails, or this simply hasn't been fetched yet.
  jpyToTwd?: number;
  updatedAt: string;
  source: 'auto';
}

export interface Snapshot {
  date: string;
  totalValue: number; // TWD, whole-portfolio (used by the trend chart)
  classValues?: Partial<Record<AssetClass, number>>; // native currency, per asset class
  symbolValues?: Record<string, number>; // native currency, per holding symbol
}

export interface ImportedHoldingRow {
  symbol: string;
  shares: number;
  avgCost: number;
  assetClass: AssetClass;
  name?: string;
}

export type TransactionAction = 'buy' | 'sell';

export interface Transaction {
  date: string;
  assetClass: AssetClass;
  symbol: string;
  name?: string;
  action: TransactionAction;
  price: number;
  amount: number;
}

// One sell event's outcome, derived from a symbol's running weighted-average
// cost at the moment it was sold (see processTransactions in transactions.ts).
export interface RealizedGain {
  id: string;
  sellDate: string;
  symbol: string;
  name?: string;
  assetClass: AssetClass;
  currency: Currency;
  avgBuyPrice: number;
  sellPrice: number;
  shares: number;
  realizedPnl: number; // native currency (see `currency`)
  returnPct: number;
  // Days since this symbol's current holding period began (see
  // processTransactions) — null only if the sell somehow has no matching
  // open position, which shouldn't happen in practice.
  holdingDays: number | null;
}
