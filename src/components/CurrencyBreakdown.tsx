import { usePortfolio } from '../context/PortfolioContext';
import { useFxRate } from '../hooks/useFxRate';
import { computeCurrencyBuckets, computeHoldingMetrics, computeTotalInTwd, convertToTwd } from '../lib/calculations';
import { formatAmount, formatCurrencyIn } from '../lib/format';
import { CURRENCY_LABELS } from '../types';

// formatCurrencyIn's TWD output is a bare "$" (ambiguous next to USD's own
// "US$" right below it), so TWD amounts here get the same explicit "TW$"
// prefix used elsewhere in the app (see HoldingsTable/CashLedgerCard).
function formatTwd(value: number): string {
  return `TW$${formatAmount(value)}`;
}

export function CurrencyBreakdown() {
  const { holdings, prices } = usePortfolio();
  const { effectiveUsdToTwd } = useFxRate();

  const metrics = holdings.map((h) => computeHoldingMetrics(h, prices));
  const buckets = computeCurrencyBuckets(metrics);
  const totalTwd = computeTotalInTwd(metrics, effectiveUsdToTwd);

  return (
    <section className="card">
      <h2>資產幣別總覽</h2>
      <div className="summary-grid">
        {buckets.map((bucket) => {
          const bucketTwd = convertToTwd(bucket.nativeTotal, bucket.currency, effectiveUsdToTwd);
          const percentOfTotal =
            totalTwd !== null && bucketTwd !== null && totalTwd > 0 ? (bucketTwd / totalTwd) * 100 : null;
          return (
            <div className="summary-stat" key={bucket.assetClass}>
              <span className="summary-label">{bucket.label}（{CURRENCY_LABELS[bucket.currency]}）</span>
              <span className="summary-value">
                {bucket.currency === 'TWD' ? formatTwd(bucket.nativeTotal) : formatCurrencyIn(bucket.nativeTotal, bucket.currency)}
              </span>
              {percentOfTotal !== null && <span className="summary-sub">占總資產 {percentOfTotal.toFixed(1)}%</span>}
            </div>
          );
        })}
        <div className="summary-stat">
          <span className="summary-label">總資產（台幣）</span>
          <span className="summary-value">{totalTwd === null ? '請先取得匯率' : formatTwd(totalTwd)}</span>
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
