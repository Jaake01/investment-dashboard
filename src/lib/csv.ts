import Papa from 'papaparse';
import type { AssetClass, ImportedHoldingRow, Transaction, TransactionAction } from '../types';
import { ASSET_CLASSES } from '../types';
import { aggregateHoldingsFromTransactions } from './transactions';

export class CsvImportError extends Error {}

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[\s_-]+/g, '');
}

function parseAssetClass(raw: string | undefined): AssetClass {
  const value = (raw ?? '').trim().toLowerCase();
  if (ASSET_CLASSES.includes(value as AssetClass)) return value as AssetClass;
  if (value === 'us stock' || value === 'usstock' || value === 'us_stock' || value === '美股') return 'us_stock';
  if (value === 'tw stock' || value === 'twstock' || value === 'tw_stock' || value === '台股') return 'tw_stock';
  if (value === 'crypto' || value === 'cryptocurrency' || value === '加密貨幣' || value === '加密货币') return 'crypto';
  if (value === 'cash' || value === '現金' || value === '现金') return 'cash';
  // Generic "stock"/"equity"/"股票" can't tell US vs TW apart, so it falls back to us_stock.
  if (value === 'stocks' || value === 'equity' || value === '股票') return 'us_stock';
  return 'us_stock';
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
      assetClass: assetClassKey ? parseAssetClass(row[assetClassKey]) : 'us_stock',
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
      assetClass: assetClassKey ? parseAssetClass(row[assetClassKey]) : 'us_stock',
      symbol,
      action: parseAction(row[actionKey], index),
      price: parseNumber(row[priceKey], '成交價格', index),
      amount: parseNumber(row[amountKey], '成交金額', index),
    };
  });
}

function isTransactionLedgerCsv(headerRow: Record<string, string>): boolean {
  return ['action', '動作'].some((k) => k in headerRow);
}

export async function fetchAndParseSheet(sheetUrl: string): Promise<ImportedHoldingRow[]> {
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
    return aggregateHoldingsFromTransactions(parseTransactionsCsv(text));
  }
  return parseHoldingsCsv(text);
}
