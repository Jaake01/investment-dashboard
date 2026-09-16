import { useId, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { usePortfolio } from '../context/PortfolioContext';
import { computeGainPct } from '../lib/calculations';
import { formatCurrencyIn, formatPercent } from '../lib/format';
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

interface GainPoint {
  date: string;
  gainPct: number | null;
}

// Shared by both stacked charts below, so their X axes always land on the
// same calendar days — always anchored to 總資產's own date coverage,
// regardless of which series the dropdown has selected, so switching it
// never shifts the 美股損益% chart underneath out of alignment. The one
// trade-off: a date with a valid 美股 reading but a broken 總資產 for that
// day (e.g. an old Action snapshot with a null total) would be excluded
// here and so wouldn't show in either chart — rare in practice, and worth
// it for the two charts staying visually lined up date-for-date.
function computeDateRange(snapshots: Snapshot[], range: RangeDays): string[] {
  const dates = new Set<string>();
  for (const s of snapshots) {
    if (Number.isFinite(s.totalValue)) dates.add(s.date);
  }
  const sorted = Array.from(dates).sort();
  if (sorted.length === 0) return [];

  const latest = sorted[sorted.length - 1];
  const earliestAvailable = sorted[0];
  const rangeStart = range === 'all' ? earliestAvailable : addDaysStr(latest, -(range - 1));
  const start = rangeStart > earliestAvailable ? rangeStart : earliestAvailable;

  const totalDays = daysBetween(start, latest) + 1;
  const out: string[] = [];
  for (let i = 0; i < totalDays; i++) out.push(addDaysStr(start, i));
  return out;
}

// One point per date in `dates` (not one per snapshot), so a day with no
// recorded snapshot shows up as a real gap in the series (value: null) —
// otherwise the chart would silently draw a smooth line straight across
// missing days, making a multi-day recording outage look like a genuine
// gradual value change.
function buildTrendPoints(snapshots: Snapshot[], series: Series, dates: string[]): TrendPoint[] {
  const valueByDate = new Map<string, number>();
  for (const s of snapshots) {
    const v = series === 'total' ? s.totalValue : s.classValues?.[series];
    // Non-finite values (a null total from an old daily-snapshot Action run)
    // count as "no reading" rather than as a data point.
    if (Number.isFinite(v)) valueByDate.set(s.date, v as number);
  }
  return dates.map((date) => ({ date, value: valueByDate.get(date) ?? null }));
}

// Same "one point per calendar day, null for a gap" treatment as
// buildTrendPoints — only plots days that actually have both a market value
// and a cost basis recorded for 美股 (older snapshots from before cost
// tracking was added won't).
function buildGainPoints(snapshots: Snapshot[], dates: string[]): GainPoint[] {
  const gainByDate = new Map<string, number>();
  for (const s of snapshots) {
    const value = s.classValues?.us_stock;
    const cost = s.classCostValues?.us_stock;
    if (value === undefined || cost === undefined) continue;
    const gainPct = computeGainPct(value, cost);
    if (gainPct === null) continue;
    gainByDate.set(s.date, gainPct);
  }
  return dates.map((date) => ({ date, gainPct: gainByDate.get(date) ?? null }));
}

// 總資產／各類別的歷史趨勢，跟美股損益%走勢收進同一張卡片、共用同一條
// 時間軸（見 computeDateRange）——兩張圖疊在一起看，比原本拆成兩張各自
// 獨立捲動的卡片更容易對出同一天兩邊的數字，也省掉重複的時間範圍選擇。
export function TrendChart() {
  const { snapshots } = usePortfolio();
  const [series, setSeries] = useState<Series>('total');
  // Defaults to the last month rather than the full history: with months of
  // data the whole range flattens recent movement into a straight line, and
  // the last month is what actually gets looked at day to day.
  const [range, setRange] = useState<RangeDays>(30);
  const gradientId = useId();
  const gainGradientId = useId();

  const currency = series === 'total' ? 'TWD' : CURRENCY_FOR_ASSET_CLASS[series];
  const dates = computeDateRange(snapshots, range);
  const points = buildTrendPoints(snapshots, series, dates);
  const gainPoints = buildGainPoints(snapshots, dates);
  const validPointCount = points.filter((p) => p.value !== null).length;
  const validGainCount = gainPoints.filter((p) => p.gainPct !== null).length;
  // Taiwan market convention: red above zero, green below (see .change-up/
  // .change-down elsewhere in the app) — applied to the line itself via a
  // vertical gradient that switches color exactly at the y=0 crossing,
  // rather than a single fixed color for the whole line. `gainMax`/`gainMin`
  // both fold in 0 itself, so an all-positive or all-negative range still
  // produces a valid split (entirely red, or entirely green) instead of
  // dividing by zero — and the YAxis domain below is set to this same
  // [gainMin, gainMax] range so the gradient's stop position always lands
  // exactly on the chart's own zero line, however the range is filtered.
  const gainValues = gainPoints.map((p) => p.gainPct).filter((v): v is number => v !== null);
  const gainMax = gainValues.length ? Math.max(...gainValues, 0) : 0;
  const gainMin = gainValues.length ? Math.min(...gainValues, 0) : 0;
  const gainZeroOffset = gainMax === gainMin ? 0.5 : gainMax / (gainMax - gainMin);
  // Same tick spacing for both charts (they share the same `dates` array),
  // so their X axis ticks land in the same place even though only the
  // bottom chart actually draws its labels.
  const tickInterval = Math.max(0, Math.ceil(dates.length / 8) - 1);

  return (
    <section className="card">
      <div className="card-header">
        <h2>歷史趨勢</h2>
        <div className="card-header-controls">
          <select value={series} onChange={(e) => setSeries(e.target.value as Series)}>
            {/* Named 總資產 to match the summary card at the top of the page:
                totalValue already has the 現金帳戶 balance folded in (see
                usePrices.ts), so this really is the whole account, not just
                the holdings' market value. */}
            <option value="total">總資產（{CURRENCY_LABELS.TWD}）</option>
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
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={points}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.35} />
                <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            {/* No tick labels here — the bottom chart's X axis (same `dates`,
                same tickInterval) carries the dates for both, so the two
                stay visually stacked as one unit instead of repeating the
                same row of dates twice. */}
            <XAxis dataKey="date" stroke="var(--text-muted)" interval={tickInterval} tick={false} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={(v: number) => formatCurrencyIn(v, currency)} width={90} stroke="var(--text-muted)" domain={['auto', 'auto']} />
            <Tooltip formatter={(value) => (value === null ? '無資料' : formatCurrencyIn(Number(value), currency))} />
            <Area
              type="monotone"
              dataKey="value"
              name={series === 'total' ? '總資產' : ASSET_CLASS_LABELS[series]}
              stroke="var(--accent)"
              strokeWidth={3}
              fill={`url(#${gradientId})`}
              connectNulls={false}
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}

      <h3 className="subchart-title">損益走勢</h3>
      {validGainCount < 2 ? (
        <p className="empty-state">刷新報價後會記錄每日美股損益%快照，累積至少 2 筆資料即可看到走勢圖。</p>
      ) : (
        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={gainPoints}>
            <defs>
              {/* Switches the line's own color exactly at the y=0 crossing
                  (see gainZeroOffset above) — red above zero, green below,
                  Taiwan market convention (same colors as .change-up/
                  .change-down elsewhere in the app). */}
              <linearGradient id={gainGradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset={gainZeroOffset} stopColor="var(--loss)" />
                <stop offset={gainZeroOffset} stopColor="var(--gain)" />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="date" stroke="var(--text-muted)" interval={tickInterval} />
            {/* Same width as the chart above's YAxis (90) — not this axis's
                own narrower content ("+27.0%" needs far less). Different
                widths would shift each chart's plot area by a different
                amount, so the same date wouldn't land at the same X pixel
                in both charts even though they share the same `dates` and
                tickInterval — the whole reason for stacking them here. */}
            <YAxis tickFormatter={(v: number) => formatPercent(v)} width={90} stroke="var(--text-muted)" domain={[gainMin, gainMax]} />
            <Tooltip formatter={(value) => (value === null ? '無資料' : formatPercent(Number(value)))} />
            <ReferenceLine y={0} stroke="var(--text-muted)" strokeDasharray="3 3" />
            <Line
              type="monotone"
              dataKey="gainPct"
              name="損益%"
              stroke={`url(#${gainGradientId})`}
              strokeWidth={3}
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </section>
  );
}
