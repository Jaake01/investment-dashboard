import { useEffect, useState } from 'react';
import { usePortfolio } from '../context/PortfolioContext';
import { fetchTwelveDataQuote } from '../lib/priceProviders/twelvedata';
import { PriceFetchError } from '../lib/priceProviders/errors';

const MIN_REFRESH_INTERVAL_MS = 5 * 60_000;

// Module-scoped (not per-component) so multiple components calling useFxRate()
// on the same page load don't each fire their own redundant auto-fetch.
let hasAutoFetchedOnMount = false;

export function useFxRate() {
  const { settings, fxRate, setFxRate } = usePortfolio();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');

  const canAutoFetch = settings.priceProvider === 'twelvedata' && settings.apiKey.trim().length > 0;

  const refreshFxRate = async () => {
    if (!canAutoFetch) {
      setError('自動抓匯率需要選擇 Twelve Data 並填入 API key');
      return;
    }
    setIsRefreshing(true);
    setError('');
    try {
      const usdToTwd = await fetchTwelveDataQuote('USD/TWD', settings.apiKey);
      setFxRate({ usdToTwd, updatedAt: new Date().toISOString(), source: 'auto' });
    } catch (err) {
      setError(err instanceof PriceFetchError ? err.message : '匯率刷新失敗');
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (hasAutoFetchedOnMount) return;
    if (!canAutoFetch) return;
    const isStale = !fxRate || Date.now() - new Date(fxRate.updatedAt).getTime() > MIN_REFRESH_INTERVAL_MS;
    if (!isStale) return;
    hasAutoFetchedOnMount = true;
    refreshFxRate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAutoFetch]);

  const effectiveUsdToTwd = fxRate?.usdToTwd ?? null;
  const updatedAt = fxRate?.updatedAt ?? null;

  return { refreshFxRate, isRefreshing, error, canAutoFetch, effectiveUsdToTwd, updatedAt };
}
