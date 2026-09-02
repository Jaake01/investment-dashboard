import { useEffect, useState } from 'react';
import { usePortfolio } from '../context/PortfolioContext';
import { REMOTE_SNAPSHOTS_URL } from '../lib/config';
import { CsvImportError, parseDailyAssetCsv } from '../lib/csv';
import type { Snapshot } from '../types';

// Module-scoped (not per-component) so it only fetches once per page load
// even if multiple components mount this hook, matching the pattern used by
// useFxRate's auto-fetch.
let hasFetchedOnMount = false;

// Pulls in the history recorded by .github/workflows/daily-snapshot.yml
// (which runs once a day regardless of whether anyone opens the site), plus
// (optionally) a longer-history "每日資產數據" Sheet backfilled from the
// 交易紀錄 ledger by an external Apps Script, and merges both into the
// locally recorded snapshots, so "較昨日" and the treemap's per-block
// change% stay accurate even across days nobody opened the dashboard.
export function useRemoteSnapshots() {
  const { settings, mergeRemoteSnapshots } = usePortfolio();
  const [lastRemoteDate, setLastRemoteDate] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (hasFetchedOnMount) return;
    hasFetchedOnMount = true;

    (async () => {
      // Sheet-backfilled history is merged first so the GitHub Action's
      // snapshot (fetched live at the moment prices were refreshed, and the
      // only source with cash-ledger data folded in) wins on any date both
      // cover — mergeSnapshots always prefers whichever side is merged in
      // second/local.
      if (settings.dailyAssetSheetUrl.trim()) {
        try {
          const res = await fetch(settings.dailyAssetSheetUrl, { cache: 'no-store' });
          if (res.ok) {
            const text = await res.text();
            const dailyAsset = parseDailyAssetCsv(text);
            if (dailyAsset.length > 0) mergeRemoteSnapshots(dailyAsset);
          }
        } catch (err) {
          // best-effort only — an unreachable/misconfigured Sheet shouldn't
          // block the GitHub Action snapshot fetch below
          if (!(err instanceof CsvImportError)) console.error('每日資產數據 Sheet 讀取失敗', err);
        }
      }

      try {
        const res = await fetch(REMOTE_SNAPSHOTS_URL, { cache: 'no-store' });
        if (!res.ok) return; // workflow not set up yet, or no history published yet
        const remote = (await res.json()) as Snapshot[];
        if (Array.isArray(remote) && remote.length > 0) {
          mergeRemoteSnapshots(remote);
          setLastRemoteDate(remote[remote.length - 1].date);
        }
      } catch {
        // best-effort only — local manual refresh still works without this
      } finally {
        setChecked(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { lastRemoteDate, checked };
}
