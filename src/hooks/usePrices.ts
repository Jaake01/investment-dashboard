import { useState } from 'react';
import { usePortfolio } from '../context/PortfolioContext';
import { getProvider, PriceFetchError } from '../lib/priceProviders';
import {
  computeClassCostValues,
  computeClassValues,
  computeHoldingMetrics,
  computeSymbolCostValues,
  computeSymbolValues,
  computeTotalCostInTwd,
  computeTotalInTwd,
} from '../lib/calculations';
import { computeCashLedgerTwdTotal } from '../lib/cashLedger';
import { CsvImportError } from '../lib/csv';
import { fetchPriceHistorySheet, lookupQuote } from '../lib/priceHistorySheet';
import { useFxRate } from './useFxRate';
import { activeApiKeyFor, type PriceEntry } from '../types';

const MIN_REFRESH_INTERVAL_MS = 60_000;
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

// Manual-only: prices are fetched solely by the 「立即刷新報價」 button
// (RefreshControl). There used to be a windowed hourly auto-refresh here, but
// it only ran during set hours, missed most of the US session, and spent
// Twelve Data credits on its own schedule — refreshing on demand gives the
// latest quote exactly when it's being looked at.
export function usePrices() {
  const { holdings, settings, prices, cashBalances, applyPriceUpdates, recordCurrentSnapshot } = usePortfolio();
  const { effectiveUsdToTwd, effectiveJpyToTwd } = useFxRate();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  // `force` skips the MIN_REFRESH_INTERVAL_MS staleness gate below — used by
  // the manual "立即刷新報價" button (RefreshControl), so clicking it always
  // fetches every symbol right away instead of silently no-oping (and
  // leaving 最後刷新 looking frozen) whenever a scheduled refresh happened to
  // run within the last minute. The scheduled/mount-triggered calls above
  // keep the default (gated) behavior.
  const refreshPrices = async (force = false) => {
    const now = Date.now();
    const staleSymbols = Array.from(
      new Set(
        holdings
          .map((h) => h.symbol.trim())
          .filter((symbol) => symbol.length > 0)
          .filter((symbol) => {
            if (force) return true;
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

    // TW quotes via the GAS-maintained 股價歷史 Sheet take priority for any
    // symbol it covers — Finnhub/Twelve Data's free tiers don't reliably
    // cover TWSE. Matched by symbol, not assetClass, since a TW high-dividend
    // ETF/bond fund someone tracks under 現金 instead of 台股 is still the
    // same TW-listed symbol the sheet quotes. Anything the sheet doesn't
    // cover falls through to the provider.
    let remainingSymbols = staleSymbols;
    if (settings.priceHistorySheetUrl.trim()) {
      try {
        const twQuotes = await fetchPriceHistorySheet(settings.priceHistorySheetUrl);
        remainingSymbols = staleSymbols.filter((symbol) => {
          const quote = lookupQuote(twQuotes, symbol);
          if (quote !== undefined) {
            fetchedEntries.push({ symbol, price: quote.price, changePercent: quote.changePercent, updatedAt: new Date().toISOString() });
            return false;
          }
          return true;
        });
      } catch (err) {
        fetchErrors.push(err instanceof CsvImportError ? err.message : '股價歷史 Sheet 讀取失敗');
      }
    }

    if (remainingSymbols.length > 0) {
      const provider = getProvider(settings.priceProvider);
      const apiKey = activeApiKeyFor(settings);
      if (!provider) {
        fetchErrors.push('請先在設定中選擇報價來源，或設定股價歷史 Sheet');
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
        // A cash balance has no cost basis of its own, so it counts equally
        // toward both value and cost (0% gain) — same treatment as
        // PortfolioSummary's totalCostValue.
        const cashLedgerTwd = computeCashLedgerTwdTotal(cashBalances, effectiveUsdToTwd, effectiveJpyToTwd);
        const classValues = computeClassValues(metrics);
        const classCostValues = computeClassCostValues(metrics);
        if (cashLedgerTwd !== 0) {
          classValues.cash = (classValues.cash ?? 0) + cashLedgerTwd;
          classCostValues.cash = (classCostValues.cash ?? 0) + cashLedgerTwd;
        }
        const totalCostTwd = computeTotalCostInTwd(metrics, effectiveUsdToTwd);
        recordCurrentSnapshot({
          totalValue: totalTwd + cashLedgerTwd,
          totalCost: totalCostTwd === null ? undefined : totalCostTwd + cashLedgerTwd,
          classValues,
          classCostValues,
          symbolValues: computeSymbolValues(metrics),
          symbolCostValues: computeSymbolCostValues(metrics),
        });
      }
    }

    // Deduped — a flat-rate-limit failure (see twelvedata.ts's 429 handling)
    // throws the exact same message for every stale symbol in this refresh,
    // which would otherwise show as N near-identical entries instead of one
    // recognizable line.
    setErrors(Array.from(new Set(fetchErrors)));
    setIsRefreshing(false);
  };

  return { refreshPrices, isRefreshing, errors };
}
