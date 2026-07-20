import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { usePortfolio } from '../context/PortfolioContext';
import { formatCurrency } from '../lib/format';

export function TrendChart() {
  const { snapshots } = usePortfolio();

  return (
    <section className="card">
      <h2>歷史趨勢</h2>
      {snapshots.length < 2 ? (
        <p className="empty-state">刷新報價後會記錄每日總市值快照，累積至少 2 筆資料即可看到趨勢圖。</p>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={snapshots}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis tickFormatter={(v: number) => formatCurrency(v)} width={90} />
            <Tooltip formatter={(value) => formatCurrency(Number(value))} />
            <Line type="monotone" dataKey="totalValue" name="總市值" stroke="#2563eb" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </section>
  );
}
