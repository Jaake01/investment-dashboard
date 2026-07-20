import type { Snapshot } from '../types';
import { todayDateString } from '../lib/calculations';

export function recordSnapshot(snapshots: Snapshot[], totalValue: number, date: string = todayDateString()): Snapshot[] {
  const existingIndex = snapshots.findIndex((s) => s.date === date);
  if (existingIndex >= 0) {
    const updated = [...snapshots];
    updated[existingIndex] = { date, totalValue };
    return updated;
  }
  return [...snapshots, { date, totalValue }].sort((a, b) => a.date.localeCompare(b.date));
}
