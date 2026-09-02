import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { usePortfolio } from '../context/PortfolioContext';
import { computeGainPct } from '../lib/calculations';
import { formatPercent } from '../lib/format';
import type { Snapshot } from '../types';

interface GainPoint {
  date: string;
  gainPct: number;
}

// Only plots days that actually have both a market value and a cost basis
// recorded for 美股 (older snapshots from before cost tracking was added
// won't) — a day with only a value would otherwise have to fake a cost, or
// the line would have to skip a beat.
function buildGainPoints(snapshots: Snapshot[]): GainPoint[] {
  const points: GainPoint[] = [];
  for (const s of snapshots) {
    const value = s.classValues?.us_stock;
    const cost = s.classCostValues?.us_stock;
    if (value === undefined || cost === undefined) continue;
    const gainPct = computeGainPct(value, cost);
    if (gainPct === null) continue;
    points.push({ date: s.date, gainPct });
  }
  return points;
}

export function UsStockGainChart() {
  const { snapshots } = usePortfolio();
  const points = buildGainPoints(snapshots);

  return (
    <section className="card">
      <h2>美股損益%走勢</h2>
      {points.length < 2 ? (
        <p className="empty-state">刷新報價後會記錄每日美股損益%快照，累積至少 2 筆資料即可看到走勢圖。</p>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={points}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="date" stroke="var(--text-muted)" />
            <YAxis tickFormatter={(v: number) => formatPercent(v)} width={70} stroke="var(--text-muted)" />
            <Tooltip formatter={(value) => formatPercent(Number(value))} />
            <ReferenceLine y={0} stroke="var(--text-muted)" strokeDasharray="3 3" />
            <Line type="monotone" dataKey="gainPct" name="美股損益%" stroke="var(--accent)" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </section>
  );
}
