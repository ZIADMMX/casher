import { useState, useEffect } from 'react';

function CreditCustomerModal({
  isOpen,
  onClose,
  customerName,
  setCustomerName,
  customerPhone,
  setCustomerPhone,
  dueDate,
  setDueDate,
  onConfirm,
}) {
  const [localName, setLocalName] = useState(customerName || '');
  const [localPhone, setLocalPhone] = useState(customerPhone || '');
  const [localDueDate, setLocalDueDate] = useState(dueDate || '');
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setLocalName(customerName || '');
      setLocalPhone(customerPhone || '');
      setLocalDueDate(dueDate || '');
      setError('');
    }
  }, [isOpen, customerName, customerPhone, dueDate]);

  if (!isOpen) return null;

  function handleSubmit(e) {
    e.preventDefault();
    if (!localName.trim()) {
      setError('اسم العميل مطلوب للبيع الآجل');
      return;
    }
    if (!localDueDate) {
      setError('تاريخ استحقاق الدين مطلوب');
      return;
    }

    setCustomerName(localName.trim());
    setCustomerPhone(localPhone.trim());
    setDueDate(localDueDate);
    if (onConfirm) onConfirm({ name: localName.trim(), phone: localPhone.trim(), dueDate: localDueDate });
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>👤 بيانات العميل للبيع الآجل (دين)</h3>
          <button type="button" className="modal-close-btn" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="form-error-banner">{error}</div>}

            <div className="form-group">
              <label className="form-label">
                اسم العميل <span style={{ color: '#EF4444' }}>*</span>
              </label>
              <input
                type="text"
                className="form-input"
                placeholder="مثال: أحمد محمود..."
                value={localName}
                onChange={(e) => setLocalName(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div className="form-group">
              <label className="form-label">رقم الهاتف (اختياري)</label>
              <input
                type="tel"
                className="form-input"
                placeholder="010xxxxxxxx"
                value={localPhone}
                onChange={(e) => setLocalPhone(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">
                تاريخ الاستحقاق <span style={{ color: '#EF4444' }}>*</span>
              </label>
              <input
                type="date"
                className="form-input"
                value={localDueDate}
                onChange={(e) => setLocalDueDate(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="secondary-btn" onClick={onClose}>
              إلغاء
            </button>
            <button type="submit" className="primary-btn">
              حفظ بيانات العميل
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CreditCustomerModal;
