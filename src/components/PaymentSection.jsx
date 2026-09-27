function PaymentSection({
  total = 0,
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
  onNavigate,
}) {
  // حساب الفئات السريعة بناءً على الإجمالي
  const quickCashOptions = [
    { label: 'المبلغ بالضبط', value: total },
    { label: '50 ج.م', value: 50 },
    { label: '100 ج.م', value: 100 },
    { label: '200 ج.م', value: 200 },
    { label: '500 ج.م', value: 500 },
  ].filter((opt) => opt.value >= total || opt.label === 'المبلغ بالضبط');

  return (
    <div className="pos-payment-section">
      <div className="payment-method-tabs">
        <button
          type="button"
          className={`pay-tab-btn ${paymentMethod === 'cash' ? 'active' : ''}`}
          onClick={() => {
            setPaymentMethod('cash');
          }}
        >
          <span className="pay-tab-icon">💵</span>
          <span className="pay-tab-text">نقدي (كاش)</span>
        </button>

        <button
          type="button"
          className={`pay-tab-btn ${paymentMethod === 'card' ? 'active' : ''}`}
          onClick={() => {
            setPaymentMethod('card');
            setCashReceived('');
          }}
        >
          <span className="pay-tab-icon">💳</span>
          <span className="pay-tab-text">فيزا / بطاقة</span>
        </button>

        <button
          type="button"
          className={`pay-tab-btn ${paymentMethod === 'credit' ? 'active' : ''}`}
          onClick={() => {
            setPaymentMethod('credit');
            setCashReceived('');
          }}
        >
          <span className="pay-tab-icon">⏳</span>
          <span className="pay-tab-text">استلام آجل</span>
        </button>
      </div>

      {paymentMethod === 'cash' && (
        <div className="cash-payment-details">
          {total > 0 && (
            <div className="quick-cash-presets">
              {quickCashOptions.map((opt, idx) => (
                <button
                  key={idx}
                  type="button"
                  className="quick-cash-chip"
                  onClick={() => setCashReceived(opt.value.toString())}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}

          <div className="cash-input-row">
            <label className="cash-label">المبلغ المستلم من الزبون:</label>
            <div className="cash-input-wrap">
              <input
                type="number"
                min="0"
                step="any"
                className="cash-input"
                value={cashReceived}
                onChange={(e) => setCashReceived(e.target.value)}
                placeholder="0.00"
              />
              <span className="cash-currency">ج.م</span>
            </div>
          </div>

          {changeDue !== null && (
            <div className="cash-change-badge">
              <div className="change-info">
                <span className="change-label">المتبقي للعميل (الفكة):</span>
                <span className="change-value">{changeDue.toFixed(2)} ج.م</span>
              </div>
              <span className="change-icon">🪙</span>
            </div>
          )}
        </div>
      )}

      {paymentMethod === 'card' && (
        <div className="card-payment-info">
          <span className="card-info-icon">💳</span>
          <p>الدفع عبر ماكينة الـ POS الإلكترونية — لا يتطلب حساب مبالغ نقدية</p>
        </div>
      )}

      {paymentMethod === 'credit' && (
        <div className="credit-form-card">
          <div className="credit-field">
            <label>اسم العميل <span>*</span></label>
            <input
              type="text"
              className="credit-input"
              placeholder="الاسم الثلاثي أو اسم الشركة..."
              value={creditCustomerName}
              onChange={(e) => setCreditCustomerName(e.target.value)}
            />
          </div>

          <div className="credit-field">
            <label>رقم هاتف العميل</label>
            <input
              type="text"
              className="credit-input"
              placeholder="01XXXXXXXXX"
              value={creditCustomerPhone}
              onChange={(e) => setCreditCustomerPhone(e.target.value)}
            />
          </div>

          <div className="credit-field">
            <label>تاريخ استحقاق السداد <span>*</span></label>
            <input
              type="date"
              className="credit-input"
              value={creditDueDate}
              onChange={(e) => setCreditDueDate(e.target.value)}
            />
          </div>

          <button
            type="button"
            className="secondary-btn"
            style={{ width: '100%', marginTop: '10px' }}
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

