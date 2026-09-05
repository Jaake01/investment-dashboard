import { useEffect, useState } from 'react';
import { usePortfolio } from '../context/PortfolioContext';
import { mergeSnapshots } from '../lib/calculations';
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
      // Combine both remote sources into one array with plain function calls
      // — not two separate calls into the context's mergeRemoteSnapshots —
      // before ever touching React state. mergeRemoteSnapshots is a closure
      // captured once when this effect was created (empty dep array), so it
      // always closes over whatever `snapshots` was at that first render; a
      // second call from the same effect body would merge against that same
      // stale snapshot instead of the first call's result, silently
      // discarding most of what the first merge just added. Merging locally
      // first and calling into the context exactly once sidesteps that.
      let combinedRemote: Snapshot[] = [];

      if (settings.dailyAssetSheetUrl.trim()) {
        try {
          const res = await fetch(settings.dailyAssetSheetUrl, { cache: 'no-store' });
          if (res.ok) {
            const text = await res.text();
            combinedRemote = parseDailyAssetCsv(text);
          }
        } catch (err) {
          // best-effort only — an unreachable/misconfigured Sheet shouldn't
          // block the GitHub Action snapshot fetch below
          if (!(err instanceof CsvImportError)) console.error('每日資產數據 Sheet 讀取失敗', err);
        }
      }

      try {
        const res = await fetch(REMOTE_SNAPSHOTS_URL, { cache: 'no-store' });
        if (res.ok) {
          const raw = (await res.json()) as Snapshot[];
          // Runs of the Action from before it learned to abort on a missing
          // FX rate left rows with a null total baked into snapshots.json.
          // Those have to be dropped rather than merged: remote snapshots win
          // over local ones for past dates, so a null total doesn't just fail
          // to help — it blanks out a day the Sheet has a real value for.
          const remote = Array.isArray(raw) ? raw.filter((s) => Number.isFinite(s.totalValue)) : [];
          if (remote.length > 0) {
            // The Sheet wins on any date both cover. It replays the whole
            // 交易紀錄 ledger *and* the 現金帳戶 balances for every calendar
            // day, whereas the Action records holdings only — so the Action's
            // totals sit a cash-ledger's worth lower (~1M TWD here), and
            // letting them win put a cliff in the trend chart on whichever
            // day the Action's history happened to start.
            combinedRemote = mergeSnapshots(combinedRemote, remote);
            setLastRemoteDate(remote[remote.length - 1].date);
          }
        }
      } catch {
        // best-effort only — local manual refresh still works without this
      } finally {
        setChecked(true);
      }

      if (combinedRemote.length > 0) mergeRemoteSnapshots(combinedRemote);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { lastRemoteDate, checked };
}
