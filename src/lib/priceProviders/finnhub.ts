import type { AssetClass } from '../../types';
import { PriceFetchError } from './errors';

interface FinnhubQuoteResponse {
  c: number;
  h: number;
  l: number;
  o: number;
  pc: number;
  t: number;
}

export async function fetchFinnhubQuote(symbol: string, apiKey: string, assetClass?: AssetClass): Promise<number> {
  if (assetClass === 'crypto') {
    // Finnhub's /quote endpoint has no crypto pair support — a bare ticker
    // like "BTC" can silently match an unrelated stock instead of failing,
    // which is why crypto prices looked wrong rather than just missing.
    throw new PriceFetchError(`${symbol}：Finnhub 不支援加密貨幣報價，請改用 Twelve Data`);
  }
  const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(apiKey)}`;
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw new PriceFetchError(`${symbol}：無法連線到 Finnhub`);
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new PriceFetchError(`${symbol}：Finnhub 回應錯誤（HTTP ${response.status}）${detail ? `：${detail.slice(0, 200)}` : ''}`);
  }
  const data = (await response.json()) as FinnhubQuoteResponse;
  if (!data || typeof data.c !== 'number' || data.c === 0) {
    throw new PriceFetchError(`${symbol}：找不到報價，請確認代號是否正確`);
  }
  return data.c;
}
