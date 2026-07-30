import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePortfolio } from '../context/PortfolioContext';
import { useFxRate } from '../hooks/useFxRate';
import { computeClassTotals, computeHoldingMetrics, convertToTwd, currencyFor, type HoldingMetrics } from '../lib/calculations';
import { formatDollar, formatShares, formatPercent, formatSignedNumber, googleNewsUrlFor } from '../lib/format';
import { CASH_CURRENCY_ORDER, formatCashAmount, twdRateForCashCurrency } from '../lib/cashLedger';
import { ASSET_CLASS_LABELS, type AssetClass } from '../types';
import { HoldingFormModal } from './HoldingFormModal';

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

  const metrics = holdings
    .filter((h) => h.assetClass === selectedClass)
    .map((h) => computeHoldingMetrics(h, prices));

  const rows: Row[] = metrics.map((m) => {
    const currency = currencyFor(m.holding);
    const isForeignCash = m.holding.assetClass === 'cash' && currency !== 'TWD';
    return {
      m,
      changePercent: m.holding.symbol ? prices[m.holding.symbol]?.changePercent : undefined,
      isForeignCash,
      displayCostValue: isForeignCash ? convertToTwd(m.costValue, currency, effectiveUsdToTwd) : m.costValue,
      displayMarketValue: isForeignCash ? convertToTwd(m.marketValue, currency, effectiveUsdToTwd) : m.marketValue,
      displayGainLoss: isForeignCash ? convertToTwd(m.gainLoss, currency, effectiveUsdToTwd) : m.gainLoss,
    };
  });
  const sortedRows = sortKey ? [...rows].sort((a, b) => compareRows(a, b, sortKey, sortDir)) : rows;
  const totals = computeClassTotals(metrics, effectiveUsdToTwd);

  // The 現金帳戶 ledger (see CashLedgerCard) tracks raw currency balances
  // separately from 現金-classified Holdings like STRC/0056 (real securities
  // someone just groups under 現金) — shown here as extra, non-editable rows
  // so the 現金 tab reflects true liquidity, not just invested-in-cash
  // positions. Pinned after the sortable rows rather than folded into them,
  // since there's no real Holding/id backing them (nothing to sort by
  // price/edit/delete). A balance has no cost basis of its own, so it
  // contributes equally to cost and market value (zero gain/loss) in the
  // footer total below.
  const cashBalanceEntries =
    selectedClass === 'cash'
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
    const rate = twdRateForCashCurrency(currency, effectiveUsdToTwd, effectiveJpyToTwd);
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

      {holdings.length === 0 && cashBalanceEntries.length === 0 ? (
        <p className="empty-state">尚未新增任何持股，點擊「新增持股」開始，或到下方設定匯入 Google Sheet。</p>
      ) : metrics.length === 0 && cashBalanceEntries.length === 0 ? (
        <p className="empty-state">「{ASSET_CLASS_LABELS[selectedClass]}」目前沒有持股。</p>
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
              {sortedRows.map(({ m, changePercent, isForeignCash, displayCostValue, displayMarketValue, displayGainLoss }) => {
                const isGain = m.gainLoss >= 0;
                const isMenuOpen = openMenu?.id === m.holding.id;
                const unitSuffix = isForeignCash ? ' U' : '';
                return (
                  <tr key={m.holding.id}>
                    <td>{m.holding.symbol || '—'}</td>
                    <td>{formatDollar(m.currentPrice)}{unitSuffix}</td>
                    <td className={changePercent === undefined ? '' : changePercent > 0 ? 'change-up' : changePercent < 0 ? 'change-down' : ''}>
                      {changePercent === undefined ? '—' : formatPercent(changePercent)}
                    </td>
                    <td>{formatShares(m.holding.shares, m.holding.assetClass)}</td>
                    <td>{formatDollar(m.holding.avgCost)}{unitSuffix}</td>
                    <td>{displayCostValue === null ? '—' : formatDollar(displayCostValue)}</td>
                    <td>{displayMarketValue === null ? '—' : formatDollar(displayMarketValue)}</td>
                    <td className={isGain ? 'change-up' : 'change-down'}>{displayGainLoss === null ? '—' : formatSignedNumber(displayGainLoss)}</td>
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
              {cashBalanceRows.map(({ currency, amount, twdValue }) => (
                <tr key={`cash-balance-${currency}`} className="cash-balance-row">
                  <td>{currency}</td>
                  <td>—</td>
                  <td>—</td>
                  <td>{formatCashAmount(amount, currency)}</td>
                  <td>—</td>
                  <td>{twdValue === null ? '—' : formatDollar(twdValue)}</td>
                  <td>{twdValue === null ? '—' : formatDollar(twdValue)}</td>
                  <td className="change-up">{twdValue === null ? '—' : '0'}</td>
                  <td className="change-up">{twdValue === null ? '—' : '0.0%'}</td>
                  <td></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="holdings-total-row">
                <td>{selectedClass === 'cash' ? '總計（台幣 TWD）' : '總計'}</td>
                <td>—</td>
                <td>—</td>
                <td>—</td>
                <td>—</td>
                <td>{formatDollar(combinedTotals.totalCostValue)}</td>
                <td>{formatDollar(combinedTotals.totalMarketValue)}</td>
                <td className={combinedTotals.totalGainLoss >= 0 ? 'change-up' : 'change-down'}>
                  {formatSignedNumber(combinedTotals.totalGainLoss)}
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
