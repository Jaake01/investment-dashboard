import { usePortfolio } from '../context/PortfolioContext';
import { useFxRate } from '../hooks/useFxRate';
import { computeHoldingMetrics, computePreviousSnapshotValue, computeTotalCostInTwd, computeTotalInTwd } from '../lib/calculations';
import { formatCurrencyIn, formatPercent } from '../lib/format';

export function PortfolioSummary() {
  const { holdings, prices, snapshots } = usePortfolio();
  const { effectiveUsdToTwd } = useFxRate();
  const metrics = holdings.map((h) => computeHoldingMetrics(h, prices));

  const totalMarketValue = computeTotalInTwd(metrics, effectiveUsdToTwd);
  const totalCostValue = computeTotalCostInTwd(metrics, effectiveUsdToTwd);
  const totalGainLoss = totalMarketValue !== null && totalCostValue !== null ? totalMarketValue - totalCostValue : null;
  const totalGainLossPct = totalGainLoss !== null && totalCostValue ? (totalGainLoss / totalCostValue) * 100 : 0;
  const isGain = (totalGainLoss ?? 0) >= 0;
  const placeholder = '請先取得匯率';

  const previousValue = computePreviousSnapshotValue(snapshots);
  const dayChangePct =
    totalMarketValue !== null && previousValue !== null && previousValue !== 0
      ? ((totalMarketValue - previousValue) / previousValue) * 100
      : null;
  // Taiwan market convention: up is red, down is green; unchanged uses the default text color.
  const dayChangeClass = dayChangePct === null || dayChangePct === 0 ? '' : dayChangePct > 0 ? 'change-up' : 'change-down';

  return (
    <section className="card summary-card">
      <h2>投資組合總覽（換算台幣）</h2>
      <div className="summary-grid">
        <div className="summary-stat">
          <span className="summary-label">總市值</span>
          <span className="summary-value">{totalMarketValue === null ? placeholder : formatCurrencyIn(totalMarketValue, 'TWD')}</span>
        </div>
        <div className="summary-stat">
          <span className="summary-label">總成本</span>
          <span className="summary-value">{totalCostValue === null ? placeholder : formatCurrencyIn(totalCostValue, 'TWD')}</span>
        </div>
        <div className="summary-stat">
          <span className="summary-label">總損益</span>
          <span className={`summary-value ${totalGainLoss !== null ? (isGain ? 'gain' : 'loss') : ''}`}>
            {totalGainLoss === null ? placeholder : formatCurrencyIn(totalGainLoss, 'TWD')}
          </span>
        </div>
        <div className="summary-stat">
          <span className="summary-label">報酬率</span>
          <span className={`summary-value ${totalGainLoss !== null ? (isGain ? 'gain' : 'loss') : ''}`}>
            {totalGainLoss === null ? placeholder : formatPercent(totalGainLossPct)}
          </span>
        </div>
        <div className="summary-stat">
          <span className="summary-label">較昨日</span>
          <span className={`summary-value ${dayChangeClass}`}>
            {dayChangePct === null ? '尚無昨日資料' : formatPercent(dayChangePct)}
          </span>
        </div>
      </div>
    </section>
  );
}
