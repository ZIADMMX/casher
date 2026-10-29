import { useState, useMemo, useEffect } from 'react';

function ShiftCloseModal({
  isOpen,
  onClose,
  onCloseShift,
}) {
  const [actualCash, setActualCash] = useState('');
  const [useBreakdown, setUseBreakdown] = useState(false);
  const [cashBreakdown, setCashBreakdown] = useState({
    200: '', 100: '', 50: '', 20: '', 10: '', 5: '', 1: ''
  });
  const [closeNotes, setCloseNotes] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const timeoutId = setTimeout(() => {
        setActualCash('');
        setUseBreakdown(false);
        setCashBreakdown({ 200: '', 100: '', 50: '', 20: '', 10: '', 5: '', 1: '' });
        setCloseNotes('');
        setError('');
      }, 0);
      return () => clearTimeout(timeoutId);
    }
  }, [isOpen]);

  const calculatedTotal = useMemo(() => {
    return [200, 100, 50, 20, 10, 5, 1].reduce((sum, denom) => {
      const count = Number(cashBreakdown[denom] || 0);
      return sum + denom * count;
    }, 0);
  }, [cashBreakdown]);

  if (!isOpen) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    const actual = useBreakdown ? calculatedTotal : Number(actualCash);
    if (isNaN(actual) || actual < 0) {
      setError('الرجاء إدخال المبلغ الفعلي الموجود في الدرج');
      return;
    }

    setLoading(true);
    try {
      await onCloseShift({
        actualCash: actual,
        cashBreakdown: useBreakdown ? cashBreakdown : null,
        notes: closeNotes,
      });
      onClose();
    } catch (err) {
      setError(err.message || 'فشل إغلاق الوردية');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: '520px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>🔒 تقفيل الوردية وإصدار تقرير (Z-Report)</h3>
          <button type="button" className="modal-close-btn" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="form-error-banner">{error}</div>}

            <div style={{
              background: '#F0F9FF',
              border: '1px solid #BAE6FD',
              padding: '12px 14px',
              borderRadius: '12px'
            }}>
              <strong style={{ color: '#0369A1', fontSize: '13.5px' }}>نظام العد الأعمى (Blind Count):</strong>
              <p style={{ margin: '4px 0 0 0', fontSize: '12.5px', color: '#475569' }}>
                قم بعد المبلغ الكاش الفعلي الموجود في الدرج حالياً وأدخله هنا. سيقوم النظام بعمل مطابقة فورية وكشف أي عجز أو زيادة وإصدار تقرير Z-Report نهائي.
              </p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label className="form-label" style={{ margin: 0 }}>
                النقدية الفعلية بالدرج <span style={{ color: '#EF4444' }}>*</span>
              </label>
              <button
                type="button"
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#F2600C',
                  fontSize: '12.5px',
                  fontWeight: '700',
                  cursor: 'pointer'
                }}
                onClick={() => setUseBreakdown(!useBreakdown)}
              >
                {useBreakdown ? '⌨️ إدخال يدوي مباشر' : '💵 استخدام عداد الفئات النقدية'}
              </button>
            </div>

            {!useBreakdown ? (
              <div className="form-group">
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  className="form-input form-input-lg"
                  placeholder="المبلغ الفعلي..."
                  value={actualCash}
                  onChange={(e) => setActualCash(e.target.value)}
                  required
                  autoFocus
                />
              </div>
            ) : (
              <div className="denominations-card">
                <div className="denominations-grid">
                  {[200, 100, 50, 20, 10, 5, 1].map((denom) => (
                    <div key={denom} className="denom-row">
                      <span className="denom-lbl">{denom} ج.م ×</span>
                      <input
                        type="number"
                        min="0"
                        className="denom-input"
                        placeholder="0"
                        value={cashBreakdown[denom]}
                        onChange={(e) => {
                          const val = e.target.value;
                          setCashBreakdown((prev) => ({ ...prev, [denom]: val }));
                        }}
                      />
                    </div>
                  ))}
                </div>
                <div className="denom-total-box">
                  <span style={{ fontSize: '12.5px', color: '#64748B', fontWeight: '600' }}>إجمالي العد المحسوب:</span>
                  <strong style={{ color: '#15803D', fontSize: '16px', fontFamily: 'Space Grotesk' }}>
                    {calculatedTotal.toFixed(2)} ج.م
                  </strong>
                </div>
              </div>
            )}

            <div className="form-group">
              <label className="form-label">ملاحظات التقفيل (اختياري)</label>
              <textarea
                className="form-input"
                placeholder="أي ملاحظات حول الوردية أو تسليم الدرج للمشرف..."
                rows="2"
                value={closeNotes}
                onChange={(e) => setCloseNotes(e.target.value)}
              ></textarea>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="secondary-btn" onClick={onClose} disabled={loading}>
              إلغاء
            </button>
            <button type="submit" className="danger-btn" disabled={loading}>
              {loading ? 'جاري التقفيل...' : 'تأكيد تقفيل الوردية وإصدار Z-Report 🔒'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ShiftCloseModal;
