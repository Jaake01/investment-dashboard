import { useState, type FormEvent } from 'react';
import { usePortfolio } from '../context/PortfolioContext';
import { ASSET_CLASSES, ASSET_CLASS_LABELS, CURRENCY_FOR_ASSET_CLASS, type AssetClass } from '../types';
import { guessAssetClassFromSymbol } from '../lib/symbolClass';
import { currencyFor, currentPriceFor } from '../lib/calculations';

interface HoldingFormModalProps {
  editingId: string | null;
  onClose: () => void;
}

export function HoldingFormModal({ editingId, onClose }: HoldingFormModalProps) {
  const { holdings, prices, addHolding, updateHolding } = usePortfolio();
  const editingHolding = editingId ? holdings.find((h) => h.id === editingId) : undefined;

  const [symbol, setSymbol] = useState(editingHolding?.symbol ?? '');
  const [shares, setShares] = useState(editingHolding ? String(editingHolding.shares) : '');
  const [avgCost, setAvgCost] = useState(editingHolding ? String(editingHolding.avgCost) : '');
  const [assetClass, setAssetClass] = useState<AssetClass>(editingHolding?.assetClass ?? 'us_stock');
  // Once true, the class dropdown won't be overwritten by symbol-based guessing anymore.
  const [classTouched, setClassTouched] = useState(!!editingHolding);
  const [notes, setNotes] = useState(editingHolding?.notes ?? '');
  const [deductFromCash, setDeductFromCash] = useState(false);
  const [deductSourceId, setDeductSourceId] = useState('');
  const [error, setError] = useState('');

  // Only offered when adding a brand-new non-cash holding, so "buying" cash
  // with cash or nudging an existing position via edit never triggers this.
  // Candidates are restricted to the purchase's own currency — deducting TWD
  // cash to fund a USD buy would need an FX conversion this feature doesn't do.
  const cashDeductionCandidates = !editingHolding && assetClass !== 'cash'
    ? holdings.filter((h) => h.assetClass === 'cash' && currencyFor(h) === CURRENCY_FOR_ASSET_CLASS[assetClass])
    : [];

  const handleSymbolChange = (value: string) => {
    setSymbol(value);
    if (!classTouched) {
      setAssetClass(guessAssetClassFromSymbol(value));
    }
  };

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
      setError('平均價格必須是有效數字');
      return;
    }
    if (deductFromCash && !deductSourceId) {
      setError('請選擇要扣款的現金持股');
      return;
    }

    const input = {
      symbol: symbol.trim().toUpperCase(),
      shares: sharesNum,
      avgCost: avgCostNum,
      assetClass,
      notes: notes.trim() || undefined,
    };

    if (editingHolding) {
      updateHolding(editingHolding.id, input);
    } else {
      addHolding(input);
      if (deductFromCash && deductSourceId) {
        const source = holdings.find((h) => h.id === deductSourceId);
        if (source) {
          const purchaseCost = sharesNum * avgCostNum;
          const { price: sourcePrice } = currentPriceFor(source, prices);
          const deductShares = purchaseCost / sourcePrice;
          updateHolding(source.id, { shares: source.shares - deductShares });
        }
      }
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
            <input value={symbol} onChange={(e) => handleSymbolChange(e.target.value)} placeholder="例如 AAPL" />
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
            平均價格（每股）
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
            <select
              value={assetClass}
              onChange={(e) => {
                setAssetClass(e.target.value as AssetClass);
                setClassTouched(true);
              }}
            >
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

          {cashDeductionCandidates.length > 0 && (
            <>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={deductFromCash}
                  onChange={(e) => {
                    setDeductFromCash(e.target.checked);
                    if (!e.target.checked) setDeductSourceId('');
                  }}
                />
                同時從現金扣款
              </label>
              {deductFromCash && (
                <label>
                  扣款來源
                  <select value={deductSourceId} onChange={(e) => setDeductSourceId(e.target.value)}>
                    <option value="">請選擇</option>
                    {cashDeductionCandidates.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.symbol || '現金餘額'}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </>
          )}

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
