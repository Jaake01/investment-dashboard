import { useEffect, useState } from 'react';
import { usePortfolio } from '../context/PortfolioContext';
import { fetchTwelveDataQuote } from '../lib/priceProviders/twelvedata';
import { PriceFetchError } from '../lib/priceProviders/errors';
import { activeApiKeyFor } from '../types';

const MIN_REFRESH_INTERVAL_MS = 5 * 60_000;
const AUTO_REFRESH_INTERVAL_MS = 15 * 60_000;

// Module-scoped (not per-component), same reasoning and shape as
// useAutoSync's syncInterval/syncedSheetUrl — one refresh loop shared across
// every mounted instance of useFxRate, re-arming itself on a fixed interval
// instead of only ever firing once on mount. The previous version fetched
// exactly once per page load and never again, so the rate went stale for the
// rest of the session no matter how long the page stayed open.
let refreshInterval: ReturnType<typeof setInterval> | null = null;
let refreshingKey: string | null = null;

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
    setError(errors.join('；'));
    setIsRefreshing(false);
  };

  useEffect(() => {
    const key = canAutoFetch ? activeApiKeyFor(settings) : null;
    if (!key) {
      if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
        refreshingKey = null;
      }
      return;
    }
    if (refreshingKey === key) return; // another mounted instance already refreshes this key

    refreshingKey = key;
    if (refreshInterval) clearInterval(refreshInterval);
    const isStale = !fxRate || Date.now() - new Date(fxRate.updatedAt).getTime() > MIN_REFRESH_INTERVAL_MS;
    if (isStale) refreshFxRate();
    refreshInterval = setInterval(refreshFxRate, AUTO_REFRESH_INTERVAL_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAutoFetch]);

  const effectiveUsdToTwd = fxRate?.usdToTwd ?? null;
  const effectiveJpyToTwd = fxRate?.jpyToTwd ?? null;
  const updatedAt = fxRate?.updatedAt ?? null;

  return { refreshFxRate, isRefreshing, error, canAutoFetch, effectiveUsdToTwd, effectiveJpyToTwd, updatedAt };
}
