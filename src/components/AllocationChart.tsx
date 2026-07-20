import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { usePortfolio } from '../context/PortfolioContext';
import { computeAllocation, computeHoldingMetrics } from '../lib/calculations';
import { formatCurrency } from '../lib/format';

const COLORS = ['#2563eb', '#16a34a', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#db2777', '#65a30d'];

export function AllocationChart() {
  const { holdings, prices, settings, setSettings } = usePortfolio();
  const metrics = holdings.map((h) => computeHoldingMetrics(h, prices));
  const allocation = computeAllocation(metrics, settings.allocationGroupBy);

  return (
    <section className="card">
      <div className="card-header">
        <h2>資產配置</h2>
        <select
          value={settings.allocationGroupBy}
          onChange={(e) => setSettings({ allocationGroupBy: e.target.value as 'holding' | 'assetClass' })}
        >
          <option value="holding">依持股</option>
          <option value="assetClass">依資產類別</option>
        </select>
      </div>

      {allocation.length === 0 ? (
        <p className="empty-state">新增持股並取得市值後即可看到配置圖表。</p>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Pie data={allocation} dataKey="value" nameKey="label" innerRadius={60} outerRadius={100} paddingAngle={2}>
              {allocation.map((entry, index) => (
                <Cell key={entry.key} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(value) => formatCurrency(Number(value))} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      )}
    </section>
  );
}
