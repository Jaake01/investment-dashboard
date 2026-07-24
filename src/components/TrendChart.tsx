import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { usePortfolio } from '../context/PortfolioContext';
import { formatCurrencyIn } from '../lib/format';

export function TrendChart() {
  const { snapshots } = usePortfolio();

  return (
    <section className="card">
      <h2>歷史趨勢（台幣）</h2>
      {snapshots.length < 2 ? (
        <p className="empty-state">刷新報價後會記錄每日總市值快照（換算成台幣），累積至少 2 筆資料即可看到趨勢圖。</p>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={snapshots}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="date" stroke="var(--text-muted)" />
            <YAxis tickFormatter={(v: number) => formatCurrencyIn(v, 'TWD')} width={90} stroke="var(--text-muted)" />
            <Tooltip formatter={(value) => formatCurrencyIn(Number(value), 'TWD')} />
            <Line type="monotone" dataKey="totalValue" name="總市值" stroke="var(--accent)" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </section>
  );
}
