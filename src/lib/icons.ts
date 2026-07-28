import type { AssetClass } from '../types';

// Ticker-keyed, no-key CDNs (jsDelivr mirroring GitHub logo sets) — covers
// major crypto tickers and NYSE/NASDAQ stock logos with no lookup table
// needed. There's no equivalent free, ticker-keyed source for TW stocks
// (numeric codes aren't covered by any of these sets), so those still fall
// back to a monogram badge — as does any US ticker missing from the set,
// via the <img>'s onError handler (see TreemapCell/BubbleContent).
const CRYPTO_ICON_BASE = 'https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color';
const US_STOCK_ICON_BASE = 'https://cdn.jsdelivr.net/gh/davidepalazzo/ticker-logos@main/ticker_icons';

export function realIconUrlFor(symbol: string, assetClass: AssetClass): string | null {
  if (assetClass === 'crypto') {
    return `${CRYPTO_ICON_BASE}/${symbol.trim().toLowerCase()}.png`;
  }
  if (assetClass === 'us_stock') {
    return `${US_STOCK_ICON_BASE}/${symbol.trim().toUpperCase()}.png`;
  }
  return null;
}

export function monogramFor(symbol: string): string {
  return symbol.trim().toUpperCase().slice(0, 2);
}

// Deterministic color per symbol (not random) so the same holding always
// gets the same badge color across renders/reloads.
const MONOGRAM_COLORS = ['#4F9DDE', '#4CAF7D', '#E8735C', '#8B7FC7', '#D9A441', '#E07A9E', '#3FB6A8', '#F2955C'];

export function monogramColorFor(symbol: string): string {
  let hash = 0;
  for (let i = 0; i < symbol.length; i++) hash = (hash * 31 + symbol.charCodeAt(i)) >>> 0;
  return MONOGRAM_COLORS[hash % MONOGRAM_COLORS.length];
}
