import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePortfolio } from '../context/PortfolioContext';
import { useFxRate } from '../hooks/useFxRate';
import { computeClassTotals, computeHoldingMetrics, convertToTwd, currencyFor, type HoldingMetrics } from '../lib/calculations';
import { formatAmount, formatShares, formatPercent, formatSignedNumber, formatTiered, googleNewsUrlFor } from '../lib/format';
import { CASH_CURRENCY_ORDER, twdRateForCashCurrency } from '../lib/cashLedger';
import { ASSET_CLASS_LABELS, type AssetClass, type Holding, type PriceEntry } from '../types';
import { HoldingFormModal } from './HoldingFormModal';

// Every tab except 現金 is already a single, unambiguous currency (the tab
// itself gives the context), so those just use a plain "$". Only 現金 mixes
// currencies (TWD cash alongside a USD-auto-detected holding like STRC, or
// raw ledger balances in any of TWD/USD/USDT/JPY — see currencyFor), so it's
// the one place that needs a differentiated label per row. USDT is pegged
// 1:1 to USD (see twdRateForCashCurrency) and gets the same "US$" for that
// reason; a TWD-equivalent value (e.g. a converted STRC row, or a ledger
// balance's 總成本/市值) always reads "TW$".
const CASH_TAB_UNIT: Record<string, string> = { TWD: 'TW$', USD: 'US$', USDT: 'US$', JPY: 'JP¥' };

// The label is its own flex item next to the value (see .money-cell in
// index.css) rather than baked into the formatted string, so the label and
// the digits both stay tight and legible regardless of label width ("$" vs
// "US$") or digit count. `tiered` switches to formatTiered's shrinking
// decimal precision, used for 現價/平均成本 and crypto 數量.
function Money({ unit, value, signed, tiered }: { unit: string; value: number | null; signed?: boolean; tiered?: boolean }) {
  if (value === null) return <span className="money-cell"><span className="money-num">—</span></span>;
  const text = signed ? formatSignedNumber(value) : tiered ? formatTiered(value) : formatAmount(value);
  return (
    <span className="money-cell">
      <span className="money-unit">{unit}</span>
      <span className="money-num">{text}</span>
    </span>
  );
}

type SortKey = 'symbol' | 'price' | 'change' | 'shares' | 'avgCost' | 'costValue' | 'marketValue' | 'gainLoss' | 'gainLossPct';

interface Row {
  m: HoldingMetrics;
  changePercent?: number;
  // True for a 現金-classified holding whose auto-detected currency isn't
  // TWD (see currencyFor) — its 總成本/市值/損益 get shown as their TWD
  // equivalent instead of the raw native number, since the 現金 tab can mix
  // TWD cash with USD-auto-detected holdings side by side.
  isForeignCash: boolean;
  displayCostValue: number | null;
  displayMarketValue: number | null;
  displayGainLoss: number | null;
}

function sortValue(row: Row, key: SortKey): number | string | undefined {
  switch (key) {
    case 'symbol':
      return row.m.holding.symbol || '';
    case 'price':
      return row.m.currentPrice;
    case 'change':
      return row.changePercent;
    case 'shares':
      return row.m.holding.shares;
    case 'avgCost':
      return row.m.holding.avgCost;
    case 'costValue':
      return row.displayCostValue ?? undefined;
    case 'marketValue':
      return row.displayMarketValue ?? undefined;
    case 'gainLoss':
      return row.displayGainLoss ?? undefined;
    case 'gainLossPct':
      return row.m.gainLossPct;
  }
}

// Missing values (e.g. no live change% for this row) always sort last,
// regardless of direction, rather than landing at the "top" of a desc sort.
function compareRows(a: Row, b: Row, key: SortKey, dir: 'asc' | 'desc'): number {
  const av = sortValue(a, key);
  const bv = sortValue(b, key);
  if (av === undefined && bv === undefined) return 0;
  if (av === undefined) return 1;
  if (bv === undefined) return -1;
  const cmp =
    typeof av === 'string' || typeof bv === 'string'
      ? String(av).localeCompare(String(bv), 'zh-Hant')
      : (av as number) - (bv as number);
  return dir === 'asc' ? cmp : -cmp;
}

interface TabData {
  metrics: HoldingMetrics[];
  sortedRows: Row[];
  cashBalanceEntries: [string, number][];
  cashBalanceRows: { currency: string; amount: number; twdValue: number | null }[];
  combinedTotals: { totalCostValue: number; totalMarketValue: number; totalGainLoss: number; totalGainLossPct: number };
  footerUnit: string;
}

// Pure per-tab data build-out, factored out of the component so every tab
// can be computed (and rendered) at once — see .table-panels in index.css,
// which stacks every tab's table in the same grid cell so the card's height
// is always pinned to the tallest one, and switching tabs never resizes it.
function buildTabData(
  tab: AssetClass,
  holdings: Holding[],
  prices: Record<string, PriceEntry>,
  cashBalances: Record<string, number>,
  usdToTwd: number | null,
  jpyToTwd: number | null,
  sortKey: SortKey | null,
  sortDir: 'asc' | 'desc',
): TabData {
  const metrics = holdings.filter((h) => h.assetClass === tab).map((h) => computeHoldingMetrics(h, prices));

  const rows: Row[] = metrics.map((m) => {
    const currency = currencyFor(m.holding);
    const isForeignCash = m.holding.assetClass === 'cash' && currency !== 'TWD';
    return {
      m,
      changePercent: m.holding.symbol ? prices[m.holding.symbol]?.changePercent : undefined,
      isForeignCash,
      displayCostValue: isForeignCash ? convertToTwd(m.costValue, currency, usdToTwd) : m.costValue,
      displayMarketValue: isForeignCash ? convertToTwd(m.marketValue, currency, usdToTwd) : m.marketValue,
      displayGainLoss: isForeignCash ? convertToTwd(m.gainLoss, currency, usdToTwd) : m.gainLoss,
    };
  });
  const sortedRows = sortKey ? [...rows].sort((a, b) => compareRows(a, b, sortKey, sortDir)) : rows;
  const totals = computeClassTotals(metrics, usdToTwd);

  // The 現金帳戶 ledger (see CashLedgerCard) tracks raw currency balances
  // separately from 現金-classified Holdings like STRC/0056 (real securities
  // someone just groups under 現金) — shown here as extra, non-editable rows
  // so the 現金 tab reflects true liquidity, not just invested-in-cash
  // positions. Pinned at the top, ahead of the sortable rows, rather than
  // folded into them, since there's no real Holding/id backing them (nothing
  // to sort by price/edit/delete). A balance has no cost basis of its own, so it
  // contributes equally to cost and market value (zero gain/loss) in the
  // footer total below.
  const cashBalanceEntries =
    tab === 'cash'
      ? Object.entries(cashBalances)
          .filter(([, amount]) => amount !== 0)
          .sort(([a], [b]) => {
            const ai = CASH_CURRENCY_ORDER.indexOf(a);
            const bi = CASH_CURRENCY_ORDER.indexOf(b);
            if (ai === -1 && bi === -1) return a.localeCompare(b);
            if (ai === -1) return 1;
            if (bi === -1) return -1;
            return ai - bi;
          })
      : [];
  let cashBalanceTwdTotal = 0;
  const cashBalanceRows = cashBalanceEntries.map(([currency, amount]) => {
    const rate = twdRateForCashCurrency(currency, usdToTwd, jpyToTwd);
    const twdValue = rate === null ? null : amount * rate;
    if (twdValue !== null) cashBalanceTwdTotal += twdValue;
    return { currency, amount, twdValue };
  });
  const combinedTotals = {
    totalCostValue: totals.totalCostValue + cashBalanceTwdTotal,
    totalMarketValue: totals.totalMarketValue + cashBalanceTwdTotal,
    totalGainLoss: totals.totalGainLoss,
    totalGainLossPct:
      totals.totalCostValue + cashBalanceTwdTotal !== 0
        ? (totals.totalGainLoss / (totals.totalCostValue + cashBalanceTwdTotal)) * 100
        : 0,
  };
  // 現金 tab totals are normalized to TWD (see computeClassTotals); every
  // other tab is a plain "$" (see CASH_TAB_UNIT above).
  const footerUnit = tab === 'cash' ? CASH_TAB_UNIT.TWD : '$';

  return { metrics, sortedRows, cashBalanceEntries, cashBalanceRows, combinedTotals, footerUnit };
}

const BASE_TABS: AssetClass[] = ['crypto', 'us_stock', 'tw_stock', 'cash'];

// Fixed pixel widths (used with table-layout: fixed) so columns don't
// reshuffle as values change length — e.g. switching tabs between
// currencies, or a price refresh changing digit count.
const COLUMN_WIDTHS = ['70px', '110px', '80px', '90px', '100px', '100px', '110px', '100px', '80px', '50px'];

interface OpenMenu {
  id: string;
  top: number;
  right: number;
}

export function HoldingsTable() {
  const { holdings, prices, cashBalances, deleteHolding } = usePortfolio();
  const { effectiveUsdToTwd, effectiveJpyToTwd } = useFxRate();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [openMenu, setOpenMenu] = useState<OpenMenu | null>(null);
  const [selectedClass, setSelectedClass] = useState<AssetClass>('us_stock');
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const menuRef = useRef<HTMLDivElement | null>(null);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  useEffect(() => {
    if (!openMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openMenu]);

  const hasOther = holdings.some((h) => h.assetClass === 'other');
  const tabs = hasOther ? [...BASE_TABS, 'other' as AssetClass] : BASE_TABS;

  return (
    <section className="card">
      <div className="card-header">
        <h2>持股清單</h2>
        <button className="btn btn-primary" onClick={() => setIsAdding(true)}>
          + 新增持股
        </button>
      </div>

      <div className="tab-bar">
        {tabs.map((tab) => (
          <button
            key={tab}
            className={`tab-button ${selectedClass === tab ? 'active' : ''}`}
            onClick={() => setSelectedClass(tab)}
          >
            {ASSET_CLASS_LABELS[tab]}
          </button>
        ))}
      </div>

      {/* Every tab's table is rendered at once and stacked in the same grid
          cell (see .table-panels in index.css), so the card's height is
          always the tallest tab's height — switching tabs never resizes the
          card or shifts the page's scroll position. Only the active one is
          visible/interactive. */}
      <div className="table-panels">
        {tabs.map((tab) => {
          const { metrics, sortedRows, cashBalanceEntries, cashBalanceRows, combinedTotals, footerUnit } = buildTabData(
            tab,
            holdings,
            prices,
            cashBalances,
            effectiveUsdToTwd,
            effectiveJpyToTwd,
            sortKey,
            sortDir,
          );
          return (
            <div key={tab} className={`table-panel ${tab === selectedClass ? 'active' : ''}`}>
              {holdings.length === 0 && cashBalanceEntries.length === 0 ? (
                <p className="empty-state">尚未新增任何持股，點擊「新增持股」開始，或到下方設定匯入 Google Sheet。</p>
              ) : metrics.length === 0 && cashBalanceEntries.length === 0 ? (
                <p className="empty-state">「{ASSET_CLASS_LABELS[tab]}」目前沒有持股。</p>
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
                        {(
                          [
                            ['symbol', '代號'],
                            ['price', '現價'],
                            ['change', '漲跌'],
                            ['shares', '數量'],
                            ['avgCost', '平均成本'],
                            ['costValue', '總成本'],
                            ['marketValue', '市值'],
                            ['gainLoss', '損益'],
                            ['gainLossPct', '損益率'],
                          ] as [SortKey, string][]
                        ).map(([key, label]) => (
                          <th key={key}>
                            <button className="sort-header" onClick={() => handleSort(key)}>
                              {label}
                              <span className="sort-arrow">
                                {sortKey === key ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
                              </span>
                            </button>
                          </th>
                        ))}
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {cashBalanceRows.map(({ currency, amount, twdValue }) => (
                        <tr key={`cash-balance-${currency}`} className="cash-balance-row">
                          <td>{currency}</td>
                          <td>—</td>
                          <td>—</td>
                          <td><Money unit={CASH_TAB_UNIT[currency] ?? currency} value={amount} /></td>
                          <td>—</td>
                          <td><Money unit={CASH_TAB_UNIT.TWD} value={twdValue} /></td>
                          <td><Money unit={CASH_TAB_UNIT.TWD} value={twdValue} /></td>
                          {/* A ledger balance has no 現價, so — like that column — 損益/
                              損益率 read as "not applicable" rather than a computed "0",
                              which would wrongly imply a real gain/loss calculation ran. */}
                          <td>—</td>
                          <td>—</td>
                          <td></td>
                        </tr>
                      ))}
                      {sortedRows.map(({ m, changePercent, isForeignCash, displayCostValue, displayMarketValue, displayGainLoss }) => {
                        const isGain = m.gainLoss >= 0;
                        const isMenuOpen = openMenu?.id === m.holding.id;
                        // Every tab except 現金 is a plain "$" (see CASH_TAB_UNIT above).
                        const nativeUnit = tab === 'cash' ? CASH_TAB_UNIT[currencyFor(m.holding)] : '$';
                        // isForeignCash rows have already been converted to their TWD
                        // equivalent above (see the Row interface), so their 總成本/
                        // 市值/損益 columns get the TWD label instead of the native one.
                        const displayUnit = isForeignCash ? CASH_TAB_UNIT.TWD : nativeUnit;
                        return (
                          <tr key={m.holding.id}>
                            <td>{m.holding.symbol || '—'}</td>
                            <td><Money unit={nativeUnit} value={m.currentPrice} tiered /></td>
                            <td className={changePercent === undefined ? '' : changePercent > 0 ? 'change-up' : changePercent < 0 ? 'change-down' : ''}>
                              {changePercent === undefined ? '—' : formatPercent(changePercent)}
                            </td>
                            <td>{formatShares(m.holding.shares, m.holding.assetClass)}</td>
                            <td><Money unit={nativeUnit} value={m.holding.avgCost} tiered /></td>
                            <td><Money unit={displayUnit} value={displayCostValue} /></td>
                            <td><Money unit={displayUnit} value={displayMarketValue} /></td>
                            <td className={isGain ? 'change-up' : 'change-down'}><Money unit={displayUnit} value={displayGainLoss} signed /></td>
                            <td className={isGain ? 'change-up' : 'change-down'}>{formatPercent(m.gainLossPct)}</td>
                            <td className="row-actions">
                              {m.holding.symbol && (
                                <a
                                  className="news-link-icon"
                                  href={googleNewsUrlFor(m.holding.symbol)}
                                  target="_blank"
                                  rel="noreferrer"
                                  title={`在 Google 新聞搜尋「${m.holding.symbol}」（近 7 天，依最新排序）`}
                                >
                                  📰
                                </a>
                              )}
                              <button
                                className="btn btn-small btn-icon"
                                aria-label="更多操作"
                                onClick={(e) => {
                                  if (isMenuOpen) {
                                    setOpenMenu(null);
                                    return;
                                  }
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  setOpenMenu({
                                    id: m.holding.id,
                                    top: rect.bottom + 4,
                                    right: window.innerWidth - rect.right,
                                  });
                                }}
                              >
                                ⋯
                              </button>
                              {isMenuOpen &&
                                createPortal(
                                  <div
                                    className="row-menu-dropdown"
                                    ref={menuRef}
                                    style={{ position: 'fixed', top: openMenu.top, right: openMenu.right }}
                                  >
                                    <button
                                      onClick={() => {
                                        setEditingId(m.holding.id);
                                        setOpenMenu(null);
                                      }}
                                    >
                                      編輯
                                    </button>
                                    <button
                                      className="danger"
                                      onClick={() => {
                                        setOpenMenu(null);
                                        if (window.confirm(`確定要刪除「${m.holding.symbol || '這筆持股'}」嗎？`)) {
                                          deleteHolding(m.holding.id);
                                        }
                                      }}
                                    >
                                      刪除
                                    </button>
                                  </div>,
                                  document.body,
                                )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="holdings-total-row">
                        <td>{tab === 'cash' ? '總計（台幣 TWD）' : '總計'}</td>
                        <td>—</td>
                        <td>—</td>
                        <td>—</td>
                        <td>—</td>
                        <td><Money unit={footerUnit} value={combinedTotals.totalCostValue} /></td>
                        <td><Money unit={footerUnit} value={combinedTotals.totalMarketValue} /></td>
                        <td className={combinedTotals.totalGainLoss >= 0 ? 'change-up' : 'change-down'}>
                          <Money unit={footerUnit} value={combinedTotals.totalGainLoss} signed />
                        </td>
                        <td className={combinedTotals.totalGainLoss >= 0 ? 'change-up' : 'change-down'}>
                          {formatPercent(combinedTotals.totalGainLossPct)}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {(isAdding || editingId) && (
        <HoldingFormModal
          editingId={editingId}
          onClose={() => {
            setIsAdding(false);
            setEditingId(null);
          }}
        />
      )}
    </section>
  );
}
