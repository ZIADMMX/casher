import CouponInput from './CouponInput.jsx';
import PaymentSection from './PaymentSection.jsx';
import { CartBagIcon } from './icons/SectorIcons.jsx';

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
}) {
  const totalItemsCount = cart.reduce((sum, item) => sum + (item.isScaleItem ? 1 : (item.quantity || 1)), 0);
  const orderTitle = sectorConfig?.orderTerm || 'سلة المبيعات';
  const unitTerm = sectorConfig?.unitTerm || 'قطع';

  return (
    <div className="pos-cart-panel">
      {/* Cart Header */}
      <div className="pos-cart-header">
        <div className="pos-cart-title-wrap">
          <div className="pos-cart-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
              title="الفواتير المعلقة"
            >
              ⏸️ معلق ({heldOrdersCount})
            </button>
          )}

          {cart.length > 0 && onHoldOrder && (
            <button
              type="button"
              className="pos-icon-action-btn"
              onClick={onHoldOrder}
              title="تعليق الفاتورة الحالية"
            >
              ⏸️
            </button>
          )}

          {cart.length > 0 && (
            <button
              type="button"
              className="pos-icon-action-btn clear-btn"
              onClick={clearCart}
              title="إفراغ السلة بالكامل"
            >
              🗑️
            </button>
          )}
        </div>
      </div>

      {/* Customer Quick Select & Subscription Status */}
      <div className="pos-customer-banner" style={{ flexDirection: 'column', gap: '8px', alignItems: 'stretch' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="customer-avatar-mini-icon">👤</span>
          <select 
            value={selectedCustomerId || ''} 
            onChange={(e) => setSelectedCustomerId && setSelectedCustomerId(e.target.value)}
            style={{ flex: 1, padding: '4px 8px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '0.85rem' }}
          >
            <option value="">-- العميل المسجل / الباقة --</option>
            {customers?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} {c.phone ? `(${c.phone})` : ''} {c.tier ? `[${c.tier}]` : ''}
              </option>
            ))}
          </select>
        </div>

        {activeSubscription && (
          <div style={{ backgroundColor: '#ecfdf5', border: '1px solid #6ee7b7', padding: '6px 10px', borderRadius: '6px', fontSize: '0.85rem', color: '#065f46', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <strong>🎫 {activeSubscription.package_name}:</strong> {activeSubscription.remaining_credits} رصيد متبقي
              {activeSubscription.discount_percentage > 0 && ` | خصم ${activeSubscription.discount_percentage}%`}
            </div>
            {activeSubscription.remaining_credits > 0 && setUseSubscriptionCredit && (
              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}>
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
          <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
            لا يوجد اشتراك نشط لهذا العميل
          </div>
        )}
      </div>

      {/* Alert Messages */}
      {message && (
        <div className={`pos-cart-alert ${message.type === 'error' ? 'alert-error' : 'alert-success'}`}>
          <span>{message.type === 'error' ? '⚠️' : '🎉'}</span>
          <span>{message.text}</span>
        </div>
      )}

      {/* Cart Items List */}
      <div className="pos-cart-items-scroll">
        {cart.length === 0 ? (
          <div className="pos-cart-empty-state">
            <div className="empty-cart-illustration">🛍️</div>
            <h4>السلة فارغة</h4>
            <p>اختر من قائمة المنتجات أو امسح الباركود لإضافة الأصناف إلى الفاتورة</p>
          </div>
        ) : (
          <div className="pos-cart-items-list">
            {cart.map((item) => (
              <div key={`${item.variantId}_${item.unitId || 'base'}`} className="pos-cart-item-card">
                <div className="pos-cart-item-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, overflow: 'hidden' }}>
                    {item.isScaleItem && (
                      <span
                        style={{
                          background: '#DCFCE7',
                          color: '#15803D',
                          fontSize: '11px',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                        onClick={() => onOpenScaleEdit?.(item)}
                        title="تعديل الوزن يدوياً"
                      >
                        ⚖️ ميزان
                      </span>
                    )}
                    <span className="pos-item-title" style={{ whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                      {item.productName}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="pos-item-remove-btn"
                    onClick={() => removeFromCart(item.variantId, item.unitId)}
                    title="حذف الصنف"
                  >
                    ×
                  </button>
                </div>

                <div className="pos-item-meta-row">
                  <span className="pos-item-variant-badge">
                    {item.size ? `مقاس ${item.size}` : ''}
                    {item.size && item.color ? ' · ' : ''}
                    {item.color || ''}
                    {item.unitName && !item.isScaleItem ? ` · ${item.unitName}` : ''}
                  </span>
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
                    >
                      -
                    </button>
                    <span
                      className="stepper-qty"
                      style={{
                        cursor: item.isScaleItem ? 'pointer' : 'default',
                        minWidth: '54px',
                        fontSize: item.isScaleItem ? '12px' : '14px',
                        fontWeight: 700,
                        color: item.isScaleItem ? '#047857' : 'inherit',
                      }}
                      onClick={() => item.isScaleItem && onOpenScaleEdit?.(item)}
                      title={item.isScaleItem ? 'اضغط لتعديل الوزن يدوياً' : `الكمية: ${item.quantity}`}
                    >
                      {item.isScaleItem ? `${item.quantity} كجم` : item.quantity}
                    </span>
                    <button
                      type="button"
                      className="stepper-btn"
                      disabled={item.maxStock && item.quantity >= item.maxStock}
                      onClick={() => changeQuantity(item.variantId, 1, item.unitId)}
                      title="زيادة"
                    >
                      +
                    </button>
                  </div>

                  <span className="pos-item-total-price">
                    {(item.unitPrice * item.quantity).toFixed(2)} <small>ج.م</small>
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer & Checkout Form */}
      <div className="pos-cart-checkout-section">
        {cart.length > 0 && (
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

          <div className="summary-line tax-hint-line">
            <span>الأسعار شاملة ضريبة القيمة المضافة (14%)</span>
          </div>

          <div className="summary-grand-total">
            <span className="total-title">الإجمالي المستحق</span>
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
        />

        {/* Big Complete Sale Button */}
        <button
          type="button"
          className="pos-complete-sale-btn"
          disabled={cart.length === 0 || isCreditInvalid || isCashInvalid}
          onClick={handleCompleteSale}
        >
          <span className="complete-btn-icon">🖨️</span>
          <span className="complete-btn-text">إتمام عملية البيع وطباعة الفاتورة</span>
          <span className="complete-btn-shortcut">↵ Enter</span>
        </button>
      </div>
    </div>
  );
}

export default CartPanel;

