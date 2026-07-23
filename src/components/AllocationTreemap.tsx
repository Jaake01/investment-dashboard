import { useState } from 'react';
import { ResponsiveContainer, Tooltip, Treemap } from 'recharts';
import { usePortfolio } from '../context/PortfolioContext';
import { useFxRate } from '../hooks/useFxRate';
import {
  computeAllocation,
  computeClassValues,
  computeDayChangePct,
  computeHoldingMetrics,
  computeHoldingsWithinClass,
  computePreviousClassValue,
  computePreviousSymbolValue,
  type AllocationSlice,
} from '../lib/calculations';
import { formatCurrencyIn, formatPercent } from '../lib/format';
import { monogramColorFor, monogramFor, realIconUrlFor } from '../lib/icons';
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

interface TreemapIcon {
  iconUrl: string | null;
  monogram: string;
  monogramColor: string;
}

interface TreemapDatum {
  name: string;
  value: number;
  fill: string;
  percentLabel: string;
  percent: number;
  changePct: number | null;
  icon: TreemapIcon | null;
  [key: string]: unknown;
}

function toTreemapData(
  slices: AllocationSlice[],
  colorFor: (key: string, index: number) => string,
  changeFor: (key: string) => number | null,
  iconFor: (key: string) => TreemapIcon | null,
): TreemapDatum[] {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  return slices.map((s, i) => {
    const percent = total > 0 ? (s.value / total) * 100 : 0;
    return {
      name: s.label,
      value: s.value,
      fill: colorFor(s.key, i),
      percentLabel: `${percent.toFixed(1)}%`,
      percent,
      changePct: changeFor(s.key),
      icon: iconFor(s.key),
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

// Taiwan market convention: up is red, down is green.
const CHANGE_UP_COLOR = '#ef4444';
const CHANGE_DOWN_COLOR = '#22c55e';

// Below this, a block is too small for an icon badge to read as anything
// but noise — falls back to text-only, same as before icons existed.
const MIN_CELL_SIZE_FOR_ICON = 70;
const MIN_ICON_SIZE = 22;
const MAX_ICON_SIZE = 44;
const ICON_GAP = 6;

function TreemapCell(props: any) {
  const { x, y, width, height, name, fill, percentLabel, percent, changePct, icon } = props;
  const maxTextWidth = width - LABEL_PADDING * 2;

  // Desired size scales with the block's share of the total (bigger slice ->
  // bigger text), then gets clamped down to whatever actually fits the
  // block so it never overflows — proportional first, legible always.
  const desiredNameSize = Math.min(MAX_NAME_FONT_SIZE, MIN_FONT_SIZE + (percent / 100) * 90);
  const nameFontSize = fitFontSize(name, desiredNameSize, maxTextWidth, 600);
  const percentFontSize = nameFontSize > 0 ? fitFontSize(percentLabel, Math.round(nameFontSize * 0.75), maxTextWidth, 400) : 0;

  const changeLabel = changePct === null || changePct === undefined ? null : formatPercent(changePct);
  const changeColor = changePct === null || changePct === undefined ? null : changePct > 0 ? CHANGE_UP_COLOR : changePct < 0 ? CHANGE_DOWN_COLOR : '#fff';
  const changeFontSize =
    changeLabel && percentFontSize > 0 ? fitFontSize(changeLabel, Math.max(MIN_FONT_SIZE, percentFontSize - 1), maxTextWidth, 700) : 0;

  const iconSize =
    icon && Math.min(width, height) >= MIN_CELL_SIZE_FOR_ICON
      ? Math.min(MAX_ICON_SIZE, Math.max(MIN_ICON_SIZE, Math.min(width, height) * 0.32))
      : 0;

  const lineGap = 2;
  const showPercent = percentFontSize > 0 && height > nameFontSize + percentFontSize + lineGap + LABEL_PADDING;
  const showChange = showPercent && changeFontSize > 0 && height > nameFontSize + percentFontSize + changeFontSize + lineGap * 2 + LABEL_PADDING;
  const showName = nameFontSize > 0 && height > nameFontSize + LABEL_PADDING;
  const showIcon = showName && iconSize > 0 && height > iconSize + ICON_GAP + nameFontSize + LABEL_PADDING;

  const centerX = x + width / 2;
  const centerY = y + height / 2;
  const contentHeight =
    (showIcon ? iconSize + ICON_GAP : 0) +
    nameFontSize +
    (showPercent ? percentFontSize + lineGap : 0) +
    (showChange ? changeFontSize + lineGap : 0);
  const topY = centerY - contentHeight / 2;
  const iconCy = topY + iconSize / 2;
  const nameY = topY + (showIcon ? iconSize + ICON_GAP : 0) + nameFontSize / 2;
  const percentY = nameY + nameFontSize / 2 + lineGap + percentFontSize / 2;
  const changeY = percentY + percentFontSize / 2 + lineGap + changeFontSize / 2;

  const changePillWidth = showChange ? measureTextWidth(changeLabel!, changeFontSize, 700) + 10 : 0;
  const clipId = `treemap-icon-clip-${Math.round(x)}-${Math.round(y)}`;

  return (
    <g>
      <rect x={x} y={y} width={width} height={height} style={{ fill, stroke: 'var(--card-bg)', strokeWidth: 2 }} />
      {showIcon && (
        <>
          <circle cx={centerX} cy={iconCy} r={iconSize / 2} fill={icon.monogramColor} />
          <text x={centerX} y={iconCy} textAnchor="middle" dominantBaseline="central" fill="#fff" fontSize={iconSize * 0.4} fontWeight={700}>
            {icon.monogram}
          </text>
          {icon.iconUrl && (
            <>
              <clipPath id={clipId}>
                <circle cx={centerX} cy={iconCy} r={iconSize / 2} />
              </clipPath>
              <image
                x={centerX - iconSize / 2}
                y={iconCy - iconSize / 2}
                width={iconSize}
                height={iconSize}
                href={icon.iconUrl}
                clipPath={`url(#${clipId})`}
                onError={(e) => {
                  (e.currentTarget as SVGImageElement).style.display = 'none';
                }}
              />
            </>
          )}
        </>
      )}
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
      {showChange && (
        <>
          <rect
            x={centerX - changePillWidth / 2}
            y={changeY - changeFontSize / 2 - 2}
            width={changePillWidth}
            height={changeFontSize + 4}
            rx={changeFontSize / 2 + 2}
            fill="rgba(0,0,0,0.35)"
          />
          <text x={centerX} y={changeY} textAnchor="middle" dominantBaseline="central" fill={changeColor ?? '#fff'} fontSize={changeFontSize} fontWeight={700}>
            {changeLabel}
          </text>
        </>
      )}
    </g>
  );
}

export function AllocationTreemap() {
  const { holdings, prices, snapshots } = usePortfolio();
  const { effectiveUsdToTwd } = useFxRate();
  const [selectedClass, setSelectedClass] = useState<AssetClass | null>(null);

  const metrics = holdings.map((h) => computeHoldingMetrics(h, prices));
  const topLevel = computeAllocation(metrics, 'assetClass', effectiveUsdToTwd);
  const classValuesToday = computeClassValues(metrics);

  const drillMetrics = selectedClass ? metrics.filter((m) => m.holding.assetClass === selectedClass) : [];
  const drillLevel = selectedClass ? computeHoldingsWithinClass(drillMetrics) : [];

  const data = selectedClass
    ? toTreemapData(
        drillLevel,
        (_key, i) => DRILL_COLORS[i % DRILL_COLORS.length],
        (key) => {
          const symbol = drillMetrics.find((m) => m.holding.id === key)?.holding.symbol;
          if (!symbol) return null;
          const slice = drillLevel.find((s) => s.key === key);
          if (!slice) return null;
          return computeDayChangePct(slice.value, computePreviousSymbolValue(snapshots, symbol));
        },
        (key) => {
          const symbol = drillMetrics.find((m) => m.holding.id === key)?.holding.symbol;
          if (!symbol) return null;
          return {
            iconUrl: realIconUrlFor(symbol, selectedClass),
            monogram: monogramFor(symbol),
            monogramColor: monogramColorFor(symbol),
          };
        },
      )
    : toTreemapData(
        topLevel,
        (key) => CLASS_COLORS[key as AssetClass],
        (key) => {
          const assetClass = key as AssetClass;
          const todayValue = classValuesToday[assetClass] ?? 0;
          return computeDayChangePct(todayValue, computePreviousClassValue(snapshots, assetClass));
        },
        () => null,
      );

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
                const payload = item?.payload as TreemapDatum | undefined;
                const percentLabel = payload?.percentLabel ?? '';
                const changeLabel = payload?.changePct != null ? `，較昨日 ${formatPercent(payload.changePct)}` : '';
                return [`${formatCurrencyIn(Number(value), currency)}（${percentLabel}${changeLabel}）`, ''];
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
