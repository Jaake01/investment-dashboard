import { usePortfolio } from '../context/PortfolioContext';
import { useFxRate } from '../hooks/useFxRate';
import {
  computeCurrencyBuckets,
  computeDayChangePct,
  computeHoldingMetrics,
  computePreviousClassValue,
  computeTotalInTwd,
  convertToTwd,
} from '../lib/calculations';
import { formatAmount, formatCurrencyIn, formatPercent } from '../lib/format';
import { CURRENCY_LABELS } from '../types';

// formatCurrencyIn's TWD output is a bare "$" (ambiguous next to USD's own
// "US$" right below it), so TWD amounts here get the same explicit "TW$"
// prefix used elsewhere in the app (see HoldingsTable/CashLedgerCard).
function formatTwd(value: number): string {
  return `TW$${formatAmount(value)}`;
}

export function CurrencyBreakdown() {
  const { holdings, prices, snapshots } = usePortfolio();
  const { effectiveUsdToTwd } = useFxRate();

  const metrics = holdings.map((h) => computeHoldingMetrics(h, prices));
  const buckets = computeCurrencyBuckets(metrics);
  const totalTwd = computeTotalInTwd(metrics, effectiveUsdToTwd);

  // Previous-day total in TWD, reconstructed from each bucket's own
  // native-currency history (Snapshot.classValues) converted at *today's*
  // FX rate — same rate used for both sides of the comparison, so this
  // reflects price movement only, not yesterday-to-today FX drift. Null
  // (and the row falls back to '—') if any bucket is missing history, same
  // all-or-nothing convention as computeTotalInTwd.
  const previousTotalTwd = buckets.reduce<number | null>((sum, bucket) => {
    if (sum === null) return null;
    const previousNative = computePreviousClassValue(snapshots, bucket.assetClass);
    if (previousNative === null) return null;
    const previousTwd = convertToTwd(previousNative, bucket.currency, effectiveUsdToTwd);
    return previousTwd === null ? null : sum + previousTwd;
  }, 0);
  const totalChangePct = totalTwd === null ? null : computeDayChangePct(totalTwd, previousTotalTwd);

  return (
    <section className="card">
      <h2>資產幣別總覽</h2>
      <div className="summary-grid">
        {buckets.map((bucket) => {
          const changePct = computeDayChangePct(bucket.nativeTotal, computePreviousClassValue(snapshots, bucket.assetClass));
          return (
            <div className="summary-stat" key={bucket.assetClass}>
              <span className="summary-label">{bucket.label}（{CURRENCY_LABELS[bucket.currency]}）</span>
              <span className="summary-value">
                {bucket.currency === 'TWD' ? formatTwd(bucket.nativeTotal) : formatCurrencyIn(bucket.nativeTotal, bucket.currency)}
              </span>
              <span className={`summary-sub ${changePct === null || changePct === 0 ? '' : changePct > 0 ? 'change-up' : 'change-down'}`}>
                {changePct === null ? '較昨日：—' : `較昨日 ${formatPercent(changePct)}`}
              </span>
            </div>
          );
        })}
        <div className="summary-stat">
          <span className="summary-label">總市值（台幣）</span>
          <span className="summary-value">{totalTwd === null ? '請先取得匯率' : formatTwd(totalTwd)}</span>
          <span className={`summary-sub ${totalChangePct === null || totalChangePct === 0 ? '' : totalChangePct > 0 ? 'change-up' : 'change-down'}`}>
            {totalChangePct === null ? '較昨日：—' : `較昨日 ${formatPercent(totalChangePct)}`}
          </span>
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
