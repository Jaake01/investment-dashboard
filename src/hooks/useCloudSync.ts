import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { useAuth } from '../context/AuthContext';
import { isFirebaseConfigured } from '../lib/firebase';
import {
  batchUpsertHoldings,
  batchUpsertSnapshots,
  deleteHoldingDoc,
  deleteHoldingDocsBatch,
  subscribeHoldings,
  subscribeSettings,
  subscribeSnapshots,
  writeHolding,
  writeSettingsDoc,
  writeSnapshotDoc,
} from '../lib/firestoreSync';
import { mergeSnapshots } from '../lib/calculations';
import { toSyncableSettings, type Holding, type Settings, type Snapshot } from '../types';

export type SyncStatus = 'offline' | 'idle' | 'syncing' | 'error';

const SETTINGS_PUSH_DEBOUNCE_MS = 800;

interface UseCloudSyncArgs {
  holdings: Holding[];
  setHoldings: Dispatch<SetStateAction<Holding[]>>;
  settings: Settings;
  setSettingsState: Dispatch<SetStateAction<Settings>>;
  snapshots: Snapshot[];
  setSnapshots: Dispatch<SetStateAction<Snapshot[]>>;
}

// Layered on top of PortfolioContext's existing localStorage-backed state —
// signed-out, this hook does nothing (no SDK calls, no listeners). Signed
// in, it (a) subscribes to this user's Firestore docs and applies remote
// changes via the same setters PortfolioContext already owns, and (b)
// exposes push* functions for PortfolioContext's mutators to call after
// each local change.
export function useCloudSync({ holdings, setHoldings, settings, setSettingsState, snapshots, setSnapshots }: UseCloudSyncArgs) {
  const { user } = useAuth();
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('offline');
  const [syncError, setSyncError] = useState<string | null>(null);

  // The subscription callbacks below are set up once per signed-in uid and
  // must always read the *latest* local state (e.g. for the first-sign-in
  // reconciliation diff), not whatever it was when the effect ran — hence
  // refs kept in sync every render rather than closing over the props.
  const holdingsRef = useRef(holdings);
  const settingsRef = useRef(settings);
  const snapshotsRef = useRef(snapshots);
  holdingsRef.current = holdings;
  settingsRef.current = settings;
  snapshotsRef.current = snapshots;

  const reportError = (err: unknown) => {
    setSyncStatus('error');
    setSyncError(err instanceof Error ? err.message : '同步失敗');
  };

  useEffect(() => {
    if (!isFirebaseConfigured || !user) {
      setSyncStatus('offline');
      setSyncError(null);
      return;
    }
    const uid = user.uid;
    setSyncStatus('syncing');
    setSyncError(null);

    let holdingsReady = false;
    let settingsReady = false;
    let snapshotsReady = false;
    const maybeGoIdle = () => {
      if (holdingsReady && settingsReady && snapshotsReady) setSyncStatus('idle');
    };

    const unsubHoldings = subscribeHoldings(uid, (changes) => {
      if (!holdingsReady) {
        // First delivery = the full current cloud collection (every
        // existing doc arrives as an 'added' change). Union with whatever
        // is already local rather than overwriting, so a holding added on
        // this device before its first sign-in doesn't silently vanish.
        holdingsReady = true;
        const remoteIds = new Set(changes.map((c) => c.id));
        const localOnly = holdingsRef.current.filter((h) => !remoteIds.has(h.id));
        if (localOnly.length > 0) {
          batchUpsertHoldings(uid, localOnly).catch(reportError);
        }
        setHoldings((prev) => {
          const byId = new Map(prev.map((h) => [h.id, h]));
          for (const c of changes) {
            if (c.data) byId.set(c.id, c.data);
          }
          return Array.from(byId.values());
        });
        maybeGoIdle();
        return;
      }
      const nonEcho = changes.filter((c) => !c.isLocalEcho);
      if (nonEcho.length === 0) return;
      setHoldings((prev) => {
        const byId = new Map(prev.map((h) => [h.id, h]));
        for (const c of nonEcho) {
          if (c.data) byId.set(c.id, c.data);
          else byId.delete(c.id);
        }
        return Array.from(byId.values());
      });
    });

    const unsubSettings = subscribeSettings(uid, (data, isLocalEcho) => {
      if (!settingsReady) {
        settingsReady = true;
        if (data === null) {
          writeSettingsDoc(uid, toSyncableSettings(settingsRef.current)).catch(reportError);
        } else {
          setSettingsState((prev) => ({ ...prev, ...data }));
        }
        maybeGoIdle();
        return;
      }
      if (isLocalEcho || data === null) return;
      setSettingsState((prev) => ({ ...prev, ...data }));
    });

    const unsubSnapshots = subscribeSnapshots(uid, (changes) => {
      if (!snapshotsReady) {
        snapshotsReady = true;
        const remoteSnapshots = changes.map((c) => c.data).filter((s): s is Snapshot => s !== null);
        // Reuses the exact same local-wins-on-date-collision merge already
        // used for the GitHub daily-snapshot branch — no new algorithm.
        const merged = mergeSnapshots(snapshotsRef.current, remoteSnapshots);
        const remoteDates = new Set(remoteSnapshots.map((s) => s.date));
        const newOnly = merged.filter((s) => !remoteDates.has(s.date));
        if (newOnly.length > 0) {
          batchUpsertSnapshots(uid, newOnly).catch(reportError);
        }
        setSnapshots(merged);
        maybeGoIdle();
        return;
      }
      const nonEcho = changes.filter((c) => !c.isLocalEcho);
      if (nonEcho.length === 0) return;
      setSnapshots((prev) => {
        const byDate = new Map(prev.map((s) => [s.date, s]));
        for (const c of nonEcho) {
          if (c.data) byDate.set(c.id, c.data);
          else byDate.delete(c.id);
        }
        return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
      });
    });

    return () => {
      unsubHoldings();
      unsubSettings();
      unsubSnapshots();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  const settingsDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pushHolding = (holding: Holding) => {
    if (!user) return;
    writeHolding(user.uid, holding).catch(reportError);
  };

  const pushHoldingDelete = (id: string) => {
    if (!user) return;
    deleteHoldingDoc(user.uid, id).catch(reportError);
  };

  // Covers both replaceHoldingsFromImport (removedIds = every holding that
  // existed before the import) and mergeHoldingsFromImport (removedIds = []
  // — merge never removes).
  const pushHoldingsReplace = (next: Holding[], removedIds: string[]) => {
    if (!user) return;
    batchUpsertHoldings(user.uid, next).catch(reportError);
    if (removedIds.length > 0) {
      deleteHoldingDocsBatch(user.uid, removedIds).catch(reportError);
    }
  };

  const pushSettings = (nextSettings: Settings) => {
    if (!user) return;
    if (settingsDebounceRef.current) clearTimeout(settingsDebounceRef.current);
    settingsDebounceRef.current = setTimeout(() => {
      writeSettingsDoc(user.uid, toSyncableSettings(nextSettings)).catch(reportError);
    }, SETTINGS_PUSH_DEBOUNCE_MS);
  };

  const pushSnapshot = (snapshot: Snapshot) => {
    if (!user) return;
    writeSnapshotDoc(user.uid, snapshot).catch(reportError);
  };

  return { syncStatus, syncError, pushHolding, pushHoldingDelete, pushHoldingsReplace, pushSettings, pushSnapshot };
}
