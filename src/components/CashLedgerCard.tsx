import { usePortfolio } from '../context/PortfolioContext';
import { useFxRate } from '../hooks/useFxRate';
import { formatCurrencyIn } from '../lib/format';

const PREFERRED_ORDER = ['TWD', 'USD', 'USDT', 'JPY'];

const jpyFormatter = new Intl.NumberFormat('zh-TW', {
  style: 'currency',
  currency: 'JPY',
  maximumFractionDigits: 0,
});

const plainNumberFormatter = new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 0 });

function formatCashAmount(amount: number, currency: string): string {
  if (currency === 'TWD') return formatCurrencyIn(amount, 'TWD');
  if (currency === 'USD') return formatCurrencyIn(amount, 'USD');
  if (currency === 'JPY') return jpyFormatter.format(amount);
  // USDT (and any other currency the ledger might use) isn't part of the
  // app's core Currency type — shown as a plain number + code, same
  // convention as USDC elsewhere in this app.
  return `${plainNumberFormatter.format(amount)} ${currency}`;
}

// USDT is treated 1:1 with USD for TWD conversion, same as USDC is treated
// 1:1 with USD elsewhere in this app (see calculations.ts's convertToTwd).
function twdRateFor(currency: string, usdToTwd: number | null, jpyToTwd: number | null): number | null {
  if (currency === 'TWD') return 1;
  if (currency === 'USD' || currency === 'USDT') return usdToTwd;
  if (currency === 'JPY') return jpyToTwd;
  return null;
}

export function CashLedgerCard() {
  const { cashBalances } = usePortfolio();
  const { effectiveUsdToTwd, effectiveJpyToTwd } = useFxRate();

  const currencies = Object.keys(cashBalances);
  if (currencies.length === 0) return null;

  const ordered = [...currencies].sort((a, b) => {
    const ai = PREFERRED_ORDER.indexOf(a);
    const bi = PREFERRED_ORDER.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  let totalTwd = 0;
  let convertedCount = 0;
  const missingRateFor: string[] = [];
  for (const currency of ordered) {
    const rate = twdRateFor(currency, effectiveUsdToTwd, effectiveJpyToTwd);
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
