import { useState, type FormEvent } from 'react';
import { usePortfolio } from '../context/PortfolioContext';
import { ASSET_CLASSES, ASSET_CLASS_LABELS, type AssetClass } from '../types';

interface HoldingFormModalProps {
  editingId: string | null;
  onClose: () => void;
}

export function HoldingFormModal({ editingId, onClose }: HoldingFormModalProps) {
  const { holdings, addHolding, updateHolding } = usePortfolio();
  const editingHolding = editingId ? holdings.find((h) => h.id === editingId) : undefined;

  const [symbol, setSymbol] = useState(editingHolding?.symbol ?? '');
  const [name, setName] = useState(editingHolding?.name ?? '');
  const [shares, setShares] = useState(editingHolding ? String(editingHolding.shares) : '');
  const [avgCost, setAvgCost] = useState(editingHolding ? String(editingHolding.avgCost) : '');
  const [assetClass, setAssetClass] = useState<AssetClass>(editingHolding?.assetClass ?? 'us_stock');
  const [notes, setNotes] = useState(editingHolding?.notes ?? '');
  const [error, setError] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const sharesNum = Number(shares);
    const avgCostNum = Number(avgCost);

    if (assetClass !== 'cash' && !symbol.trim()) {
      setError('請輸入代號（現金項目除外）');
      return;
    }
    if (Number.isNaN(sharesNum) || sharesNum <= 0) {
      setError('股數必須是大於 0 的數字');
      return;
    }
    if (Number.isNaN(avgCostNum) || avgCostNum < 0) {
      setError('平均成本必須是有效數字');
      return;
    }

    const input = {
      symbol: symbol.trim().toUpperCase(),
      name: name.trim() || undefined,
      shares: sharesNum,
      avgCost: avgCostNum,
      assetClass,
      notes: notes.trim() || undefined,
    };

    if (editingHolding) {
      updateHolding(editingHolding.id, input);
    } else {
      addHolding(input);
    }
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{editingHolding ? '編輯持股' : '新增持股'}</h3>
        <form onSubmit={handleSubmit}>
          <label>
            代號
            <input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="AAPL" />
          </label>
          <label>
            名稱（選填）
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Apple Inc." />
          </label>
          <label>
            股數
            <input
              type="number"
              step="any"
              value={shares}
              onChange={(e) => setShares(e.target.value)}
              placeholder="10"
            />
          </label>
          <label>
            平均成本（每股）
            <input
              type="number"
              step="any"
              value={avgCost}
              onChange={(e) => setAvgCost(e.target.value)}
              placeholder="150"
            />
          </label>
          <label>
            資產類別
            <select value={assetClass} onChange={(e) => setAssetClass(e.target.value as AssetClass)}>
              {ASSET_CLASSES.map((ac) => (
                <option key={ac} value={ac}>
                  {ASSET_CLASS_LABELS[ac]}
                </option>
              ))}
            </select>
          </label>
          <label>
            備註（選填）
            <input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>

          {error && <p className="form-error">{error}</p>}

          <div className="modal-actions">
            <button type="button" className="btn" onClick={onClose}>
              取消
            </button>
            <button type="submit" className="btn btn-primary">
              {editingHolding ? '儲存' : '新增'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
