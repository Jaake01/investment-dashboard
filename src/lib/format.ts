import type { Currency } from '../types';

const currencyFormatter = new Intl.NumberFormat('zh-TW', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
});

const twdFormatter = new Intl.NumberFormat('zh-TW', {
  style: 'currency',
  currency: 'TWD',
  maximumFractionDigits: 0,
});

const usdcNumberFormatter = new Intl.NumberFormat('zh-TW', {
  maximumFractionDigits: 2,
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
  return `${sign}${value.toFixed(2)}%`;
}
