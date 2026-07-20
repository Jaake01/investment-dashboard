import { useState } from 'react';
import { usePortfolio } from '../context/PortfolioContext';
import { computeHoldingMetrics } from '../lib/calculations';
import { formatCurrency, formatNumber, formatPercent } from '../lib/format';
import { ASSET_CLASS_LABELS } from '../types';
import { HoldingFormModal } from './HoldingFormModal';

export function HoldingsTable() {
  const { holdings, prices, deleteHolding } = usePortfolio();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const metrics = holdings.map((h) => computeHoldingMetrics(h, prices));

  return (
    <section className="card">
      <div className="card-header">
        <h2>持股清單</h2>
        <button className="btn btn-primary" onClick={() => setIsAdding(true)}>
          + 新增持股
        </button>
      </div>

      {holdings.length === 0 ? (
        <p className="empty-state">尚未新增任何持股，點擊「新增持股」開始，或到下方設定匯入 Google Sheet。</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>代號</th>
                <th>名稱</th>
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
                return (
                  <tr key={m.holding.id}>
                    <td>{m.holding.symbol || '—'}</td>
                    <td>{m.holding.name || '—'}</td>
                    <td>{ASSET_CLASS_LABELS[m.holding.assetClass]}</td>
                    <td>{formatNumber(m.holding.shares)}</td>
                    <td>{formatCurrency(m.holding.avgCost)}</td>
                    <td>
                      {formatCurrency(m.currentPrice)}
                      {!m.priceIsLive && m.holding.symbol && <span className="badge">成本價</span>}
                    </td>
                    <td>{formatCurrency(m.marketValue)}</td>
                    <td className={isGain ? 'gain' : 'loss'}>{formatCurrency(m.gainLoss)}</td>
                    <td className={isGain ? 'gain' : 'loss'}>{formatPercent(m.gainLossPct)}</td>
                    <td className="row-actions">
                      <button className="btn btn-small" onClick={() => setEditingId(m.holding.id)}>
                        編輯
                      </button>
                      <button
                        className="btn btn-small btn-danger"
                        onClick={() => {
                          if (window.confirm(`確定要刪除「${m.holding.symbol || m.holding.name}」嗎？`)) {
                            deleteHolding(m.holding.id);
                          }
                        }}
                      >
                        刪除
                      </button>
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
