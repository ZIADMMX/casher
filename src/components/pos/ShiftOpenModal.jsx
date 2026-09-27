import { useState, useMemo, useEffect } from 'react';

function ShiftOpenModal({
  isOpen,
  onClose,
  onOpenShift,
  sessionUser,
  lastClosedShift,
}) {
  const [shiftType, setShiftType] = useState('morning');
  const [posStation] = useState('الدرج الرئيسي - POS 1');
  const [useBreakdown, setUseBreakdown] = useState(false);
  const [cashBreakdown, setCashBreakdown] = useState({
    200: '', 100: '', 50: '', 20: '', 10: '', 5: '', 1: ''
  });
  const [safetyChecked, setSafetyChecked] = useState(true);
  const [openingCash, setOpeningCash] = useState('');
  const [openNotes, setOpenNotes] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const currentHour = new Date().getHours();
      setShiftType(currentHour < 16 ? 'morning' : 'evening');
      setUseBreakdown(false);
      setCashBreakdown({ 200: '', 100: '', 50: '', 20: '', 10: '', 5: '', 1: '' });
      setSafetyChecked(true);
      setOpeningCash('');
      setOpenNotes('');
      setError('');
    }
  }, [isOpen]);

  const breakdownCalculatedTotal = useMemo(() => {
    return [200, 100, 50, 20, 10, 5, 1].reduce((sum, denom) => {
      const count = Number(cashBreakdown[denom] || 0);
      return sum + denom * count;
    }, 0);
  }, [cashBreakdown]);

  if (!isOpen) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    const amount = useBreakdown ? breakdownCalculatedTotal : Number(openingCash || 0);
    if (isNaN(amount) || amount < 0) {
      setError('الرجاء إدخال عهدة نقدية صحيحة');
      return;
    }

    setLoading(true);
    try {
      await onOpenShift({
        openingCash: amount,
        shiftType,
        posStation,
        notes: openNotes,
        openingCashBreakdown: useBreakdown ? cashBreakdown : null,
      });
      onClose();
    } catch (err) {
      setError(err.message || 'فشل فتح الوردية');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: '560px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>🟢 استلام الدرج وبدء وردية جديدة</h3>
          <button type="button" className="modal-close-btn" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="form-error-banner">{error}</div>}

            {/* Staff & Station Info Grid */}
            <div className="shift-staff-grid">
              <div className="shift-meta-item">
                <span className="shift-meta-label">👤 مستلم الوردية</span>
                <strong className="shift-meta-val">
                  {sessionUser?.username || 'الكاشير'}
                  <span style={{ fontSize: '10px', background: '#E2E8F0', padding: '1px 5px', borderRadius: '4px', color: '#475569' }}>
                    {sessionUser?.role === 'admin' ? 'مدير' : 'كاشير'}
                  </span>
                </strong>
              </div>
              <div className="shift-meta-item">
                <span className="shift-meta-label">🏬 نقطة البيع</span>
                <strong className="shift-meta-val">{posStation}</strong>
              </div>
              <div className="shift-meta-item">
                <span className="shift-meta-label">🕒 توقيت الاستلام</span>
                <strong className="shift-meta-val" style={{ fontFamily: 'Space Grotesk' }}>
                  {new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                </strong>
              </div>
            </div>

            {/* Handover from Previous Shift Banner (if exists) */}
            {lastClosedShift && (
              <div className="shift-handover-card">
                <div className="shift-handover-info">
                  <div className="shift-handover-icon">📦</div>
                  <div className="shift-handover-texts">
                    <h5>آخر وردية مغلقة: #{lastClosedShift.id} ({lastClosedShift.closed_by_username || lastClosedShift.cashier_username || 'كاشير'})</h5>
                    <p>
                      العهدة النقدية المتبقية: <strong>{Number(lastClosedShift.actual_cash || 0).toFixed(2)} ج.م</strong>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="shift-handover-btn"
                  onClick={() => {
                    const val = Number(lastClosedShift.actual_cash || 0);
                    setOpeningCash(val > 0 ? String(val) : '0');
                    setUseBreakdown(false);
                  }}
                >
                  ⚡ استلام نفس العهدة
                </button>
              </div>
            )}

            {/* Shift Type (Morning / Evening) */}
            <div className="form-group">
              <label className="form-label">فترة الوردية (الشيفت)</label>
              <div className="shift-type-pills">
                <button
                  type="button"
                  className={`shift-type-btn ${shiftType === 'morning' ? 'active morning' : ''}`}
                  onClick={() => setShiftType('morning')}
                >
                  <span>☀️</span> وردية صباحية
                </button>
                <button
                  type="button"
                  className={`shift-type-btn ${shiftType === 'evening' ? 'active evening' : ''}`}
                  onClick={() => setShiftType('evening')}
                >
                  <span>🌙</span> وردية مسائية
                </button>
              </div>
            </div>

            {/* Opening Cash Input & Presets */}
            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label className="form-label" style={{ margin: 0 }}>
                  العهدة النقدية الابتدائية (الفكة في الدرج) <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <button
                  type="button"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#2E5BFF',
                    fontSize: '12.5px',
                    fontWeight: '700',
                    cursor: 'pointer'
                  }}
                  onClick={() => setUseBreakdown(!useBreakdown)}
                >
                  {useBreakdown ? '⌨️ إدخال يدوي مباشر' : '🧮 حاسبة تفقيط الفئات'}
                </button>
              </div>

              {/* Quick Presets */}
              <div className="quick-presets-row">
                {[0, 200, 300, 500, 1000].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className="preset-chip"
                    onClick={() => {
                      setOpeningCash(String(preset));
                      setUseBreakdown(false);
                    }}
                  >
                    {preset === 0 ? 'بدون فكة (0)' : `${preset} ج.م`}
                  </button>
                ))}
              </div>

              {!useBreakdown ? (
                <div style={{ position: 'relative' }}>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    className="form-input form-input-lg"
                    placeholder="500"
                    value={openingCash}
                    onChange={(e) => setOpeningCash(e.target.value)}
                    required
                    autoFocus
                  />
                  <span style={{
                    position: 'absolute',
                    left: '14px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: '#64748B',
                    fontWeight: '700',
                    fontSize: '13px'
                  }}>
                    ج.م
                  </span>
                </div>
              ) : (
                /* Denominations breakdown */
                <div className="denominations-card" style={{ marginTop: '8px' }}>
                  <span className="denom-title">💰 تفقيط فئات الفكة النقدية:</span>
                  <div className="denom-grid">
                    {[200, 100, 50, 20, 10, 5, 1].map((denom) => (
                      <div key={denom} className="denom-row">
                        <span className="denom-label">{denom} ج.م:</span>
                        <input
                          type="number"
                          min="0"
                          className="denom-input"
                          placeholder="0"
                          value={cashBreakdown[denom] || ''}
                          onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, '');
                            setCashBreakdown((prev) => ({ ...prev, [denom]: val }));
                          }}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="denom-total-box">
                    <span style={{ fontSize: '12.5px', color: '#64748B', fontWeight: '600' }}>إجمالي الفكة المحسوب:</span>
                    <strong style={{ color: '#15803D', fontSize: '16px', fontFamily: 'Space Grotesk' }}>
                      {breakdownCalculatedTotal.toFixed(2)} ج.م
                    </strong>
                  </div>
                </div>
              )}
              <span className="form-helper" style={{ marginTop: '6px' }}>
                أدخل المبلغ المتوفر في الدرج لحظة استلام الشيفت قبل أول عملية بيع.
              </span>
            </div>

            {/* Safety & Checklist */}
            <div className="checklist-card">
              <label className="checklist-label">
                <input
                  type="checkbox"
                  className="checklist-checkbox"
                  checked={safetyChecked}
                  onChange={(e) => setSafetyChecked(e.target.checked)}
                />
                <span>✅ تم فحص وسلامة الدرج وطابعة الفواتير وجهاز الباركود وتجهيزات الكاشير</span>
              </label>
            </div>

            {/* Notes */}
            <div className="form-group">
              <label className="form-label">ملاحظات الاستلام (اختياري)</label>
              <textarea
                className="form-input"
                placeholder="أي ملاحظات بخصوص استلام الوردية أو حالة الفكة..."
                rows="2"
                value={openNotes}
                onChange={(e) => setOpenNotes(e.target.value)}
              ></textarea>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="secondary-btn" onClick={onClose} disabled={loading}>
              إلغاء
            </button>
            <button type="submit" className="primary-btn" disabled={loading}>
              {loading ? 'جاري الفتح...' : 'تأكيد استلام الدرج وبدء الوردية 🟢'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ShiftOpenModal;
