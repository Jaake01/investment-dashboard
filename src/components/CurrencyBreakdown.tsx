import { usePortfolio } from '../context/PortfolioContext';
import { useFxRate } from '../hooks/useFxRate';
import { computeCurrencyBuckets, computeHoldingMetrics, computeTotalInTwd, convertToTwd } from '../lib/calculations';
import { computeCashLedgerTwdTotal } from '../lib/cashLedger';
import { formatAmount, formatCurrencyIn } from '../lib/format';
import { CURRENCY_LABELS } from '../types';

// formatCurrencyIn's TWD output is a bare "$" (ambiguous next to USD's own
// "US$" right below it), so TWD amounts here get the same explicit "TW$"
// prefix used elsewhere in the app (see HoldingsTable/CashLedgerCard).
function formatTwd(value: number): string {
  return `TW$${formatAmount(value)}`;
}

// null (rate missing for some Holding) stays null rather than silently
// showing a partial total — matches computeTotalInTwd's all-or-nothing
// convention, same helper as PortfolioSummary's totalMarketValue.
function addTwd(base: number | null, delta: number): number | null {
  return base === null ? null : base + delta;
}

export function CurrencyBreakdown() {
  const { holdings, prices, cashBalances } = usePortfolio();
  const { effectiveUsdToTwd, effectiveJpyToTwd } = useFxRate();

  const metrics = holdings.map((h) => computeHoldingMetrics(h, prices));
  const buckets = computeCurrencyBuckets(metrics);
  // 總市值 here is holdings only (crypto/us_stock/tw_stock/現金-classified
  // Holdings like STRC) — it deliberately excludes the 現金帳戶 ledger
  // (TWD/USD/USDT/JPY raw balances), unlike PortfolioSummary's 總資產 up top,
  // which is the comprehensive holdings+cash figure. Percentages below still
  // use that bigger, comprehensive total as their denominator (see
  // grandTotalTwd) — including this row's own percentage, which is why it's
  // not simply 100%.
  const cashLedgerTwd = computeCashLedgerTwdTotal(cashBalances, effectiveUsdToTwd, effectiveJpyToTwd);
  const totalTwd = computeTotalInTwd(metrics, effectiveUsdToTwd);
  const grandTotalTwd = addTwd(totalTwd, cashLedgerTwd);

  return (
    <section className="card">
      <h2>資產幣別總覽</h2>
      <div className="summary-grid">
        {buckets.map((bucket) => {
          const bucketTwd = convertToTwd(bucket.nativeTotal, bucket.currency, effectiveUsdToTwd);
          const percentOfTotal =
            grandTotalTwd !== null && bucketTwd !== null && grandTotalTwd > 0 ? (bucketTwd / grandTotalTwd) * 100 : null;
          return (
            <div className="summary-stat" key={bucket.assetClass}>
              <span className="summary-label">{bucket.label}（{CURRENCY_LABELS[bucket.currency]}）</span>
              <span className="summary-value">
                {bucket.currency === 'TWD' ? formatTwd(bucket.nativeTotal) : formatCurrencyIn(bucket.nativeTotal, bucket.currency)}
              </span>
              {percentOfTotal !== null && <span className="summary-sub">{percentOfTotal.toFixed(1)}%</span>}
            </div>
          );
        })}
        <div className="summary-stat">
          <span className="summary-label">總市值（台幣）</span>
          <span className="summary-value">{totalTwd === null ? '請先取得匯率' : formatTwd(totalTwd)}</span>
          {totalTwd !== null && grandTotalTwd !== null && grandTotalTwd > 0 && (
            <span className="summary-sub">{((totalTwd / grandTotalTwd) * 100).toFixed(1)}%</span>
          )}
        </div>
      </div>
      {effectiveUsdToTwd === null && (
        <p className="settings-hint">
          尚未取得美元/台幣匯率，請到下方設定選擇 Twelve Data 並填入 API key。
        </p>
      )}
    </section>
  );
}
