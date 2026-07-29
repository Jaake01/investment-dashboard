import type { AssetClass } from '../../types';
import { looksLikeTwSymbol } from '../symbolClass';
import { PriceFetchError } from './errors';
import type { QuoteResult } from './index';

interface TwelveDataQuoteResponse {
  close?: string;
  percent_change?: string;
  code?: number;
  message?: string;
}

// There's no bare "BTC" instrument — crypto has to be queried as a trading
// pair (same "BASE/QUOTE" convention this app already uses for the USD/TWD
// FX rate). A bare symbol either 404s or, worse, silently matches an
// unrelated instrument that happens to share the ticker, which is why crypto
// prices looked wrong before this. This app treats crypto as ~USD (USDC
// 1:1), so pairing against USD gives the right price.
function symbolForQuery(symbol: string, assetClass?: AssetClass): string {
  if (assetClass === 'crypto' && !symbol.includes('/')) return `${symbol}/USD`;
  return symbol;
}

export async function fetchTwelveDataQuote(symbol: string, apiKey: string, assetClass?: AssetClass): Promise<QuoteResult> {
  // Based on the symbol's own shape (numeric = TW-listed), not the holding's
  // assetClass — a TW high-dividend ETF tracked under 現金 instead of 台股
  // still needs the exchange hint to resolve correctly.
  const exchangeParam = looksLikeTwSymbol(symbol) ? `&exchange=${encodeURIComponent('TWSE')}` : '';
  const querySymbol = symbolForQuery(symbol, assetClass);
  const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(querySymbol)}${exchangeParam}&apikey=${encodeURIComponent(apiKey)}`;
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw new PriceFetchError(`${symbol}：無法連線到 Twelve Data`);
  }
  if (!response.ok) {
    let detail = '';
    try {
      const errJson = (await response.clone().json()) as TwelveDataQuoteResponse;
      detail = errJson.message ?? '';
    } catch {
      detail = await response.text().catch(() => '');
    }
    throw new PriceFetchError(`${symbol}：Twelve Data 回應錯誤（HTTP ${response.status}）${detail ? `：${detail.slice(0, 200)}` : ''}`);
  }
  const data = (await response.json()) as TwelveDataQuoteResponse;
  if (!data.close) {
    throw new PriceFetchError(`${symbol}：${data.message ?? '找不到報價'}`);
  }
  const price = Number(data.close);
  if (Number.isNaN(price)) {
    throw new PriceFetchError(`${symbol}：Twelve Data 回傳的價格無法解析`);
  }
  const changePercent = data.percent_change !== undefined ? Number(data.percent_change) : undefined;
  return { price, changePercent: changePercent !== undefined && !Number.isNaN(changePercent) ? changePercent : undefined };
}
