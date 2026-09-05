import Papa from 'papaparse';
import type { AssetClass, ImportedHoldingRow, Snapshot, Transaction, TransactionAction } from '../types';
import { ASSET_CLASSES } from '../types';
import { processTransactions } from './transactions';
import { guessAssetClassFromSymbol } from './symbolClass';

export class CsvImportError extends Error {}

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[\s_-]+/g, '');
}

// Falls back to guessing from the symbol whenever the class column is missing
// or too generic to tell US vs TW stock apart (e.g. plain "股票"/"stock").
function parseAssetClass(raw: string | undefined, symbol: string): AssetClass {
  const value = (raw ?? '').trim().toLowerCase();
  if (ASSET_CLASSES.includes(value as AssetClass)) return value as AssetClass;
  if (value === 'us stock' || value === 'usstock' || value === 'us_stock' || value === '美股') return 'us_stock';
  if (value === 'tw stock' || value === 'twstock' || value === 'tw_stock' || value === '台股') return 'tw_stock';
  if (value === 'crypto' || value === 'cryptocurrency' || value === '加密貨幣' || value === '加密货币') return 'crypto';
  if (value === 'cash' || value === '現金' || value === '现金') return 'cash';
  return guessAssetClassFromSymbol(symbol);
}

function parseNumber(raw: string | undefined, field: string, rowIndex: number): number {
  const cleaned = (raw ?? '').replace(/[,$\s]/g, '');
  if (cleaned === '') return 0;
  const num = Number(cleaned);
  if (Number.isNaN(num)) {
    throw new CsvImportError(`第 ${rowIndex + 1} 列的「${field}」不是有效數字：「${raw}」`);
  }
  return num;
}

function parseAction(raw: string | undefined, rowIndex: number): TransactionAction {
  const value = (raw ?? '').trim().toLowerCase();
  if (value === 'buy' || value === '買入' || value === '买入') return 'buy';
  if (value === 'sell' || value === '賣出' || value === '卖出') return 'sell';
  throw new CsvImportError(`第 ${rowIndex + 1} 列的「動作」必須是買入或賣出，收到「${raw}」`);
}

export function parseHoldingsCsv(csvText: string): ImportedHoldingRow[] {
  const result = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: normalizeHeader,
  });

  if (result.errors.length > 0) {
    throw new CsvImportError(`CSV 解析失敗：${result.errors[0].message}`);
  }

  const rows = result.data;
  if (rows.length === 0) {
    throw new CsvImportError('CSV 沒有任何資料列');
  }

  const symbolKey = ['symbol', 'ticker', '代號', '股票代號'].find((k) => k in rows[0]);
  if (!symbolKey) {
    throw new CsvImportError('CSV 找不到 symbol 欄位，請確認標題列包含 "symbol"');
  }
  const sharesKey = ['shares', 'quantity', 'qty', '股數'].find((k) => k in rows[0]) ?? 'shares';
  const avgCostKey = ['avgcost', 'cost', 'costbasis', '成本'].find((k) => k in rows[0]) ?? 'avgcost';
  const assetClassKey = ['assetclass', 'class', 'type', '類別'].find((k) => k in rows[0]);
  const nameKey = ['name', '名稱'].find((k) => k in rows[0]);

  return rows.map((row, index) => {
    const symbol = (row[symbolKey] ?? '').trim().toUpperCase();
    if (!symbol) {
      throw new CsvImportError(`第 ${index + 1} 列缺少 symbol`);
    }
    return {
      symbol,
      shares: parseNumber(row[sharesKey], 'shares', index),
      avgCost: parseNumber(row[avgCostKey], 'avgCost', index),
      assetClass: assetClassKey ? parseAssetClass(row[assetClassKey], symbol) : guessAssetClassFromSymbol(symbol),
      name: nameKey ? row[nameKey]?.trim() || undefined : undefined,
    };
  });
}

export function parseTransactionsCsv(csvText: string): Transaction[] {
  const result = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: normalizeHeader,
  });

  if (result.errors.length > 0) {
    throw new CsvImportError(`CSV 解析失敗：${result.errors[0].message}`);
  }

  const rows = result.data;
  if (rows.length === 0) {
    throw new CsvImportError('CSV 沒有任何資料列');
  }

  const dateKey = ['date', 'tradedate', '交易日期'].find((k) => k in rows[0]);
  const symbolKey = ['symbol', 'ticker', '代號', '股票代號'].find((k) => k in rows[0]);
  const actionKey = ['action', '動作'].find((k) => k in rows[0]);
  const priceKey = ['price', '成交價格'].find((k) => k in rows[0]);
  const amountKey = ['amount', '成交金額'].find((k) => k in rows[0]);
  const assetClassKey = ['assetclass', 'class', 'type', '類別'].find((k) => k in rows[0]);
  const nameKey = ['name', '名稱'].find((k) => k in rows[0]);

  if (!dateKey || !symbolKey || !actionKey || !priceKey || !amountKey) {
    throw new CsvImportError('交易紀錄 CSV 欄位不完整，需要包含：交易日期、代號、動作、成交價格、成交金額');
  }

  return rows.map((row, index) => {
    const symbol = (row[symbolKey] ?? '').trim().toUpperCase();
    if (!symbol) {
      throw new CsvImportError(`第 ${index + 1} 列缺少代號`);
    }
    return {
      date: (row[dateKey] ?? '').trim(),
      assetClass: assetClassKey ? parseAssetClass(row[assetClassKey], symbol) : guessAssetClassFromSymbol(symbol),
      symbol,
      name: nameKey ? row[nameKey]?.trim() || undefined : undefined,
      action: parseAction(row[actionKey], index),
      price: parseNumber(row[priceKey], '成交價格', index),
      amount: parseNumber(row[amountKey], '成交金額', index),
    };
  });
}

// Parses the "每日資產數據" tab an external Apps Script (not part of this
// repo) computes from the 交易紀錄 ledger plus historical GOOGLEFINANCE
// prices — column headers are that script's fixed output contract, not
// user-provided data, so matched literally rather than fuzzy-detected like
// the holdings/transaction CSVs above.
export function parseDailyAssetCsv(csvText: string): Snapshot[] {
  const result = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  if (result.errors.length > 0) {
    throw new CsvImportError(`CSV 解析失敗：${result.errors[0].message}`);
  }

  const num = (v: string | undefined): number | undefined => {
    if (v === undefined || v.trim() === '') return undefined;
    const n = Number(v.replace(/[,$\s]/g, ''));
    return Number.isNaN(n) ? undefined : n;
  };

  // Without this, a CSV of the wrong tab (or a sheet whose headers drifted)
  // parses "successfully" into zero snapshots and the dashboard just shows no
  // history — indistinguishable from an empty sheet, and impossible to tell
  // apart from the outside.
  const first = result.data[0];
  if (first && !('日期' in first && '總市值(TWD)' in first)) {
    throw new CsvImportError(
      `找不到「日期」或「總市值(TWD)」欄位，請確認「發布到網路」發布的是「每日資產數據」分頁。實際讀到的欄位：${Object.keys(first).join('、')}`,
    );
  }

  const snapshots: Snapshot[] = [];
  for (const row of result.data) {
    const date = (row['日期'] ?? '').trim();
    const totalValue = num(row['總市值(TWD)']);
    if (!date || totalValue === undefined) continue;

    const classValues: Partial<Record<AssetClass, number>> = {};
    const classCostValues: Partial<Record<AssetClass, number>> = {};
    const assign = (assetClass: AssetClass, valueCol: string, costCol: string) => {
      const v = num(row[valueCol]);
      const c = num(row[costCol]);
      if (v !== undefined) classValues[assetClass] = v;
      if (c !== undefined) classCostValues[assetClass] = c;
    };
    assign('us_stock', '美股市值(USD)', '美股成本(USD)');
    assign('tw_stock', '台股市值(TWD)', '台股成本(TWD)');
    assign('cash', '現金市值(TWD)', '現金成本(TWD)');
    assign('crypto', '加密貨幣市值(USD)', '加密貨幣成本(USD)');
    assign('other', '其他市值(TWD)', '其他成本(TWD)');

    snapshots.push({
      date,
      totalValue,
      totalCost: num(row['總成本(TWD)']),
      classValues,
      classCostValues,
    });
  }
  return snapshots;
}

function isTransactionLedgerCsv(headerRow: Record<string, string>): boolean {
  return ['action', '動作'].some((k) => k in headerRow);
}

export interface SheetImportResult {
  rows: ImportedHoldingRow[];
  // Only set when the sheet is a 交易紀錄 (transaction ledger) — a plain
  // 持股快照 sheet has no per-trade history to derive 已實現損益 from.
  transactions: Transaction[] | null;
}

export async function fetchAndParseSheet(sheetUrl: string): Promise<SheetImportResult> {
  if (!sheetUrl.trim()) {
    throw new CsvImportError('請先填入 Google Sheet 發布的 CSV 網址');
  }
  let response: Response;
  try {
    response = await fetch(sheetUrl);
  } catch {
    throw new CsvImportError('無法連線到該網址，請確認網路連線與網址是否正確');
  }
  if (!response.ok) {
    throw new CsvImportError(`下載 CSV 失敗（HTTP ${response.status}）`);
  }
  const text = await response.text();

  const probe = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: normalizeHeader,
    preview: 1,
  });
  if (probe.errors.length > 0) {
    throw new CsvImportError(`CSV 解析失敗：${probe.errors[0].message}`);
  }
  if (probe.data.length === 0) {
    throw new CsvImportError('CSV 沒有任何資料列');
  }

  if (isTransactionLedgerCsv(probe.data[0])) {
    const transactions = parseTransactionsCsv(text);
    const { holdings } = processTransactions(transactions);
    return { rows: holdings, transactions };
  }
  return { rows: parseHoldingsCsv(text), transactions: null };
}
