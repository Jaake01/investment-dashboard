import type { AssetClass, PriceProviderId } from '../../types';
import { fetchFinnhubQuote } from './finnhub';
import { fetchTwelveDataQuote } from './twelvedata';

export interface ProviderAdapter {
  id: PriceProviderId;
  label: string;
  fetchQuote(symbol: string, apiKey: string, assetClass?: AssetClass): Promise<number>;
}

export { PriceFetchError } from './errors';

const finnhub: ProviderAdapter = {
  id: 'finnhub',
  label: 'Finnhub',
  fetchQuote: fetchFinnhubQuote,
};

const twelvedata: ProviderAdapter = {
  id: 'twelvedata',
  label: 'Twelve Data',
  fetchQuote: fetchTwelveDataQuote,
};

export const PRICE_PROVIDERS: Record<Exclude<PriceProviderId, 'none'>, ProviderAdapter> = {
  finnhub,
  twelvedata,
};

export function getProvider(id: PriceProviderId): ProviderAdapter | null {
  if (id === 'none') return null;
  return PRICE_PROVIDERS[id];
}
