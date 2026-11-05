import { CardIcon, CashIcon, ClockIcon } from './icons/PosIcons.jsx';

const PAYMENT_METHODS = [
  { key: 'cash', label: 'كاش', Icon: CashIcon, title: 'نقدي (F9)' },
  { key: 'card', label: 'فيزا / بطاقة', Icon: CardIcon, title: 'دفع بالبطاقة' },
  { key: 'credit', label: 'آجل', Icon: ClockIcon, title: 'بيع آجل (F10)' },
];

const QUICK_CASH_AMOUNTS = [100, 200, 500];

function PaymentSection({
  total = 0,
  paymentMethod,
  setPaymentMethod,
  cashReceived,
  setCashReceived,
  changeDue,
  isCashInvalid = false,
  creditCustomerName,
  setCreditCustomerName,
  creditCustomerPhone,
  setCreditCustomerPhone,
  creditDueDate,
  setCreditDueDate,
  onNavigate,
  sectionRef,
}) {
  const exactSelected = cashReceived !== '' && Number(cashReceived) === Number(total);

  return (
    <div className="pos-payment-section" ref={sectionRef} tabIndex={-1}>
      <div className="payment-method-tabs" role="group" aria-label="طريقة الدفع">
        {PAYMENT_METHODS.map(({ key, label, Icon, title }) => (
          <button
            key={key}
            type="button"
            className={`pay-tab-btn ${paymentMethod === key ? 'active' : ''}`}
            aria-pressed={paymentMethod === key}
            title={title}
            onClick={() => {
              setPaymentMethod(key);
              if (key !== 'cash') setCashReceived('');
            }}
          >
            <Icon size={20} />
            <span className="pay-tab-text">{label}</span>
          </button>
        ))}
      </div>

      {paymentMethod === 'cash' && (
        <div className="cash-payment-details">
          <div className="quick-cash-presets">
            <button
              type="button"
              className={`quick-cash-chip${exactSelected ? ' is-selected' : ''}`}
              onClick={() => setCashReceived(total.toString())}
              disabled={total <= 0}
            >
              بالضبط
            </button>
            {QUICK_CASH_AMOUNTS.map((amount) => (
              <button
                key={amount}
                type="button"
                className={`quick-cash-chip${!exactSelected && Number(cashReceived) === amount ? ' is-selected' : ''}`}
                onClick={() => setCashReceived(amount.toString())}
                disabled={total <= 0 || amount < total}
              >
                {amount}
              </button>
            ))}
          </div>

          <div className={`cash-change-badge${isCashInvalid ? ' is-invalid' : ''}`}>
            <label className="cash-input-row" htmlFor="pos-cash-received">
              <span className="cash-label">المستلم</span>
              <input
                id="pos-cash-received"
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                className="cash-input"
                value={cashReceived}
                onChange={(e) => setCashReceived(e.target.value)}
                placeholder="0.00"
              />
            </label>
            <div className="change-info">
              <span className="change-label">{isCashInvalid ? 'المبلغ أقل من الإجمالي' : 'الباقي للعميل'}</span>
              <span className="change-value">{`${(changeDue ?? 0).toFixed(2)} ج.م`}</span>
            </div>
          </div>
        </div>
      )}

      {paymentMethod === 'card' && (
        <div className="card-payment-info">
          <CardIcon size={18} />
          <p>الدفع عبر ماكينة الـ POS — لا يتطلب حساب مبالغ نقدية</p>
        </div>
      )}

      {paymentMethod === 'credit' && (
        <div className="credit-form-card">
          <div className="credit-field">
            <label htmlFor="pos-credit-name">اسم العميل <span>*</span></label>
            <input
              id="pos-credit-name"
              type="text"
              className="credit-input"
              placeholder="الاسم الثلاثي أو اسم الشركة..."
              value={creditCustomerName}
              onChange={(e) => setCreditCustomerName(e.target.value)}
            />
          </div>

          <div className="credit-field">
            <label htmlFor="pos-credit-phone">رقم هاتف العميل</label>
            <input
              id="pos-credit-phone"
              type="text"
              className="credit-input"
              placeholder="01XXXXXXXXX"
              value={creditCustomerPhone}
              onChange={(e) => setCreditCustomerPhone(e.target.value)}
            />
          </div>

          <div className="credit-field">
            <label htmlFor="pos-credit-due">تاريخ استحقاق السداد <span>*</span></label>
            <input
              id="pos-credit-due"
              type="date"
              className="credit-input"
              value={creditDueDate}
              onChange={(e) => setCreditDueDate(e.target.value)}
            />
          </div>

          <button
            type="button"
            className="pos-credit-add-customer-btn"
            onClick={() => {
              const payload = {
                name: creditCustomerName?.trim() || '',
                phone: creditCustomerPhone?.trim() || '',
                email: '',
              };

              try {
                localStorage.setItem('kashiear_pending_customer', JSON.stringify(payload));
              } catch (e) {
                console.error('Failed to store pending customer:', e);
              }

              onNavigate?.('customers');
            }}
          >
            + إضافة عميل يدويًا
          </button>
        </div>
      )}
    </div>
  );
}

export default PaymentSection;
