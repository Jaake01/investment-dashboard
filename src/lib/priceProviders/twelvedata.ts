import { PriceFetchError } from './errors';

interface TwelveDataPriceResponse {
  price?: string;
  code?: number;
  message?: string;
}

export async function fetchTwelveDataQuote(symbol: string, apiKey: string): Promise<number> {
  const url = `https://api.twelvedata.com/price?symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(apiKey)}`;
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw new PriceFetchError(`${symbol}：無法連線到 Twelve Data`);
  }
  if (!response.ok) {
    throw new PriceFetchError(`${symbol}：Twelve Data 回應錯誤（HTTP ${response.status}）`);
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
