import { usePortfolio } from '../context/PortfolioContext';
import { computeHoldingMetrics, computePortfolioTotals } from '../lib/calculations';
import { formatCurrency, formatPercent } from '../lib/format';

export function PortfolioSummary() {
  const { holdings, prices } = usePortfolio();
  const metrics = holdings.map((h) => computeHoldingMetrics(h, prices));
  const totals = computePortfolioTotals(metrics);
  const isGain = totals.totalGainLoss >= 0;

  return (
    <section className="card summary-card">
      <h2>投資組合總覽</h2>
      <div className="summary-grid">
        <div className="summary-stat">
          <span className="summary-label">總市值</span>
          <span className="summary-value">{formatCurrency(totals.totalMarketValue)}</span>
        </div>
        <div className="summary-stat">
          <span className="summary-label">總成本</span>
          <span className="summary-value">{formatCurrency(totals.totalCostValue)}</span>
        </div>
        <div className="summary-stat">
          <span className="summary-label">總損益</span>
          <span className={`summary-value ${isGain ? 'gain' : 'loss'}`}>
            {formatCurrency(totals.totalGainLoss)}
          </span>
        </div>
        <div className="summary-stat">
          <span className="summary-label">報酬率</span>
          <span className={`summary-value ${isGain ? 'gain' : 'loss'}`}>
            {formatPercent(totals.totalGainLossPct)}
          </span>
        </div>
      </div>
    </section>
  );
}
