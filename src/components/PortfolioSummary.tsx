import { usePortfolio } from '../context/PortfolioContext';
import { useFxRate } from '../hooks/useFxRate';
import { computeHoldingMetrics, computeTotalCostInTwd, computeTotalInTwd } from '../lib/calculations';
import { formatCurrencyIn, formatPercent } from '../lib/format';

export function PortfolioSummary() {
  const { holdings, prices } = usePortfolio();
  const { effectiveUsdToTwd } = useFxRate();
  const metrics = holdings.map((h) => computeHoldingMetrics(h, prices));

  const totalMarketValue = computeTotalInTwd(metrics, effectiveUsdToTwd);
  const totalCostValue = computeTotalCostInTwd(metrics, effectiveUsdToTwd);
  const totalGainLoss = totalMarketValue !== null && totalCostValue !== null ? totalMarketValue - totalCostValue : null;
  const totalGainLossPct = totalGainLoss !== null && totalCostValue ? (totalGainLoss / totalCostValue) * 100 : 0;
  const isGain = (totalGainLoss ?? 0) >= 0;
  const placeholder = '請先取得匯率';

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
      </div>
    </section>
  );
}
