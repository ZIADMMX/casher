import { useEffect, useState } from 'react';
import { CloseIcon } from '../icons/PosIcons.jsx';

/**
 * Picks the add-ons for one cart line and how many of its units get them
 * ("one of the three with extra cheese"), plus a free note for the kitchen.
 */
export default function ModifiersModal({ line, catalog, onApply, onClose }) {
  const [selected, setSelected] = useState([]);
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!line) return;
    setSelected((line.modifiers || []).map((m) => m.name));
    setQuantity(line.quantity);
    setNote(line.note || '');
  }, [line]);

  if (!line) return null;

  const toggle = (name) => setSelected((prev) => (
    prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
  ));
  const extra = catalog.filter((a) => selected.includes(a.name)).reduce((sum, a) => sum + a.price, 0);
  const basePrice = line.basePrice ?? line.unitPrice;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="held-orders-modal pos-tables-modal" role="dialog" aria-label="إضافات وملاحظة الصنف" onClick={(e) => e.stopPropagation()}>
        <div className="held-modal-header">
          <div className="held-title-row">
            <h3>{line.productName}</h3>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="إغلاق">
            <CloseIcon size={18} />
          </button>
        </div>

        <div className="held-modal-body">
          <div className="pos-tables-grid">
            {catalog.map((addon) => {
              const isOn = selected.includes(addon.name);
              return (
                <div key={addon.name} className={`pos-table-card${isOn ? ' is-busy' : ''}`}>
                  <button
                    type="button"
                    className="pos-table-card__open"
                    aria-pressed={isOn}
                    onClick={() => toggle(addon.name)}
                  >
                    <span className="pos-table-card__name">{addon.name}</span>
                    <span className="pos-table-card__state">
                      {addon.price > 0 ? `+${addon.price.toFixed(2)} ج.م` : 'بدون رسوم'}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>

          <form
            className="pos-tables-add"
            onSubmit={(e) => {
              e.preventDefault();
              onApply(selected, quantity, note);
            }}
          >
            <input
              className="pos-tables-add__input"
              value={note}
              maxLength={120}
              placeholder="ملاحظة للمطبخ (مثال: من غير بصل، استوا زيادة)"
              aria-label="ملاحظة للمطبخ"
              onChange={(e) => setNote(e.target.value)}
            />
            {line.quantity > 1 && (
              <label>
                {'العدد '}
                <input
                  className="pos-tables-add__input"
                  type="number"
                  min="1"
                  max={line.quantity}
                  step="1"
                  value={quantity}
                  aria-label="عدد القطع اللي عليها الإضافات"
                  onChange={(e) => setQuantity(Math.min(Math.max(Number(e.target.value) || 1, 1), line.quantity))}
                />
                {` من ${line.quantity}`}
              </label>
            )}
            <button type="submit" className="pos-topbar-btn">
              <span>{`تأكيد — ${(basePrice + extra).toFixed(2)} ج.م للقطعة`}</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
