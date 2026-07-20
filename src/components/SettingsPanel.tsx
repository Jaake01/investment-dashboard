import { useState } from 'react';
import { usePortfolio } from '../context/PortfolioContext';
import { CsvImportError, fetchAndParseSheet } from '../lib/csv';
import { PRICE_PROVIDERS } from '../lib/priceProviders';
import { usePrices } from '../hooks/usePrices';
import type { ImportedHoldingRow, PriceProviderId } from '../types';

export function SettingsPanel() {
  const { settings, setSettings, replaceHoldingsFromImport, mergeHoldingsFromImport } = usePortfolio();
  const { refreshPrices, isRefreshing, errors: priceErrors } = usePrices();

  const [importError, setImportError] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [pendingRows, setPendingRows] = useState<ImportedHoldingRow[] | null>(null);

  const handleImportClick = async () => {
    setImportError('');
    setIsImporting(true);
    try {
      const rows = await fetchAndParseSheet(settings.sheetUrl);
      setPendingRows(rows);
    } catch (err) {
      setImportError(err instanceof CsvImportError ? err.message : '匯入失敗，請確認網址是否正確');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <section className="card">
      <h2>設定</h2>

      <div className="settings-group">
        <h3>Google Sheet 匯入</h3>
        <p className="settings-hint">
          在 Google Sheet 使用「檔案 → 共用 → 發布到網路」，格式選擇 CSV，將產生的網址貼在下方。欄位需包含
          symbol、shares、avgCost，assetClass 與 name 為選填。
        </p>
        <div className="settings-row">
          <input
            type="text"
            placeholder="https://docs.google.com/spreadsheets/d/.../pub?output=csv"
            value={settings.sheetUrl}
            onChange={(e) => setSettings({ sheetUrl: e.target.value })}
          />
          <button className="btn" onClick={handleImportClick} disabled={isImporting}>
            {isImporting ? '匯入中…' : '匯入'}
          </button>
        </div>
        {importError && <p className="form-error">{importError}</p>}

        {pendingRows && (
          <div className="import-confirm">
            <p>
              已讀取 {pendingRows.length} 筆資料，請選擇匯入方式：
            </p>
            <div className="settings-row">
              <button
                className="btn btn-primary"
                onClick={() => {
                  mergeHoldingsFromImport(pendingRows);
                  setPendingRows(null);
                }}
              >
                依代號合併（保留其他手動持股）
              </button>
              <button
                className="btn btn-danger"
                onClick={() => {
                  replaceHoldingsFromImport(pendingRows);
                  setPendingRows(null);
                }}
              >
                整批覆蓋
              </button>
              <button className="btn" onClick={() => setPendingRows(null)}>
                取消
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="settings-group">
        <h3>即時報價 API</h3>
        <div className="settings-row">
          <select
            value={settings.priceProvider}
            onChange={(e) => setSettings({ priceProvider: e.target.value as PriceProviderId })}
          >
            <option value="none">不使用</option>
            {Object.values(PRICE_PROVIDERS).map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          <input
            type="password"
            placeholder="API key"
            value={settings.apiKey}
            onChange={(e) => setSettings({ apiKey: e.target.value })}
          />
          <button className="btn btn-primary" onClick={refreshPrices} disabled={isRefreshing}>
            {isRefreshing ? '刷新中…' : '立即刷新報價'}
          </button>
        </div>
        <p className="settings-hint">API key 僅儲存在你的瀏覽器 localStorage，不會傳送到除報價來源以外的任何地方。</p>
        {priceErrors.length > 0 && (
          <ul className="form-error-list">
            {priceErrors.map((err) => (
              <li key={err}>{err}</li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
