import type { AssetClass } from '../types';

// Ticker-keyed, no-key CDN (jsDelivr mirroring the well-established
// spothq/cryptocurrency-icons GitHub set) — covers major crypto tickers with
// no lookup table needed. There's no equivalent no-key, ticker-keyed source
// for US/TW stock logos (real stock logo APIs need a domain-name mapping or
// a paid key), so those fall back to a monogram badge instead.
const CRYPTO_ICON_BASE = 'https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color';

export function realIconUrlFor(symbol: string, assetClass: AssetClass): string | null {
  if (assetClass === 'crypto') {
    return `${CRYPTO_ICON_BASE}/${symbol.trim().toLowerCase()}.png`;
  }
  return null;
}

export function monogramFor(symbol: string): string {
  return symbol.trim().toUpperCase().slice(0, 2);
}

// Deterministic color per symbol (not random) so the same holding always
// gets the same badge color across renders/reloads.
const MONOGRAM_COLORS = ['#2563eb', '#16a34a', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#db2777', '#65a30d'];

export function monogramColorFor(symbol: string): string {
  let hash = 0;
  for (let i = 0; i < symbol.length; i++) hash = (hash * 31 + symbol.charCodeAt(i)) >>> 0;
  return MONOGRAM_COLORS[hash % MONOGRAM_COLORS.length];
}
