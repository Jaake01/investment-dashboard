import { usePortfolio } from '../context/PortfolioContext';
import { useFxRate } from '../hooks/useFxRate';
import { formatCurrencyIn } from '../lib/format';
import { CASH_CURRENCY_ORDER, formatCashAmount, twdRateForCashCurrency } from '../lib/cashLedger';

export function CashLedgerCard() {
  const { cashBalances } = usePortfolio();
  const { effectiveUsdToTwd, effectiveJpyToTwd } = useFxRate();

  const currencies = Object.keys(cashBalances);
  if (currencies.length === 0) return null;

  const ordered = [...currencies].sort((a, b) => {
    const ai = CASH_CURRENCY_ORDER.indexOf(a);
    const bi = CASH_CURRENCY_ORDER.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  let totalTwd = 0;
  let convertedCount = 0;
  const missingRateFor: string[] = [];
  for (const currency of ordered) {
    const rate = twdRateForCashCurrency(currency, effectiveUsdToTwd, effectiveJpyToTwd);
    if (rate === null) {
      missingRateFor.push(currency);
      continue;
    }
    totalTwd += cashBalances[currency] * rate;
    convertedCount += 1;
  }

  return (
    <section className="card">
      <h2>現金帳戶</h2>
      <div className="summary-grid">
        {ordered.map((currency) => (
          <div className="summary-stat" key={currency}>
            <span className="summary-label">{currency} 現金餘額</span>
            <span className="summary-value">{formatCashAmount(cashBalances[currency], currency)}</span>
          </div>
        ))}
        <div className="summary-stat">
          <span className="summary-label">現金總額（台幣）</span>
          <span className="summary-value">
            {convertedCount === 0 ? '—' : formatCurrencyIn(totalTwd, 'TWD')}
          </span>
        </div>
      </div>
      {missingRateFor.length > 0 && (
        <p className="settings-hint">
          尚未取得 {missingRateFor.join('、')} 匯率，現金總額（台幣）暫不計入這些幣別。
        </p>
      )}
    </section>
  );
}
