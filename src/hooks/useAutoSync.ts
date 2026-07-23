import { useEffect, useRef, useState } from 'react';
import { usePortfolio } from '../context/PortfolioContext';
import { CsvImportError, fetchAndParseSheet } from '../lib/csv';

const AUTO_SYNC_INTERVAL_MS = 15 * 60_000;

export function useAutoSync() {
  const { settings, mergeHoldingsFromImport } = usePortfolio();
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState('');
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const runSync = async (sheetUrl: string) => {
    setIsSyncing(true);
    setError('');
    try {
      const rows = await fetchAndParseSheet(sheetUrl);
      mergeHoldingsFromImport(rows);
      setLastSyncedAt(new Date().toISOString());
    } catch (err) {
      setError(err instanceof CsvImportError ? err.message : '自動同步失敗');
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (!settings.sheetUrl.trim()) {
      return;
    }

    const sheetUrl = settings.sheetUrl;
    runSync(sheetUrl);
    intervalRef.current = setInterval(() => runSync(sheetUrl), AUTO_SYNC_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.sheetUrl]);

  return { isSyncing, error, lastSyncedAt };
}
