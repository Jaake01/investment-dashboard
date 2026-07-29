import type { AssetClass } from '../types';

const KNOWN_CRYPTO_SYMBOLS = new Set([
  'BTC', 'ETH', 'USDT', 'USDC', 'SOL', 'XRP', 'DOGE', 'ADA', 'BNB',
  'LTC', 'DOT', 'MATIC', 'LINK', 'AVAX', 'SHIB', 'TRX', 'UNI', 'ATOM',
]);

// Taiwan-listed tickers are purely numeric (e.g. 2330, 0056) — US tickers
// never are. Used both to guess the class below and to route TW-specific
// quote handling (Twelve Data exchange hint) for holdings tagged with a
// different class on purpose (e.g. a TW high-dividend ETF someone tracks
// under 現金 instead of 台股).
export function looksLikeTwSymbol(symbol: string): boolean {
  return /^\d+$/.test(symbol.trim());
}

// Best-effort default so users don't have to manually pick a class for the
// common cases: numeric codes are Taiwan-listed tickers, known crypto
// tickers are crypto, everything else defaults to a US stock. This is only
// ever a starting point — the class field stays editable for anything it
// gets wrong (cash, other, etc).
export function guessAssetClassFromSymbol(symbol: string): AssetClass {
  const s = symbol.trim().toUpperCase();
  if (!s) return 'us_stock';
  if (KNOWN_CRYPTO_SYMBOLS.has(s)) return 'crypto';
  if (looksLikeTwSymbol(s)) return 'tw_stock';
  return 'us_stock';
}
