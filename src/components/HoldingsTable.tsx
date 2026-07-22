import { useEffect, useRef, useState } from 'react';
import { usePortfolio } from '../context/PortfolioContext';
import { computeHoldingMetrics } from '../lib/calculations';
import { formatCurrencyIn, formatNumber, formatPercent } from '../lib/format';
import { ASSET_CLASS_LABELS, CURRENCY_FOR_ASSET_CLASS, type AssetClass } from '../types';
import { HoldingFormModal } from './HoldingFormModal';

const BASE_TABS: AssetClass[] = ['crypto', 'us_stock', 'tw_stock', 'cash'];

export function HoldingsTable() {
  const { holdings, prices, deleteHolding } = usePortfolio();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [selectedClass, setSelectedClass] = useState<AssetClass>('us_stock');
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!openMenuId) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openMenuId]);

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
          <table>
            <thead>
              <tr>
                <th>代號</th>
                <th>類別</th>
                <th>股數</th>
                <th>平均成本</th>
                <th>現價</th>
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
                return (
                  <tr key={m.holding.id}>
                    <td>{m.holding.symbol || '—'}</td>
                    <td>{ASSET_CLASS_LABELS[m.holding.assetClass]}</td>
                    <td>{formatNumber(m.holding.shares)}</td>
                    <td>{formatCurrencyIn(m.holding.avgCost, currency)}</td>
                    <td>
                      {formatCurrencyIn(m.currentPrice, currency)}
                      {!m.priceIsLive && m.holding.symbol && <span className="badge">成本價</span>}
                    </td>
                    <td>{formatCurrencyIn(m.marketValue, currency)}</td>
                    <td className={isGain ? 'gain' : 'loss'}>{formatCurrencyIn(m.gainLoss, currency)}</td>
                    <td className={isGain ? 'gain' : 'loss'}>{formatPercent(m.gainLossPct)}</td>
                    <td className="row-actions">
                      <div className="row-menu" ref={openMenuId === m.holding.id ? menuRef : undefined}>
                        <button
                          className="btn btn-small btn-icon"
                          aria-label="更多操作"
                          onClick={() => setOpenMenuId(openMenuId === m.holding.id ? null : m.holding.id)}
                        >
                          ⋯
                        </button>
                        {openMenuId === m.holding.id && (
                          <div className="row-menu-dropdown">
                            <button
                              onClick={() => {
                                setEditingId(m.holding.id);
                                setOpenMenuId(null);
                              }}
                            >
                              編輯
                            </button>
                            <button
                              className="danger"
                              onClick={() => {
                                setOpenMenuId(null);
                                if (window.confirm(`確定要刪除「${m.holding.symbol || '這筆持股'}」嗎？`)) {
                                  deleteHolding(m.holding.id);
                                }
                              }}
                            >
                              刪除
                            </button>
                          </div>
                        )}
                      </div>
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
