import { useState, useEffect, useCallback } from 'react';

/**
 * ProductUnitsModal Component
 * نافذة إدارة تعدد وحدات القياس للصنف (قطعة / علبة / كرتونة / باكت / شيكارة)
 * مع معاملات التحويل والباركود المستقل وأسعار البيع
 */
export default function ProductUnitsModal({
  isOpen,
  onClose,
  productVariant,
  productName,
}) {
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // نموذج إضافة وحدة جديدة
  const [newUnitForm, setNewUnitForm] = useState({
    unit_name: '',
    conversion_factor: 12,
    barcode: '',
    selling_price: '',
    purchase_price: '',
  });

  const loadUnits = useCallback(async () => {
    if (!productVariant?.id || !window.electronAPI?.getGroceryUnits) return;
    try {
      setLoading(true);
      setErrorMsg('');
      const list = await window.electronAPI.getGroceryUnits(productVariant.id);
      setUnits(list || []);
    } catch (err) {
      setErrorMsg(err.message || 'تعذر تحميل وحدات القياس');
    } finally {
      setLoading(false);
    }
  }, [productVariant]);

  useEffect(() => {
    if (isOpen) {
      loadUnits();
      setErrorMsg('');
      setSuccessMsg('');
      // اقتراح سعر بيع تلقائي بناءً على سعر القطعة ومعامل 12
      const basePrice = Number(productVariant?.selling_price || 0);
      setNewUnitForm({
        unit_name: 'كرتونة',
        conversion_factor: 12,
        barcode: '',
        selling_price: basePrice > 0 ? (basePrice * 12).toFixed(2) : '',
        purchase_price: '',
      });
    }
  }, [isOpen, loadUnits, productVariant]);

  if (!isOpen || !productVariant) return null;

  const handleCreateUnit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!newUnitForm.unit_name.trim()) {
      setErrorMsg('اسم الوحدة مطلوب (مثال: كرتونة، علبة، دستة)');
      return;
    }
    const factor = Number(newUnitForm.conversion_factor);
    if (isNaN(factor) || factor <= 0) {
      setErrorMsg('معامل التحويل يجب أن يكون أكبر من صفر');
      return;
    }
    const price = Number(newUnitForm.selling_price);
    if (isNaN(price) || price < 0) {
      setErrorMsg('سعر بيع الوحدة غير صحيح');
      return;
    }

    try {
      await window.electronAPI.createGroceryUnit({
        variant_id: productVariant.id,
        unit_name: newUnitForm.unit_name.trim(),
        conversion_factor: factor,
        barcode: newUnitForm.barcode.trim() || null,
        selling_price: price,
        purchase_price: Number(newUnitForm.purchase_price) || 0,
        is_base_unit: 0,
      });

      setSuccessMsg(`تمت إضافة وحدة "${newUnitForm.unit_name.trim()}" بنجاح 📦`);
      setNewUnitForm({
        unit_name: '',
        conversion_factor: 1,
        barcode: '',
        selling_price: '',
        purchase_price: '',
      });
      loadUnits();
    } catch (err) {
      setErrorMsg(err.message || 'فشل حفظ وحدة القياس');
    }
  };

  const handleDeleteUnit = async (unitId, unitName) => {
    if (!window.confirm(`هل أنت متأكد من حذف وحدة "${unitName}"؟`)) return;
    try {
      await window.electronAPI.deleteGroceryUnit(unitId);
      setSuccessMsg(`تم حذف وحدة "${unitName}" بنجاح`);
      loadUnits();
    } catch (err) {
      setErrorMsg(err.message || 'تعذر حذف الوحدة');
    }
  };

  return (
    <div className="fox-modal-overlay" onClick={onClose}>
      <div className="fox-modal-card" style={{ maxWidth: '640px' }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="fox-modal-header" style={{ borderBottom: '2px solid #3B82F6' }}>
          <div className="fox-modal-title">
            <span style={{ fontSize: '24px' }}>📦</span>
            <div>
              <h4 style={{ margin: 0, color: '#0F172A' }}>تعدد وحدات القياس (Multi-UOM)</h4>
              <span style={{ fontSize: '12px', color: '#64748B' }}>
                {productName || 'المنتج'} — SKU: {productVariant.sku || 'بدون'}
              </span>
            </div>
          </div>
          <button type="button" className="fox-modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="fox-modal-body" style={{ maxHeight: '78vh', overflowY: 'auto' }}>
          {errorMsg && <div className="fox-alert-error" style={{ marginBottom: '12px' }}>{errorMsg}</div>}
          {successMsg && <div className="fox-alert-success" style={{ marginBottom: '12px' }}>{successMsg}</div>}

          {/* بطاقة الوحدة الصغرى الأساسية */}
          <div
            style={{
              background: '#EFF6FF',
              border: '1.5px solid #BFDBFE',
              borderRadius: '10px',
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '16px',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontWeight: 700, color: '#1E40AF' }}>الوحدة الصغرى الأساسية:</span>
                <span style={{ background: '#3B82F6', color: '#fff', fontSize: '11px', padding: '1px 6px', borderRadius: '4px', fontWeight: 700 }}>
                  قطعة / حبة (معامل 1)
                </span>
              </div>
              <div style={{ fontSize: '12px', color: '#475569', marginTop: '4px' }}>
                الباركود الأساسي: <code>{productVariant.barcode || productVariant.sku || 'لا يوجد'}</code> · المخزون: <strong>{productVariant.stock_quantity}</strong>
              </div>
            </div>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#1E40AF' }}>
                {Number(productVariant.selling_price || 0).toFixed(2)} ج.م
              </div>
            </div>
          </div>

          {/* قائمة الوحدات المضافة حالياً */}
          <div style={{ marginBottom: '20px' }}>
            <h5 style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#334155' }}>
              الوحدات الأكبر المسجلة (كرتونة، باكت، دستة...):
            </h5>

            {loading ? (
              <div style={{ textAlign: 'center', padding: '16px', color: '#64748B' }}>جاري التحميل...</div>
            ) : units.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '16px', background: '#F8FAFC', borderRadius: '8px', color: '#94A3B8', fontSize: '13px' }}>
                لا توجد وحدات أكبر مسجلة لهذا الصنف حتى الآن. أضف كرتونة أو علبة بالأسفل!
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {units.map((u) => (
                  <div
                    key={u.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: '#FFFFFF',
                      border: '1px solid #E2E8F0',
                      borderRadius: '8px',
                      padding: '10px 14px',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontWeight: 700, color: '#0F172A' }}>{u.unit_name}</span>
                        <span style={{ fontSize: '11px', background: '#F1F5F9', color: '#475569', padding: '1px 6px', borderRadius: '4px' }}>
                          تحتوي على {u.conversion_factor} قطعة
                        </span>
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748B' }}>
                        الباركود المخصص: <code>{u.barcode || 'غير محدد'}</code>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <div style={{ textAlign: 'left' }}>
                        <div style={{ fontWeight: 800, color: '#10B981', fontSize: '15px' }}>
                          {Number(u.selling_price).toFixed(2)} ج.م
                        </div>
                        {u.purchase_price > 0 && (
                          <div style={{ fontSize: '11px', color: '#94A3B8' }}>
                            شراء: {Number(u.purchase_price).toFixed(2)} ج.م
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDeleteUnit(u.id, u.unit_name)}
                        style={{
                          background: '#FEE2E2',
                          color: '#EF4444',
                          border: 'none',
                          borderRadius: '6px',
                          padding: '6px 10px',
                          cursor: 'pointer',
                          fontWeight: 700,
                          fontSize: '12px',
                        }}
                        title="حذف الوحدة"
                      >
                        حذف
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* نموذج إضافة وحدة جديدة */}
          <div
            style={{
              background: '#F8FAFC',
              border: '1px solid #E2E8F0',
              borderRadius: '10px',
              padding: '16px',
            }}
          >
            <h5 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#1E293B', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>➕</span> إضافة وحدة بيع جديدة (كرتونة / باكت):
            </h5>

            <form onSubmit={handleCreateUnit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '12px', marginBottom: '10px' }}>
                <div className="form-field-group">
                  <label className="form-label">اسم الوحدة: <span className="req-star">*</span></label>
                  <input
                    type="text"
                    className="fox-lux-input"
                    placeholder="مثال: كرتونة 24 علبة أو باكت 6"
                    value={newUnitForm.unit_name}
                    onChange={(e) => setNewUnitForm({ ...newUnitForm, unit_name: e.target.value })}
                    required
                  />
                </div>

                <div className="form-field-group">
                  <label className="form-label">معامل التحويل (عدد القطع): <span className="req-star">*</span></label>
                  <input
                    type="number"
                    min="1"
                    className="fox-lux-input"
                    value={newUnitForm.conversion_factor}
                    onChange={(e) => {
                      const f = Number(e.target.value) || 1;
                      const basePrice = Number(productVariant.selling_price || 0);
                      setNewUnitForm((prev) => ({
                        ...prev,
                        conversion_factor: e.target.value,
                        selling_price: basePrice > 0 ? (basePrice * f).toFixed(2) : prev.selling_price,
                      }));
                    }}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '10px' }}>
                <div className="form-field-group">
                  <label className="form-label">سعر بيع الوحدة: <span className="req-star">*</span></label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="fox-lux-input"
                    placeholder="سعر البيع"
                    value={newUnitForm.selling_price}
                    onChange={(e) => setNewUnitForm({ ...newUnitForm, selling_price: e.target.value })}
                    required
                  />
                </div>

                <div className="form-field-group">
                  <label className="form-label">سعر شراء الوحدة (اختياري):</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="fox-lux-input"
                    placeholder="سعر الشراء"
                    value={newUnitForm.purchase_price}
                    onChange={(e) => setNewUnitForm({ ...newUnitForm, purchase_price: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-field-group" style={{ marginBottom: '14px' }}>
                <label className="form-label">باركود مخصص لهذه الوحدة (امسح باركود الكرتونة):</label>
                <input
                  type="text"
                  className="fox-lux-input"
                  placeholder="مثال: 6229998887771 (إذا وجد باركود على الكرتونة)"
                  value={newUnitForm.barcode}
                  onChange={(e) => setNewUnitForm({ ...newUnitForm, barcode: e.target.value })}
                />
              </div>

              <button
                type="submit"
                className="fox-btn-primary"
                style={{ width: '100%', justifyContent: 'center', background: '#3B82F6', borderColor: '#3B82F6' }}
              >
                + حفظ الوحدة الجديدة للصنف
              </button>
            </form>
          </div>
        </div>

        <div className="fox-modal-actions">
          <button type="button" className="fox-btn-secondary" onClick={onClose}>
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}
