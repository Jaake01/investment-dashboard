import type { AssetClass, Holding, PriceEntry } from '../types';
import { ASSET_CLASS_LABELS } from '../types';

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

export interface PortfolioTotals {
  totalMarketValue: number;
  totalCostValue: number;
  totalGainLoss: number;
  totalGainLossPct: number;
}

export function computePortfolioTotals(metrics: HoldingMetrics[]): PortfolioTotals {
  const totalMarketValue = metrics.reduce((sum, m) => sum + m.marketValue, 0);
  const totalCostValue = metrics.reduce((sum, m) => sum + m.costValue, 0);
  const totalGainLoss = totalMarketValue - totalCostValue;
  const totalGainLossPct = totalCostValue !== 0 ? (totalGainLoss / totalCostValue) * 100 : 0;
  return { totalMarketValue, totalCostValue, totalGainLoss, totalGainLossPct };
}

export interface AllocationSlice {
  key: string;
  label: string;
  value: number;
}

export function computeAllocation(
  metrics: HoldingMetrics[],
  groupBy: 'holding' | 'assetClass',
): AllocationSlice[] {
  const map = new Map<string, AllocationSlice>();
  for (const m of metrics) {
    if (m.marketValue <= 0) continue;
    const key = groupBy === 'assetClass' ? m.holding.assetClass : m.holding.id;
    const label = groupBy === 'assetClass'
      ? ASSET_CLASS_LABELS[m.holding.assetClass as AssetClass]
      : (m.holding.symbol || m.holding.name || '未命名');
    const existing = map.get(key);
    if (existing) {
      existing.value += m.marketValue;
    } else {
      map.set(key, { key, label, value: m.marketValue });
    }
  }
  return Array.from(map.values()).sort((a, b) => b.value - a.value);
}

export function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}
