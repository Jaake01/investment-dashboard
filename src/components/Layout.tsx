import { PortfolioSummary } from './PortfolioSummary';
import { HoldingsTable } from './HoldingsTable';
import { AllocationChart } from './AllocationChart';
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
        <HoldingsTable />
        <div className="charts-grid">
          <AllocationChart />
          <TrendChart />
        </div>
        <SettingsPanel />
      </main>
    </div>
  );
}
