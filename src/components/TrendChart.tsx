import { useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { usePortfolio } from '../context/PortfolioContext';
import { formatCurrencyIn } from '../lib/format';
import { ASSET_CLASSES, ASSET_CLASS_LABELS, CURRENCY_FOR_ASSET_CLASS, CURRENCY_LABELS } from '../types';
import type { AssetClass } from '../types';

type Series = 'total' | AssetClass;

export function TrendChart() {
  const { snapshots } = usePortfolio();
  const [series, setSeries] = useState<Series>('total');

  const currency = series === 'total' ? 'TWD' : CURRENCY_FOR_ASSET_CLASS[series];
  const data =
    series === 'total'
      ? snapshots.map((s) => ({ date: s.date, value: s.totalValue }))
      : snapshots.filter((s) => s.classValues?.[series] !== undefined).map((s) => ({ date: s.date, value: s.classValues![series]! }));

  return (
    <section className="card">
      <div className="card-header">
        <h2>歷史趨勢</h2>
        <select value={series} onChange={(e) => setSeries(e.target.value as Series)}>
          <option value="total">總市值（{CURRENCY_LABELS.TWD}）</option>
          {ASSET_CLASSES.map((assetClass) => (
            <option key={assetClass} value={assetClass}>
              {ASSET_CLASS_LABELS[assetClass]}（{CURRENCY_LABELS[CURRENCY_FOR_ASSET_CLASS[assetClass]]}）
            </option>
          ))}
        </select>
      </div>
      {data.length < 2 ? (
        <p className="empty-state">刷新報價後會記錄每日快照，累積至少 2 筆這個類別的資料即可看到趨勢圖。</p>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="date" stroke="var(--text-muted)" />
            <YAxis tickFormatter={(v: number) => formatCurrencyIn(v, currency)} width={90} stroke="var(--text-muted)" />
            <Tooltip formatter={(value) => formatCurrencyIn(Number(value), currency)} />
            <Line
              type="monotone"
              dataKey="value"
              name={series === 'total' ? '總市值' : ASSET_CLASS_LABELS[series]}
              stroke="var(--accent)"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </section>
  );
}
