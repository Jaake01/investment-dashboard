import { createContext, useContext, useMemo, useRef, type ReactNode } from 'react';
import type { FxRate, Holding, ImportedHoldingRow, PriceEntry, Settings, Snapshot, Transaction } from '../types';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { useCloudSync, type SyncStatus } from '../hooks/useCloudSync';
import { storageKey } from '../lib/storage';
import { newId } from '../lib/id';
import { recordSnapshot, type SnapshotInput } from '../hooks/useSnapshots';
import { mergeSnapshotsPreferRemoteExceptToday, todayDateString } from '../lib/calculations';
import { DEFAULT_SHEET_URL } from '../lib/config';

// Pre-filled with the owner's own published sheet so the dashboard connects
// automatically on first load without requiring the URL to be pasted in
// manually. This sheet is already public (anyone with the link can read it
// via "publish to web"), and since this is a client-only app the built JS
// bundle is visible to anyone who opens the deployed site regardless, so
// there's no meaningful confidentiality being traded away here.
const DEFAULT_SETTINGS: Settings = {
  sheetUrl: DEFAULT_SHEET_URL,
  priceProvider: 'none',
  finnhubApiKey: '',
  twelveDataApiKey: '',
  twQuoteSheetUrl: '',
  cashLedgerSheetUrl: '',
  dailyAssetSheetUrl: '',
  theme: 'system',
};

export type NewHoldingInput = Omit<Holding, 'id' | 'source'>;

interface PortfolioContextValue {
  holdings: Holding[];
  settings: Settings;
  prices: Record<string, PriceEntry>;
  snapshots: Snapshot[];
  fxRate: FxRate | null;
  syncStatus: SyncStatus;
  syncError: string | null;
  cashBalances: Record<string, number>;
  transactions: Transaction[];
  addHolding: (input: NewHoldingInput) => void;
  updateHolding: (id: string, patch: Partial<NewHoldingInput>) => void;
  deleteHolding: (id: string) => void;
  replaceHoldingsFromImport: (rows: ImportedHoldingRow[]) => void;
  mergeHoldingsFromImport: (rows: ImportedHoldingRow[]) => void;
  setSettings: (patch: Partial<Settings>) => void;
  applyPriceUpdates: (entries: PriceEntry[]) => void;
  setCashBalances: (balances: Record<string, number>) => void;
  recordCurrentSnapshot: (input: SnapshotInput) => void;
  mergeRemoteSnapshots: (remote: Snapshot[]) => void;
  setFxRate: (rate: FxRate) => void;
  setTransactions: (transactions: Transaction[]) => void;
}

const PortfolioContext = createContext<PortfolioContextValue | null>(null);

export function PortfolioProvider({ children }: { children: ReactNode }) {
  const [holdings, setHoldings] = useLocalStorage<Holding[]>(storageKey('holdings'), []);
  const [storedSettings, setSettingsState] = useLocalStorage<Settings>(storageKey('settings'), DEFAULT_SETTINGS);
  // Merge with defaults on every read: localStorage may hold a Settings object
  // saved by an older version of the app that's missing fields added since
  // (e.g. twQuoteSheetUrl) — reading those as `undefined` instead of '' broke
  // every `.trim()` call on them. This self-heals regardless of what's stored.
  const settings = useMemo<Settings>(() => {
    // One-time migration: versions before the per-provider key split stored a
    // single shared `apiKey` regardless of which provider was selected. Move
    // it into whichever provider it currently belongs to — then drop the
    // legacy field entirely rather than leaving it in `settings`, since the
    // next setSettings() call spreads `settings` back into storage; keeping
    // it around would make it resurface and get misapplied again the next
    // time the provider changes (it doesn't track *which* provider it was
    // originally saved for, so re-checking it against a later provider
    // choice would silently reassign a stale key to the wrong one).
    const { apiKey: legacyApiKey, ...rest } = storedSettings as Partial<Settings> & { apiKey?: string };
    const merged: Settings = { ...DEFAULT_SETTINGS, ...rest };
    if (legacyApiKey) {
      if (merged.priceProvider === 'finnhub' && !merged.finnhubApiKey) {
        merged.finnhubApiKey = legacyApiKey;
      } else if (merged.priceProvider === 'twelvedata' && !merged.twelveDataApiKey) {
        merged.twelveDataApiKey = legacyApiKey;
      }
    }
    return merged;
  }, [storedSettings]);
  const [prices, setPrices] = useLocalStorage<Record<string, PriceEntry>>(storageKey('prices'), {});
  const [snapshots, setSnapshots] = useLocalStorage<Snapshot[]>(storageKey('snapshots'), []);
  const [fxRate, setFxRateState] = useLocalStorage<FxRate | null>(storageKey('fxRate'), null);
  // Local-only, like fxRate/prices — re-fetched from the cash ledger sheet on
  // load rather than synced to the cloud, since it's a cheap derived value.
  const [cashBalances, setCashBalancesState] = useLocalStorage<Record<string, number>>(storageKey('cashBalances'), {});
  // Local-only, same as cashBalances — a full mirror of whatever the 交易紀錄
  // sheet currently contains, re-fetched (and wholesale replaced) on every
  // sync rather than synced to the cloud itself. Used to derive 已實現損益
  // (see RealizedGains.tsx / processTransactions).
  const [transactions, setTransactionsState] = useLocalStorage<Transaction[]>(storageKey('transactions'), []);

  const cloudSync = useCloudSync({ holdings, setHoldings, settings, setSettingsState, snapshots, setSnapshots });

  // Snapshot writes have to survive being interleaved. Two of them run
  // asynchronously and finish minutes apart: useRemoteSnapshots merges the
  // 每日資產數據 Sheet as soon as it downloads, while a price refresh sleeps
  // 8s between quotes and only then records today's snapshot. Computing the
  // next array from a `snapshots` captured at render time made whichever
  // finished last overwrite the other wholesale — the Sheet's months of
  // history kept vanishing behind a price refresh that started before it
  // landed. The setters below therefore all derive from `prev`. This ref is
  // only for the cloud-push diffs, which just need "what did we have a moment
  // ago" and are idempotent upserts anyway.
  const snapshotsRef = useRef(snapshots);
  snapshotsRef.current = snapshots;

  const value = useMemo<PortfolioContextValue>(() => ({
    holdings,
    settings,
    prices,
    snapshots,
    fxRate,
    cashBalances,
    transactions,
    syncStatus: cloudSync.syncStatus,
    syncError: cloudSync.syncError,

    addHolding: (input) => {
      const holding: Holding = { ...input, id: newId(), source: 'manual' };
      setHoldings((prev) => [...prev, holding]);
      cloudSync.pushHolding(holding);
    },

    updateHolding: (id, patch) => {
      const current = holdings.find((h) => h.id === id);
      setHoldings((prev) => prev.map((h) => (h.id === id ? { ...h, ...patch } : h)));
      if (current) cloudSync.pushHolding({ ...current, ...patch });
    },

    deleteHolding: (id) => {
      setHoldings((prev) => prev.filter((h) => h.id !== id));
      cloudSync.pushHoldingDelete(id);
    },

    replaceHoldingsFromImport: (rows) => {
      const next: Holding[] = rows.map((row) => ({
        id: newId(),
        symbol: row.symbol,
        name: row.name,
        shares: row.shares,
        avgCost: row.avgCost,
        assetClass: row.assetClass,
        source: 'import',
      }));
      const removedIds = holdings.map((h) => h.id);
      setHoldings(next);
      cloudSync.pushHoldingsReplace(next, removedIds);
    },

    mergeHoldingsFromImport: (rows) => {
      const importedSymbols = new Set(rows.map((row) => row.symbol));
      // A fully-sold position (0 remaining shares) is correctly omitted from
      // `rows` by aggregateHoldingsFromTransactions — without this, it would
      // never get removed here, since the loop below only adds/updates
      // symbols present in `rows`, and the position would linger forever
      // after being sold. Manually-added holdings are never touched by an
      // import sync, sold-out or not.
      const stale = holdings.filter((h) => h.source === 'import' && !importedSymbols.has(h.symbol));
      const staleIds = new Set(stale.map((h) => h.id));
      const next = holdings.filter((h) => !staleIds.has(h.id));
      for (const row of rows) {
        const existingIndex = next.findIndex((h) => h.symbol === row.symbol);
        if (existingIndex >= 0) {
          next[existingIndex] = {
            ...next[existingIndex],
            shares: row.shares,
            avgCost: row.avgCost,
            assetClass: row.assetClass,
            name: row.name ?? next[existingIndex].name,
          };
        } else {
          next.push({
            id: newId(),
            symbol: row.symbol,
            name: row.name,
            shares: row.shares,
            avgCost: row.avgCost,
            assetClass: row.assetClass,
            source: 'import',
          });
        }
      }
      setHoldings(next);
      cloudSync.pushHoldingsReplace(next, stale.map((h) => h.id));
    },

    setSettings: (patch) => {
      const next = { ...settings, ...patch };
      setSettingsState(next);
      cloudSync.pushSettings(next);
    },

    applyPriceUpdates: (entries) => {
      setPrices((prev) => {
        const next = { ...prev };
        for (const entry of entries) {
          next[entry.symbol] = entry;
        }
        return next;
      });
    },

    recordCurrentSnapshot: (input) => {
      setSnapshots((prev) => recordSnapshot(prev, input));
      cloudSync.pushSnapshot({ date: todayDateString(), ...input });
    },

    mergeRemoteSnapshots: (remote) => {
      const priorDates = new Set(snapshotsRef.current.map((s) => s.date));
      setSnapshots((prev) => mergeSnapshotsPreferRemoteExceptToday(prev, remote, todayDateString()));
      for (const s of remote) {
        if (!priorDates.has(s.date)) cloudSync.pushSnapshot(s);
      }
    },

    setFxRate: (rate) => {
      setFxRateState(rate);
    },

    setCashBalances: (balances) => {
      setCashBalancesState(balances);
    },

    setTransactions: (next) => {
      setTransactionsState(next);
    },
  }), [
    holdings,
    settings,
    prices,
    snapshots,
    fxRate,
    cashBalances,
    transactions,
    cloudSync,
    setHoldings,
    setSettingsState,
    setPrices,
    setSnapshots,
    setFxRateState,
    setCashBalancesState,
    setTransactionsState,
  ]);

  return <PortfolioContext.Provider value={value}>{children}</PortfolioContext.Provider>;
}

export function usePortfolio(): PortfolioContextValue {
  const ctx = useContext(PortfolioContext);
  if (!ctx) throw new Error('usePortfolio must be used within a PortfolioProvider');
  return ctx;
}
