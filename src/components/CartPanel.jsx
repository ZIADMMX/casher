import CouponInput from './CouponInput.jsx';
import PaymentSection from './PaymentSection.jsx';
import { getCategoryIcon } from './ProductGrid.jsx';
import { lineKey } from '../utils/cartModifiers.js';
import {
  AlertIcon,
  BagIcon,
  CheckIcon,
  ChevronDownIcon,
  CloseIcon,
  LockIcon,
  MinusIcon,
  PauseIcon,
  PlusIcon,
  PrinterIcon,
  ProductLineIcon,
  ScaleIcon,
  TagIcon,
  TrashIcon,
  UserIcon,
} from './icons/PosIcons.jsx';

const VAT_RATE = 0.14;

function money(value) {
  return Number(value || 0).toFixed(2);
}

function CartPanel({
  canDiscount = true,
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
  onEditModifiers = null,
  paymentSectionRef,
  isShiftOpen = true,
  shiftLoaded = true,
  shiftGate = null,
  orderModeLabel = '',
  discountOpen = false,
  setDiscountOpen,
}) {
  const orderTitle = sectorConfig?.orderTerm || 'الطلب الحالي';
  const unitTerm = sectorConfig?.unitTerm || 'قطعة';
  const sectorKey = sectorConfig?.key || 'retail';
  const isEmpty = cart.length === 0;
  const saleLocked = !isShiftOpen;
  const canCompleteSale = !isEmpty && !saleLocked && !isCreditInvalid && !isCashInvalid;
  const hasDiscount = Number(discount || 0) > 0;
  const vatIncluded = Math.round((total - total / (1 + VAT_RATE)) * 100) / 100;
  const subtitle = [orderModeLabel, isEmpty ? 'طلب جديد' : `${cart.length} أصناف`].filter(Boolean).join(' · ');

  let completeText = `إتمام البيع · ${money(total)} ج.م`;
  let completeLabel = `إتمام عملية البيع وطباعة الفاتورة — ${money(total)} ج.م`;
  let completeHint = null;
  if (saleLocked) {
    completeText = shiftLoaded ? 'افتح الوردية أولاً لإتمام البيع' : 'جارٍ التحقق من الوردية...';
    completeLabel = completeText;
  } else if (isEmpty) {
    completeHint = 'أضف أصنافاً للسلة';
  } else if (isCreditInvalid) {
    completeHint = 'أكمل اسم العميل وتاريخ الاستحقاق';
  } else if (isCashInvalid) {
    completeHint = 'المبلغ المستلم أقل من الإجمالي';
  }

  return (
    <div className={`pos-cart-panel${saleLocked ? ' is-locked' : ''}`}>
      {/* Header */}
      <div className="pos-cart-header">
        <div className="pos-cart-title-wrap">
          <h3 className="pos-cart-title">{orderTitle}</h3>
          <span className="pos-cart-subtitle">{subtitle}</span>
        </div>

        <div className="pos-cart-header-actions">
          {heldOrdersCount > 0 && (
            <button type="button" className="pos-held-btn" onClick={onShowHeldOrders} title="الفواتير المعلقة (F3)">
              <PauseIcon size={16} />
              <span>معلق ({heldOrdersCount})</span>
            </button>
          )}
          <button
            type="button"
            className="pos-icon-action-btn"
            onClick={onHoldOrder}
            disabled={isEmpty || !onHoldOrder}
            title="تعليق الفاتورة الحالية (F2)"
            aria-label="تعليق الفاتورة الحالية"
          >
            <PauseIcon size={18} />
          </button>
          <button
            type="button"
            className="pos-icon-action-btn clear-btn"
            onClick={clearCart}
            disabled={isEmpty}
            title="إفراغ السلة بالكامل"
            aria-label="إفراغ السلة بالكامل"
          >
            <TrashIcon size={18} />
          </button>
        </div>
      </div>

      {shiftGate}

      {/* Customer */}
      <div className="pos-customer-banner">
        <label className="pos-customer-select-row">
          <UserIcon size={18} className="pos-customer-icon" />
          <span className="visually-hidden">اختيار العميل أو الباقة</span>
          <select
            className="pos-customer-select"
            value={selectedCustomerId || ''}
            onChange={(e) => setSelectedCustomerId && setSelectedCustomerId(e.target.value)}
          >
            <option value="">عميل نقدي (بدون تسجيل)</option>
            {customers?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} {c.phone ? `(${c.phone})` : ''} {c.tier ? `[${c.tier}]` : ''}
              </option>
            ))}
          </select>
          <ChevronDownIcon size={18} className="pos-customer-chevron" />
        </label>

        {activeSubscription && (
          <div className="pos-subscription-card">
            <div>
              <strong>{activeSubscription.package_name}:</strong> {activeSubscription.remaining_credits} رصيد متبقي
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

      {/* Messages */}
      {message && (
        <div
          className={`pos-cart-alert alert-${message.type === 'error' ? 'error' : message.type === 'warning' ? 'warning' : 'success'}`}
          role={message.type === 'error' ? 'alert' : 'status'}
        >
          {message.type === 'error' || message.type === 'warning'
            ? <AlertIcon size={18} />
            : <CheckIcon size={18} />}
          <span>{message.text}</span>
        </div>
      )}

      {/* Items */}
      <div className="pos-cart-items-scroll">
        {isEmpty ? (
          <div className="pos-cart-empty-state">
            <span className="empty-cart-illustration"><BagIcon size={32} /></span>
            <h4>السلة فارغة</h4>
            <p>اختر من القائمة أو امسح الباركود لإضافة {sectorConfig?.itemTerm || 'الأصناف'}</p>
          </div>
        ) : (
          <ul className="pos-cart-items-list">
            {cart.map((item) => {
              const atMinimum = !item.isScaleItem && item.quantity <= 1;
              const variantText = [item.size, item.color].filter(Boolean).join(' · ');
              return (
                <li key={lineKey(item)} className="pos-cart-item-card">
                  <span className="pos-cart-item-icon" aria-hidden="true">
                    <ProductLineIcon emoji={getCategoryIcon('', item.productName, sectorKey)} size={20} />
                  </span>

                  <div className="pos-cart-item-info">
                    <span className="pos-item-title" title={item.productName}>{item.productName}</span>
                    <span className="pos-item-unit-price">
                      {`${money(item.unitPrice)} ج.م / ${item.unitName || unitTerm}`}
                      {variantText ? ` · ${variantText}` : ''}
                    </span>
                    {item.modifiers?.length > 0 && (
                      <span className="pos-item-unit-price">+ {item.modifiers.map((m) => m.name).join('، ')}</span>
                    )}
                    {onEditModifiers && !item.isScaleItem && (
                      <button
                        type="button"
                        className="pos-scale-tag"
                        onClick={() => onEditModifiers(item)}
                        aria-label={`إضافات ${item.productName}`}
                      >
                        <PlusIcon size={14} />
                        إضافات
                      </button>
                    )}
                    {item.isScaleItem && (
                      <button
                        type="button"
                        className="pos-scale-tag"
                        onClick={() => onOpenScaleEdit?.(item)}
                        title="تعديل الوزن يدوياً"
                      >
                        <ScaleIcon size={14} />
                        {`${item.quantity} كجم`}
                      </button>
                    )}
                  </div>

                  <div className="pos-item-stepper">
                    <button
                      type="button"
                      className="stepper-btn"
                      onClick={() => changeQuantity(item, 1)}
                      disabled={Boolean(item.maxStock && item.quantity >= item.maxStock)}
                      title="زيادة"
                      aria-label={`زيادة كمية ${item.productName}`}
                    >
                      <PlusIcon size={16} strokeWidth={2.2} />
                    </button>
                    <span className="stepper-qty" aria-label={`الكمية ${item.quantity}`}>
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      className={`stepper-btn${atMinimum ? ' is-remove' : ''}`}
                      onClick={() => (atMinimum
                        ? removeFromCart(item)
                        : changeQuantity(item, -1))}
                      title={atMinimum ? 'حذف الصنف' : 'تقليل'}
                      aria-label={atMinimum ? `حذف ${item.productName}` : `تقليل كمية ${item.productName}`}
                    >
                      {atMinimum ? <TrashIcon size={15} /> : <MinusIcon size={16} strokeWidth={2.2} />}
                    </button>
                  </div>

                  <span className="pos-item-total-price">{money(item.unitPrice * item.quantity)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Checkout (sticky) */}
      <div className="pos-cart-checkout-section">
        <div className="pos-summary-card">
          <div className="summary-line">
            <span className="summary-label">المجموع الفرعي</span>
            <span className="summary-val">{money(subtotal)} ج.م</span>
          </div>

          <div className="summary-line discount-line">
            {/* Manual discounts need pos.discount; the server refuses them otherwise. */}
            {canDiscount ? (
              <button
                type="button"
                className="pos-discount-link"
                onClick={() => setDiscountOpen?.(!discountOpen)}
                aria-expanded={discountOpen}
                disabled={isEmpty}
                title="إضافة خصم (F4)"
              >
                {discountOpen ? <CloseIcon size={14} /> : <TagIcon size={14} />}
                {hasDiscount ? 'تعديل الخصم' : '+ إضافة خصم'}
              </button>
            ) : (
              <span className="summary-label">الخصم</span>
            )}
            <span className="summary-val">{hasDiscount ? `- ${money(discount)}` : money(0)} ج.م</span>
          </div>

          {canDiscount && discountOpen && !isEmpty && (
            <CouponInput
              value={couponCode}
              onChange={setCouponCode}
              onApply={applyCoupon}
              message={couponMessage}
            />
          )}
          {!discountOpen && couponMessage && hasDiscount && (
            <p className="pos-coupon-message success">{couponMessage}</p>
          )}

          <div className="summary-line tax-hint-line">
            <span>شامل ضريبة القيمة المضافة 14%</span>
            <span className="summary-val">{money(vatIncluded)} ج.م</span>
          </div>

          <div className="summary-grand-total">
            <span className="total-title">الإجمالي</span>
            <span className="total-amount">
              {money(total)} <span className="currency-unit">ج.م</span>
            </span>
          </div>
        </div>

        {!saleLocked && (
        <PaymentSection
          total={total}
          paymentMethod={paymentMethod}
          setPaymentMethod={setPaymentMethod}
          cashReceived={cashReceived}
          setCashReceived={setCashReceived}
          changeDue={changeDue}
          isCashInvalid={isCashInvalid}
          creditCustomerName={creditCustomerName}
          setCreditCustomerName={setCreditCustomerName}
          creditCustomerPhone={creditCustomerPhone}
          setCreditCustomerPhone={setCreditCustomerPhone}
          creditDueDate={creditDueDate}
          setCreditDueDate={setCreditDueDate}
          onNavigate={onNavigate}
          sectionRef={paymentSectionRef}
        />
        )}

        <button
          type="button"
          className={`pos-complete-sale-btn${saleLocked ? ' is-locked' : ''}`}
          disabled={!canCompleteSale}
          onClick={handleCompleteSale}
          aria-label={completeLabel}
        >
          <span className="complete-btn-icon" aria-hidden="true">
            {saleLocked ? <LockIcon size={20} /> : <PrinterIcon size={20} />}
          </span>
          <span className="complete-btn-text">
            {completeText}
            {completeHint && <small className="complete-btn-hint">{completeHint}</small>}
          </span>
          {canCompleteSale && <kbd className="complete-btn-shortcut">Enter</kbd>}
        </button>
      </div>
    </div>
  );
}

export default CartPanel;
