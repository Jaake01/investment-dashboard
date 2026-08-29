import { usePortfolio } from '../context/PortfolioContext';
import { useFxRate } from '../hooks/useFxRate';
import {
  computeCurrencyBuckets,
  computeDayChangeInGainPct,
  computeHoldingMetrics,
  computePreviousClassCostValue,
  computePreviousClassValue,
  computeTotalInTwd,
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

  return (
    <section className="card">
      <h2>資產幣別總覽</h2>
      <div className="summary-grid">
        {buckets.map((bucket) => {
          const changePct = computeDayChangeInGainPct(
            bucket.nativeTotal,
            bucket.nativeCost,
            computePreviousClassValue(snapshots, bucket.assetClass),
            computePreviousClassCostValue(snapshots, bucket.assetClass),
          );
          return (
            <div className="summary-stat" key={bucket.assetClass}>
              <span className="summary-label">{bucket.label}（{CURRENCY_LABELS[bucket.currency]}）</span>
              <span className="summary-value">
                {bucket.currency === 'TWD' ? formatTwd(bucket.nativeTotal) : formatCurrencyIn(bucket.nativeTotal, bucket.currency)}
              </span>
              <span className="summary-sub">
                較昨日{' '}
                <span className={changePct === null || changePct === 0 ? '' : changePct > 0 ? 'change-up' : 'change-down'}>
                  {changePct === null ? '—' : formatPercent(changePct)}
                </span>
              </span>
            </div>
          );
        })}
        <div className="summary-stat">
          <span className="summary-label">總市值（台幣）</span>
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
