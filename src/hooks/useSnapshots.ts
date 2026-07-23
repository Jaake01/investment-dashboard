import type { AssetClass, Snapshot } from '../types';
import { todayDateString } from '../lib/calculations';

export function recordSnapshot(
  snapshots: Snapshot[],
  totalValue: number,
  classValues: Partial<Record<AssetClass, number>>,
  symbolValues: Record<string, number>,
  date: string = todayDateString(),
): Snapshot[] {
  const entry: Snapshot = { date, totalValue, classValues, symbolValues };
  const existingIndex = snapshots.findIndex((s) => s.date === date);
  if (existingIndex >= 0) {
    const updated = [...snapshots];
    updated[existingIndex] = entry;
    return updated;
  }
  return [...snapshots, entry].sort((a, b) => a.date.localeCompare(b.date));
}
