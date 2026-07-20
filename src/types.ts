export type AssetClass = 'stock' | 'crypto' | 'cash' | 'other';

export const ASSET_CLASSES: AssetClass[] = ['stock', 'crypto', 'cash', 'other'];

export const ASSET_CLASS_LABELS: Record<AssetClass, string> = {
  stock: '股票',
  crypto: '加密貨幣',
  cash: '現金',
  other: '其他',
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
  allocationGroupBy: 'holding' | 'assetClass';
}

export interface PriceEntry {
  symbol: string;
  price: number;
  updatedAt: string;
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
