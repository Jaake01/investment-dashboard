import { useEffect, useState } from 'react';
import { usePortfolio } from '../context/PortfolioContext';
import { CsvImportError, fetchAndParseSheet } from '../lib/csv';

const AUTO_SYNC_INTERVAL_MS = 15 * 60_000;

// Module-scoped (not per-component ref) so the interval is shared across
// every mounted instance of useAutoSync (Layout, for the background
// behavior, and SettingsPanel, for its own display) — one sync loop per
// sheet URL regardless of how many components call this hook.
let syncInterval: ReturnType<typeof setInterval> | null = null;
let syncedSheetUrl: string | null = null;
// Latest render's runSync. The interval used to call the closure captured on
// mount, whose mergeHoldingsFromImport merged against mount-time `holdings`
// — so every 15-minute sync rebuilt holdings from that stale list, dropping
// anything added or changed since (manual edits, cloud-synced holdings).
let latestRunSync: ((sheetUrl: string) => Promise<void>) | null = null;

export function useAutoSync() {
  const { settings, mergeHoldingsFromImport, setTransactions } = usePortfolio();
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState('');
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  const runSync = async (sheetUrl: string) => {
    setIsSyncing(true);
    setError('');
    try {
      const { rows, transactions } = await fetchAndParseSheet(sheetUrl);
      mergeHoldingsFromImport(rows);
      if (transactions) setTransactions(transactions);
      setLastSyncedAt(new Date().toISOString());
    } catch (err) {
      setError(err instanceof CsvImportError ? err.message : '自動同步失敗');
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    const sheetUrl = settings.sheetUrl.trim();
    if (!sheetUrl) {
      if (syncInterval) {
        clearInterval(syncInterval);
        syncInterval = null;
        syncedSheetUrl = null;
      }
      return;
    }
    if (syncedSheetUrl === sheetUrl) return; // another mounted instance already syncs this URL

    syncedSheetUrl = sheetUrl;
    if (syncInterval) clearInterval(syncInterval);
    runSync(sheetUrl);
    syncInterval = setInterval(() => latestRunSync?.(sheetUrl), AUTO_SYNC_INTERVAL_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.sheetUrl]);

  useEffect(() => {
    latestRunSync = runSync;
  });

  return { isSyncing, error, lastSyncedAt };
}
