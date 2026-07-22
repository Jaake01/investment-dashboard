import { useState } from 'react';
import { ResponsiveContainer, Tooltip, Treemap } from 'recharts';
import { usePortfolio } from '../context/PortfolioContext';
import { useFxRate } from '../hooks/useFxRate';
import { computeAllocation, computeHoldingMetrics, computeHoldingsWithinClass, type AllocationSlice } from '../lib/calculations';
import { formatCurrencyIn } from '../lib/format';
import { ASSET_CLASS_LABELS, CURRENCY_FOR_ASSET_CLASS, type AssetClass } from '../types';

// Fixed per-class colors so a block's color always identifies the same asset
// class across renders, regardless of how the classes rank by value.
const CLASS_COLORS: Record<AssetClass, string> = {
  us_stock: '#2563eb',
  tw_stock: '#16a34a',
  crypto: '#d97706',
  cash: '#0891b2',
  other: '#7c3aed',
};

const DRILL_COLORS = ['#2563eb', '#16a34a', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#db2777', '#65a30d'];

interface TreemapDatum {
  name: string;
  value: number;
  fill: string;
  percentLabel: string;
  [key: string]: unknown;
}

function toTreemapData(slices: AllocationSlice[], colorFor: (key: string, index: number) => string): TreemapDatum[] {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  return slices.map((s, i) => ({
    name: s.label,
    value: s.value,
    fill: colorFor(s.key, i),
    percentLabel: total > 0 ? `${((s.value / total) * 100).toFixed(1)}%` : '0%',
  }));
}

function TreemapCell(props: any) {
  const { x, y, width, height, name, fill, percentLabel } = props;
  const canLabel = width > 46 && height > 28;
  const canShowPercent = canLabel && height > 46;
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} style={{ fill, stroke: 'var(--card-bg)', strokeWidth: 2 }} />
      {canLabel && (
        <text x={x + 8} y={y + 18} fill="#fff" fontSize={12} fontWeight={600}>
          {name}
        </text>
      )}
      {canShowPercent && (
        <text x={x + 8} y={y + 34} fill="#fff" fontSize={11} opacity={0.9}>
          {percentLabel}
        </text>
      )}
    </g>
  );
}

export function AllocationTreemap() {
  const { holdings, prices } = usePortfolio();
  const { effectiveUsdToTwd } = useFxRate();
  const [selectedClass, setSelectedClass] = useState<AssetClass | null>(null);

  const metrics = holdings.map((h) => computeHoldingMetrics(h, prices));
  const topLevel = computeAllocation(metrics, 'assetClass', effectiveUsdToTwd);

  const drillMetrics = selectedClass ? metrics.filter((m) => m.holding.assetClass === selectedClass) : [];
  const drillLevel = selectedClass ? computeHoldingsWithinClass(drillMetrics) : [];

  const data = selectedClass
    ? toTreemapData(drillLevel, (_key, i) => DRILL_COLORS[i % DRILL_COLORS.length])
    : toTreemapData(topLevel, (key) => CLASS_COLORS[key as AssetClass]);

  const isEmpty = data.length === 0;

  return (
    <section className="card">
      <div className="card-header">
        <h2>資產配置{selectedClass ? `（${ASSET_CLASS_LABELS[selectedClass]}）` : ''}</h2>
      </div>

      <div className="treemap-tabs">
        <button
          className={`treemap-tab ${selectedClass === null ? 'active' : ''}`}
          onClick={() => setSelectedClass(null)}
        >
          總覽
        </button>
        {topLevel.map((s) => (
          <button
            key={s.key}
            className={`treemap-tab ${selectedClass === s.key ? 'active' : ''}`}
            onClick={() => setSelectedClass(s.key as AssetClass)}
          >
            {s.label}
          </button>
        ))}
      </div>

      {isEmpty ? (
        <p className="empty-state">
          {selectedClass ? '這個類別目前沒有持股。' : '新增持股並取得市值後即可看到配置圖表。'}
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={320}>
          <Treemap
            data={data}
            dataKey="value"
            nameKey="name"
            stroke="var(--card-bg)"
            content={<TreemapCell />}
            isAnimationActive={false}
          >
            <Tooltip
              formatter={(value, _name, item) => {
                const currency = selectedClass ? CURRENCY_FOR_ASSET_CLASS[selectedClass] : 'TWD';
                const percentLabel = (item?.payload as TreemapDatum | undefined)?.percentLabel ?? '';
                return [`${formatCurrencyIn(Number(value), currency)}（${percentLabel}）`, ''];
              }}
            />
          </Treemap>
        </ResponsiveContainer>
      )}

      {!selectedClass && effectiveUsdToTwd === null && topLevel.length > 0 && (
        <p className="settings-hint">尚未取得匯率，比例可能不準確（不同幣別的市值目前直接相加）。</p>
      )}
    </section>
  );
}
