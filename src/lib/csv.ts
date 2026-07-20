import Papa from 'papaparse';
import type { AssetClass, ImportedHoldingRow } from '../types';
import { ASSET_CLASSES } from '../types';

export class CsvImportError extends Error {}

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[\s_-]+/g, '');
}

function parseAssetClass(raw: string | undefined): AssetClass {
  const value = (raw ?? '').trim().toLowerCase();
  if (ASSET_CLASSES.includes(value as AssetClass)) return value as AssetClass;
  if (value === 'stocks' || value === 'equity' || value === '股票') return 'stock';
  if (value === 'crypto' || value === 'cryptocurrency' || value === '加密貨幣' || value === '加密货币') return 'crypto';
  if (value === 'cash' || value === '現金' || value === '现金') return 'cash';
  return 'stock';
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
      assetClass: assetClassKey ? parseAssetClass(row[assetClassKey]) : 'stock',
      name: nameKey ? row[nameKey]?.trim() || undefined : undefined,
    };
  });
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
  return parseHoldingsCsv(text);
}
