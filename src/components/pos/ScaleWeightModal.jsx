import { useState, useEffect } from 'react';

/**
 * ScaleWeightModal Component
 * نافذة وزن السلعة الحية لكاشير السوبر ماركت
 * تتيح تحديد الوزن بالكيلوجرام أو الجرام بضغطة زر
 */
export default function ScaleWeightModal({
  isOpen,
  onClose,
  productVariant,
  onConfirmWeight,
}) {
  const [weightKg, setWeightKg] = useState('0.500');
  const [mode, setMode] = useState('kg'); // 'kg' or 'grams'

  useEffect(() => {
    if (isOpen) {
      setWeightKg('0.500');
      setMode('kg');
    }
  }, [isOpen]);

  if (!isOpen || !productVariant) return null;

  const unitPrice = Number(productVariant.selling_price || productVariant.unitPrice || 0);
  const numericWeight = parseFloat(weightKg) || 0;
  const computedWeightKg = mode === 'grams' ? numericWeight / 1000 : numericWeight;
  const totalPrice = Math.round(computedWeightKg * unitPrice * 100) / 100;

  const handleQuickPreset = (valInKg) => {
    setMode('kg');
    setWeightKg(String(valInKg));
  };

  const handleConfirm = (e) => {
    e.preventDefault();
    if (computedWeightKg <= 0) return;
    onConfirmWeight({
      weightKg: Math.round(computedWeightKg * 1000) / 1000,
      totalPrice,
      productVariant,
    });
    onClose();
  };

  return (
    <div className="fox-modal-overlay" onClick={onClose}>
      <div className="fox-modal-card" style={{ maxWidth: '440px' }} onClick={(e) => e.stopPropagation()}>
        <div className="fox-modal-header" style={{ borderBottom: '2px solid #10B981' }}>
          <div className="fox-modal-title">
            <span style={{ fontSize: '24px' }}>⚖️</span>
            <div>
              <h4 style={{ margin: 0, color: '#0F172A' }}>وزن سلعة الميزان</h4>
              <span style={{ fontSize: '12px', color: '#64748B' }}>
                {productVariant.productName || productVariant.name || 'صنف بالوزن'}
              </span>
            </div>
          </div>
          <button type="button" className="fox-modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <form onSubmit={handleConfirm} className="fox-modal-body">
          {/* سعر الكيلو الحالي */}
          <div
            style={{
              background: '#F0FDF4',
              border: '1px solid #BBF7D0',
              borderRadius: '10px',
              padding: '12px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px',
            }}
          >
            <span style={{ color: '#166534', fontWeight: 600 }}>سعر الكيلو الأساسي:</span>
            <span style={{ fontSize: '18px', fontWeight: 800, color: '#15803D' }}>
              {unitPrice.toFixed(2)} ج.م / كجم
            </span>
          </div>

          {/* أزرار الأوزان الشائعة السريعة */}
          <div style={{ marginBottom: '14px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '6px' }}>
              أوزان سريعة جاهزة:
            </span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
              {[
                { label: 'ربع كجم', val: 0.25 },
                { label: 'نصف كجم', val: 0.5 },
                { label: 'كيلو', val: 1.0 },
                { label: '2 كيلو', val: 2.0 },
              ].map((p) => (
                <button
                  key={p.val}
                  type="button"
                  className="fox-btn-secondary"
                  style={{
                    padding: '8px 4px',
                    fontSize: '12px',
                    background: computedWeightKg === p.val ? '#10B981' : '#F8FAFC',
                    color: computedWeightKg === p.val ? '#fff' : '#334155',
                    borderColor: computedWeightKg === p.val ? '#10B981' : '#E2E8F0',
                  }}
                  onClick={() => handleQuickPreset(p.val)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* حقل إدخال الوزن اليدوي */}
          <div className="form-field-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <label className="form-label" style={{ margin: 0 }}>
                أدخل الوزن بدقة:
              </label>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button
                  type="button"
                  style={{
                    padding: '2px 8px',
                    fontSize: '11px',
                    borderRadius: '4px',
                    border: '1px solid #CBD5E1',
                    background: mode === 'kg' ? '#10B981' : '#F1F5F9',
                    color: mode === 'kg' ? '#fff' : '#475569',
                    cursor: 'pointer',
                  }}
                  onClick={() => setMode('kg')}
                >
                  كجم
                </button>
                <button
                  type="button"
                  style={{
                    padding: '2px 8px',
                    fontSize: '11px',
                    borderRadius: '4px',
                    border: '1px solid #CBD5E1',
                    background: mode === 'grams' ? '#10B981' : '#F1F5F9',
                    color: mode === 'grams' ? '#fff' : '#475569',
                    cursor: 'pointer',
                  }}
                  onClick={() => setMode('grams')}
                >
                  جرام
                </button>
              </div>
            </div>

            <div style={{ position: 'relative' }}>
              <input
                type="number"
                step="any"
                min="0.001"
                autoFocus
                className="fox-lux-input"
                style={{ fontSize: '22px', fontWeight: 700, textAlign: 'center', letterSpacing: '1px' }}
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value)}
                placeholder={mode === 'kg' ? 'مثال: 0.350' : 'مثال: 350'}
              />
              <span
                style={{
                  position: 'absolute',
                  left: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  fontWeight: 600,
                  color: '#94A3B8',
                }}
              >
                {mode === 'kg' ? 'كجم' : 'جرام'}
              </span>
            </div>
          </div>

          {/* الإجمالي التلقائي للوزن */}
          <div
            style={{
              background: '#F8FAFC',
              border: '2px dashed #CBD5E1',
              borderRadius: '12px',
              padding: '14px',
              textAlign: 'center',
              marginTop: '16px',
            }}
          >
            <div style={{ fontSize: '13px', color: '#64748B' }}>
              الوزن الصافي: <strong>{computedWeightKg.toFixed(3)} كجم</strong> ({Math.round(computedWeightKg * 1000)} جرام)
            </div>
            <div style={{ fontSize: '26px', fontWeight: 900, color: '#0F172A', marginTop: '4px' }}>
              {totalPrice.toFixed(2)} <span style={{ fontSize: '15px', fontWeight: 600 }}>ج.م</span>
            </div>
          </div>

          <div className="fox-modal-actions" style={{ marginTop: '20px' }}>
            <button type="button" className="fox-btn-secondary" onClick={onClose}>
              إلغاء
            </button>
            <button
              type="submit"
              className="fox-btn-primary"
              style={{ background: '#10B981', borderColor: '#10B981' }}
              disabled={computedWeightKg <= 0}
            >
              ✓ إضافة للسلة ({totalPrice.toFixed(2)} ج.م)
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
