import { useEffect, useState } from 'react';
import { CloseIcon } from '../icons/PosIcons.jsx';

/**
 * Split a table check: pick the lines one guest pays now. The rest stays on
 * the check for the next payment; the last payment closes the table.
 */
export default function SplitBillModal({ tab, onPay, onClose }) {
  const unpaid = (tab?.items || []).filter((item) => item.paid_sale_id == null);
  const [selected, setSelected] = useState([]);

  useEffect(() => setSelected([]), [tab]);

  if (!tab) return null;

  const toggle = (id) => setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const total = unpaid.filter((item) => selected.includes(item.id)).reduce((sum, item) => sum + item.quantity * item.unit_price, 0);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="held-orders-modal pos-tables-modal" role="dialog" aria-label="تقسيم الحساب" onClick={(e) => e.stopPropagation()}>
        <div className="held-modal-header">
          <div className="held-title-row">
            <h3>{`تقسيم حساب ${tab.table_name}`}</h3>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="إغلاق">
            <CloseIcon size={18} />
          </button>
        </div>

        <div className="held-modal-body">
          {Number(tab.paid_total) > 0 && (
            <p>{`اتدفع قبل كده: ${Number(tab.paid_total).toFixed(2)} ج.م`}</p>
          )}
          <div className="pos-tables-grid">
            {unpaid.map((item) => {
              const isOn = selected.includes(item.id);
              return (
                <div key={item.id} className={`pos-table-card${isOn ? ' is-busy' : ''}`}>
                  <button type="button" className="pos-table-card__open" aria-pressed={isOn} onClick={() => toggle(item.id)}>
                    <span className="pos-table-card__name">{`${item.quantity} × ${item.product_name || 'صنف محذوف'}`}</span>
                    <span className="pos-table-card__state">{`${(item.quantity * item.unit_price).toFixed(2)} ج.م`}</span>
                  </button>
                </div>
              );
            })}
          </div>
          <div className="pos-tables-add">
            <button type="button" className="pos-topbar-btn" onClick={() => setSelected(unpaid.map((item) => item.id))}>
              اختار الكل
            </button>
            <button type="button" className="pos-topbar-btn" disabled={selected.length === 0} onClick={() => onPay(selected)}>
              {`ادفع المختار — ${total.toFixed(2)} ج.م`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
