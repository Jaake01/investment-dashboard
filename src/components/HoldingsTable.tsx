import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePortfolio } from '../context/PortfolioContext';
import { computeHoldingMetrics } from '../lib/calculations';
import { formatCurrencyIn, formatNumber, formatPercent } from '../lib/format';
import { ASSET_CLASS_LABELS, CURRENCY_FOR_ASSET_CLASS, type AssetClass } from '../types';
import { HoldingFormModal } from './HoldingFormModal';

const BASE_TABS: AssetClass[] = ['crypto', 'us_stock', 'tw_stock', 'cash'];

// Fixed pixel widths (used with table-layout: fixed) so columns don't
// reshuffle as values change length — e.g. switching tabs between
// currencies, or a price refresh changing digit count.
const COLUMN_WIDTHS = ['70px', '110px', '90px', '100px', '110px', '100px', '80px', '50px'];

interface OpenMenu {
  id: string;
  top: number;
  right: number;
}

export function HoldingsTable() {
  const { holdings, prices, deleteHolding } = usePortfolio();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [openMenu, setOpenMenu] = useState<OpenMenu | null>(null);
  const [selectedClass, setSelectedClass] = useState<AssetClass>('us_stock');
  const menuRef = useRef<HTMLDivElement | null>(null);

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

      {holdings.length === 0 ? (
        <p className="empty-state">尚未新增任何持股，點擊「新增持股」開始，或到下方設定匯入 Google Sheet。</p>
      ) : metrics.length === 0 ? (
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
                <th>代號</th>
                <th>現價</th>
                <th>數量</th>
                <th>平均成本</th>
                <th>市值</th>
                <th>損益</th>
                <th>損益率</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {metrics.map((m) => {
                const isGain = m.gainLoss >= 0;
                const currency = CURRENCY_FOR_ASSET_CLASS[m.holding.assetClass];
                const isMenuOpen = openMenu?.id === m.holding.id;
                return (
                  <tr key={m.holding.id}>
                    <td>{m.holding.symbol || '—'}</td>
                    <td>
                      {formatCurrencyIn(m.currentPrice, currency)}
                      {!m.priceIsLive && m.holding.symbol && <span className="badge">成本價</span>}
                    </td>
                    <td>{formatNumber(m.holding.shares)}</td>
                    <td>{formatCurrencyIn(m.holding.avgCost, currency)}</td>
                    <td>{formatCurrencyIn(m.marketValue, currency)}</td>
                    <td className={isGain ? 'gain' : 'loss'}>{formatCurrencyIn(m.gainLoss, currency)}</td>
                    <td className={isGain ? 'gain' : 'loss'}>{formatPercent(m.gainLossPct)}</td>
                    <td className="row-actions">
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
