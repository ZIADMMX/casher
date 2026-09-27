import { useState, useEffect } from 'react';

const SHIFT_EXPENSE_CATS = [
  'نثريات ومصروفات عامة',
  'بوفيه وضيافة ومشروبات',
  'صيانة وإصلاحات',
  'مواصلات وشحن سريع',
  'أخرى',
];

function ShiftExpenseModal({
  isOpen,
  onClose,
  onAddExpense,
}) {
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState(SHIFT_EXPENSE_CATS[0]);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setAmount('');
      setCategory(SHIFT_EXPENSE_CATS[0]);
      setNotes('');
      setError('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    const amt = Number(amount);
    if (isNaN(amt) || amt <= 0) {
      setError('الرجاء إدخال مبلغ صحيح أكبر من الصفر');
      return;
    }

    setLoading(true);
    try {
      await onAddExpense({
        amount: amt,
        category,
        notes,
      });
      onClose();
    } catch (err) {
      setError(err.message || 'فشل تسجيل المصروف');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>💸 سحب وتسجيل مصروف من الدرج</h3>
          <button type="button" className="modal-close-btn" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="form-error-banner">{error}</div>}

            <div className="form-group">
              <label className="form-label">
                المبلغ المسحوب <span style={{ color: '#EF4444' }}>*</span>
              </label>
              <input
                type="number"
                step="0.5"
                min="0.5"
                className="form-input form-input-lg"
                placeholder="50"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div className="form-group">
              <label className="form-label">بند أو تصنيف المصروف</label>
              <select
                className="form-input"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {SHIFT_EXPENSE_CATS.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">البيان / تفاصيل المصروف</label>
              <input
                type="text"
                className="form-input"
                placeholder="مثال: شاي وقهوة للضيوف، نثريات..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="secondary-btn" onClick={onClose} disabled={loading}>
              إلغاء
            </button>
            <button type="submit" className="warning-btn" disabled={loading}>
              {loading ? 'جاري التسجيل...' : 'خصم المصروف من الدرج 💸'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ShiftExpenseModal;
