import type { AssetClass, Currency, Holding, PriceEntry } from '../types';
import { ASSET_CLASS_LABELS, CURRENCY_FOR_ASSET_CLASS } from '../types';

export interface HoldingMetrics {
  holding: Holding;
  currentPrice: number;
  priceIsLive: boolean;
  marketValue: number;
  costValue: number;
  gainLoss: number;
  gainLossPct: number;
}

export function currentPriceFor(holding: Holding, prices: Record<string, PriceEntry>): { price: number; isLive: boolean } {
  const entry = holding.symbol ? prices[holding.symbol] : undefined;
  if (entry) return { price: entry.price, isLive: true };
  return { price: holding.avgCost, isLive: false };
}

export function computeHoldingMetrics(holding: Holding, prices: Record<string, PriceEntry>): HoldingMetrics {
  const { price, isLive } = currentPriceFor(holding, prices);
  const marketValue = holding.shares * price;
  const costValue = holding.shares * holding.avgCost;
  const gainLoss = marketValue - costValue;
  const gainLossPct = costValue !== 0 ? (gainLoss / costValue) * 100 : 0;
  return {
    holding,
    currentPrice: price,
    priceIsLive: isLive,
    marketValue,
    costValue,
    gainLoss,
    gainLossPct,
  };
}

export interface AllocationSlice {
  key: string;
  label: string;
  value: number;
}

export function computeAllocation(
  metrics: HoldingMetrics[],
  groupBy: 'holding' | 'assetClass',
  usdToTwd: number | null,
): AllocationSlice[] {
  // Holdings can be in different native currencies (USD/TWD/USDC); comparing raw
  // native values directly would make pie slice proportions meaningless, so this
  // converts to TWD when a rate is available and only falls back to native values
  // (still better than nothing) when it isn't.
  const map = new Map<string, AllocationSlice>();
  for (const m of metrics) {
    if (m.marketValue <= 0) continue;
    const value = convertToTwd(m.marketValue, m.holding.assetClass, usdToTwd) ?? m.marketValue;
    const key = groupBy === 'assetClass' ? m.holding.assetClass : m.holding.id;
    const label = groupBy === 'assetClass'
      ? ASSET_CLASS_LABELS[m.holding.assetClass as AssetClass]
      : (m.holding.symbol || m.holding.name || '未命名');
    const existing = map.get(key);
    if (existing) {
      existing.value += value;
    } else {
      map.set(key, { key, label, value });
    }
  }
  return Array.from(map.values()).sort((a, b) => b.value - a.value);
}

export function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

// USDC is treated as 1:1 with USD, so both convert via the same USD/TWD rate.
export function convertToTwd(nativeValue: number, assetClass: AssetClass, usdToTwd: number | null): number | null {
  const currency = CURRENCY_FOR_ASSET_CLASS[assetClass];
  if (currency === 'TWD') return nativeValue;
  if (usdToTwd === null) return null;
  return nativeValue * usdToTwd;
}

export interface CurrencyBucket {
  assetClass: 'us_stock' | 'tw_stock' | 'crypto';
  label: string;
  currency: Currency;
  nativeTotal: number;
}

const CURRENCY_BUCKET_CLASSES: Array<'us_stock' | 'tw_stock' | 'crypto'> = ['us_stock', 'tw_stock', 'crypto'];

export function computeCurrencyBuckets(metrics: HoldingMetrics[]): CurrencyBucket[] {
  return CURRENCY_BUCKET_CLASSES.map((assetClass) => ({
    assetClass,
    label: ASSET_CLASS_LABELS[assetClass],
    currency: CURRENCY_FOR_ASSET_CLASS[assetClass],
    nativeTotal: metrics
      .filter((m) => m.holding.assetClass === assetClass)
      .reduce((sum, m) => sum + m.marketValue, 0),
  }));
}

export function computeTotalInTwd(metrics: HoldingMetrics[], usdToTwd: number | null): number | null {
  let total = 0;
  for (const m of metrics) {
    const twdValue = convertToTwd(m.marketValue, m.holding.assetClass, usdToTwd);
    if (twdValue === null) return null;
    total += twdValue;
  }
  return total;
}

export function computeTotalCostInTwd(metrics: HoldingMetrics[], usdToTwd: number | null): number | null {
  let total = 0;
  for (const m of metrics) {
    const twdValue = convertToTwd(m.costValue, m.holding.assetClass, usdToTwd);
    if (twdValue === null) return null;
    total += twdValue;
  }
  return total;
}
