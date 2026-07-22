import { PortfolioSummary } from './PortfolioSummary';
import { CurrencyBreakdown } from './CurrencyBreakdown';
import { AllocationTreemap } from './AllocationTreemap';
import { HoldingsTable } from './HoldingsTable';
import { TrendChart } from './TrendChart';
import { SettingsPanel } from './SettingsPanel';

export function Layout() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>投資儀表板</h1>
      </header>
      <main className="app-main">
        <PortfolioSummary />
        <CurrencyBreakdown />
        <AllocationTreemap />
        <HoldingsTable />
        <TrendChart />
        <SettingsPanel />
      </main>
    </div>
  );
}
