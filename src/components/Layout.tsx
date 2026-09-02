import { useEffect, useState } from 'react';
import { PortfolioSummary } from './PortfolioSummary';
import { CurrencyBreakdown } from './CurrencyBreakdown';
import { CashLedgerCard } from './CashLedgerCard';
import { AllocationBubbleChart } from './AllocationBubbleChart';
import { HoldingsTable } from './HoldingsTable';
import { TrendChart } from './TrendChart';
import { UsStockGainChart } from './UsStockGainChart';
import { RealizedGains } from './RealizedGains';
import { SettingsPanel } from './SettingsPanel';
import { usePrices } from '../hooks/usePrices';
import { useAutoSync } from '../hooks/useAutoSync';
import { useCashLedger } from '../hooks/useCashLedger';
import { useRemoteSnapshots } from '../hooks/useRemoteSnapshots';
import { usePortfolio } from '../context/PortfolioContext';

type Page = 'overview' | 'realized' | 'settings';

export function Layout() {
  const [page, setPage] = useState<Page>('overview');
  const { settings } = usePortfolio();

  // Mounted here (not just inside SettingsPanel) so Sheet auto-sync, the
  // remote daily-snapshot merge, and price auto-refresh all run as soon as
  // the app loads, regardless of which tab is open — Layout is always
  // mounted, SettingsPanel isn't. Each hook dedupes its own background
  // behavior across multiple mounted instances, so SettingsPanel can still
  // call these itself for its manual buttons/status display.
  usePrices();
  useAutoSync();
  useCashLedger();
  useRemoteSnapshots();

  // 'system' leaves no data-theme attribute set, so the OS-driven
  // prefers-color-scheme media query in index.css takes over naturally.
  // The toggle itself lives in SettingsPanel; this just needs to run
  // regardless of which tab is active, hence it's here rather than there.
  useEffect(() => {
    if (settings.theme === 'system') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.dataset.theme = settings.theme;
    }
  }, [settings.theme]);

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>投資儀表板</h1>
        <nav className="tab-bar app-header-tabs">
          <button
            className={`tab-button ${page === 'overview' ? 'active' : ''}`}
            onClick={() => setPage('overview')}
          >
            總覽
          </button>
          <button
            className={`tab-button ${page === 'realized' ? 'active' : ''}`}
            onClick={() => setPage('realized')}
          >
            已實現損益
          </button>
          <button
            className={`tab-button ${page === 'settings' ? 'active' : ''}`}
            onClick={() => setPage('settings')}
          >
            設定
          </button>
        </nav>
      </header>
      <main className="app-main">
        {page === 'overview' && (
          <>
            <PortfolioSummary />
            <CurrencyBreakdown />
            <CashLedgerCard />
            <AllocationBubbleChart />
            <TrendChart />
            <UsStockGainChart />
            <HoldingsTable />
          </>
        )}
        {page === 'realized' && <RealizedGains />}
        {page === 'settings' && <SettingsPanel />}
      </main>
    </div>
  );
}
