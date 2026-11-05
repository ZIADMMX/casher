import CouponInput from './CouponInput.jsx';
import PaymentSection from './PaymentSection.jsx';
import { CartBagIcon } from './icons/SectorIcons.jsx';

const ALERT_ICONS = { error: '⚠️', warning: '⚠️', success: '✓' };

function CartPanel({
  cart = [],
  changeQuantity,
  removeFromCart,
  clearCart,
  onHoldOrder,
  heldOrdersCount = 0,
  onShowHeldOrders,
  discount,
  couponCode,
  setCouponCode,
  couponMessage,
  applyCoupon,
  subtotal,
  total,
  paymentMethod,
  setPaymentMethod,
  cashReceived,
  setCashReceived,
  changeDue,
  creditCustomerName,
  setCreditCustomerName,
  creditCustomerPhone,
  setCreditCustomerPhone,
  creditDueDate,
  setCreditDueDate,
  isCreditInvalid,
  isCashInvalid,
  handleCompleteSale,
  message,
  onNavigate,
  customers = [],
  selectedCustomerId = '',
  setSelectedCustomerId,
  activeSubscription = null,
  useSubscriptionCredit = false,
  setUseSubscriptionCredit,
  sectorConfig,
  onOpenScaleEdit,
  paymentSectionRef,
  isShiftOpen = true,
  shiftLoaded = true,
  shiftGate = null,
  customerTerm = 'العملاء',
}) {
  const totalItemsCount = cart.reduce((sum, item) => sum + (item.isScaleItem ? 1 : (item.quantity || 1)), 0);
  const orderTitle = sectorConfig?.orderTerm || 'سلة المبيعات';
  const unitTerm = sectorConfig?.unitTerm || 'قطع';
  const isEmpty = cart.length === 0;
  const saleLocked = !isShiftOpen;
  const canCompleteSale = !isEmpty && !saleLocked && !isCreditInvalid && !isCashInvalid;

  let completeLabel = 'إتمام عملية البيع وطباعة الفاتورة';
  let completeHint = null;
  if (saleLocked) {
    completeLabel = shiftLoaded ? 'افتح الوردية أولاً لإتمام البيع' : 'جارٍ التحقق من الوردية...';
  } else if (isEmpty) {
    completeHint = 'أضف أصنافاً للسلة';
  } else if (isCreditInvalid) {
    completeHint = 'أكمل اسم العميل وتاريخ الاستحقاق';
  } else if (isCashInvalid) {
    completeHint = 'المبلغ المستلم أقل من الإجمالي';
  }

  return (
    <div className={`pos-cart-panel${saleLocked ? ' is-locked' : ''}`}>
      {/* Cart Header */}
      <div className="pos-cart-header">
        <div className="pos-cart-title-wrap">
          <div className="pos-cart-icon" aria-hidden="true">
            <CartBagIcon size={20} />
          </div>
          <div>
            <h3 className="pos-cart-title">{orderTitle}</h3>
            <span className="pos-cart-subtitle">
              {totalItemsCount > 0 ? `${totalItemsCount} ${unitTerm} مختارة` : 'طلب جديد'}
            </span>
          </div>
        </div>

        <div className="pos-cart-header-actions">
          {heldOrdersCount > 0 && (
            <button
              type="button"
              className="pos-held-btn"
              onClick={onShowHeldOrders}
              title="الفواتير المعلقة (F3)"
            >
              ⏸️ معلق ({heldOrdersCount})
            </button>
          )}

          {!isEmpty && onHoldOrder && (
            <button
              type="button"
              className="pos-icon-action-btn"
              onClick={onHoldOrder}
              title="تعليق الفاتورة الحالية (F2)"
              aria-label="تعليق الفاتورة الحالية"
            >
              ⏸️
            </button>
          )}

          {!isEmpty && (
            <button
              type="button"
              className="pos-icon-action-btn clear-btn"
              onClick={clearCart}
              title="إفراغ السلة بالكامل"
              aria-label="إفراغ السلة بالكامل"
            >
              🗑️
            </button>
          )}
        </div>
      </div>

      {shiftGate}

      {/* Customer Quick Select & Subscription Status */}
      <div className="pos-customer-banner">
        <label className="pos-customer-select-row">
          <span className="customer-avatar-mini-icon" aria-hidden="true">👤</span>
          <span className="visually-hidden">اختيار العميل أو الباقة</span>
          <select
            className="pos-customer-select"
            value={selectedCustomerId || ''}
            onChange={(e) => setSelectedCustomerId && setSelectedCustomerId(e.target.value)}
          >
            <option value="">{`-- ${customerTerm}: عميل نقدي بدون تسجيل --`}</option>
            {customers?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} {c.phone ? `(${c.phone})` : ''} {c.tier ? `[${c.tier}]` : ''}
              </option>
            ))}
          </select>
        </label>

        {activeSubscription && (
          <div className="pos-subscription-card">
            <div>
              <strong>🎫 {activeSubscription.package_name}:</strong> {activeSubscription.remaining_credits} رصيد متبقي
              {activeSubscription.discount_percentage > 0 && ` | خصم ${activeSubscription.discount_percentage}%`}
            </div>
            {activeSubscription.remaining_credits > 0 && setUseSubscriptionCredit && (
              <label className="pos-subscription-toggle">
                <input
                  type="checkbox"
                  checked={useSubscriptionCredit}
                  onChange={(e) => setUseSubscriptionCredit(e.target.checked)}
                />
                خصم رصيد
              </label>
            )}
          </div>
        )}

        {!activeSubscription && selectedCustomerId && (
          <div className="pos-subscription-empty">لا يوجد اشتراك نشط لهذا العميل</div>
        )}
      </div>

      {/* Alert Messages */}
      {message && (
        <div
          className={`pos-cart-alert alert-${message.type === 'error' ? 'error' : message.type === 'warning' ? 'warning' : 'success'}`}
          role={message.type === 'error' ? 'alert' : 'status'}
        >
          <span aria-hidden="true">{ALERT_ICONS[message.type] || '✓'}</span>
          <span>{message.text}</span>
        </div>
      )}

      {/* Cart Items List */}
      <div className="pos-cart-items-scroll">
        {isEmpty ? (
          <div className="pos-cart-empty-state">
            <div className="empty-cart-illustration" aria-hidden="true">🛍️</div>
            <h4>السلة فارغة</h4>
            <p>اختر من القائمة أو امسح الباركود لإضافة {sectorConfig?.itemTerm || 'الأصناف'} إلى {orderTitle}</p>
          </div>
        ) : (
          <ul className="pos-cart-items-list">
            {cart.map((item) => (
              <li key={`${item.variantId}_${item.unitId || 'base'}`} className="pos-cart-item-card">
                <div className="pos-cart-item-header">
                  <div className="pos-cart-item-name">
                    {item.isScaleItem && (
                      <button
                        type="button"
                        className="pos-scale-tag"
                        onClick={() => onOpenScaleEdit?.(item)}
                        title="تعديل الوزن يدوياً"
                      >
                        ⚖️ ميزان
                      </button>
                    )}
                    <span className="pos-item-title">{item.productName}</span>
                  </div>
                  <button
                    type="button"
                    className="pos-item-remove-btn"
                    onClick={() => removeFromCart(item.variantId, item.unitId)}
                    title="حذف الصنف"
                    aria-label={`حذف ${item.productName}`}
                  >
                    ×
                  </button>
                </div>

                <div className="pos-item-meta-row">
                  {(item.size || item.color || (item.unitName && !item.isScaleItem)) && (
                    <span className="pos-item-variant-badge">
                      {item.size ? `مقاس ${item.size}` : ''}
                      {item.size && item.color ? ' · ' : ''}
                      {item.color || ''}
                      {item.unitName && !item.isScaleItem ? `${item.size || item.color ? ' · ' : ''}${item.unitName}` : ''}
                    </span>
                  )}
                  <span className="pos-item-unit-price">
                    {item.unitPrice.toFixed(2)} ج.م / {item.unitName || 'قطعة'}
                  </span>
                </div>

                <div className="pos-cart-item-footer">
                  <div className="pos-item-stepper">
                    <button
                      type="button"
                      className="stepper-btn"
                      onClick={() => changeQuantity(item.variantId, -1, item.unitId)}
                      title="تقليل"
                      aria-label="تقليل الكمية"
                    >
                      −
                    </button>
                    {item.isScaleItem ? (
                      <button
                        type="button"
                        className="stepper-qty is-scale"
                        onClick={() => onOpenScaleEdit?.(item)}
                        title="اضغط لتعديل الوزن يدوياً"
                      >
                        {`${item.quantity} كجم`}
                      </button>
                    ) : (
                      <span className="stepper-qty" title={`الكمية: ${item.quantity}`}>
                        {item.quantity}
                      </span>
                    )}
                    <button
                      type="button"
                      className="stepper-btn"
                      disabled={item.maxStock && item.quantity >= item.maxStock}
                      onClick={() => changeQuantity(item.variantId, 1, item.unitId)}
                      title="زيادة"
                      aria-label="زيادة الكمية"
                    >
                      +
                    </button>
                  </div>

                  <span className="pos-item-total-price">
                    {(item.unitPrice * item.quantity).toFixed(2)} <small>ج.م</small>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Footer & Checkout Form (always visible) */}
      <div className="pos-cart-checkout-section">
        {!isEmpty && (
          <CouponInput
            value={couponCode}
            onChange={setCouponCode}
            onApply={applyCoupon}
            message={couponMessage}
          />
        )}

        {/* Invoice Summary */}
        <div className="pos-summary-card">
          <div className="summary-line">
            <span className="summary-label">المجموع الفرعي ({cart.length} أصناف)</span>
            <span className="summary-val">{subtotal.toFixed(2)} ج.م</span>
          </div>

          {Number(discount || 0) > 0 && (
            <div className="summary-line discount-line">
              <span className="summary-label">الخصم المطبق</span>
              <span className="summary-val">- {Number(discount).toFixed(2)} ج.م</span>
            </div>
          )}

          <div className="summary-grand-total">
            <span className="total-title">
              الإجمالي المستحق
              <small className="tax-hint-line">شامل ضريبة القيمة المضافة (14%)</small>
            </span>
            <span className="total-amount">
              {total.toFixed(2)} <span className="currency-unit">ج.م</span>
            </span>
          </div>
        </div>

        {/* Payment Methods & Inputs */}
        <PaymentSection
          total={total}
          paymentMethod={paymentMethod}
          setPaymentMethod={setPaymentMethod}
          cashReceived={cashReceived}
          setCashReceived={setCashReceived}
          changeDue={changeDue}
          creditCustomerName={creditCustomerName}
          setCreditCustomerName={setCreditCustomerName}
          creditCustomerPhone={creditCustomerPhone}
          setCreditCustomerPhone={setCreditCustomerPhone}
          creditDueDate={creditDueDate}
          setCreditDueDate={setCreditDueDate}
          onNavigate={onNavigate}
          sectionRef={paymentSectionRef}
        />

        {/* Big Complete Sale Button */}
        <button
          type="button"
          className={`pos-complete-sale-btn${saleLocked ? ' is-locked' : ''}`}
          disabled={!canCompleteSale}
          onClick={handleCompleteSale}
        >
          <span className="complete-btn-icon" aria-hidden="true">{saleLocked ? '🔒' : '🖨️'}</span>
          <span className="complete-btn-text">
            {completeLabel}
            {completeHint && <small className="complete-btn-hint">{completeHint}</small>}
          </span>
          {canCompleteSale && <span className="complete-btn-shortcut">↵ Enter</span>}
        </button>
      </div>
    </div>
  );
}

export default CartPanel;
