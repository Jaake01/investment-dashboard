import type { AssetClass, Currency, Holding, PriceEntry, Snapshot } from '../types';
import { ASSET_CLASS_LABELS, ASSET_CLASSES, CURRENCY_FOR_ASSET_CLASS } from '../types';
import { looksLikeTwSymbol } from './symbolClass';

// 現金 defaults to TWD, but if the symbol doesn't look like a TW ticker
// (purely numeric), it's almost certainly a USD-denominated holding someone
// tracks under 現金 for grouping purposes rather than a TWD cash balance —
// auto-detected so no manual currency setting is needed. Other classes keep
// their fixed CURRENCY_FOR_ASSET_CLASS mapping unchanged.
export function currencyFor(holding: Holding): Currency {
  if (holding.assetClass === 'cash' && holding.symbol && !looksLikeTwSymbol(holding.symbol)) {
    return 'USD';
  }
  return CURRENCY_FOR_ASSET_CLASS[holding.assetClass];
}

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
    const value = convertToTwd(m.marketValue, currencyFor(m.holding), usdToTwd) ?? m.marketValue;
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
  const slices = Array.from(map.values());
  if (groupBy === 'assetClass') {
    // Fixed canonical order (crypto, us_stock, tw_stock, cash, other) rather
    // than sorting by value, so a class's position doesn't jump around as
    // its value changes relative to the others.
    return slices.sort((a, b) => ASSET_CLASSES.indexOf(a.key as AssetClass) - ASSET_CLASSES.indexOf(b.key as AssetClass));
  }
  return slices.sort((a, b) => b.value - a.value);
}

// For drilling into a single asset class: every holding here already shares
// the same native currency, so this skips TWD conversion (unlike
// computeAllocation) and keeps values in that class's native currency.
export function computeHoldingsWithinClass(metrics: HoldingMetrics[]): AllocationSlice[] {
  const map = new Map<string, AllocationSlice>();
  for (const m of metrics) {
    if (m.marketValue <= 0) continue;
    const key = m.holding.id;
    const label = m.holding.symbol || m.holding.name || '未命名';
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

// Most recent recorded snapshot strictly before today, i.e. "yesterday" (or
// the last day a snapshot exists, if the app wasn't opened every day). Null
// if there's no snapshot history yet to compare against.
export function computePreviousSnapshotValue(snapshots: Snapshot[], today: string = todayDateString()): number | null {
  const past = snapshots.filter((s) => s.date < today).sort((a, b) => b.date.localeCompare(a.date));
  return past.length > 0 ? past[0].totalValue : null;
}

// Native-currency totals per asset class, for recording into a snapshot.
export function computeClassValues(metrics: HoldingMetrics[]): Partial<Record<AssetClass, number>> {
  const map: Partial<Record<AssetClass, number>> = {};
  for (const m of metrics) {
    if (m.marketValue <= 0) continue;
    map[m.holding.assetClass] = (map[m.holding.assetClass] ?? 0) + m.marketValue;
  }
  return map;
}

// Same grouping as computeClassValues, but cost basis instead of market
// value — the other half of a snapshot's gain% (see computeGainPct).
export function computeClassCostValues(metrics: HoldingMetrics[]): Partial<Record<AssetClass, number>> {
  const map: Partial<Record<AssetClass, number>> = {};
  for (const m of metrics) {
    if (m.marketValue <= 0) continue;
    map[m.holding.assetClass] = (map[m.holding.assetClass] ?? 0) + m.costValue;
  }
  return map;
}

// Native-currency totals per holding symbol, for recording into a snapshot.
export function computeSymbolValues(metrics: HoldingMetrics[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const m of metrics) {
    if (m.marketValue <= 0 || !m.holding.symbol) continue;
    map[m.holding.symbol] = (map[m.holding.symbol] ?? 0) + m.marketValue;
  }
  return map;
}

// Same grouping as computeSymbolValues, but cost basis instead of market
// value — the other half of a snapshot's gain% (see computeGainPct).
export function computeSymbolCostValues(metrics: HoldingMetrics[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const m of metrics) {
    if (m.marketValue <= 0 || !m.holding.symbol) continue;
    map[m.holding.symbol] = (map[m.holding.symbol] ?? 0) + m.costValue;
  }
  return map;
}

export function computePreviousClassValue(
  snapshots: Snapshot[],
  assetClass: AssetClass,
  today: string = todayDateString(),
): number | null {
  const past = snapshots
    .filter((s) => s.date < today && s.classValues?.[assetClass] !== undefined)
    .sort((a, b) => b.date.localeCompare(a.date));
  return past.length > 0 ? past[0].classValues![assetClass]! : null;
}

export function computePreviousClassCostValue(
  snapshots: Snapshot[],
  assetClass: AssetClass,
  today: string = todayDateString(),
): number | null {
  const past = snapshots
    .filter((s) => s.date < today && s.classCostValues?.[assetClass] !== undefined)
    .sort((a, b) => b.date.localeCompare(a.date));
  return past.length > 0 ? past[0].classCostValues![assetClass]! : null;
}

export function computePreviousSymbolValue(
  snapshots: Snapshot[],
  symbol: string,
  today: string = todayDateString(),
): number | null {
  const past = snapshots
    .filter((s) => s.date < today && s.symbolValues?.[symbol] !== undefined)
    .sort((a, b) => b.date.localeCompare(a.date));
  return past.length > 0 ? past[0].symbolValues![symbol]! : null;
}

export function computePreviousSymbolCostValue(
  snapshots: Snapshot[],
  symbol: string,
  today: string = todayDateString(),
): number | null {
  const past = snapshots
    .filter((s) => s.date < today && s.symbolCostValues?.[symbol] !== undefined)
    .sort((a, b) => b.date.localeCompare(a.date));
  return past.length > 0 ? past[0].symbolCostValues![symbol]! : null;
}

// Most recent recorded snapshot strictly before today with cost data —
// counterpart to computePreviousSnapshotValue, for the whole-portfolio 較昨日.
export function computePreviousSnapshotCost(snapshots: Snapshot[], today: string = todayDateString()): number | null {
  const past = snapshots
    .filter((s) => s.date < today && s.totalCost !== undefined)
    .sort((a, b) => b.date.localeCompare(a.date));
  return past.length > 0 ? past[0].totalCost! : null;
}

// Unrealized gain/loss as a percent of cost — null if there's no cost basis
// to divide by (not yet recorded, or a zero-cost position).
export function computeGainPct(value: number, cost: number | null | undefined): number | null {
  if (cost === null || cost === undefined || cost === 0) return null;
  return ((value - cost) / cost) * 100;
}

// "較昨日" as a change in unrealized gain% (percentage points), not raw
// value% — comparing gain% to gain% cancels out the effect of adding or
// removing money mid-period, unlike comparing value to value directly. A
// same-day purchase moves value and cost together, barely nudging gain%
// (only by however profitable that one purchase already was), whereas a
// pure value comparison would misread "you added money" as "the price
// moved." Null if either day is missing a value or a cost to divide by.
export function computeDayChangeInGainPct(
  todayValue: number,
  todayCost: number | null | undefined,
  previousValue: number | null,
  previousCost: number | null,
): number | null {
  const todayGainPct = computeGainPct(todayValue, todayCost);
  const previousGainPct = previousValue === null ? null : computeGainPct(previousValue, previousCost);
  if (todayGainPct === null || previousGainPct === null) return null;
  return todayGainPct - previousGainPct;
}

// Merges the daily-automated history (fetched from the "data" branch, see
// useRemoteSnapshots) with locally recorded snapshots. Local wins on a date
// collision, since a manual "刷新報價" click is a more deliberate record
// than the scheduled run for that same day.
export function mergeSnapshots(local: Snapshot[], remote: Snapshot[]): Snapshot[] {
  const byDate = new Map<string, Snapshot>();
  for (const s of remote) byDate.set(s.date, s);
  for (const s of local) byDate.set(s.date, s);
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

// USDC is treated as 1:1 with USD, so both convert via the same USD/TWD rate.
export function convertToTwd(nativeValue: number, currency: Currency, usdToTwd: number | null): number | null {
  if (currency === 'TWD') return nativeValue;
  if (usdToTwd === null) return null;
  return nativeValue * usdToTwd;
}

export interface CurrencyBucket {
  assetClass: 'us_stock' | 'tw_stock' | 'crypto';
  label: string;
  currency: Currency;
  nativeTotal: number;
  nativeCost: number;
}

const CURRENCY_BUCKET_CLASS_SET = new Set<AssetClass>(['us_stock', 'tw_stock', 'crypto']);
const CURRENCY_BUCKET_CLASSES = ASSET_CLASSES.filter((c) => CURRENCY_BUCKET_CLASS_SET.has(c)) as Array<
  'us_stock' | 'tw_stock' | 'crypto'
>;

export function computeCurrencyBuckets(metrics: HoldingMetrics[]): CurrencyBucket[] {
  return CURRENCY_BUCKET_CLASSES.map((assetClass) => {
    const inClass = metrics.filter((m) => m.holding.assetClass === assetClass);
    return {
      assetClass,
      label: ASSET_CLASS_LABELS[assetClass],
      currency: CURRENCY_FOR_ASSET_CLASS[assetClass],
      nativeTotal: inClass.reduce((sum, m) => sum + m.marketValue, 0),
      nativeCost: inClass.reduce((sum, m) => sum + m.costValue, 0),
    };
  });
}

export function computeTotalInTwd(metrics: HoldingMetrics[], usdToTwd: number | null): number | null {
  let total = 0;
  for (const m of metrics) {
    const twdValue = convertToTwd(m.marketValue, currencyFor(m.holding), usdToTwd);
    if (twdValue === null) return null;
    total += twdValue;
  }
  return total;
}

export interface ClassTotals {
  totalCostValue: number;
  totalMarketValue: number;
  totalGainLoss: number;
  totalGainLossPct: number;
}

// Native-currency totals across metrics sharing the same asset class — no FX
// conversion needed for us_stock/tw_stock/crypto tabs (already one currency
// each), but 現金 can mix TWD cash with USD-auto-detected holdings (see
// currencyFor), so those get converted to TWD before summing so the total
// means something.
export function computeClassTotals(metrics: HoldingMetrics[], usdToTwd: number | null = null): ClassTotals {
  const valueFor = (raw: number, m: HoldingMetrics) => {
    if (m.holding.assetClass !== 'cash') return raw;
    const currency = currencyFor(m.holding);
    if (currency === 'TWD') return raw;
    return convertToTwd(raw, currency, usdToTwd) ?? raw;
  };
  const totalCostValue = metrics.reduce((sum, m) => sum + valueFor(m.costValue, m), 0);
  const totalMarketValue = metrics.reduce((sum, m) => sum + valueFor(m.marketValue, m), 0);
  const totalGainLoss = totalMarketValue - totalCostValue;
  const totalGainLossPct = totalCostValue !== 0 ? (totalGainLoss / totalCostValue) * 100 : 0;
  return { totalCostValue, totalMarketValue, totalGainLoss, totalGainLossPct };
}

export function computeTotalCostInTwd(metrics: HoldingMetrics[], usdToTwd: number | null): number | null {
  let total = 0;
  for (const m of metrics) {
    const twdValue = convertToTwd(m.costValue, currencyFor(m.holding), usdToTwd);
    if (twdValue === null) return null;
    total += twdValue;
  }
  return total;
}
