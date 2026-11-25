import { useState } from 'react';
import { usePortfolio } from '../context/PortfolioContext';
import { fetchTwelveDataQuote } from '../lib/priceProviders/twelvedata';
import { PriceFetchError } from '../lib/priceProviders/errors';
import { activeApiKeyFor } from '../types';

// Manual-only, like usePrices.ts: the FX rate is fetched solely by the
// 「立即刷新報價」 button (RefreshControl), alongside prices.
export function useFxRate() {
  const { settings, fxRate, setFxRate } = usePortfolio();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');

  const canAutoFetch = settings.priceProvider === 'twelvedata' && activeApiKeyFor(settings).trim().length > 0;

  // USD/TWD and JPY/TWD are fetched independently — one failing (e.g. Twelve
  // Data doesn't have a quote for it) shouldn't block the other. A rate that
  // fails to fetch keeps its last known value rather than being cleared.
  const refreshFxRate = async () => {
    if (!canAutoFetch) {
      setError('自動抓匯率需要選擇 Twelve Data 並填入 API key');
      return;
    }
    setIsRefreshing(true);
    const apiKey = activeApiKeyFor(settings);
    const errors: string[] = [];
    let usdToTwd = fxRate?.usdToTwd;
    let jpyToTwd = fxRate?.jpyToTwd;

    try {
      usdToTwd = (await fetchTwelveDataQuote('USD/TWD', apiKey)).price;
    } catch (err) {
      errors.push(err instanceof PriceFetchError ? err.message : 'USD/TWD 匯率刷新失敗');
    }
    try {
      jpyToTwd = (await fetchTwelveDataQuote('JPY/TWD', apiKey)).price;
    } catch (err) {
      errors.push(err instanceof PriceFetchError ? err.message : 'JPY/TWD 匯率刷新失敗');
    }

    if (usdToTwd !== undefined) {
      setFxRate({ usdToTwd, jpyToTwd, updatedAt: new Date().toISOString(), source: 'auto' });
    }
    // Deduped — a flat-rate-limit failure (see twelvedata.ts's 429 handling)
    // throws the exact same message for both pairs, which would otherwise
    // join into one confusing "msg；msg" string instead of showing once.
    setError(Array.from(new Set(errors)).join('；'));
    setIsRefreshing(false);
  };

  const effectiveUsdToTwd = fxRate?.usdToTwd ?? null;
  const effectiveJpyToTwd = fxRate?.jpyToTwd ?? null;
  const updatedAt = fxRate?.updatedAt ?? null;

  return { refreshFxRate, isRefreshing, error, canAutoFetch, effectiveUsdToTwd, effectiveJpyToTwd, updatedAt };
}
