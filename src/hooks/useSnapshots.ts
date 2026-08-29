import type { AssetClass, Snapshot } from '../types';
import { todayDateString } from '../lib/calculations';

export interface SnapshotInput {
  totalValue: number;
  totalCost?: number;
  classValues: Partial<Record<AssetClass, number>>;
  classCostValues?: Partial<Record<AssetClass, number>>;
  symbolValues: Record<string, number>;
  symbolCostValues?: Record<string, number>;
}

export function recordSnapshot(snapshots: Snapshot[], input: SnapshotInput, date: string = todayDateString()): Snapshot[] {
  const entry: Snapshot = { date, ...input };
  const existingIndex = snapshots.findIndex((s) => s.date === date);
  if (existingIndex >= 0) {
    const updated = [...snapshots];
    updated[existingIndex] = entry;
    return updated;
  }
  return [...snapshots, entry].sort((a, b) => a.date.localeCompare(b.date));
}
