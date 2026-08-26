import { useEffect, useState } from 'react';
import { usePortfolio } from '../context/PortfolioContext';
import { getProvider, PriceFetchError } from '../lib/priceProviders';
import { computeClassValues, computeHoldingMetrics, computeSymbolValues, computeTotalInTwd } from '../lib/calculations';
import { computeCashLedgerTwdTotal } from '../lib/cashLedger';
import { CsvImportError } from '../lib/csv';
import { fetchQuoteSheet } from '../lib/quoteSheet';
import { useFxRate } from './useFxRate';
import { activeApiKeyFor, type PriceEntry } from '../types';

const MIN_REFRESH_INTERVAL_MS = 60_000;
const AUTO_REFRESH_INTERVAL_MS = 30 * 60_000;
// Twelve Data paces itself internally now (see the shared throttle in
// lib/priceProviders/twelvedata.ts, which also covers useFxRate's calls) —
// pacing it again here on top of that would just double the wait for no
// reason. Finnhub has no such shared throttle, so it still paces itself here.
const REQUEST_DELAY_MS: Record<string, number> = {
  finnhub: 250,
  twelvedata: 0,
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Module-scoped (not per-component), same reasoning and shape as
// useAutoSync's syncInterval/syncedSheetUrl — one refresh loop shared across
// every mounted instance of usePrices (Layout, for the background behavior,
// and SettingsPanel, for the manual button), re-arming itself on a fixed
// interval instead of only ever firing once on mount. The previous version
// fetched exactly once per page load and never again, so prices went stale
// for the rest of the session no matter how long the page stayed open.
let refreshInterval: ReturnType<typeof setInterval> | null = null;
let refreshingKey: string | null = null;
// The interval callback currently in effect, kept module-scoped alongside
// refreshInterval/refreshingKey so the visibilitychange listener below (also
// module-scoped, attached once) can call/restart the *current* owning
// instance's refreshPrices closure without every instance needing its own
// listener.
let activeRefresh: (() => void) | null = null;
let visibilityListenerAttached = false;

// A backgrounded tab still burns through Twelve Data's daily credit budget
// on a schedule nobody's watching — pausing here while hidden, then catching
// up immediately on refocus, was the fix once we found real usage blowing
// through the free tier's 800/day limit well before the day was over.
function handlePricesVisibilityChange() {
  if (document.visibilityState === 'hidden') {
    if (refreshInterval) {
      clearInterval(refreshInterval);
      refreshInterval = null;
    }
    return;
  }
  if (!activeRefresh) return;
  activeRefresh();
  if (!refreshInterval) refreshInterval = setInterval(activeRefresh, AUTO_REFRESH_INTERVAL_MS);
}

export function usePrices() {
  const { holdings, settings, prices, cashBalances, applyPriceUpdates, recordCurrentSnapshot } = usePortfolio();
  const { effectiveUsdToTwd, effectiveJpyToTwd } = useFxRate();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const refreshPrices = async () => {
    const now = Date.now();
    const staleSymbols = Array.from(
      new Set(
        holdings
          .map((h) => h.symbol.trim())
          .filter((symbol) => symbol.length > 0)
          .filter((symbol) => {
            const cached = prices[symbol];
            if (!cached) return true;
            return now - new Date(cached.updatedAt).getTime() > MIN_REFRESH_INTERVAL_MS;
          }),
      ),
    );

    if (staleSymbols.length === 0) {
      setErrors([]);
      return;
    }

    setIsRefreshing(true);
    setErrors([]);
    const fetchedEntries: PriceEntry[] = [];
    const fetchErrors: string[] = [];

    // TW quotes via a Google Sheet GOOGLEFINANCE tab take priority for any
    // symbol it covers — Finnhub/Twelve Data's free tiers don't reliably
    // cover TWSE. Matched by symbol, not assetClass, since a TW high-dividend
    // ETF/bond fund someone tracks under 現金 instead of 台股 is still the
    // same TW-listed symbol the sheet quotes. Anything the sheet doesn't
    // cover falls through to the provider.
    let remainingSymbols = staleSymbols;
    if (settings.twQuoteSheetUrl.trim()) {
      try {
        const twQuotes = await fetchQuoteSheet(settings.twQuoteSheetUrl);
        remainingSymbols = staleSymbols.filter((symbol) => {
          const quote = twQuotes[symbol];
          if (quote !== undefined) {
            fetchedEntries.push({ symbol, price: quote.price, changePercent: quote.changePercent, updatedAt: new Date().toISOString() });
            return false;
          }
          return true;
        });
      } catch (err) {
        fetchErrors.push(err instanceof CsvImportError ? err.message : '台股報價 Sheet 讀取失敗');
      }
    }

    if (remainingSymbols.length > 0) {
      const provider = getProvider(settings.priceProvider);
      const apiKey = activeApiKeyFor(settings);
      if (!provider) {
        fetchErrors.push('請先在設定中選擇報價來源，或設定台股報價 Sheet');
      } else if (!apiKey.trim()) {
        fetchErrors.push('請先在設定中輸入 API key');
      } else {
        const delay = REQUEST_DELAY_MS[provider.id] ?? 1000;
        for (let i = 0; i < remainingSymbols.length; i++) {
          const symbol = remainingSymbols[i];
          const assetClass = holdings.find((h) => h.symbol.trim() === symbol)?.assetClass;
          try {
            const { price, changePercent } = await provider.fetchQuote(symbol, apiKey, assetClass);
            fetchedEntries.push({ symbol, price, changePercent, updatedAt: new Date().toISOString() });
          } catch (err) {
            fetchErrors.push(err instanceof PriceFetchError ? err.message : `${symbol}：報價失敗`);
          }
          if (i < remainingSymbols.length - 1) {
            await sleep(delay);
          }
        }
      }
    }

    if (fetchedEntries.length > 0) {
      applyPriceUpdates(fetchedEntries);
      const mergedPrices = { ...prices };
      for (const entry of fetchedEntries) {
        mergedPrices[entry.symbol] = entry;
      }
      const metrics = holdings.map((h) => computeHoldingMetrics(h, mergedPrices));
      const totalTwd = computeTotalInTwd(metrics, effectiveUsdToTwd);
      if (totalTwd !== null) {
        // Cash-ledger balances aren't Holdings, so they're folded into the
        // snapshot total (and the 現金 classValues bucket, for the pie
        // chart's day-change tracking) here rather than inside
        // computeTotalInTwd/computeClassValues — keeps 較昨日/趨勢圖
        // consistent with PortfolioSummary's "total including cash ledger".
        const cashLedgerTwd = computeCashLedgerTwdTotal(cashBalances, effectiveUsdToTwd, effectiveJpyToTwd);
        const classValues = computeClassValues(metrics);
        if (cashLedgerTwd !== 0) {
          classValues.cash = (classValues.cash ?? 0) + cashLedgerTwd;
        }
        recordCurrentSnapshot(totalTwd + cashLedgerTwd, classValues, computeSymbolValues(metrics));
      }
    }

    setErrors(fetchErrors);
    setIsRefreshing(false);
  };

  useEffect(() => {
    const hasProvider = settings.priceProvider !== 'none' && activeApiKeyFor(settings).trim().length > 0;
    const hasTwSheet = settings.twQuoteSheetUrl.trim().length > 0;
    const enabled = (hasProvider || hasTwSheet) && holdings.length > 0;
    const key = enabled
      ? `${settings.priceProvider}|${activeApiKeyFor(settings)}|${settings.twQuoteSheetUrl}|${holdings.length}`
      : null;

    if (!key) {
      if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
      }
      refreshingKey = null;
      activeRefresh = null;
      return;
    }
    if (refreshingKey === key) return; // another mounted instance already refreshes this configuration

    refreshingKey = key;
    activeRefresh = refreshPrices;
    if (refreshInterval) clearInterval(refreshInterval);
    refreshInterval = null;

    if (!visibilityListenerAttached) {
      document.addEventListener('visibilitychange', handlePricesVisibilityChange);
      visibilityListenerAttached = true;
    }

    // Tab is backgrounded right now — defer both the immediate refresh and
    // the interval to handlePricesVisibilityChange, whenever it next becomes
    // visible, instead of spending credits on a tab nobody's watching.
    if (document.visibilityState === 'hidden') return;

    refreshPrices();
    refreshInterval = setInterval(refreshPrices, AUTO_REFRESH_INTERVAL_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.priceProvider, settings.finnhubApiKey, settings.twelveDataApiKey, settings.twQuoteSheetUrl, holdings.length]);

  return { refreshPrices, isRefreshing, errors };
}
