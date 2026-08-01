import { usePortfolio } from '../context/PortfolioContext';
import { useFxRate } from '../hooks/useFxRate';
import { computeHoldingMetrics, computePreviousSnapshotValue, computeTotalCostInTwd, computeTotalInTwd } from '../lib/calculations';
import { computeCashLedgerTwdTotal } from '../lib/cashLedger';
import { formatCurrencyIn, formatPercent } from '../lib/format';

// null (rate missing for some Holding) stays null rather than silently
// showing a partial total for 總市值/總成本 — matches computeTotalInTwd's
// existing all-or-nothing convention.
function addTwd(base: number | null, delta: number): number | null {
  return base === null ? null : base + delta;
}

export function PortfolioSummary() {
  const { holdings, prices, snapshots, cashBalances } = usePortfolio();
  const { effectiveUsdToTwd, effectiveJpyToTwd } = useFxRate();
  const metrics = holdings.map((h) => computeHoldingMetrics(h, prices));

  // Cash-ledger balances (see CashLedgerCard) aren't Holdings, so they don't
  // flow through computeTotalInTwd/computeTotalCostInTwd — added on top here
  // instead. A cash balance has no cost basis of its own, so it contributes
  // equally to market value and cost value (zero gain/loss), same treatment
  // as the 現金 tab's total row in HoldingsTable.
  const cashLedgerTwd = computeCashLedgerTwdTotal(cashBalances, effectiveUsdToTwd, effectiveJpyToTwd);

  const totalMarketValue = addTwd(computeTotalInTwd(metrics, effectiveUsdToTwd), cashLedgerTwd);
  const totalCostValue = addTwd(computeTotalCostInTwd(metrics, effectiveUsdToTwd), cashLedgerTwd);
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
          {/* "總資產" (not 總市值) because this includes 現金帳戶 ledger
              balances on top of holdings — see CurrencyBreakdown's 總市值
              row for the holdings-only figure this is built from. */}
          <span className="summary-label">總資產</span>
          <span className="summary-value">{totalMarketValue === null ? placeholder : formatCurrencyIn(totalMarketValue, 'TWD')}</span>
        </div>
        <div className="summary-stat">
          <span className="summary-label">總成本</span>
          <span className="summary-value">{totalCostValue === null ? placeholder : formatCurrencyIn(totalCostValue, 'TWD')}</span>
        </div>
        <div className="summary-stat">
          <span className="summary-label">總損益</span>
          <span className={`summary-value ${totalGainLoss !== null ? (isGain ? 'change-up' : 'change-down') : ''}`}>
            {totalGainLoss === null ? placeholder : formatCurrencyIn(totalGainLoss, 'TWD')}
          </span>
        </div>
        <div className="summary-stat">
          <span className="summary-label">報酬率</span>
          <span className={`summary-value ${totalGainLoss !== null ? (isGain ? 'change-up' : 'change-down') : ''}`}>
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
