import { useEffect, useState } from 'react';
import { usePortfolio } from '../context/PortfolioContext';
import { REMOTE_SNAPSHOTS_URL } from '../lib/config';
import type { Snapshot } from '../types';

// Module-scoped (not per-component) so it only fetches once per page load
// even if multiple components mount this hook, matching the pattern used by
// useFxRate's auto-fetch.
let hasFetchedOnMount = false;

// Pulls in the history recorded by .github/workflows/daily-snapshot.yml
// (which runs once a day regardless of whether anyone opens the site) and
// merges it into the locally recorded snapshots, so "較昨日" and the
// treemap's per-block change% stay accurate even across days nobody opened
// the dashboard.
export function useRemoteSnapshots() {
  const { mergeRemoteSnapshots } = usePortfolio();
  const [lastRemoteDate, setLastRemoteDate] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (hasFetchedOnMount) return;
    hasFetchedOnMount = true;

    (async () => {
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
