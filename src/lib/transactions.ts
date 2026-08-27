import type { AssetClass, ImportedHoldingRow, RealizedGain, Transaction } from '../types';
import { CURRENCY_FOR_ASSET_CLASS } from '../types';

function parseDateValue(date: string): number {
  const t = Date.parse(date);
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
}

// A sell's implied share count (amount / price) is derived from two
// independently-rounded dollar figures — Sheet cells are entered to the
// cent, not the share — so it rarely matches a buy's implied count exactly,
// even in exact arithmetic. A symbol bought and fully sold more than once
// (buy, sell out, buy again, sell out again, ...) reuses the same
// accumulator across every round trip, so each round trip's own leftover
// stacks on top of the last one's. Fuzzing this across 2-10 round trips with
// realistic cent-rounded amounts found residuals worth over $1 at the sell
// price — nowhere near float-noise scale (that's fixable with a tiny
// epsilon), and it scales with the security's price level, so a fixed
// share-count cutoff can never be sized right for every symbol. Judging
// "fully sold" by the residual's dollar value at the sell price instead
// — comfortably above that observed worst case, comfortably below any
// position a user would actually consider still holding — is robust
// regardless of price level or how many round trips compounded into it.
//
// The threshold itself is a USD figure, converted to whichever currency the
// sell's own assetClass trades in (see CURRENCY_FOR_ASSET_CLASS) so it means
// the same real amount everywhere — 2 TWD would be a meaningless ~$0.06 and
// never catch anything. This is a fuzzy "is this basically zero" safety
// margin, not a real financial figure, so a fixed approximate rate is
// precise enough here; pulling in the live FX rate would mean threading it
// through every processTransactions call site (Sheet auto-sync, manual
// import, RealizedGains, the daily-snapshot script) for no real benefit.
const DUST_VALUE_THRESHOLD_USD = 5;
const APPROX_USD_TO_TWD = 32;
// Rounding to a fixed precision after every update — far finer than any
// real share count this app deals with, so it never masks a genuine
// fractional position — also resets true float noise (as opposed to the
// cent-rounding drift above) before it has a chance to compound.
const SHARES_PRECISION = 1e8;
function roundShares(value: number): number {
  return Math.round(value * SHARES_PRECISION) / SHARES_PRECISION;
}

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
      const newShares = roundShares(acc.shares + txShares);
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
      const remainingShares = roundShares(acc.shares - txShares);
      const remainingValue = Math.abs(remainingShares) * tx.price;
      const dustThreshold =
        CURRENCY_FOR_ASSET_CLASS[tx.assetClass] === 'TWD' ? DUST_VALUE_THRESHOLD_USD * APPROX_USD_TO_TWD : DUST_VALUE_THRESHOLD_USD;
      acc.shares = remainingValue <= dustThreshold ? 0 : remainingShares;
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
