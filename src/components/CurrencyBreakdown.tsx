import { usePortfolio } from '../context/PortfolioContext';
import { useFxRate } from '../hooks/useFxRate';
import { computeCurrencyBuckets, computeHoldingMetrics, computeTotalInTwd } from '../lib/calculations';
import { formatCurrencyIn } from '../lib/format';
import { CURRENCY_LABELS } from '../types';

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
        {buckets.map((bucket) => (
          <div className="summary-stat" key={bucket.assetClass}>
            <span className="summary-label">{bucket.label}（{CURRENCY_LABELS[bucket.currency]}）</span>
            <span className="summary-value">{formatCurrencyIn(bucket.nativeTotal, bucket.currency)}</span>
          </div>
        ))}
        <div className="summary-stat">
          <span className="summary-label">總資產（台幣）</span>
          <span className="summary-value">
            {totalTwd === null ? '請先取得匯率' : formatCurrencyIn(totalTwd, 'TWD')}
          </span>
        </div>
      </div>
      {effectiveUsdToTwd !== null && (
        <p className="settings-hint">目前匯率：1 USD = {effectiveUsdToTwd} TWD（即時 API）</p>
      )}
      {effectiveUsdToTwd === null && (
        <p className="settings-hint">
          尚未取得美元/台幣匯率，請到下方設定選擇 Twelve Data 並填入 API key。
        </p>
      )}
    </section>
  );
}
