import { useState } from 'react';
import { PortfolioSummary } from './PortfolioSummary';
import { CurrencyBreakdown } from './CurrencyBreakdown';
import { AllocationTreemap } from './AllocationTreemap';
import { HoldingsTable } from './HoldingsTable';
import { TrendChart } from './TrendChart';
import { SettingsPanel } from './SettingsPanel';

type Page = 'overview' | 'settings';

export function Layout() {
  const [page, setPage] = useState<Page>('overview');

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
