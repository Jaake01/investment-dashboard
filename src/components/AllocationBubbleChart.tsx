import { useEffect, useMemo, useRef, useState, type MouseEvent, type RefObject } from 'react';
import { usePortfolio } from '../context/PortfolioContext';
import { useFxRate } from '../hooks/useFxRate';
import {
  computeDayChangePct,
  computeHoldingMetrics,
  computePreviousSymbolValue,
  convertToTwd,
  type HoldingMetrics,
} from '../lib/calculations';
import { formatCurrencyIn, formatPercent } from '../lib/format';
import { monogramColorFor, monogramFor, realIconUrlFor } from '../lib/icons';
import { ASSET_CLASS_LABELS, ASSET_CLASSES, CURRENCY_FOR_ASSET_CLASS, type AssetClass, type Currency, type Snapshot } from '../types';

// One base hue per asset class, spread evenly around the full color wheel
// (~70-90° apart) so classes stay visually distinct from each other —
// crypto red-orange, us_stock yellow-green, tw_stock blue-violet (per
// request), with cash/other filling the remaining gaps. Individual holdings
// within a class get a hue/shade variation around that base (see
// bubbleColorFor) so same-class bubbles read as related at a glance while
// still being clearly distinguishable from each other.
const CLASS_HUE: Record<AssetClass, number> = {
  crypto: 15,
  us_stock: 80,
  other: 165,
  tw_stock: 255,
  cash: 315,
};

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function bubbleColorFor(assetClass: AssetClass, seed: string): string {
  const hash = hashString(seed);
  const hue = CLASS_HUE[assetClass] + ((hash % 37) - 18);
  const saturation = 48 + ((hash >> 4) % 38);
  const lightness = 36 + ((hash >> 9) % 26);
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

interface BubbleIcon {
  iconUrl: string | null;
  monogram: string;
  monogramColor: string;
}

interface BubbleDatum {
  key: string;
  name: string;
  value: number;
  percent: number;
  percentLabel: string;
  fill: string;
  changePct: number | null;
  icon: BubbleIcon | null;
  assetClass: AssetClass;
}

function buildBubbleData(
  metrics: HoldingMetrics[],
  selectedClass: AssetClass | null,
  usdToTwd: number | null,
  snapshots: Snapshot[],
): BubbleDatum[] {
  const scoped = selectedClass ? metrics.filter((m) => m.holding.assetClass === selectedClass) : metrics;
  const entries = scoped
    .filter((m) => m.marketValue > 0)
    .map((m) => ({
      m,
      // Combined view mixes currencies, so it converts to TWD (falling back
      // to the native value when no FX rate is available yet, same as
      // computeAllocation). A single-class view is already one currency.
      value: selectedClass ? m.marketValue : (convertToTwd(m.marketValue, m.holding.assetClass, usdToTwd) ?? m.marketValue),
    }));
  const total = entries.reduce((sum, e) => sum + e.value, 0);
  return entries
    .map(({ m, value }) => {
      const symbol = m.holding.symbol;
      const percent = total > 0 ? (value / total) * 100 : 0;
      const changePct = symbol ? computeDayChangePct(m.marketValue, computePreviousSymbolValue(snapshots, symbol)) : null;
      return {
        key: m.holding.id,
        name: symbol || m.holding.name || '未命名',
        value,
        percent,
        percentLabel: `${percent.toFixed(1)}%`,
        fill: bubbleColorFor(m.holding.assetClass, symbol || m.holding.id),
        changePct,
        icon: symbol
          ? { iconUrl: realIconUrlFor(symbol, m.holding.assetClass), monogram: monogramFor(symbol), monogramColor: monogramColorFor(symbol) }
          : null,
        assetClass: m.holding.assetClass,
      };
    })
    .sort((a, b) => b.value - a.value);
}

interface BubbleNode extends BubbleDatum {
  r: number;
  x: number;
  y: number;
}

// Compresses the size range so a small holding is still clearly visible next
// to a large one (proportional, not to-scale) — a plain sqrt-of-value scale
// would make the smallest slices disappear entirely.
const SIZE_EXPONENT = 0.42;

function layoutBubbles(data: BubbleDatum[], width: number, height: number): BubbleNode[] {
  if (data.length === 0 || width <= 0 || height <= 0) return [];

  const maxValue = Math.max(...data.map((d) => d.value), 1);
  // Radius bounds shrink a bit as the bubble count grows, so a long holdings
  // list still has a reasonable chance of fitting without heavy overlap.
  const maxRadius = Math.max(28, Math.min(85, 360 / Math.sqrt(data.length)));
  const minRadius = Math.max(19, maxRadius * 0.32);

  const classesPresent = ASSET_CLASSES.filter((c) => data.some((d) => d.assetClass === c));
  const centerX = width / 2;
  const centerY = height / 2;
  // Elliptical (not circular) spread so cluster anchors use a wide canvas's
  // width instead of bunching into a small circle in the middle, while still
  // pulling clusters close enough together to read as one connected group
  // rather than isolated islands with empty space between them.
  const spreadX = width * 0.2;
  const spreadY = height * 0.2;
  const anchors: Partial<Record<AssetClass, { x: number; y: number }>> = {};
  classesPresent.forEach((c, i) => {
    const angle = (i / classesPresent.length) * Math.PI * 2 - Math.PI / 2;
    anchors[c] = classesPresent.length === 1
      ? { x: centerX, y: centerY }
      : { x: centerX + spreadX * Math.cos(angle), y: centerY + spreadY * Math.sin(angle) };
  });

  const nodes: BubbleNode[] = data.map((d) => {
    const t = Math.pow(d.value / maxValue, SIZE_EXPONENT);
    const r = minRadius + t * (maxRadius - minRadius);
    const anchor = anchors[d.assetClass] ?? { x: centerX, y: centerY };
    const jitterAngle = Math.random() * Math.PI * 2;
    const jitterR = Math.random() * 30;
    return {
      ...d,
      r,
      x: anchor.x + Math.cos(jitterAngle) * jitterR,
      y: anchor.y + Math.sin(jitterAngle) * jitterR,
    };
  });

  const padding = 6;
  const pull = 0.045;
  const iterations = 360;
  for (let iter = 0; iter < iterations; iter++) {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = a.r + b.r + padding;
        if (dist < minDist) {
          if (dist === 0) {
            dx = Math.random() - 0.5;
            dy = Math.random() - 0.5;
            dist = 0.01;
          }
          const overlap = (minDist - dist) / 2;
          const nx = dx / dist;
          const ny = dy / dist;
          a.x -= nx * overlap;
          a.y -= ny * overlap;
          b.x += nx * overlap;
          b.y += ny * overlap;
        }
      }
    }
    for (const n of nodes) {
      const anchor = anchors[n.assetClass] ?? { x: centerX, y: centerY };
      n.x += (anchor.x - n.x) * pull;
      n.y += (anchor.y - n.y) * pull;
    }
    for (const n of nodes) {
      n.x = Math.min(width - n.r, Math.max(n.r, n.x));
      n.y = Math.min(height - n.r, Math.max(n.r, n.y));
    }
  }

  return nodes;
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

const MIN_FONT_SIZE = 9;
const MAX_NAME_FONT_SIZE = 22;

// Largest font size (down to MIN_FONT_SIZE) at which `text` still fits
// within maxWidth; 0 if it doesn't fit even at the minimum.
function fitFontSize(text: string, maxSize: number, maxWidth: number, weight: number): number {
  for (let size = maxSize; size >= MIN_FONT_SIZE; size -= 1) {
    if (measureTextWidth(text, size, weight) <= maxWidth) return size;
  }
  return 0;
}

const MIN_RADIUS_FOR_ICON = 34;
const MIN_ICON_SIZE = 18;
const MAX_ICON_SIZE = 34;
const LINE_GAP = 2;

// A thin dark outline behind the white labels so they stay legible against
// the full range of bubble hues/lightnesses, not just the darker ones.
const TEXT_OUTLINE = { stroke: 'rgba(0,0,0,0.55)', paintOrder: 'stroke' } as const;

interface TextLine {
  type: 'icon' | 'name' | 'percent';
  size: number;
}

// Tries content combos from most to least complete, in priority order —
// the percent figure is what the chart is actually for, so it's the last
// thing to get dropped; the icon (purely decorative) is the first.
function pickLines(diameter: number, icon: number, name: number, percent: number): TextLine[] {
  const combos: Array<[boolean, boolean, boolean]> = [
    [true, true, true],
    [false, true, true],
    [true, false, true],
    [false, false, true],
    [false, true, false],
  ];
  for (const [wantIcon, wantName, wantPercent] of combos) {
    const lines: TextLine[] = [];
    if (wantIcon && icon > 0) lines.push({ type: 'icon', size: icon });
    if (wantName && name > 0) lines.push({ type: 'name', size: name });
    if (wantPercent && percent > 0) lines.push({ type: 'percent', size: percent });
    // A combo can silently lose a part if its size was 0 (didn't fit at all) —
    // only accept it if every part we asked for actually made it in.
    const gotIcon = !wantIcon || icon > 0;
    const gotName = !wantName || name > 0;
    const gotPercent = !wantPercent || percent > 0;
    if (!(gotIcon && gotName && gotPercent) || lines.length === 0) continue;
    const height = lines.reduce((sum, l) => sum + l.size, 0) + (lines.length - 1) * LINE_GAP;
    if (height <= diameter - 8) return lines;
  }
  return [];
}

function BubbleContent({ node }: { node: BubbleNode }) {
  const { x, y, r, name, percentLabel, percent, icon } = node;
  const maxTextWidth = r * 1.7;
  const diameter = r * 2;

  const desiredNameSize = Math.min(MAX_NAME_FONT_SIZE, MIN_FONT_SIZE + (percent / 100) * 70);
  const nameFontSize = fitFontSize(name, desiredNameSize, maxTextWidth, 600);
  const desiredPercentSize = Math.min(MAX_NAME_FONT_SIZE - 2, MIN_FONT_SIZE + (percent / 100) * 55);
  const percentFontSize = fitFontSize(percentLabel, desiredPercentSize, maxTextWidth, 700);
  const iconSize = icon && r >= MIN_RADIUS_FOR_ICON ? Math.min(MAX_ICON_SIZE, Math.max(MIN_ICON_SIZE, r * 0.55)) : 0;

  const lines = pickLines(diameter, iconSize, nameFontSize, percentFontSize);
  const showIcon = lines.some((l) => l.type === 'icon');
  const showName = lines.some((l) => l.type === 'name');
  const showPercent = lines.some((l) => l.type === 'percent');

  const contentHeight = lines.reduce((sum, l) => sum + l.size, 0) + (lines.length - 1) * LINE_GAP;
  let cursorY = y - contentHeight / 2;
  const centerYFor: Partial<Record<TextLine['type'], number>> = {};
  for (const line of lines) {
    centerYFor[line.type] = cursorY + line.size / 2;
    cursorY += line.size + LINE_GAP;
  }
  const iconCy = centerYFor.icon ?? y;
  const nameY = centerYFor.name ?? y;
  const percentY = centerYFor.percent ?? y;
  const clipId = `bubble-icon-clip-${node.key}`;

  return (
    <g>
      <circle cx={x} cy={y} r={r} style={{ fill: node.fill, stroke: 'var(--card-bg)', strokeWidth: 2 }} />
      {showIcon && icon && (
        <>
          <circle cx={x} cy={iconCy} r={iconSize / 2} fill={icon.monogramColor} />
          <text x={x} y={iconCy} textAnchor="middle" dominantBaseline="central" fill="#fff" fontSize={iconSize * 0.4} fontWeight={700}>
            {icon.monogram}
          </text>
          {icon.iconUrl && (
            <>
              <clipPath id={clipId}>
                <circle cx={x} cy={iconCy} r={iconSize / 2} />
              </clipPath>
              <image
                x={x - iconSize / 2}
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
        <text
          x={x}
          y={nameY}
          textAnchor="middle"
          dominantBaseline="central"
          fill="#fff"
          fontSize={nameFontSize}
          fontWeight={600}
          strokeWidth={Math.max(2, nameFontSize * 0.12)}
          {...TEXT_OUTLINE}
        >
          {name}
        </text>
      )}
      {showPercent && (
        <text
          x={x}
          y={percentY}
          textAnchor="middle"
          dominantBaseline="central"
          fill="#fff"
          fontSize={percentFontSize}
          fontWeight={showName ? 400 : 700}
          strokeWidth={Math.max(1.5, percentFontSize * 0.12)}
          {...TEXT_OUTLINE}
        >
          {percentLabel}
        </text>
      )}
    </g>
  );
}

interface TooltipState {
  datum: BubbleDatum;
  left: number;
  top: number;
}

const CHART_HEIGHT = 480;

// recharts v3's ResponsiveContainer only measures/sizes actual recharts chart
// components (via an internal context), not arbitrary children — so a
// custom SVG chart like this one needs its own resize measurement instead.
function useContainerWidth(ref: RefObject<HTMLDivElement | null>): number {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setWidth(entry.contentRect.width);
    });
    setWidth(el.getBoundingClientRect().width);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

function BubbleChartSvg({
  width,
  height,
  data,
  currency,
}: {
  width: number;
  height: number;
  data: BubbleDatum[];
  currency: Currency;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const nodes = useMemo(() => layoutBubbles(data, width, height), [data, width, height]);

  const showTooltip = (e: MouseEvent, datum: BubbleDatum) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTooltip({ datum, left: e.clientX - rect.left, top: e.clientY - rect.top });
  };

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <svg width={width} height={height}>
        {nodes.map((n) => (
          <g
            key={n.key}
            onMouseEnter={(e) => showTooltip(e, n)}
            onMouseMove={(e) => showTooltip(e, n)}
            onMouseLeave={() => setTooltip(null)}
          >
            <BubbleContent node={n} />
          </g>
        ))}
      </svg>
      {tooltip && (
        <div className="bubble-tooltip" style={{ left: tooltip.left + 12, top: tooltip.top + 12 }}>
          <strong>{tooltip.datum.name}</strong>
          <div>
            {formatCurrencyIn(tooltip.datum.value, currency)}（{tooltip.datum.percentLabel}
            {tooltip.datum.changePct != null ? `，較昨日 ${formatPercent(tooltip.datum.changePct)}` : ''}）
          </div>
        </div>
      )}
    </div>
  );
}

// Fixed tab list (matches HoldingsTable's BASE_TABS) so the class switcher
// doesn't appear/disappear as holdings change — 'other' only shows up once
// it's actually used, same as there.
const BASE_CLASS_TABS: AssetClass[] = ['crypto', 'us_stock', 'tw_stock', 'cash'];

export function AllocationBubbleChart() {
  const { holdings, prices, snapshots } = usePortfolio();
  const { effectiveUsdToTwd } = useFxRate();
  const [selectedClass, setSelectedClass] = useState<AssetClass | null>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const width = useContainerWidth(measureRef);

  const metrics = holdings.map((h) => computeHoldingMetrics(h, prices));
  const hasOther = holdings.some((h) => h.assetClass === 'other');
  const classTabs = hasOther ? [...BASE_CLASS_TABS, 'other' as AssetClass] : BASE_CLASS_TABS;

  const data = buildBubbleData(metrics, selectedClass, effectiveUsdToTwd, snapshots);
  const isEmpty = data.length === 0;
  const currency = selectedClass ? CURRENCY_FOR_ASSET_CLASS[selectedClass] : 'TWD';

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
        {classTabs.map((c) => (
          <button
            key={c}
            className={`tab-button ${selectedClass === c ? 'active' : ''}`}
            onClick={() => setSelectedClass(c)}
          >
            {ASSET_CLASS_LABELS[c]}
          </button>
        ))}
      </div>

      {/* Always mounted (even when empty) so the ResizeObserver in
          useContainerWidth — which only attaches once, on mount — keeps
          watching the same node. Unmounting/remounting this div (e.g. by
          conditionally rendering it only when non-empty) left the observer
          watching a detached node after switching away from and back to a
          class with data, so the chart would silently stay blank. */}
      <div ref={measureRef} style={{ width: '100%', minHeight: isEmpty ? undefined : CHART_HEIGHT }}>
        {isEmpty ? (
          <p className="empty-state">
            {selectedClass ? '這個類別目前沒有持股。' : '新增持股並取得市值後即可看到配置圖表。'}
          </p>
        ) : (
          width > 0 && <BubbleChartSvg data={data} currency={currency} width={width} height={CHART_HEIGHT} />
        )}
      </div>

      {!selectedClass && effectiveUsdToTwd === null && !isEmpty && (
        <p className="settings-hint">尚未取得匯率，比例可能不準確（不同幣別的市值目前直接相加）。</p>
      )}
    </section>
  );
}
