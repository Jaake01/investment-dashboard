import { useState } from 'react';
import { usePortfolio } from '../context/PortfolioContext';
import { CsvImportError, fetchAndParseSheet } from '../lib/csv';
import { PRICE_PROVIDERS } from '../lib/priceProviders';
import { usePrices } from '../hooks/usePrices';
import { useFxRate } from '../hooks/useFxRate';
import { useAutoSync } from '../hooks/useAutoSync';
import type { ImportedHoldingRow, PriceProviderId } from '../types';

export function SettingsPanel() {
  const { settings, setSettings, replaceHoldingsFromImport, mergeHoldingsFromImport } = usePortfolio();
  const { refreshPrices, isRefreshing, errors: priceErrors } = usePrices();
  const { refreshFxRate, isRefreshing: isFxRefreshing, error: fxError, canAutoFetch: canAutoFetchFx, effectiveUsdToTwd, effectiveSource } = useFxRate();
  const { isSyncing: isAutoSyncing, error: autoSyncError, lastSyncedAt } = useAutoSync();

  const handleRefreshAll = async () => {
    await Promise.all([refreshPrices(), canAutoFetchFx ? refreshFxRate() : Promise.resolve()]);
  };

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
          在 Google Sheet 使用「檔案 → 共用 → 發布到網路」，格式選擇 CSV，將產生的網址貼在下方。支援兩種格式，程式會自動判斷：
          「持股快照」（symbol、shares、avgCost，assetClass 與 name 選填）或「交易紀錄」（交易日期、類別、代號、動作、成交價格、成交金額——有「動作」欄位就視為交易紀錄，自動換算股數與加權平均成本）。
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

        <div className="settings-row">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={settings.autoSyncEnabled}
              onChange={(e) => setSettings({ autoSyncEnabled: e.target.checked })}
            />
            自動同步（每 15 分鐘依代號合併一次，不會跳確認視窗）
          </label>
        </div>
        {settings.autoSyncEnabled && (
          <p className="settings-hint">
            {isAutoSyncing
              ? '同步中…'
              : lastSyncedAt
                ? `上次自動同步：${new Date(lastSyncedAt).toLocaleTimeString('zh-TW')}`
                : '尚未同步'}
          </p>
        )}
        {autoSyncError && <p className="form-error">{autoSyncError}</p>}

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
          <button className="btn btn-primary" onClick={handleRefreshAll} disabled={isRefreshing || isFxRefreshing}>
            {isRefreshing || isFxRefreshing ? '刷新中…' : '立即刷新報價'}
          </button>
        </div>
        <p className="settings-hint">
          API key 僅儲存在你的瀏覽器 localStorage，不會傳送到除報價來源以外的任何地方。選擇 Twelve Data 時，這顆按鈕也會一併刷新美元/台幣匯率。
        </p>
        {priceErrors.length > 0 && (
          <ul className="form-error-list">
            {priceErrors.map((err) => (
              <li key={err}>{err}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="settings-group">
        <h3>匯率（美元/台幣）</h3>
        <p className="settings-hint">
          {effectiveUsdToTwd === null
            ? '尚未取得匯率。'
            : `目前：1 USD = ${effectiveUsdToTwd} TWD（${effectiveSource === 'auto' ? '即時 API' : '手動輸入'}）`}
          {!canAutoFetchFx && '　自動抓匯率需選擇 Twelve Data 並填入 API key，否則只能用下方手動輸入。'}
        </p>
        <div className="settings-row">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={settings.fxAutoRefresh}
              onChange={(e) => setSettings({ fxAutoRefresh: e.target.checked })}
            />
            自動抓匯率
          </label>
          <input
            type="number"
            step="any"
            placeholder="手動輸入匯率，例如 32.5"
            value={settings.manualUsdTwdRate || ''}
            onChange={(e) => setSettings({ manualUsdTwdRate: Number(e.target.value) || 0 })}
          />
        </div>
        {fxError && <p className="form-error">{fxError}</p>}
      </div>
    </section>
  );
}
