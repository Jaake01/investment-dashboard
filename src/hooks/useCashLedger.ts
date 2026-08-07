import { useEffect, useState } from 'react';
import { usePortfolio } from '../context/PortfolioContext';
import { CsvImportError } from '../lib/csv';
import { fetchCashLedgerSheet } from '../lib/cashLedger';

const AUTO_REFRESH_INTERVAL_MS = 15 * 60_000;

// Module-scoped (not per-component ref), same reasoning and shape as
// useAutoSync's syncInterval/syncedSheetUrl — one refresh loop per sheet URL
// shared across every mounted instance (Layout's background behavior,
// SettingsPanel's own display), and it re-arms itself on a fixed interval
// instead of only ever firing once on mount. The previous version fetched
// exactly once per page load and never again, so edits made to the Sheet
// after that first load (e.g. a new 現金帳戶 entry) never showed up until the
// whole page was reloaded — this brings it in line with useAutoSync's
// recurring refresh.
let refreshInterval: ReturnType<typeof setInterval> | null = null;
let refreshingSheetUrl: string | null = null;

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
    const url = settings.cashLedgerSheetUrl.trim();
    if (!url) {
      if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
        refreshingSheetUrl = null;
      }
      return;
    }
    if (refreshingSheetUrl === url) return; // another mounted instance already refreshes this URL

    refreshingSheetUrl = url;
    if (refreshInterval) clearInterval(refreshInterval);
    refreshCashLedger();
    refreshInterval = setInterval(refreshCashLedger, AUTO_REFRESH_INTERVAL_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.cashLedgerSheetUrl]);

  return { refreshCashLedger, isRefreshing, error };
}
