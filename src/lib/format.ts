import type { Currency } from '../types';

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

export function formatCurrency(value: number): string {
  return currencyFormatter.format(value);
}

export function formatCurrencyIn(value: number, currency: Currency): string {
  if (currency === 'TWD') return twdFormatter.format(value);
  if (currency === 'USDC') return `${usdcNumberFormatter.format(value)} U`;
  return currencyFormatter.format(value);
}

export function formatNumber(value: number): string {
  return numberFormatter.format(value);
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
