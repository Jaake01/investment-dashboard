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

export function formatCurrency(value: number): string {
  return currencyFormatter.format(value);
}

export function formatCurrencyIn(value: number, currency: Currency): string {
  if (currency === 'TWD') return twdFormatter.format(value);
  if (currency === 'USDC') return `${usdcNumberFormatter.format(value)} U`;
  return currencyFormatter.format(value);
}

// Plain "$" prefix regardless of the holding's actual currency — used in the
// holdings table where the asset-class tabs already give currency context,
// so per-row "US$"/"NT$"/"U" labels are more clutter than signal.
export function formatDollar(value: number): string {
  const sign = value < 0 ? '-' : '';
  return `${sign}$${usdcNumberFormatter.format(Math.abs(value))}`;
}

export function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

// Crypto commonly needs sub-1 precision (e.g. 0.05 BTC) to stay meaningful;
// other asset classes round to a tidier 1 decimal place.
export function formatShares(value: number, assetClass: AssetClass): string {
  return assetClass === 'crypto' ? numberFormatter.format(value) : roundedSharesFormatter.format(value);
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
    q: symbol,
    tbm: 'nws',
    tbs: 'qdr:w,sbd:1',
    hl: 'zh-TW',
    gl: 'TW',
  });
  return `https://www.google.com/search?${params.toString()}`;
}
