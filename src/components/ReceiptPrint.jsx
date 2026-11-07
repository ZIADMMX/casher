import { useState } from 'react';
import { useSettings } from '../contexts/SettingsContext.jsx';

function ReceiptPrint({ sale }) {
  const { settings } = useSettings();
  const [renderedAt] = useState(() => Date.now());
  if (!sale) return null;

  // تنسيق التاريخ والوقت بشكل مدمج
  const dateObj = new Date(sale.created_at || renderedAt);
  const formattedDate = dateObj.toLocaleDateString('ar-EG', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const formattedTime = dateObj.toLocaleTimeString('ar-EG', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  const paymentMethodLabel =
    sale.payment_method === 'cash'
      ? 'نقدي (كاش)'
      : sale.payment_method === 'card'
      ? 'بطاقة / فيزا'
      : 'آجل';

  const storeName = settings?.store_name || 'بوتيك الفخامة';
  const paperSize = settings?.receipt_paper_size || '80mm';
  const showLogo = settings?.show_logo_on_receipt === '1' && settings?.store_logo;
  const showCashier = settings?.show_cashier_name === '1';
  const showBarcode = settings?.show_barcode_on_receipt === '1';

  return (
    <div className={`receipt-print paper-${paperSize}`}>
      {/* Header */}
      <div className="receipt-header">
        {showLogo && (
          <div className="receipt-logo-wrap" style={{ textAlign: 'center', marginBottom: '6px' }}>
            <img
              src={settings.store_logo}
              alt="Logo"
              style={{ maxHeight: '48px', maxWidth: '130px', objectFit: 'contain' }}
            />
          </div>
        )}
        <h2 className="receipt-store-title">{storeName}</h2>
        {settings?.store_tagline && (
          <div style={{ fontSize: '11px', color: '#475569', marginBottom: '2px' }}>
            {settings.store_tagline}
          </div>
        )}
        {settings?.store_phone && (
          <div style={{ fontSize: '11px', color: '#334155' }}>
            📞 {settings.store_phone}
          </div>
        )}
        {settings?.store_address && (
          <div style={{ fontSize: '10.5px', color: '#475569', marginTop: '1px' }}>
            📍 {settings.store_address}
          </div>
        )}

        <div className="receipt-meta-line" style={{ marginTop: '6px' }}>
          <span>فاتورة #{sale.id}</span>
          <span>{formattedDate} {formattedTime}</span>
        </div>
        {sale.delivery_address && (
          <div className="receipt-meta-line">
            <span>توصيل {sale.customer_phone}</span>
            <span>{sale.delivery_address}</span>
          </div>
        )}
        {sale.tableName && (
          <div className="receipt-meta-line">
            <span>الطاولة</span>
            <span>{sale.tableName}</span>
          </div>
        )}
        {showCashier && sale.cashier_name && (
          <div className="receipt-meta-line">
            <span>الكاشير</span>
            <span>{sale.cashier_name}</span>
          </div>
        )}
      </div>

      <div className="receipt-divider"></div>

      {/* Items Table */}
      <table className="receipt-items-table">
        <thead>
          <tr>
            <th className="th-item">الصنف</th>
            <th className="th-qty">الكمية</th>
            <th className="th-price">السعر</th>
            <th className="th-total">الإجمالي</th>
          </tr>
        </thead>
        <tbody>
          {sale.items?.map((item, idx) => {
            const name = item.productName || item.product_name || 'منتج';
            const size = item.size ? ` (${item.size})` : '';
            const color = item.color ? ` - ${item.color}` : '';
            const lineTotal = item.unit_price * item.quantity;

            return (
              <tr key={idx}>
                <td className="td-item">
                  <div className="item-name-text">{name}</div>
                  {(size || color) && (
                    <div className="item-variant-text">{size}{color}</div>
                  )}
                  {item.modifiers?.length > 0 && (
                    <div className="item-variant-text">+ {item.modifiers.map((m) => m.name).join('، ')}</div>
                  )}
                </td>
                <td className="td-qty">{item.unitName || item.unit_name ? `${item.quantity} ${item.unitName || item.unit_name}` : item.quantity}</td>
                <td className="td-price">{Number(item.unit_price).toFixed(2)}</td>
                <td className="td-total">{lineTotal.toFixed(2)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="receipt-divider"></div>

      {/* Totals & Payments */}
      <div className="receipt-totals-box">
        {Number(sale.discount || 0) > 0 && (
          <div className="receipt-row">
            <span>الخصم المطبق</span>
            <span>- {Number(sale.discount).toFixed(2)} ج.م</span>
          </div>
        )}

        {Number(sale.service_charge || 0) > 0 && (
          <div className="receipt-row">
            <span>{sale.order_mode === 'delivery' ? 'رسوم التوصيل' : 'الخدمة'}</span>
            <span>{Number(sale.service_charge).toFixed(2)} ج.م</span>
          </div>
        )}

        <div className="receipt-row receipt-grand-total">
          <span>الإجمالي المستحق</span>
          <span>{Number(sale.total_amount).toFixed(2)} ج.م</span>
        </div>

        <div className="receipt-divider-dotted"></div>

        <div className="receipt-row">
          <span>طريقة الدفع</span>
          <span>{paymentMethodLabel}</span>
        </div>

        {sale.payment_method === 'cash' && Number(sale.cashReceived) > 0 && (
          <>
            <div className="receipt-row">
              <span>المبلغ المدفوع</span>
              <span>{Number(sale.cashReceived).toFixed(2)} ج.م</span>
            </div>
            {sale.changeDue != null && Number(sale.changeDue) > 0 && (
              <div className="receipt-row receipt-change-row">
                <span>المتبقي (الفكة)</span>
                <span>{Number(sale.changeDue).toFixed(2)} ج.م</span>
              </div>
            )}
          </>
        )}

        {sale.payment_method === 'credit' && (
          <>
            {sale.customer_name && (
              <div className="receipt-row">
                <span>اسم العميل</span>
                <span>{sale.customer_name}</span>
              </div>
            )}
            {sale.due_date && (
              <div className="receipt-row">
                <span>تاريخ الاستحقاق</span>
                <span>{sale.due_date}</span>
              </div>
            )}
          </>
        )}
      </div>

      <div className="receipt-divider"></div>

      {/* Footer */}
      <div className="receipt-footer">
        <p className="receipt-policy" style={{ whiteSpace: 'pre-wrap' }}>
          {settings?.receipt_footer || 'الاستبدال والاسترجاع خلال 14 يوماً مع الفاتورة. شكراً لزيارتكم!'}
        </p>

        {showBarcode && (
          <div style={{
            marginTop: '8px',
            textAlign: 'center',
            fontSize: '11px',
            letterSpacing: '2px',
            fontWeight: 'bold',
            fontFamily: 'monospace'
          }}>
            *SALE-{sale.id}*
          </div>
        )}
      </div>
    </div>
  );
}

export default ReceiptPrint;
