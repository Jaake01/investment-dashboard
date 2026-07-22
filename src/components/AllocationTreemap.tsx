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
  percent: number;
  [key: string]: unknown;
}

function toTreemapData(slices: AllocationSlice[], colorFor: (key: string, index: number) => string): TreemapDatum[] {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  return slices.map((s, i) => {
    const percent = total > 0 ? (s.value / total) * 100 : 0;
    return {
      name: s.label,
      value: s.value,
      fill: colorFor(s.key, i),
      percentLabel: `${percent.toFixed(1)}%`,
      percent,
    };
  });
}

let measureCanvas: HTMLCanvasElement | null = null;
function measureTextWidth(text: string, fontSize: number, fontWeight: number): number {
  if (typeof document === 'undefined') return text.length * fontSize * 0.6;
  if (!measureCanvas) measureCanvas = document.createElement('canvas');
  const ctx = measureCanvas.getContext('2d');
  if (!ctx) return text.length * fontSize * 0.6;
  ctx.font = `${fontWeight} ${fontSize}px sans-serif`;
  return ctx.measureText(text).width;
}

const LABEL_PADDING = 6;
const MIN_FONT_SIZE = 9;
const MAX_NAME_FONT_SIZE = 26;

// Largest font size (down to MIN_FONT_SIZE) at which `text` still fits
// within maxWidth; 0 if it doesn't fit even at the minimum.
function fitFontSize(text: string, maxSize: number, maxWidth: number, weight: number): number {
  for (let size = maxSize; size >= MIN_FONT_SIZE; size -= 1) {
    if (measureTextWidth(text, size, weight) <= maxWidth) return size;
  }
  return 0;
}

function TreemapCell(props: any) {
  const { x, y, width, height, name, fill, percentLabel, percent } = props;
  const maxTextWidth = width - LABEL_PADDING * 2;

  // Desired size scales with the block's share of the total (bigger slice ->
  // bigger text), then gets clamped down to whatever actually fits the
  // block so it never overflows — proportional first, legible always.
  const desiredNameSize = Math.min(MAX_NAME_FONT_SIZE, MIN_FONT_SIZE + (percent / 100) * 90);
  const nameFontSize = fitFontSize(name, desiredNameSize, maxTextWidth, 600);
  const percentFontSize = nameFontSize > 0 ? fitFontSize(percentLabel, Math.round(nameFontSize * 0.75), maxTextWidth, 400) : 0;

  const lineGap = 2;
  const showPercent = percentFontSize > 0 && height > nameFontSize + percentFontSize + lineGap + LABEL_PADDING;
  const showName = nameFontSize > 0 && height > nameFontSize + LABEL_PADDING;

  const centerX = x + width / 2;
  const centerY = y + height / 2;
  const nameY = showPercent ? centerY - (percentFontSize + lineGap) / 2 : centerY;
  const percentY = centerY + (nameFontSize + lineGap) / 2;

  return (
    <g>
      <rect x={x} y={y} width={width} height={height} style={{ fill, stroke: 'var(--card-bg)', strokeWidth: 2 }} />
      {showName && (
        <text x={centerX} y={nameY} textAnchor="middle" dominantBaseline="central" fill="#fff" fontSize={nameFontSize} fontWeight={600}>
          {name}
        </text>
      )}
      {showPercent && (
        <text x={centerX} y={percentY} textAnchor="middle" dominantBaseline="central" fill="#fff" fontSize={percentFontSize} opacity={0.9}>
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

      <div className="tab-bar">
        <button
          className={`tab-button ${selectedClass === null ? 'active' : ''}`}
          onClick={() => setSelectedClass(null)}
        >
          總覽
        </button>
        {topLevel.map((s) => (
          <button
            key={s.key}
            className={`tab-button ${selectedClass === s.key ? 'active' : ''}`}
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
        <ResponsiveContainer width="100%" height={360}>
          <Treemap
            data={data}
            dataKey="value"
            nameKey="name"
            stroke="var(--card-bg)"
            nodeGap={3}
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
