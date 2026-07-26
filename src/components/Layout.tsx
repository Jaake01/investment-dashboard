import { useEffect, useState } from 'react';
import { PortfolioSummary } from './PortfolioSummary';
import { CurrencyBreakdown } from './CurrencyBreakdown';
import { AllocationTreemap } from './AllocationTreemap';
import { HoldingsTable } from './HoldingsTable';
import { TrendChart } from './TrendChart';
import { NewsPanel } from './NewsPanel';
import { SettingsPanel } from './SettingsPanel';
import { usePrices } from '../hooks/usePrices';
import { useAutoSync } from '../hooks/useAutoSync';
import { useRemoteSnapshots } from '../hooks/useRemoteSnapshots';
import { usePortfolio } from '../context/PortfolioContext';
import type { Theme } from '../types';

type Page = 'overview' | 'news' | 'settings';

const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: 'light', label: '淺色' },
  { value: 'dark', label: '深色' },
  { value: 'system', label: '系統' },
];

export function Layout() {
  const [page, setPage] = useState<Page>('overview');
  const { settings, setSettings } = usePortfolio();

  // Mounted here (not just inside SettingsPanel) so Sheet auto-sync, the
  // remote daily-snapshot merge, and price auto-refresh all run as soon as
  // the app loads, regardless of which tab is open — Layout is always
  // mounted, SettingsPanel isn't. Each hook dedupes its own background
  // behavior across multiple mounted instances, so SettingsPanel can still
  // call these itself for its manual buttons/status display.
  usePrices();
  useAutoSync();
  useRemoteSnapshots();

  // 'system' leaves no data-theme attribute set, so the OS-driven
  // prefers-color-scheme media query in index.css takes over naturally.
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
        <div className="app-header-row">
          <nav className="tab-bar app-header-tabs">
            <button
              className={`tab-button ${page === 'overview' ? 'active' : ''}`}
              onClick={() => setPage('overview')}
            >
              總覽
            </button>
            <button
              className={`tab-button ${page === 'news' ? 'active' : ''}`}
              onClick={() => setPage('news')}
            >
              新聞
            </button>
            <button
              className={`tab-button ${page === 'settings' ? 'active' : ''}`}
              onClick={() => setPage('settings')}
            >
              設定
            </button>
          </nav>
          <div className="theme-toggle" role="group" aria-label="外觀">
            {THEME_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                className={`theme-toggle-btn ${settings.theme === opt.value ? 'active' : ''}`}
                onClick={() => setSettings({ theme: opt.value })}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </header>
      <main className="app-main">
        {page === 'overview' ? (
          <>
            <PortfolioSummary />
            <CurrencyBreakdown />
            <AllocationTreemap />
            <TrendChart />
            <HoldingsTable />
          </>
        ) : page === 'news' ? (
          <NewsPanel />
        ) : (
          <SettingsPanel />
        )}
      </main>
    </div>
  );
}
