import type { AssetClass, Currency } from '../types';

const currencyFormatter = new Intl.NumberFormat('zh-TW', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

const twdFormatter = new Intl.NumberFormat('zh-TW', {
  style: 'currency',
  currency: 'TWD',
  maximumFractionDigits: 0,
});

const usdcNumberFormatter = new Intl.NumberFormat('zh-TW', {
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat('zh-TW', {
  maximumFractionDigits: 4,
});

const roundedSharesFormatter = new Intl.NumberFormat('zh-TW', {
  maximumFractionDigits: 1,
});

// Tiered precision — fewer decimals as the integer part gets wider, so a
// value keeps roughly the same number of significant digits whether it's a
// sub-$10 price/quantity or a $1000+ one, instead of a fixed decimal count
// that's either noisy for small values or falsely precise for large ones.
const tier1Formatter = new Intl.NumberFormat('zh-TW', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const tier2Formatter = new Intl.NumberFormat('zh-TW', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const tier3Formatter = new Intl.NumberFormat('zh-TW', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function formatCurrency(value: number): string {
  return currencyFormatter.format(value);
}

export function formatCurrencyIn(value: number, currency: Currency): string {
  if (currency === 'TWD') return twdFormatter.format(value);
  if (currency === 'USDC') return `${usdcNumberFormatter.format(value)} U`;
  return currencyFormatter.format(value);
}

// Plain magnitude with thousands separator, no currency symbol — pairs with
// a currency label rendered as its own left-aligned column (see .money-cell
// in index.css) so the label and the digits each line up down the column
// regardless of how wide the label is (e.g. "$" vs "US$").
export function formatAmount(value: number): string {
  const sign = value < 0 ? '-' : '';
  return `${sign}${usdcNumberFormatter.format(Math.abs(value))}`;
}

export function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

// <10: 3 decimals, <100: 2, <1000: 1, >=1000: whole number.
export function formatTiered(value: number): string {
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  if (abs < 10) return `${sign}${tier1Formatter.format(abs)}`;
  if (abs < 100) return `${sign}${tier2Formatter.format(abs)}`;
  if (abs < 1000) return `${sign}${tier3Formatter.format(abs)}`;
  return `${sign}${usdcNumberFormatter.format(abs)}`;
}

// Crypto commonly needs sub-1 precision (e.g. 0.05 BTC) to stay meaningful,
// so it uses the same tiered precision as price/avgCost; other asset
// classes round to a tidier fixed 1 decimal place.
export function formatShares(value: number, assetClass: AssetClass): string {
  return assetClass === 'crypto' ? formatTiered(value) : roundedSharesFormatter.format(value);
}

// Signed plain number, no currency symbol — used for 損益 where the $/NT$/U
// prefix would be redundant with the 市值/現價 columns right next to it.
export function formatSignedNumber(value: number): string {
  const sign = value < 0 ? '-' : value > 0 ? '+' : '';
  return `${sign}${usdcNumberFormatter.format(Math.abs(value))}`;
}

export function formatPercent(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

// Uses the classic www.google.com News-tab search (tbm=nws) so tbs=sbd:1 can
// force a true date sort (news.google.com has no such param). The earlier
// attempt at this combined tbm=nws with the "when:7d" text operator, which
// only news.google.com itself recognizes — on the classic search it was
// parsed as literal search text, which is almost certainly why so many
// holdings turned up zero results. The date range now comes from tbs=qdr:w
// (past week) instead, not from query text.
export function googleNewsUrlFor(symbol: string): string {
  const params = new URLSearchParams({
    // Appending "新聞" biases results toward Chinese-language coverage —
    // searching the bare ticker (e.g. "BTC") mostly surfaces English
    // financial news even with hl/gl set to zh-TW/TW.
    q: `${symbol} 新聞`,
    tbm: 'nws',
    tbs: 'qdr:w,sbd:1',
    hl: 'zh-TW',
    gl: 'TW',
  });
  return `https://www.google.com/search?${params.toString()}`;
}
