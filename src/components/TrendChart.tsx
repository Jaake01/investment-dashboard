import { useId, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { usePortfolio } from '../context/PortfolioContext';
import { formatCurrencyIn } from '../lib/format';
import { ASSET_CLASSES, ASSET_CLASS_LABELS, CURRENCY_FOR_ASSET_CLASS, CURRENCY_LABELS } from '../types';
import type { AssetClass, Snapshot } from '../types';

type Series = 'total' | AssetClass;
type RangeDays = 7 | 30 | 180 | 365 | 'all';

const RANGE_OPTIONS: { value: RangeDays; label: string }[] = [
  { value: 7, label: '7天' },
  { value: 30, label: '1月' },
  { value: 180, label: '6月' },
  { value: 365, label: '1年' },
  { value: 'all', label: '全部' },
];

function addDaysStr(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86_400_000);
}

interface TrendPoint {
  date: string;
  value: number | null;
}

// Builds one point per calendar day (not one per snapshot) so a day with no
// recorded snapshot shows up as a real gap in the series (value: null) —
// otherwise the chart would silently draw a smooth line straight across
// missing days, making a multi-day recording outage look like a genuine
// gradual value change.
function buildTrendPoints(snapshots: Snapshot[], series: Series, range: RangeDays): TrendPoint[] {
  const valueByDate = new Map<string, number>();
  for (const s of snapshots) {
    const v = series === 'total' ? s.totalValue : s.classValues?.[series];
    // Non-finite values (a null total from an old daily-snapshot Action run)
    // count as "no reading" rather than as a data point — otherwise such a
    // date can become the series' first or last point and shift the whole
    // selected range onto days that render as an empty gap.
    if (Number.isFinite(v)) valueByDate.set(s.date, v as number);
  }
  const dates = Array.from(valueByDate.keys()).sort();
  if (dates.length === 0) return [];

  const latest = dates[dates.length - 1];
  const earliestAvailable = dates[0];
  const rangeStart = range === 'all' ? earliestAvailable : addDaysStr(latest, -(range - 1));
  const start = rangeStart > earliestAvailable ? rangeStart : earliestAvailable;

  const totalDays = daysBetween(start, latest) + 1;
  const points: TrendPoint[] = [];
  for (let i = 0; i < totalDays; i++) {
    const date = addDaysStr(start, i);
    points.push({ date, value: valueByDate.get(date) ?? null });
  }
  return points;
}

export function TrendChart() {
  const { snapshots } = usePortfolio();
  const [series, setSeries] = useState<Series>('total');
  const [range, setRange] = useState<RangeDays>('all');
  const gradientId = useId();

  const currency = series === 'total' ? 'TWD' : CURRENCY_FOR_ASSET_CLASS[series];
  const points = buildTrendPoints(snapshots, series, range);
  const validPointCount = points.filter((p) => p.value !== null).length;
  const tickInterval = Math.max(0, Math.ceil(points.length / 8) - 1);

  return (
    <section className="card">
      <div className="card-header">
        <h2>歷史趨勢</h2>
        <div className="card-header-controls">
          <select value={series} onChange={(e) => setSeries(e.target.value as Series)}>
            <option value="total">總市值（{CURRENCY_LABELS.TWD}）</option>
            {ASSET_CLASSES.map((assetClass) => (
              <option key={assetClass} value={assetClass}>
                {ASSET_CLASS_LABELS[assetClass]}（{CURRENCY_LABELS[CURRENCY_FOR_ASSET_CLASS[assetClass]]}）
              </option>
            ))}
          </select>
          <div className="theme-toggle" role="group" aria-label="時間範圍">
            {RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                className={`theme-toggle-btn ${range === opt.value ? 'active' : ''}`}
                onClick={() => setRange(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      {validPointCount < 2 ? (
        <p className="empty-state">刷新報價後會記錄每日快照，累積至少 2 筆這個類別的資料即可看到趨勢圖。</p>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={points}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.35} />
                <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="date" stroke="var(--text-muted)" interval={tickInterval} />
            <YAxis tickFormatter={(v: number) => formatCurrencyIn(v, currency)} width={90} stroke="var(--text-muted)" domain={['auto', 'auto']} />
            <Tooltip formatter={(value) => (value === null ? '無資料' : formatCurrencyIn(Number(value), currency))} />
            <Area
              type="monotone"
              dataKey="value"
              name={series === 'total' ? '總市值' : ASSET_CLASS_LABELS[series]}
              stroke="var(--accent)"
              strokeWidth={2}
              fill={`url(#${gradientId})`}
              connectNulls={false}
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </section>
  );
}
