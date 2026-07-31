import { useEffect, useMemo, useRef, useState, type MouseEvent, type RefObject } from 'react';
import { usePortfolio } from '../context/PortfolioContext';
import { useFxRate } from '../hooks/useFxRate';
import {
  computeAllocation,
  computeClassValues,
  computeDayChangePct,
  computeHoldingMetrics,
  computePreviousClassValue,
  computePreviousSymbolValue,
  convertToTwd,
  currencyFor,
  type HoldingMetrics,
} from '../lib/calculations';
import { CASH_CURRENCY_ORDER, twdRateForCashCurrency } from '../lib/cashLedger';
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

// One flat color per class (no per-symbol variation, unlike bubbleColorFor)
// — the pie chart has one slice per class, not one per holding.
function classColorFor(assetClass: AssetClass): string {
  return `hsl(${CLASS_HUE[assetClass]}, 62%, 50%)`;
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

// Cash-ledger balances (see CashLedgerCard) aren't Holdings, so they can't
// flow through computeHoldingMetrics/currencyFor — each currency becomes its
// own bubble in the 現金 cluster instead, alongside any 現金-classified
// Holdings like STRC/0056. Only relevant to the "全部" and "現金" views;
// other single-class views wouldn't include any cash currencies anyway. No
// changePct (no per-currency day-change history is tracked, same treatment
// a symbol-less cash Holding already gets) and no icon (no real ticker).
function buildCashBalanceEntries(
  selectedClass: AssetClass | null,
  cashBalances: Record<string, number>,
  usdToTwd: number | null,
  jpyToTwd: number | null,
): { key: string; name: string; value: number }[] {
  if (selectedClass !== null && selectedClass !== 'cash') return [];
  const currencies = Object.keys(cashBalances)
    .filter((c) => cashBalances[c] !== 0)
    .sort((a, b) => {
      const ai = CASH_CURRENCY_ORDER.indexOf(a);
      const bi = CASH_CURRENCY_ORDER.indexOf(b);
      if (ai === -1 && bi === -1) return a.localeCompare(b);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
  const entries: { key: string; name: string; value: number }[] = [];
  for (const currency of currencies) {
    const amount = cashBalances[currency];
    // Unlike every other class, 現金 itself mixes currencies (TWD/USD/USDT/
    // JPY balances side by side), so — same as the combined "全部" view —
    // this always converts to TWD rather than comparing raw currency units
    // directly (comparing raw JPY-yen counts against raw USDT-token counts
    // would make bubble sizes meaningless).
    const rate = twdRateForCashCurrency(currency, usdToTwd, jpyToTwd);
    const value = rate === null ? null : amount * rate;
    if (value === null || value <= 0) continue;
    entries.push({ key: `cash-balance-${currency}`, name: `${currency} 現金`, value });
  }
  return entries;
}

function buildBubbleData(
  metrics: HoldingMetrics[],
  selectedClass: AssetClass | null,
  usdToTwd: number | null,
  jpyToTwd: number | null,
  snapshots: Snapshot[],
  cashBalances: Record<string, number>,
): BubbleDatum[] {
  const scoped = selectedClass ? metrics.filter((m) => m.holding.assetClass === selectedClass) : metrics;
  const entries = scoped
    .filter((m) => m.marketValue > 0)
    .map((m) => ({
      m,
      // Every single-class view except 現金 is already one currency and can
      // use the native value as-is. 現金 can mix TWD cash with a
      // USD-auto-detected holding like STRC (see currencyFor), so — like the
      // combined "全部" view — it converts to TWD (falling back to the
      // native value when no FX rate is available yet, same as
      // computeAllocation).
      value:
        selectedClass && selectedClass !== 'cash'
          ? m.marketValue
          : (convertToTwd(m.marketValue, currencyFor(m.holding), usdToTwd) ?? m.marketValue),
    }));
  const cashEntries = buildCashBalanceEntries(selectedClass, cashBalances, usdToTwd, jpyToTwd);
  const total = entries.reduce((sum, e) => sum + e.value, 0) + cashEntries.reduce((sum, e) => sum + e.value, 0);

  const fromHoldings = entries.map(({ m, value }) => {
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
  });
  const fromCash = cashEntries.map(({ key, name, value }) => {
    const percent = total > 0 ? (value / total) * 100 : 0;
    return {
      key,
      name,
      value,
      percent,
      percentLabel: `${percent.toFixed(1)}%`,
      fill: bubbleColorFor('cash', key),
      changePct: null,
      icon: null,
      assetClass: 'cash' as AssetClass,
    };
  });

  return [...fromHoldings, ...fromCash].sort((a, b) => b.value - a.value);
}

interface BubbleNode extends BubbleDatum {
  r: number;
  x: number;
  y: number;
}

// 0.5 makes bubble *area* directly proportional to value (area = πr², and
// r ∝ value^0.5 means area ∝ value) — the true reading of a bubble chart.
// Anything lower visually flattens the differences between holdings, which
// is what made very different-sized positions (e.g. 27% vs 3%) look similar.
const SIZE_EXPONENT = 0.5;

function layoutBubbles(data: BubbleDatum[], width: number, height: number): BubbleNode[] {
  if (data.length === 0 || width <= 0 || height <= 0) return [];

  const maxValue = Math.max(...data.map((d) => d.value), 1);
  // Radius bounds shrink a bit as the bubble count grows, so a long holdings
  // list still has a reasonable chance of fitting without heavy overlap.
  const maxRadius = Math.max(30, Math.min(105, 440 / Math.sqrt(data.length)));
  const minRadius = Math.max(19, maxRadius * 0.32);

  const classesPresent = ASSET_CLASSES.filter((c) => data.some((d) => d.assetClass === c));
  const centerX = width / 2;
  const centerY = height / 2;
  // Elliptical (not circular) spread so cluster anchors use a wide canvas's
  // width instead of bunching into a small circle in the middle, while still
  // pulling clusters close enough together to read as one connected group
  // rather than isolated islands with empty space between them.
  const spreadX = width * 0.26;
  const spreadY = height * 0.3;
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

const CHART_HEIGHT = 580;

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

interface PieDatum {
  key: AssetClass;
  label: string;
  value: number;
  percent: number;
  percentLabel: string;
  fill: string;
  changePct: number | null;
}

// Class-level breakdown (one slice per asset class) for the overview's pie
// chart — a coarser view than the bubble chart's per-holding breakdown.
// Cash-ledger balances (not Holdings) are folded into the 現金 slice's value
// — adding a 現金 slice from scratch if there are no 現金-classified Holdings
// at all yet — and into its today/previous classValue comparison so the
// slice's day-change % stays consistent with what it now includes.
function buildPieData(
  metrics: HoldingMetrics[],
  usdToTwd: number | null,
  jpyToTwd: number | null,
  snapshots: Snapshot[],
  cashBalances: Record<string, number>,
): PieDatum[] {
  const slices = computeAllocation(metrics, 'assetClass', usdToTwd);
  const classValuesToday = computeClassValues(metrics);
  const cashLedgerTwd = Object.entries(cashBalances).reduce((sum, [currency, amount]) => {
    const rate = twdRateForCashCurrency(currency, usdToTwd, jpyToTwd);
    return rate === null ? sum : sum + amount * rate;
  }, 0);

  let mergedSlices = slices;
  if (cashLedgerTwd > 0) {
    const idx = mergedSlices.findIndex((s) => s.key === 'cash');
    if (idx >= 0) {
      mergedSlices = mergedSlices.map((s, i) => (i === idx ? { ...s, value: s.value + cashLedgerTwd } : s));
    } else {
      mergedSlices = [...mergedSlices, { key: 'cash', label: ASSET_CLASS_LABELS.cash, value: cashLedgerTwd }].sort(
        (a, b) => ASSET_CLASSES.indexOf(a.key as AssetClass) - ASSET_CLASSES.indexOf(b.key as AssetClass),
      );
    }
  }

  const total = mergedSlices.reduce((sum, s) => sum + s.value, 0);
  return mergedSlices.map((s) => {
    const assetClass = s.key as AssetClass;
    const percent = total > 0 ? (s.value / total) * 100 : 0;
    const todayValue = (classValuesToday[assetClass] ?? 0) + (assetClass === 'cash' ? cashLedgerTwd : 0);
    return {
      key: assetClass,
      label: s.label,
      value: s.value,
      percent,
      percentLabel: `${percent.toFixed(1)}%`,
      fill: classColorFor(assetClass),
      changePct: computeDayChangePct(todayValue, computePreviousClassValue(snapshots, assetClass)),
    };
  });
}

// Space reserved on each side of the circle for "edge → elbow → dot + text"
// leader lines, so the pie always leaves room for its own labels instead of
// them running off the SVG. The floor below covers the shortest realistic
// label; PieChartSvg grows it further based on each render's actual
// (measured) longest label.
const MIN_LABEL_RESERVE = 112;
const PIE_LABEL_FONT_SIZE = 13;
const LEADER_ELBOW_GAP = 18;
const LEADER_DOT_GAP = 8;
const LEADER_TEXT_GAP = 8;
const LEADER_MIN_GAP = 22;
const LEADER_DOT_RADIUS = 4;

function polarPoint(cx: number, cy: number, r: number, angle: number) {
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
}

// Leader-line label anchors start stacked at each slice's natural angle-based
// height, then get nudged apart top-to-bottom so two labels never overlap —
// same idea as map/chart callout labels. Assumes items are already sorted by
// natural y (ascending) within a single side of the pie.
function resolveLabelYs(naturalYs: number[], minY: number, maxY: number): number[] {
  if (naturalYs.length === 0) return [];
  const ys = [...naturalYs];
  for (let i = 1; i < ys.length; i++) {
    if (ys[i] - ys[i - 1] < LEADER_MIN_GAP) ys[i] = ys[i - 1] + LEADER_MIN_GAP;
  }
  // If stacking pushed the last label past the bottom edge, slide the whole
  // group up just enough to fit — keeps every label inside the chart rather
  // than clipping it.
  const overflow = ys[ys.length - 1] - maxY;
  if (overflow > 0) {
    for (let i = 0; i < ys.length; i++) ys[i] -= overflow;
  }
  if (ys[0] < minY) {
    const shift = minY - ys[0];
    for (let i = 0; i < ys.length; i++) ys[i] += shift;
  }
  return ys;
}

function PieSlice({
  datum,
  startAngle,
  endAngle,
  cx,
  cy,
  radius,
  onHover,
  onLeave,
}: {
  datum: PieDatum;
  startAngle: number;
  endAngle: number;
  cx: number;
  cy: number;
  radius: number;
  onHover: (e: MouseEvent, datum: PieDatum) => void;
  onLeave: () => void;
}) {
  const start = polarPoint(cx, cy, radius, startAngle);
  const end = polarPoint(cx, cy, radius, endAngle);
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
  const path = `M ${cx} ${cy} L ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y} Z`;

  // No in-wedge percent text — every slice's leader line already carries its
  // own label + percent, so a second copy on the wedge itself would just be
  // the same figure twice.
  return (
    <g onMouseEnter={(e) => onHover(e, datum)} onMouseMove={(e) => onHover(e, datum)} onMouseLeave={onLeave}>
      <path d={path} style={{ fill: datum.fill, stroke: 'var(--card-bg)', strokeWidth: 2 }} />
    </g>
  );
}

function PieChartSvg({ data, width, height }: { data: PieDatum[]; width: number; height: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<{ datum: PieDatum; left: number; top: number } | null>(null);
  const cx = width / 2;
  const cy = height / 2;
  // A narrow card (e.g. phone width) gets a smaller label font so the
  // measured reserve below — and therefore the pie itself — doesn't have to
  // shrink as much to make room for it.
  const labelFontSize = width < 480 ? 11 : PIE_LABEL_FONT_SIZE;
  // Reserve exactly as much room as the widest label actually needs (measured,
  // not guessed) — a fixed guess either clips long labels or wastes space on
  // short ones.
  const maxLabelTextWidth = Math.max(
    0,
    ...data.map((d) => measureTextWidth(`${d.label} · ${d.percentLabel}`, labelFontSize, 400)),
  );
  const labelReserve = Math.max(
    MIN_LABEL_RESERVE,
    LEADER_ELBOW_GAP + 14 + LEADER_DOT_RADIUS + LEADER_TEXT_GAP + maxLabelTextWidth + 10,
  );
  // The pie shrinks to make room for that reserve on both sides; it has a
  // floor low enough that even a very narrow card still gets a legible
  // circle rather than the layout breaking down.
  const radius = Math.max(40, Math.min(150, Math.min(height, width - labelReserve * 2) / 2 - 20));

  const showTooltip = (e: MouseEvent, datum: PieDatum) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTooltip({ datum, left: e.clientX - rect.left, top: e.clientY - rect.top });
  };

  let cursor = -Math.PI / 2;
  const slices = data.map((d) => {
    const sweep = (d.percent / 100) * Math.PI * 2;
    const slice = { datum: d, startAngle: cursor, endAngle: cursor + sweep, midAngle: cursor + sweep / 2 };
    cursor += sweep;
    return slice;
  });

  // Each slice's leader line starts at its own angle on the circle, but the
  // label itself always sits on a fixed left or right column outside the
  // pie — same convention as a map callout — so text reads in a straight,
  // scannable line instead of floating at whatever angle its slice happens
  // to be at. The dot sits a small, fixed distance beyond the circle
  // (independent of labelReserve) so the label text — which starts right
  // after the dot and grows outward — always has the rest of labelReserve
  // to itself, all the way to the card edge, regardless of card width.
  const leaders = slices.map((s) => {
    const side: 1 | -1 = Math.cos(s.midAngle) >= 0 ? 1 : -1;
    const edge = polarPoint(cx, cy, radius, s.midAngle);
    const elbow = polarPoint(cx, cy, radius + LEADER_ELBOW_GAP, s.midAngle);
    const dotX = cx + side * (radius + LEADER_ELBOW_GAP + 14);
    const stemX = dotX - side * LEADER_DOT_GAP;
    return { ...s, side, edge, naturalY: elbow.y, stemX, dotX };
  });

  const minY = 16;
  const maxY = height - 16;
  const finalYByKey = new Map<AssetClass, number>();
  for (const side of [-1, 1] as const) {
    const group = leaders.filter((l) => l.side === side).sort((a, b) => a.naturalY - b.naturalY);
    const resolved = resolveLabelYs(
      group.map((l) => l.naturalY),
      minY,
      maxY,
    );
    group.forEach((l, i) => finalYByKey.set(l.datum.key, resolved[i]));
  }

  return (
    <div ref={containerRef} className="pie-chart-wrap">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {slices.map((s) => (
          <PieSlice
            key={s.datum.key}
            datum={s.datum}
            startAngle={s.startAngle}
            endAngle={s.endAngle}
            cx={cx}
            cy={cy}
            radius={radius}
            onHover={showTooltip}
            onLeave={() => setTooltip(null)}
          />
        ))}
        {leaders.map((l) => {
          const finalY = finalYByKey.get(l.datum.key) ?? l.naturalY;
          const textX = l.dotX + l.side * (LEADER_DOT_RADIUS + LEADER_TEXT_GAP);
          return (
            <g key={l.datum.key} className="pie-leader" onMouseEnter={(e) => showTooltip(e, l.datum)} onMouseMove={(e) => showTooltip(e, l.datum)} onMouseLeave={() => setTooltip(null)}>
              <polyline points={`${l.edge.x},${l.edge.y} ${l.stemX},${finalY} ${l.dotX},${finalY}`} fill="none" className="pie-leader-line" />
              <circle cx={l.dotX} cy={finalY} r={LEADER_DOT_RADIUS} fill={l.datum.fill} />
              <text
                x={textX}
                y={finalY}
                textAnchor={l.side === 1 ? 'start' : 'end'}
                dominantBaseline="central"
                fontSize={labelFontSize}
                className="pie-leader-label"
              >
                {l.datum.label} · {l.datum.percentLabel}
              </text>
            </g>
          );
        })}
      </svg>
      {tooltip && (
        <div className="bubble-tooltip" style={{ left: tooltip.left + 12, top: tooltip.top + 12 }}>
          <strong>{tooltip.datum.label}</strong>
          <div>
            {formatCurrencyIn(tooltip.datum.value, 'TWD')}（{tooltip.datum.percentLabel}
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
  const { holdings, prices, snapshots, cashBalances } = usePortfolio();
  const { effectiveUsdToTwd, effectiveJpyToTwd } = useFxRate();
  const [selectedClass, setSelectedClass] = useState<AssetClass | null>(null);
  // The pie view only makes sense at the class-level overview — drilling
  // into a single class still always shows its individual holdings as
  // bubbles, regardless of this setting.
  const [viewMode, setViewMode] = useState<'bubble' | 'pie'>('bubble');
  const measureRef = useRef<HTMLDivElement>(null);
  const width = useContainerWidth(measureRef);

  const metrics = holdings.map((h) => computeHoldingMetrics(h, prices));
  const hasOther = holdings.some((h) => h.assetClass === 'other');
  const classTabs = hasOther ? [...BASE_CLASS_TABS, 'other' as AssetClass] : BASE_CLASS_TABS;

  const data = buildBubbleData(metrics, selectedClass, effectiveUsdToTwd, effectiveJpyToTwd, snapshots, cashBalances);
  const isEmpty = data.length === 0;
  const currency = selectedClass ? CURRENCY_FOR_ASSET_CLASS[selectedClass] : 'TWD';
  const showPie = selectedClass === null && viewMode === 'pie';
  const pieData = showPie ? buildPieData(metrics, effectiveUsdToTwd, effectiveJpyToTwd, snapshots, cashBalances) : [];

  return (
    <section className="card">
      <div className="card-header">
        <h2>資產配置{selectedClass ? `（${ASSET_CLASS_LABELS[selectedClass]}）` : ''}</h2>
        {selectedClass === null && (
          <div className="theme-toggle" role="group" aria-label="圖表類型">
            <button className={`theme-toggle-btn ${viewMode === 'bubble' ? 'active' : ''}`} onClick={() => setViewMode('bubble')}>
              氣泡圖
            </button>
            <button className={`theme-toggle-btn ${viewMode === 'pie' ? 'active' : ''}`} onClick={() => setViewMode('pie')}>
              圓餅圖
            </button>
          </div>
        )}
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
        ) : showPie ? (
          width > 0 && <PieChartSvg data={pieData} width={width} height={CHART_HEIGHT} />
        ) : (
          width > 0 && <BubbleChartSvg data={data} currency={currency} width={width} height={CHART_HEIGHT} />
        )}
      </div>

      {(!selectedClass || selectedClass === 'cash') && (effectiveUsdToTwd === null || effectiveJpyToTwd === null) && !isEmpty && (
        <p className="settings-hint">尚未取得匯率，比例可能不準確（不同幣別的市值目前直接相加）。</p>
      )}
    </section>
  );
}
