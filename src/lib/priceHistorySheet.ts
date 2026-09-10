import Papa from 'papaparse';
import { CsvImportError } from './csv';

export interface TwQuote {
  price: number;
  // Derived from the two most recent stored closes, not fetched — the
  // 股價歷史 sheet only ever stores a close per (symbol, date), no % change
  // column. Missing when there's only one date on record for a symbol.
  changePercent?: number;
}

// Reads the GAS-maintained "股價歷史" sheet (symbol|date|close), published as
// CSV, and reduces it to "latest known close" per symbol. This replaced a
// separate "報價" tab that held a live GOOGLEFINANCE("...", "price") formula:
// that formula only recalculates when the sheet is opened or edited, so on a
// sheet nobody has open it quietly goes stale and just sits on whatever value
// it last had — the current price looked live but wasn't. 股價歷史 is
// written by the daily trigger instead of a recalculating formula, so what's
// in it is only ever as stale as "days since the trigger last ran", not
// "days since someone opened the sheet". The trade-off: this is the latest
// *close*, not a real-time intraday quote.
export async function fetchPriceHistorySheet(url: string): Promise<Record<string, TwQuote>> {
  if (!url.trim()) return {};

  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw new CsvImportError('無法連線到股價歷史 Sheet');
  }
  if (!response.ok) {
    throw new CsvImportError(`下載股價歷史 Sheet 失敗（HTTP ${response.status}）`);
  }
  const text = await response.text();

  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  });
  if (result.errors.length > 0) {
    throw new CsvImportError(`股價歷史 Sheet 解析失敗：${result.errors[0].message}`);
  }

  const rows = result.data;
  if (rows.length === 0) return {};
  if (!('symbol' in rows[0]) || !('date' in rows[0]) || !('close' in rows[0])) {
    throw new CsvImportError('股價歷史 Sheet 需要有 symbol、date、close 三個欄位（標題列）');
  }

  const bySymbol: Record<string, Record<string, number>> = {};
  for (const row of rows) {
    const symbol = (row.symbol ?? '').trim();
    const date = (row.date ?? '').trim();
    const close = Number(row.close);
    if (!symbol || !date || !Number.isFinite(close)) continue;
    (bySymbol[symbol] ??= {})[date] = close;
  }

  const map: Record<string, TwQuote> = {};
  for (const symbol in bySymbol) {
    const dates = Object.keys(bySymbol[symbol]).sort();
    const latestDate = dates[dates.length - 1];
    const price = bySymbol[symbol][latestDate];
    const prevDate = dates.length > 1 ? dates[dates.length - 2] : undefined;
    const changePercent = prevDate
      ? ((price - bySymbol[symbol][prevDate]) / bySymbol[symbol][prevDate]) * 100
      : undefined;
    map[symbol] = { price, changePercent };
  }
  return map;
}

// Google Sheets silently coerces a leading-zero symbol like "0056" to the
// number 56 when it's written with setValues — same corruption the GAS side
// already works around when it reads 股價歷史 back for itself (see
// rebuildDailyAssetTableInner_). Mirrors that fallback here: try the exact
// holding symbol first, then its leading-zeros-stripped numeric form.
export function lookupQuote(quotes: Record<string, TwQuote>, symbol: string): TwQuote | undefined {
  if (quotes[symbol]) return quotes[symbol];
  if (/^\d+$/.test(symbol)) {
    const numericKey = String(Number(symbol));
    if (quotes[numericKey]) return quotes[numericKey];
  }
  return undefined;
}
