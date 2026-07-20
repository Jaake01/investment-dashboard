import { useState } from 'react';
import { usePortfolio } from '../context/PortfolioContext';
import { getProvider, PriceFetchError } from '../lib/priceProviders';
import { computeHoldingMetrics, computePortfolioTotals } from '../lib/calculations';
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
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const refreshPrices = async () => {
    const provider = getProvider(settings.priceProvider);
    if (!provider) {
      setErrors(['請先在設定中選擇報價來源']);
      return;
    }
    if (!settings.apiKey.trim()) {
      setErrors(['請先在設定中輸入 API key']);
      return;
    }

    const now = Date.now();
    const symbols = Array.from(
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

    if (symbols.length === 0) {
      setErrors([]);
      return;
    }

    setIsRefreshing(true);
    setErrors([]);
    const fetchedEntries: PriceEntry[] = [];
    const fetchErrors: string[] = [];
    const delay = REQUEST_DELAY_MS[provider.id] ?? 1000;

    for (let i = 0; i < symbols.length; i++) {
      const symbol = symbols[i];
      try {
        const price = await provider.fetchQuote(symbol, settings.apiKey);
        fetchedEntries.push({ symbol, price, updatedAt: new Date().toISOString() });
      } catch (err) {
        fetchErrors.push(err instanceof PriceFetchError ? err.message : `${symbol}：報價失敗`);
      }
      if (i < symbols.length - 1) {
        await sleep(delay);
      }
    }

    if (fetchedEntries.length > 0) {
      applyPriceUpdates(fetchedEntries);
      const mergedPrices = { ...prices };
      for (const entry of fetchedEntries) {
        mergedPrices[entry.symbol] = entry;
      }
      const metrics = holdings.map((h) => computeHoldingMetrics(h, mergedPrices));
      const totals = computePortfolioTotals(metrics);
      recordCurrentSnapshot(totals.totalMarketValue);
    }

    setErrors(fetchErrors);
    setIsRefreshing(false);
  };

  return { refreshPrices, isRefreshing, errors };
}
