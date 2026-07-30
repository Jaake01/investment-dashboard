import Papa from 'papaparse';
import { CsvImportError } from './csv';

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[\s_-]+/g, '');
}

export interface CashLedgerEntry {
  date: string;
  currency: string;
  amount: number;
}

// Reads the append-only "現金帳戶" ledger tab (date/currency/type/amount/note)
// kept in sync with 交易紀錄 via an Apps Script trigger — 買入扣款 rows are
// negative, 賣出入帳/初始餘額 rows are positive, so summing D by currency
// (B) directly yields the current balance per currency. Rows missing a
// currency or a parseable amount are skipped rather than failing the whole
// import, matching fetchQuoteSheet's leniency for this kind of read-only
// informational sheet.
export function parseCashLedgerCsv(csvText: string): CashLedgerEntry[] {
  const result = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: normalizeHeader,
  });
  if (result.errors.length > 0) {
    throw new CsvImportError(`現金帳戶 Sheet 解析失敗：${result.errors[0].message}`);
  }

  const rows = result.data;
  if (rows.length === 0) return [];

  const dateKey = ['date', '日期'].find((k) => k in rows[0]);
  const currencyKey = ['currency', '幣別'].find((k) => k in rows[0]);
  const amountKey = ['amount', '金額'].find((k) => k in rows[0]);
  if (!currencyKey || !amountKey) {
    throw new CsvImportError('現金帳戶 Sheet 需要有「幣別」和「金額」兩個欄位（標題列）');
  }

  const entries: CashLedgerEntry[] = [];
  for (const row of rows) {
    const currency = (row[currencyKey] ?? '').trim().toUpperCase();
    const amount = Number((row[amountKey] ?? '').replace(/[,$\s]/g, ''));
    if (!currency || !Number.isFinite(amount)) continue;
    entries.push({ date: dateKey ? (row[dateKey] ?? '').trim() : '', currency, amount });
  }
  return entries;
}

export function computeCashBalances(entries: CashLedgerEntry[]): Record<string, number> {
  const balances: Record<string, number> = {};
  for (const entry of entries) {
    balances[entry.currency] = (balances[entry.currency] ?? 0) + entry.amount;
  }
  return balances;
}

export async function fetchCashLedgerSheet(url: string): Promise<Record<string, number>> {
  if (!url.trim()) return {};

  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw new CsvImportError('無法連線到現金帳戶 Sheet');
  }
  if (!response.ok) {
    throw new CsvImportError(`下載現金帳戶 Sheet 失敗（HTTP ${response.status}）`);
  }
  const text = await response.text();
  return computeCashBalances(parseCashLedgerCsv(text));
}
