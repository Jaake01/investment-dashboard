import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { Holding, ImportedHoldingRow, PriceEntry, Settings, Snapshot } from '../types';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { storageKey } from '../lib/storage';
import { newId } from '../lib/id';
import { recordSnapshot } from '../hooks/useSnapshots';

const DEFAULT_SETTINGS: Settings = {
  sheetUrl: '',
  priceProvider: 'none',
  apiKey: '',
  allocationGroupBy: 'holding',
};

export type NewHoldingInput = Omit<Holding, 'id' | 'source'>;

interface PortfolioContextValue {
  holdings: Holding[];
  settings: Settings;
  prices: Record<string, PriceEntry>;
  snapshots: Snapshot[];
  addHolding: (input: NewHoldingInput) => void;
  updateHolding: (id: string, patch: Partial<NewHoldingInput>) => void;
  deleteHolding: (id: string) => void;
  replaceHoldingsFromImport: (rows: ImportedHoldingRow[]) => void;
  mergeHoldingsFromImport: (rows: ImportedHoldingRow[]) => void;
  setSettings: (patch: Partial<Settings>) => void;
  applyPriceUpdates: (entries: PriceEntry[]) => void;
  recordCurrentSnapshot: (totalValue: number) => void;
}

const PortfolioContext = createContext<PortfolioContextValue | null>(null);

export function PortfolioProvider({ children }: { children: ReactNode }) {
  const [holdings, setHoldings] = useLocalStorage<Holding[]>(storageKey('holdings'), []);
  const [settings, setSettingsState] = useLocalStorage<Settings>(storageKey('settings'), DEFAULT_SETTINGS);
  const [prices, setPrices] = useLocalStorage<Record<string, PriceEntry>>(storageKey('prices'), {});
  const [snapshots, setSnapshots] = useLocalStorage<Snapshot[]>(storageKey('snapshots'), []);

  const value = useMemo<PortfolioContextValue>(() => ({
    holdings,
    settings,
    prices,
    snapshots,

    addHolding: (input) => {
      setHoldings([...holdings, { ...input, id: newId(), source: 'manual' }]);
    },

    updateHolding: (id, patch) => {
      setHoldings(holdings.map((h) => (h.id === id ? { ...h, ...patch } : h)));
    },

    deleteHolding: (id) => {
      setHoldings(holdings.filter((h) => h.id !== id));
    },

    replaceHoldingsFromImport: (rows) => {
      setHoldings(
        rows.map((row) => ({
          id: newId(),
          symbol: row.symbol,
          name: row.name,
          shares: row.shares,
          avgCost: row.avgCost,
          assetClass: row.assetClass,
          source: 'import',
        })),
      );
    },

    mergeHoldingsFromImport: (rows) => {
      const next = [...holdings];
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
    },

    setSettings: (patch) => {
      setSettingsState({ ...settings, ...patch });
    },

    applyPriceUpdates: (entries) => {
      const next = { ...prices };
      for (const entry of entries) {
        next[entry.symbol] = entry;
      }
      setPrices(next);
    },

    recordCurrentSnapshot: (totalValue) => {
      setSnapshots(recordSnapshot(snapshots, totalValue));
    },
  }), [holdings, settings, prices, snapshots, setHoldings, setSettingsState, setPrices, setSnapshots]);

  return <PortfolioContext.Provider value={value}>{children}</PortfolioContext.Provider>;
}

export function usePortfolio(): PortfolioContextValue {
  const ctx = useContext(PortfolioContext);
  if (!ctx) throw new Error('usePortfolio must be used within a PortfolioProvider');
  return ctx;
}
