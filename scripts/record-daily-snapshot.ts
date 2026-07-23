// Runs once a day via .github/workflows/daily-snapshot.yml (schedule
// trigger) so the portfolio's daily snapshot history gets recorded even on
// days nobody opens the dashboard in a browser. Reuses the same pure lib
// functions the React app uses in the browser (src/lib/*, useSnapshots),
// just driven from Node instead of a button click.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fetchAndParseSheet } from '../src/lib/csv';
import { fetchTwelveDataQuote } from '../src/lib/priceProviders/twelvedata';
import { fetchQuoteSheet } from '../src/lib/quoteSheet';
import {
  computeClassValues,
  computeHoldingMetrics,
  computeSymbolValues,
  computeTotalInTwd,
  todayDateString,
} from '../src/lib/calculations';
import { recordSnapshot } from '../src/hooks/useSnapshots';
import { DEFAULT_SHEET_URL } from '../src/lib/config';
import type { Holding, PriceEntry, Snapshot } from '../src/types';

const SHEET_URL = process.env.SNAPSHOT_SHEET_URL?.trim() || DEFAULT_SHEET_URL;
const TW_QUOTE_SHEET_URL = process.env.SNAPSHOT_TW_QUOTE_SHEET_URL?.trim();
const API_KEY = process.env.TWELVEDATA_API_KEY?.trim();
const OUTPUT_PATH = fileURLToPath(new URL('../public/snapshots.json', import.meta.url));
// Twelve Data's free tier rate limit — matches the delay usePrices.ts uses in the browser.
const QUOTE_DELAY_MS = 8_000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  if (!API_KEY) {
    console.error('Missing TWELVEDATA_API_KEY environment variable.');
    process.exit(1);
  }

  const rows = await fetchAndParseSheet(SHEET_URL);
  const holdings: Holding[] = rows.map((row) => ({
    id: row.symbol,
    symbol: row.symbol,
    name: row.name,
    shares: row.shares,
    avgCost: row.avgCost,
    assetClass: row.assetClass,
    source: 'import',
  }));

  const prices: Record<string, PriceEntry> = {};
  const symbols = Array.from(new Set(holdings.map((h) => h.symbol.trim()).filter(Boolean)));

  // TW quotes via a Google Sheet GOOGLEFINANCE tab take priority for
  // tw_stock holdings — Twelve Data's free tier doesn't reliably cover
  // TWSE. Mirrors the same fallback usePrices.ts uses in the browser.
  let twQuotes: Record<string, number> = {};
  if (TW_QUOTE_SHEET_URL) {
    try {
      twQuotes = await fetchQuoteSheet(TW_QUOTE_SHEET_URL);
    } catch (err) {
      console.error('TW quote sheet fetch failed:', err instanceof Error ? err.message : err);
    }
  }

  const remainingSymbols: string[] = [];
  for (const symbol of symbols) {
    const holding = holdings.find((h) => h.symbol.trim() === symbol);
    if (holding?.assetClass === 'tw_stock' && twQuotes[symbol] !== undefined) {
      prices[symbol] = { symbol, price: twQuotes[symbol], updatedAt: new Date().toISOString() };
    } else {
      remainingSymbols.push(symbol);
    }
  }

  for (let i = 0; i < remainingSymbols.length; i++) {
    const symbol = remainingSymbols[i];
    const assetClass = holdings.find((h) => h.symbol.trim() === symbol)?.assetClass;
    try {
      const price = await fetchTwelveDataQuote(symbol, API_KEY, assetClass);
      prices[symbol] = { symbol, price, updatedAt: new Date().toISOString() };
    } catch (err) {
      console.error(`quote failed for ${symbol}:`, err instanceof Error ? err.message : err);
    }
    if (i < remainingSymbols.length - 1) await sleep(QUOTE_DELAY_MS);
  }

  let usdToTwd: number | null = null;
  try {
    if (remainingSymbols.length > 0) await sleep(QUOTE_DELAY_MS);
    usdToTwd = await fetchTwelveDataQuote('USD/TWD', API_KEY);
  } catch (err) {
    console.error('FX fetch failed:', err instanceof Error ? err.message : err);
  }

  const metrics = holdings.map((h) => computeHoldingMetrics(h, prices));
  const totalTwd = computeTotalInTwd(metrics, usdToTwd);
  if (totalTwd === null) {
    console.error('Could not compute a TWD total (missing FX rate) — aborting without writing a snapshot.');
    process.exit(1);
  }

  const existing: Snapshot[] = existsSync(OUTPUT_PATH) ? JSON.parse(readFileSync(OUTPUT_PATH, 'utf-8')) : [];
  const next = recordSnapshot(existing, totalTwd, computeClassValues(metrics), computeSymbolValues(metrics));
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`Recorded snapshot for ${todayDateString()}: ${totalTwd.toFixed(0)} TWD (${symbols.length} symbols)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
