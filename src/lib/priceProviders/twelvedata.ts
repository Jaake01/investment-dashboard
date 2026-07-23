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

export async function fetchTwelveDataQuote(symbol: string, apiKey: string, assetClass?: AssetClass): Promise<number> {
  const exchange = assetClass ? EXCHANGE_FOR_ASSET_CLASS[assetClass] : undefined;
  const exchangeParam = exchange ? `&exchange=${encodeURIComponent(exchange)}` : '';
  const querySymbol = symbolForQuery(symbol, assetClass);
  const url = `https://api.twelvedata.com/price?symbol=${encodeURIComponent(querySymbol)}${exchangeParam}&apikey=${encodeURIComponent(apiKey)}`;
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
