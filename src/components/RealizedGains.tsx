import { useMemo, useState } from 'react';
import { usePortfolio } from '../context/PortfolioContext';
import { useFxRate } from '../hooks/useFxRate';
import { processTransactions } from '../lib/transactions';
import { convertToTwd } from '../lib/calculations';
import { formatAmount, formatCurrencyIn, formatPercent, formatShares } from '../lib/format';
import { ASSET_CLASS_LABELS, type AssetClass, type Currency, type RealizedGain } from '../types';

// formatCurrencyIn's TWD output is a bare "$", ambiguous next to a USD row's
// "US$" right above/below it in the same column — same fix as
// CurrencyBreakdown/HoldingsTable's "TW$" convention.
function formatMoney(value: number, currency: Currency): string {
  return currency === 'TWD' ? `TW$${formatAmount(value)}` : formatCurrencyIn(value, currency);
}

// Every column in this table can mix TWD/US$/USDC rows (unlike HoldingsTable,
// where only the 現金 tab ever mixes currencies) — a plain formatMoney()
// string left the unit drifting left/right per row depending on the number's
// digit count, same alignment problem HoldingsTable's `alignUnit` fixes.
// USDC's "N U" has no separate prefix to pull out, so it just sits in the
// number slot with an empty unit slot, still filling the fixed-width column.
function MoneyCell({ value, currency }: { value: number; currency: Currency }) {
  if (currency === 'USDC') {
    return (
      <span className="money-cell money-cell--aligned">
        <span className="money-unit" />
        <span className="money-num">{formatCurrencyIn(value, 'USDC')}</span>
      </span>
    );
  }
  return (
    <span className="money-cell money-cell--aligned">
      <span className="money-unit">{currency === 'TWD' ? 'TW$' : 'US$'}</span>
      <span className="money-num">{formatAmount(value)}</span>
    </span>
  );
}

// Only the asset classes real trades can happen in — 'other' has no
// dedicated filter button (falls under 全部 only), matching how thin that
// category is used everywhere else in the app.
const ASSET_CLASS_FILTERS: AssetClass[] = ['tw_stock', 'us_stock', 'crypto', 'cash'];

type QuickRange = 'all' | 'month' | 'year' | 'lastYear';
const QUICK_RANGE_LABELS: Record<QuickRange, string> = { all: '全部', month: '本月', year: '今年', lastYear: '去年' };

function matchesQuickRange(sellDate: string, range: QuickRange, now: Date): boolean {
  if (range === 'all') return true;
  const d = new Date(sellDate);
  if (Number.isNaN(d.getTime())) return false;
  if (range === 'month') return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  if (range === 'year') return d.getFullYear() === now.getFullYear();
  return d.getFullYear() === now.getFullYear() - 1; // lastYear
}

// "20260806" -> "2026-08-06". Returns null for anything that isn't exactly
// 8 digits or doesn't parse to a real date, so a still-being-typed value
// just doesn't filter yet rather than throwing.
function parseYyyymmdd(raw: string): string | null {
  const trimmed = raw.trim();
  if (!/^\d{8}$/.test(trimmed)) return null;
  const iso = `${trimmed.slice(0, 4)}-${trimmed.slice(4, 6)}-${trimmed.slice(6, 8)}`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

// Combines with the quick-range buttons (AND, not instead-of) — an empty/
// invalid start or end just doesn't restrict that side.
function matchesCustomRange(sellDate: string, startIso: string | null, endIso: string | null): boolean {
  if (startIso === null && endIso === null) return true;
  const t = Date.parse(sellDate);
  if (Number.isNaN(t)) return false;
  if (startIso !== null && t < Date.parse(startIso)) return false;
  if (endIso !== null && t > Date.parse(`${endIso}T23:59:59`)) return false;
  return true;
}

type SortKey = 'sellDate' | 'symbol' | 'shares' | 'avgBuyPrice' | 'sellPrice' | 'realizedPnl' | 'returnPct' | 'holdingDays';

function sortValue(g: RealizedGain, key: SortKey): number | string | undefined {
  switch (key) {
    case 'sellDate':
      return g.sellDate;
    case 'symbol':
      return g.symbol;
    case 'shares':
      return g.shares;
    case 'avgBuyPrice':
      return g.avgBuyPrice;
    case 'sellPrice':
      return g.sellPrice;
    case 'realizedPnl':
      return g.realizedPnl;
    case 'returnPct':
      return g.returnPct;
    case 'holdingDays':
      return g.holdingDays ?? undefined;
  }
}

function compareGains(a: RealizedGain, b: RealizedGain, key: SortKey, dir: 'asc' | 'desc'): number {
  const av = sortValue(a, key);
  const bv = sortValue(b, key);
  if (av === undefined && bv === undefined) return 0;
  if (av === undefined) return 1;
  if (bv === undefined) return -1;
  const cmp = typeof av === 'string' || typeof bv === 'string' ? String(av).localeCompare(String(bv), 'zh-Hant') : (av as number) - (bv as number);
  return dir === 'asc' ? cmp : -cmp;
}

// null (rate missing) propagates rather than silently showing a partial sum
// — same all-or-nothing convention as computeTotalInTwd.
function sumRealizedTwd(gains: RealizedGain[], usdToTwd: number | null): number | null {
  let total = 0;
  for (const g of gains) {
    const twd = convertToTwd(g.realizedPnl, g.currency, usdToTwd);
    if (twd === null) return null;
    total += twd;
  }
  return total;
}

function sumCostBasisTwd(gains: RealizedGain[], usdToTwd: number | null): number | null {
  let total = 0;
  for (const g of gains) {
    const twd = convertToTwd(g.avgBuyPrice * g.shares, g.currency, usdToTwd);
    if (twd === null) return null;
    total += twd;
  }
  return total;
}

// 賣出日期／代號／股數／買入均價／賣出均價／已實現損益／報酬率／持有天數
const COLUMN_WIDTHS = ['100px', '80px', '80px', '90px', '90px', '110px', '80px', '80px'];

const SORT_HEADERS: [SortKey, string][] = [
  ['sellDate', '賣出日期'],
  ['symbol', '代號'],
  ['shares', '股數'],
  ['avgBuyPrice', '買入均價'],
  ['sellPrice', '賣出均價'],
  ['realizedPnl', '已實現損益'],
  ['returnPct', '報酬率'],
  ['holdingDays', '持有天數'],
];

export function RealizedGains() {
  const { transactions } = usePortfolio();
  const { effectiveUsdToTwd } = useFxRate();
  const [quickRange, setQuickRange] = useState<QuickRange>('all');
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');
  const [assetClass, setAssetClass] = useState<AssetClass | null>(null);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  // Quick range and the custom date inputs are two different ways to say
  // the same thing (a date filter) — letting both apply at once (an AND)
  // silently narrowed results in a way that looked like a bug (e.g. 今年
  // still selected while typing an unrelated custom range produced 0 rows
  // for no visible reason). Picking one now clears the other, so exactly
  // one date filter is ever in effect.
  const handleQuickRange = (range: QuickRange) => {
    setQuickRange(range);
    setRangeStart('');
    setRangeEnd('');
  };
  const handleRangeStartChange = (value: string) => {
    setRangeStart(value);
    setQuickRange('all');
  };
  const handleRangeEndChange = (value: string) => {
    setRangeEnd(value);
    setQuickRange('all');
  };

  // Recomputed whenever the synced transaction log changes — cheap enough
  // (a handful of sells at most) not to need caching beyond useMemo.
  const realizedGains = useMemo(() => processTransactions(transactions).realizedGains, [transactions]);

  // Summary cards read the *entire* history regardless of the filters below,
  // same layering as PortfolioSummary/CurrencyBreakdown sitting above
  // HoldingsTable's own tab selection — filters only narrow the table.
  const twdTotal = realizedGains.filter((g) => g.currency === 'TWD').reduce((sum, g) => sum + g.realizedPnl, 0);
  const usdTotal = realizedGains
    .filter((g) => g.currency === 'USD' || g.currency === 'USDC')
    .reduce((sum, g) => sum + g.realizedPnl, 0);
  const now = new Date();
  const ytdGains = realizedGains.filter((g) => matchesQuickRange(g.sellDate, 'year', now));
  const mtdGains = realizedGains.filter((g) => matchesQuickRange(g.sellDate, 'month', now));
  const ytdTwd = sumRealizedTwd(ytdGains, effectiveUsdToTwd);
  const mtdTwd = sumRealizedTwd(mtdGains, effectiveUsdToTwd);
  const winCount = realizedGains.filter((g) => g.realizedPnl > 0).length;
  const totalCount = realizedGains.length;
  const winRate = totalCount > 0 ? (winCount / totalCount) * 100 : null;

  const startIso = parseYyyymmdd(rangeStart);
  const endIso = parseYyyymmdd(rangeEnd);
  const filtered = realizedGains.filter(
    (g) =>
      matchesQuickRange(g.sellDate, quickRange, now) &&
      matchesCustomRange(g.sellDate, startIso, endIso) &&
      (assetClass === null || g.assetClass === assetClass) &&
      (search.trim() === '' ||
        g.symbol.toLowerCase().includes(search.trim().toLowerCase()) ||
        (g.name ?? '').toLowerCase().includes(search.trim().toLowerCase())),
  );
  const sortedGains = sortKey ? [...filtered].sort((a, b) => compareGains(a, b, sortKey, sortDir)) : filtered;

  // Footer total reflects whatever's currently filtered/sorted above it —
  // always TWD-converted since the visible rows can mix currencies (unlike
  // HoldingsTable's per-tab totals, which never mix).
  const filteredPnlTwd = sumRealizedTwd(sortedGains, effectiveUsdToTwd);
  const filteredCostTwd = sumCostBasisTwd(sortedGains, effectiveUsdToTwd);
  const filteredReturnPct =
    filteredPnlTwd !== null && filteredCostTwd !== null && filteredCostTwd !== 0 ? (filteredPnlTwd / filteredCostTwd) * 100 : null;

  return (
    <section className="card">
      <h2>已實現損益</h2>

      <div className="summary-grid">
        <div className="summary-stat">
          <span className="summary-label">總已實現損益（TWD）</span>
          <span className={`summary-value ${twdTotal !== 0 ? (twdTotal > 0 ? 'change-up' : 'change-down') : ''}`}>
            {formatMoney(twdTotal, 'TWD')}
          </span>
        </div>
        <div className="summary-stat">
          <span className="summary-label">總已實現損益（USD）</span>
          <span className={`summary-value ${usdTotal !== 0 ? (usdTotal > 0 ? 'change-up' : 'change-down') : ''}`}>
            {formatMoney(usdTotal, 'USD')}
          </span>
        </div>
        <div className="summary-stat">
          <span className="summary-label">本年度已實現（台幣）</span>
          <span className={`summary-value ${ytdTwd !== null && ytdTwd !== 0 ? (ytdTwd > 0 ? 'change-up' : 'change-down') : ''}`}>
            {ytdTwd === null ? '請先取得匯率' : formatMoney(ytdTwd, 'TWD')}
          </span>
        </div>
        <div className="summary-stat">
          <span className="summary-label">本月已實現（台幣）</span>
          <span className={`summary-value ${mtdTwd !== null && mtdTwd !== 0 ? (mtdTwd > 0 ? 'change-up' : 'change-down') : ''}`}>
            {mtdTwd === null ? '請先取得匯率' : formatMoney(mtdTwd, 'TWD')}
          </span>
        </div>
        <div className="summary-stat">
          <span className="summary-label">勝率</span>
          <span className="summary-value">{winRate === null ? '—' : `${winRate.toFixed(1)}%`}</span>
          {totalCount > 0 && <span className="summary-sub">{winCount} / {totalCount} 筆</span>}
        </div>
      </div>

      {realizedGains.length > 0 && (
        <>
          <div className="tab-bar">
            {(Object.keys(QUICK_RANGE_LABELS) as QuickRange[]).map((range) => (
              <button
                key={range}
                className={`tab-button ${quickRange === range ? 'active' : ''}`}
                onClick={() => handleQuickRange(range)}
              >
                {QUICK_RANGE_LABELS[range]}
              </button>
            ))}
          </div>
          <div className="settings-row">
            <input
              type="text"
              inputMode="numeric"
              className="date-range-input"
              placeholder="起始日期 20260101"
              maxLength={8}
              value={rangeStart}
              onChange={(e) => handleRangeStartChange(e.target.value)}
            />
            <span>至</span>
            <input
              type="text"
              inputMode="numeric"
              className="date-range-input"
              placeholder="結束日期 20261231"
              maxLength={8}
              value={rangeEnd}
              onChange={(e) => handleRangeEndChange(e.target.value)}
            />
          </div>
          <div className="tab-bar">
            <button className={`tab-button ${assetClass === null ? 'active' : ''}`} onClick={() => setAssetClass(null)}>
              全部類別
            </button>
            {ASSET_CLASS_FILTERS.map((c) => (
              <button key={c} className={`tab-button ${assetClass === c ? 'active' : ''}`} onClick={() => setAssetClass(c)}>
                {ASSET_CLASS_LABELS[c]}
              </button>
            ))}
          </div>
          <div className="settings-row">
            <input
              type="text"
              placeholder="搜尋代號或名稱"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </>
      )}

      {transactions.length === 0 ? (
        <p className="empty-state">
          目前沒有交易紀錄可用，請到下方設定填入「交易紀錄」格式的 Google Sheet 網址（需要有「動作」欄位）。
        </p>
      ) : realizedGains.length === 0 ? (
        <p className="empty-state">目前沒有已實現損益，尚未賣出任何持股。</p>
      ) : sortedGains.length === 0 ? (
        <p className="empty-state">沒有符合篩選條件的紀錄。</p>
      ) : (
        <div className="table-scroll">
          <table className="holdings-table">
            <colgroup>
              {COLUMN_WIDTHS.map((width, i) => (
                <col key={i} style={{ width }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                {SORT_HEADERS.map(([key, label]) => (
                  <th key={key}>
                    <button className="sort-header" onClick={() => handleSort(key)}>
                      {label}
                      <span className="sort-arrow">{sortKey === key ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}</span>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedGains.map((g) => {
                const isGain = g.realizedPnl >= 0;
                return (
                  <tr key={g.id}>
                    <td>{g.sellDate}</td>
                    <td>{g.symbol}</td>
                    <td>{formatShares(g.shares, g.assetClass)}</td>
                    <td><MoneyCell value={g.avgBuyPrice} currency={g.currency} /></td>
                    <td><MoneyCell value={g.sellPrice} currency={g.currency} /></td>
                    <td className={isGain ? 'change-up' : 'change-down'}>
                      <MoneyCell value={g.realizedPnl} currency={g.currency} />
                    </td>
                    <td className={isGain ? 'change-up' : 'change-down'}>{formatPercent(g.returnPct)}</td>
                    <td>{g.holdingDays === null ? '—' : `${g.holdingDays} 天`}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="holdings-total-row">
                <td>總計</td>
                <td>—</td>
                <td>—</td>
                <td>—</td>
                <td>—</td>
                <td className={filteredPnlTwd !== null && filteredPnlTwd < 0 ? 'change-down' : 'change-up'}>
                  {filteredPnlTwd === null ? '請先取得匯率' : <MoneyCell value={filteredPnlTwd} currency="TWD" />}
                </td>
                <td className={filteredReturnPct !== null && filteredReturnPct < 0 ? 'change-down' : 'change-up'}>
                  {filteredReturnPct === null ? '—' : formatPercent(filteredReturnPct)}
                </td>
                <td>—</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}
