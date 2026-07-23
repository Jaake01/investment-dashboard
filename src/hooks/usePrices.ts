import { useState } from 'react';
import { usePortfolio } from '../context/PortfolioContext';
import { getProvider, PriceFetchError } from '../lib/priceProviders';
import { computeClassValues, computeHoldingMetrics, computeSymbolValues, computeTotalInTwd } from '../lib/calculations';
import { CsvImportError } from '../lib/csv';
import { fetchQuoteSheet } from '../lib/quoteSheet';
import { useFxRate } from './useFxRate';
import type { PriceEntry } from '../types';

const MIN_REFRESH_INTERVAL_MS = 60_000;
const REQUEST_DELAY_MS: Record<string, number> = {
  finnhub: 250,
  twelvedata: 8_000,
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function usePrices() {
  const { holdings, settings, prices, applyPriceUpdates, recordCurrentSnapshot } = usePortfolio();
  const { effectiveUsdToTwd } = useFxRate();
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

    // TW quotes via a Google Sheet GOOGLEFINANCE tab take priority for
    // tw_stock holdings — Finnhub/Twelve Data's free tiers don't reliably
    // cover TWSE. Anything it doesn't cover falls through to the provider.
    let remainingSymbols = staleSymbols;
    if (settings.twQuoteSheetUrl.trim()) {
      try {
        const twQuotes = await fetchQuoteSheet(settings.twQuoteSheetUrl);
        remainingSymbols = staleSymbols.filter((symbol) => {
          const holding = holdings.find((h) => h.symbol.trim() === symbol);
          if (holding?.assetClass === 'tw_stock' && twQuotes[symbol] !== undefined) {
            fetchedEntries.push({ symbol, price: twQuotes[symbol], updatedAt: new Date().toISOString() });
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
      if (!provider) {
        fetchErrors.push('請先在設定中選擇報價來源，或設定台股報價 Sheet');
      } else if (!settings.apiKey.trim()) {
        fetchErrors.push('請先在設定中輸入 API key');
      } else {
        const delay = REQUEST_DELAY_MS[provider.id] ?? 1000;
        for (let i = 0; i < remainingSymbols.length; i++) {
          const symbol = remainingSymbols[i];
          const assetClass = holdings.find((h) => h.symbol.trim() === symbol)?.assetClass;
          try {
            const price = await provider.fetchQuote(symbol, settings.apiKey, assetClass);
            fetchedEntries.push({ symbol, price, updatedAt: new Date().toISOString() });
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
        recordCurrentSnapshot(totalTwd, computeClassValues(metrics), computeSymbolValues(metrics));
      }
    }

    setErrors(fetchErrors);
    setIsRefreshing(false);
  };

  return { refreshPrices, isRefreshing, errors };
}
