import { useEffect, useState } from 'react';
import { usePortfolio } from '../context/PortfolioContext';
import { CsvImportError } from '../lib/csv';
import { fetchCashLedgerSheet } from '../lib/cashLedger';

// Module-scoped (not per-component) so multiple components calling
// useCashLedger() on the same page load don't each fire their own redundant
// auto-fetch — matches the useFxRate/usePrices pattern. Unlike useFxRate,
// there's no persisted staleness gate: this just fetches a public CSV (no
// rate-limited API key involved), so re-fetching once per page load is cheap.
let hasAutoFetchedOnMount = false;

export function useCashLedger() {
  const { settings, setCashBalances } = usePortfolio();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');

  const refreshCashLedger = async () => {
    const url = settings.cashLedgerSheetUrl.trim();
    if (!url) return;
    setIsRefreshing(true);
    setError('');
    try {
      const balances = await fetchCashLedgerSheet(url);
      setCashBalances(balances);
    } catch (err) {
      setError(err instanceof CsvImportError ? err.message : '現金帳戶讀取失敗');
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (hasAutoFetchedOnMount) return;
    if (!settings.cashLedgerSheetUrl.trim()) return;
    hasAutoFetchedOnMount = true;
    refreshCashLedger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.cashLedgerSheetUrl]);

  return { refreshCashLedger, isRefreshing, error };
}
