import { usePrices } from '../hooks/usePrices';
import { useFxRate } from '../hooks/useFxRate';
import { useCashLedger } from '../hooks/useCashLedger';
import { usePortfolio } from '../context/PortfolioContext';

// Lives in Layout's app-header (top-right, visible on every page) rather
// than inside any one card — refreshing prices isn't specific to 總覽, and
// this way it's reachable without switching tabs. Used to live inline in
// SettingsPanel; moved out so it doesn't require opening 設定 first.
export function RefreshControl() {
  const { prices } = usePortfolio();
  const {
    refreshFxRate,
    canAutoFetch: canAutoFetchFx,
    updatedAt: fxUpdatedAt,
    isRefreshing: isFxRefreshing,
    error: fxError,
  } = useFxRate();
  const { refreshPrices, isRefreshing, errors: priceErrors } = usePrices();
  const { refreshCashLedger, isRefreshing: isCashLedgerRefreshing, error: cashLedgerError } = useCashLedger();

  const isAnyRefreshing = isRefreshing || isFxRefreshing || isCashLedgerRefreshing;
  // Surfaced here too (not just in SettingsPanel's status section) — this
  // button moved out of 設定 into the global header, so a failure needs to be
  // visible without switching tabs, otherwise a failed refresh looks
  // identical to a successful one that just returned unchanged prices.
  // Deduped — a flat-rate-limit failure (see twelvedata.ts's 429 handling)
  // throws the exact same message for both the price loop and the FX rate
  // (both hit Twelve Data), which would otherwise double up here even
  // though priceErrors is already deduped within itself.
  const refreshErrors = Array.from(new Set([...priceErrors, fxError, cashLedgerError].filter((e): e is string => Boolean(e))));

  const handleRefreshAll = async () => {
    await Promise.all([refreshPrices(true), canAutoFetchFx ? refreshFxRate() : Promise.resolve(), refreshCashLedger()]);
  };

  // "最後刷新時間" — the most recent of any price entry's own timestamp
  // (see usePrices.ts's applyPriceUpdates) and the FX rate's, rather than a
  // separate tracked field: this already reflects both the windowed
  // auto-refresh (see lib/refreshSchedule.ts) and manual refreshes, and
  // (unlike a timestamp set only here) survives a page reload since prices/
  // fxRate are themselves persisted to localStorage.
  const priceTimestamps = Object.values(prices)
    .map((p) => new Date(p.updatedAt).getTime())
    .filter((t) => Number.isFinite(t));
  const lastRefreshedMs = Math.max(...priceTimestamps, fxUpdatedAt ? new Date(fxUpdatedAt).getTime() : -Infinity);
  const lastRefreshedLabel = Number.isFinite(lastRefreshedMs) ? new Date(lastRefreshedMs).toLocaleTimeString('zh-TW') : null;

  return (
    <div className="refresh-control">
      <button className="btn btn-primary" onClick={handleRefreshAll} disabled={isAnyRefreshing}>
        {isAnyRefreshing ? '刷新中…' : '立即刷新報價'}
      </button>
      <span className="last-refreshed-label">{lastRefreshedLabel ? `最後刷新：${lastRefreshedLabel}` : '尚未刷新過'}</span>
      {refreshErrors.length > 0 && (
        <span className="refresh-error-label" title={refreshErrors.join('；')}>
          刷新失敗（{refreshErrors.length}）－詳見設定頁
        </span>
      )}
    </div>
  );
}
