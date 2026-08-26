import type { AssetClass, ImportedHoldingRow, RealizedGain, Transaction } from '../types';
import { CURRENCY_FOR_ASSET_CLASS } from '../types';

function parseDateValue(date: string): number {
  const t = Date.parse(date);
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
}

// Below this, a share count is treated as "fully sold" rather than a real
// leftover position — repeated floating-point buy/sell arithmetic across a
// long transaction history essentially never lands on exactly 0.
const SHARES_EPSILON = 1e-6;

function daysBetween(from: string, to: string): number | null {
  const t1 = Date.parse(from);
  const t2 = Date.parse(to);
  if (Number.isNaN(t1) || Number.isNaN(t2)) return null;
  return Math.max(0, Math.round((t2 - t1) / 86_400_000));
}

interface Accumulator {
  shares: number;
  avgCost: number;
  assetClass: AssetClass;
  name?: string;
  // Date the current holding period started — set on the buy that first
  // takes shares from 0 to positive, cleared once a sell brings shares back
  // to 0. This app tracks cost via a single blended weighted average (not
  // per-lot FIFO), so there's no per-share purchase date to report a sell
  // against — "days since this position was last opened from flat" is the
  // closest meaningful stand-in for 持有天數.
  openedAt: string | null;
}

export interface ProcessedTransactions {
  holdings: ImportedHoldingRow[];
  realizedGains: RealizedGain[];
}

// Single pass over the sorted transaction log, sharing one weighted-average
// accumulator per symbol for both outputs — buys blend into the running
// average cost; sells reduce shares and (new) emit a RealizedGain against
// the average cost at the moment of sale, without changing that average for
// whatever remains.
export function processTransactions(transactions: Transaction[]): ProcessedTransactions {
  const sorted = [...transactions].sort((a, b) => parseDateValue(a.date) - parseDateValue(b.date));

  const bySymbol = new Map<string, Accumulator>();
  const realizedGains: RealizedGain[] = [];

  for (const tx of sorted) {
    const acc = bySymbol.get(tx.symbol) ?? { shares: 0, avgCost: 0, assetClass: tx.assetClass, openedAt: null };
    const txShares = tx.price > 0 ? tx.amount / tx.price : 0;

    if (tx.action === 'buy') {
      if (acc.shares <= 0) acc.openedAt = tx.date;
      const newShares = acc.shares + txShares;
      acc.avgCost = newShares > 0 ? (acc.shares * acc.avgCost + txShares * tx.price) / newShares : 0;
      acc.shares = newShares;
    } else {
      const soldShares = Math.min(acc.shares, txShares);
      if (soldShares > 0) {
        const costBasis = acc.avgCost * soldShares;
        const realizedPnl = (tx.price - acc.avgCost) * soldShares;
        realizedGains.push({
          id: `${tx.symbol}-${tx.date}-${realizedGains.length}`,
          sellDate: tx.date,
          symbol: tx.symbol,
          name: tx.name ?? acc.name,
          assetClass: tx.assetClass,
          currency: CURRENCY_FOR_ASSET_CLASS[tx.assetClass],
          avgBuyPrice: acc.avgCost,
          sellPrice: tx.price,
          shares: soldShares,
          realizedPnl,
          returnPct: costBasis !== 0 ? (realizedPnl / costBasis) * 100 : 0,
          holdingDays: acc.openedAt ? daysBetween(acc.openedAt, tx.date) : null,
        });
      }
      const remainingShares = acc.shares - txShares;
      acc.shares = remainingShares <= SHARES_EPSILON ? 0 : remainingShares;
      if (acc.shares <= 0) acc.openedAt = null;
    }
    acc.assetClass = tx.assetClass;
    if (tx.name) acc.name = tx.name;
    bySymbol.set(tx.symbol, acc);
  }

  const holdings: ImportedHoldingRow[] = [];
  for (const [symbol, acc] of bySymbol) {
    if (acc.shares <= 0) continue;
    holdings.push({ symbol, shares: acc.shares, avgCost: acc.avgCost, assetClass: acc.assetClass, name: acc.name });
  }
  return { holdings, realizedGains };
}
