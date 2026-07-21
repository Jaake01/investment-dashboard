import type { AssetClass, ImportedHoldingRow, Transaction } from '../types';

function parseDateValue(date: string): number {
  const t = Date.parse(date);
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
}

interface Accumulator {
  shares: number;
  avgCost: number;
  assetClass: AssetClass;
}

// Weighted-average cost method: buys blend into the running average cost,
// sells reduce shares without changing the average cost of what remains.
export function aggregateHoldingsFromTransactions(transactions: Transaction[]): ImportedHoldingRow[] {
  const sorted = [...transactions].sort((a, b) => parseDateValue(a.date) - parseDateValue(b.date));

  const bySymbol = new Map<string, Accumulator>();

  for (const tx of sorted) {
    const acc = bySymbol.get(tx.symbol) ?? { shares: 0, avgCost: 0, assetClass: tx.assetClass };
    const txShares = tx.price > 0 ? tx.amount / tx.price : 0;

    if (tx.action === 'buy') {
      const newShares = acc.shares + txShares;
      acc.avgCost = newShares > 0 ? (acc.shares * acc.avgCost + txShares * tx.price) / newShares : 0;
      acc.shares = newShares;
    } else {
      acc.shares = Math.max(0, acc.shares - txShares);
    }
    acc.assetClass = tx.assetClass;
    bySymbol.set(tx.symbol, acc);
  }

  const rows: ImportedHoldingRow[] = [];
  for (const [symbol, acc] of bySymbol) {
    if (acc.shares <= 0) continue;
    rows.push({ symbol, shares: acc.shares, avgCost: acc.avgCost, assetClass: acc.assetClass });
  }
  return rows;
}
