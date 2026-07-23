import { useState } from 'react';
import { PortfolioSummary } from './PortfolioSummary';
import { CurrencyBreakdown } from './CurrencyBreakdown';
import { AllocationTreemap } from './AllocationTreemap';
import { HoldingsTable } from './HoldingsTable';
import { TrendChart } from './TrendChart';
import { SettingsPanel } from './SettingsPanel';
import { usePrices } from '../hooks/usePrices';
import { useAutoSync } from '../hooks/useAutoSync';
import { useRemoteSnapshots } from '../hooks/useRemoteSnapshots';

type Page = 'overview' | 'settings';

export function Layout() {
  const [page, setPage] = useState<Page>('overview');

  // Mounted here (not just inside SettingsPanel) so Sheet auto-sync, the
  // remote daily-snapshot merge, and price auto-refresh all run as soon as
  // the app loads, regardless of which tab is open — Layout is always
  // mounted, SettingsPanel isn't. Each hook dedupes its own background
  // behavior across multiple mounted instances, so SettingsPanel can still
  // call these itself for its manual buttons/status display.
  usePrices();
  useAutoSync();
  useRemoteSnapshots();

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
            className={`tab-button ${page === 'settings' ? 'active' : ''}`}
            onClick={() => setPage('settings')}
          >
            設定
          </button>
        </nav>
      </header>
      <main className="app-main">
        {page === 'overview' ? (
          <>
            <PortfolioSummary />
            <CurrencyBreakdown />
            <AllocationTreemap />
            <HoldingsTable />
            <TrendChart />
          </>
        ) : (
          <SettingsPanel />
        )}
      </main>
    </div>
  );
}
