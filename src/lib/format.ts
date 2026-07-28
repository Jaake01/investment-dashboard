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

// hl/gl/ceid=zh-TW bias Google News toward Chinese-language sources/UI.
export function googleNewsUrlFor(symbol: string): string {
  const query = `${symbol} when:7d`;
  return `https://news.google.com/search?q=${encodeURIComponent(query)}&hl=zh-TW&gl=TW&ceid=TW:zh-Hant`;
}
