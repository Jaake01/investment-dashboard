import type { AssetClass } from '../../types';
import { PriceFetchError } from './errors';

interface TwelveDataPriceResponse {
  price?: string;
  code?: number;
  message?: string;
}

// Plain tickers like "2330" collide across exchanges, so non-US symbols need
// an explicit exchange hint or Twelve Data can't resolve which listing you mean.
const EXCHANGE_FOR_ASSET_CLASS: Partial<Record<AssetClass, string>> = {
  tw_stock: 'TWSE',
};

export async function fetchTwelveDataQuote(symbol: string, apiKey: string, assetClass?: AssetClass): Promise<number> {
  const exchange = assetClass ? EXCHANGE_FOR_ASSET_CLASS[assetClass] : undefined;
  const exchangeParam = exchange ? `&exchange=${encodeURIComponent(exchange)}` : '';
  const url = `https://api.twelvedata.com/price?symbol=${encodeURIComponent(symbol)}${exchangeParam}&apikey=${encodeURIComponent(apiKey)}`;
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw new PriceFetchError(`${symbol}：無法連線到 Twelve Data`);
  }
  if (!response.ok) {
    let detail = '';
    try {
      const errJson = (await response.clone().json()) as TwelveDataPriceResponse;
      detail = errJson.message ?? '';
    } catch {
      detail = await response.text().catch(() => '');
    }
    throw new PriceFetchError(`${symbol}：Twelve Data 回應錯誤（HTTP ${response.status}）${detail ? `：${detail.slice(0, 200)}` : ''}`);
  }
  const data = (await response.json()) as TwelveDataPriceResponse;
  if (!data.price) {
    throw new PriceFetchError(`${symbol}：${data.message ?? '找不到報價'}`);
  }
  const price = Number(data.price);
  if (Number.isNaN(price)) {
    throw new PriceFetchError(`${symbol}：Twelve Data 回傳的價格無法解析`);
  }
  return price;
}
