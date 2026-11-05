import { useEffect, useState } from 'react';
import * as printingApi from '../../api/printing.js';
import * as salesApi from '../../api/sales.js';

function PaymentBadge({ method }) {
  const map = {
    cash: { label: 'نقدي 💵', className: 'pay-cash' },
    card: { label: 'بطاقة 💳', className: 'pay-card' },
    credit: { label: 'آجل ⏳', className: 'pay-credit' },
  };
  const info = map[method] || { label: method || 'نقدي', className: 'pay-cash' };
  return <span className={`pay-pill ${info.className}`}>{info.label}</span>;
}

export default function InvoiceModal({ invoiceId, onClose }) {
  const [sale, setSale] = useState(null);
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    salesApi.getSaleById(invoiceId)
      .then((data) => {
        if (!cancelled) {
          setSale(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error('فشل جلب الفاتورة:', err);
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [invoiceId]);

  const handlePrint = async () => {
    if (!sale) return;
    setPrinting(true);
    try {
      if (printingApi.printReceipt.isAvailable()) {
        await printingApi.printReceipt(sale);
      }
    } catch (err) {
      console.error('فشل طباعة الفاتورة:', err);
    } finally {
      setPrinting(false);
    }
  };

  const handleCopy = () => {
    const text = `#INV-${String(invoiceId).padStart(4, '0')}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formattedDate = sale?.created_at
    ? new Date(sale.created_at).toLocaleDateString('ar-EG', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : '';

  const formattedTime = sale?.created_at
    ? new Date(sale.created_at).toLocaleTimeString('ar-EG', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      })
    : '';

  return (
    <div className="receipt-modal-backdrop" onClick={onClose}>
      <div className="receipt-sheet" onClick={(e) => e.stopPropagation()}>
        {/* رأسية الإيصال الفاخرة */}
        <div className="receipt-sheet-header">
          <div className="receipt-header-brand">
            <span className="receipt-tag-badge">فاتورة مبيعات معتمدة ✓</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 className="receipt-sheet-title">#INV-{String(invoiceId).padStart(4, '0')}</h2>
              <button
                type="button"
                className="inv-copy-icon"
                style={{ opacity: 1, color: '#93c5fd', background: 'none', border: 'none' }}
                title="نسخ رقم الفاتورة"
                onClick={handleCopy}
              >
                {copied ? '✓' : '📋'}
              </button>
            </div>
            {formattedDate && (
              <span className="receipt-sheet-date">
                📅 {formattedDate} • ⏰ {formattedTime}
              </span>
            )}
          </div>
          <button type="button" className="receipt-close-btn" onClick={onClose} title="إغلاق">×</button>
        </div>

        {loading ? (
          <div style={{ padding: '50px 20px', textAlign: 'center', color: '#64748b' }}>
            جاري تحضير تفاصيل الفاتورة...
          </div>
        ) : sale ? (
          <>
            {/* بطاقة العميل وطريقة الدفع */}
            <div className="receipt-meta-capsule">
              <div className="receipt-customer-chip">
                <span>👤 {sale.customer_name || 'عميل نقدي سريع'}</span>
                {sale.customer_phone && <span className="phone">({sale.customer_phone})</span>}
              </div>
              <PaymentBadge method={sale.payment_method} />
            </div>

            {/* تفاصيل الأصناف */}
            <div className="receipt-body">
              <div className="receipt-items-list">
                {sale.items?.map((item, i) => (
                  <div key={i} className="receipt-item-row">
                    <div className="receipt-item-details">
                      <span className="receipt-item-name">{item.productName || 'صنف بدون اسم'}</span>
                      <div className="receipt-item-specs">
                        {item.size && <span className="receipt-spec-badge">المقاس: {item.size}</span>}
                        {item.color && <span className="receipt-spec-badge">اللون: {item.color}</span>}
                        {item.barcode && <span style={{ opacity: 0.7 }}>#{item.barcode}</span>}
                      </div>
                    </div>
                    <div className="receipt-item-pricing">
                      <span className="receipt-qty-badge">{item.quantity} × {item.unit_price}</span>
                      <span className="receipt-item-total">
                        {(item.quantity * item.unit_price).toLocaleString()} ج.م
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* الملخص المالي */}
              <div className="receipt-financial-summary">
                {sale.discount > 0 && (
                  <>
                    <div className="receipt-summary-line">
                      <span>المجموع الفرعي</span>
                      <span>{Number(sale.subtotal || (sale.total_amount + sale.discount)).toLocaleString()} ج.م</span>
                    </div>
                    <div className="receipt-summary-line discount">
                      <span>خصم خاص</span>
                      <span>- {Number(sale.discount).toLocaleString()} ج.م</span>
                    </div>
                  </>
                )}

                <div className="receipt-total-banner">
                  <span className="receipt-total-label">المبلغ المطلوب / المدفوع</span>
                  <span className="receipt-total-amount">{Number(sale.total_amount).toLocaleString()} ج.م</span>
                </div>
              </div>
            </div>

            {/* أزرار الإجراءات في الأسفل */}
            <div className="receipt-footer-actions">
              <button
                type="button"
                className="receipt-print-btn"
                onClick={handlePrint}
                disabled={printing}
              >
                <span>🖨️</span>
                <span>{printing ? 'جاري إرسال الأمر للطابعة...' : 'طباعة إيصال فوري'}</span>
              </button>
              <button type="button" className="receipt-dismiss-btn" onClick={onClose}>
                إغلاق
              </button>
            </div>
          </>
        ) : (
          <div style={{ padding: '40px', textAlign: 'center', color: '#ef4444' }}>
            تعذر تحميل بيانات الفاتورة
          </div>
        )}
      </div>
    </div>
  );
}
