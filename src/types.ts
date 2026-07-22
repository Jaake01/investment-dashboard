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
  USD: '美元 (USD)',
  TWD: '台幣 (TWD)',
  USDC: 'USDC',
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

export interface Settings {
  sheetUrl: string;
  priceProvider: PriceProviderId;
  apiKey: string;
  fxAutoRefresh: boolean;
  autoSyncEnabled: boolean;
}

export interface PriceEntry {
  symbol: string;
  price: number;
  updatedAt: string;
}

export interface FxRate {
  usdToTwd: number;
  updatedAt: string;
  source: 'auto';
}

export interface Snapshot {
  date: string;
  totalValue: number;
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
  action: TransactionAction;
  price: number;
  amount: number;
}
