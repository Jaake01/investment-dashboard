import Papa from 'papaparse';
import { CsvImportError } from './csv';

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[\s_-]+/g, '');
}

// Reads a small "symbol,price" CSV published from a Google Sheet tab that
// uses GOOGLEFINANCE (e.g. =GOOGLEFINANCE("TPE:"&A2,"price")). This exists
// because Finnhub's and Twelve Data's free tiers don't reliably cover TWSE
// real-time quotes — GOOGLEFINANCE does, and it's already free.
export async function fetchQuoteSheet(url: string): Promise<Record<string, number>> {
  if (!url.trim()) return {};

  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw new CsvImportError('無法連線到台股報價 Sheet');
  }
  if (!response.ok) {
    throw new CsvImportError(`下載台股報價 Sheet 失敗（HTTP ${response.status}）`);
  }
  const text = await response.text();

  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: normalizeHeader,
  });
  if (result.errors.length > 0) {
    throw new CsvImportError(`台股報價 Sheet 解析失敗：${result.errors[0].message}`);
  }

  const rows = result.data;
  if (rows.length === 0) return {};

  const symbolKey = ['symbol', 'ticker', '代號'].find((k) => k in rows[0]);
  const priceKey = ['price', '報價', '股價'].find((k) => k in rows[0]);
  if (!symbolKey || !priceKey) {
    throw new CsvImportError('台股報價 Sheet 需要有 symbol 和 price 兩個欄位（標題列）');
  }

  const map: Record<string, number> = {};
  for (const row of rows) {
    const symbol = (row[symbolKey] ?? '').trim().toUpperCase();
    const price = Number((row[priceKey] ?? '').replace(/[,$\s]/g, ''));
    if (symbol && Number.isFinite(price) && price > 0) {
      map[symbol] = price;
    }
  }
  return map;
}
