import { useState, useEffect, useCallback } from 'react';
import * as groceryApi from '../../api/grocery.js';

/**
 * ExpiryManagerModal Component
 * لوحة إدارة تواريخ الصلاحية، تشغيلات اللوت، تنبيهات الهالك، وإعدادات ميزان الباركود
 */
export default function ExpiryManagerModal({
  isOpen,
  onClose,
  products = [],
}) {
  const [activeTab, setActiveTab] = useState('summary'); // 'summary' | 'add_batch' | 'scale_config'
  const [summaryData, setSummaryData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // نموذج إضافة تشغيلة جديدة
  const [batchForm, setBatchForm] = useState({
    variant_id: '',
    batch_number: '',
    expiry_date: '',
    production_date: '',
    quantity: '',
    purchase_price: '',
    notes: '',
  });

  // نموذج إعدادات الميزان
  const [scaleForm, setScaleForm] = useState({
    name: 'ميزان الأجبان واللحوم',
    prefix: '20',
    plu_length: 5,
    encoding_type: 'weight_grams',
  });

  // أداة اختبار الباركود الحية
  const [testBarcode, setTestBarcode] = useState('2000142003505');
  const [testResult, setTestResult] = useState(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMsg('');
      if (groceryApi.getGroceryExpirySummary.isAvailable()) {
        const sum = await groceryApi.getGroceryExpirySummary(30);
        setSummaryData(sum);
      }
      if (groceryApi.getGroceryScaleConfig.isAvailable()) {
        const cfg = await groceryApi.getGroceryScaleConfig();
        if (cfg) {
          setScaleForm({
            name: cfg.name || 'ميزان الأجبان واللحوم',
            prefix: cfg.prefix || '20',
            plu_length: cfg.plu_length || 5,
            encoding_type: cfg.encoding_type || 'weight_grams',
          });
        }
      }
    } catch (err) {
      setErrorMsg(err.message || 'تعذر تحميل بيانات الصلاحيات');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadData();
      setErrorMsg('');
      setSuccessMsg('');
    }
  }, [isOpen, loadData]);

  if (!isOpen) return null;

  const handleCreateBatch = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    if (!batchForm.variant_id) {
      setErrorMsg('يرجى اختيار الصنف المرتبط بالتشغيلة');
      return;
    }
    if (!batchForm.expiry_date) {
      setErrorMsg('تاريخ انتهاء الصلاحية مطلوب');
      return;
    }

    try {
      await groceryApi.createGroceryBatch({
        variant_id: Number(batchForm.variant_id),
        batch_number: batchForm.batch_number.trim() || null,
        expiry_date: batchForm.expiry_date,
        production_date: batchForm.production_date || null,
        quantity: Number(batchForm.quantity) || 0,
        purchase_price: Number(batchForm.purchase_price) || 0,
        notes: batchForm.notes.trim() || null,
      });

      setSuccessMsg('تم تسجيل التشغيلة وتاريخ الصلاحية بنجاح 🛡️');
      setBatchForm({
        variant_id: '',
        batch_number: '',
        expiry_date: '',
        production_date: '',
        quantity: '',
        purchase_price: '',
        notes: '',
      });
      loadData();
      setActiveTab('summary');
    } catch (err) {
      setErrorMsg(err.message || 'فشل حفظ التشغيلة');
    }
  };

  const handleSaveScaleConfig = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const updated = await groceryApi.saveGroceryScaleConfig(scaleForm);
      if (updated) {
        setScaleForm({
          name: updated.name || scaleForm.name,
          prefix: updated.prefix || scaleForm.prefix,
          plu_length: updated.plu_length || scaleForm.plu_length,
          encoding_type: updated.encoding_type || scaleForm.encoding_type,
        });
      }
      setSuccessMsg('تم حفظ إعدادات ميزان الباركود الإلكتروني بنجاح ⚖️');
    } catch (err) {
      setErrorMsg(err.message || 'فشل حفظ إعدادات الميزان');
    }
  };

  const handleTestBarcode = async () => {
    if (!testBarcode) return;
    try {
      if (groceryApi.parseGroceryScaleBarcode.isAvailable()) {
        const parsed = await groceryApi.parseGroceryScaleBarcode(testBarcode.trim());
        setTestResult(parsed || { error: 'الباركود لا يتطابق مع إعدادات الميزان الحالية' });
      }
    } catch (err) {
      setTestResult({ error: err.message });
    }
  };

  const allVariants = products.flatMap((p) =>
    (p.variants || []).map((v) => ({
      id: v.id,
      name: `${p.name} ${v.size || ''} ${v.color || ''}`.trim(),
      sku: v.sku,
      barcode: v.barcode,
    }))
  );

  return (
    <div className="fox-modal-overlay" onClick={onClose}>
      <div className="fox-modal-card" style={{ maxWidth: '780px' }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="fox-modal-header" style={{ borderBottom: '2px solid #F59E0B' }}>
          <div className="fox-modal-title">
            <span style={{ fontSize: '26px' }}>🛡️</span>
            <div>
              <h4 style={{ margin: 0, color: '#0F172A' }}>
                إدارة الصلاحيات والموازين الإلكترونية {loading && <span style={{ fontSize: '12px', color: '#F59E0B' }}>(جاري التحديث...)</span>}
              </h4>
              <span style={{ fontSize: '12px', color: '#64748B' }}>
                مراقبة تواريخ انتهاء الصلاحية، تشغيلات اللوت، وحماية أرباح السوبر ماركت من الهالك
              </span>
            </div>
          </div>
          <button type="button" className="fox-modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        {/* Navigation Tabs */}
        <div style={{ display: 'flex', gap: '8px', padding: '12px 20px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
          {[
            { key: 'summary', label: '📊 ملخص الأمان والهالك', count: (summaryData?.expiringCount || 0) + (summaryData?.expiredCount || 0) },
            { key: 'add_batch', label: '➕ تسجيل تشغيلة لوت جديدة' },
            { key: 'scale_config', label: '⚖️ إعدادات ميزان الباركود' },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: '8px 14px',
                borderRadius: '8px',
                border: 'none',
                background: activeTab === tab.key ? '#F59E0B' : '#E2E8F0',
                color: activeTab === tab.key ? '#ffffff' : '#334155',
                fontWeight: 700,
                fontSize: '13px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <span>{tab.label}</span>
              {tab.count !== undefined && tab.count > 0 && (
                <span style={{ background: '#EF4444', color: '#fff', fontSize: '10px', padding: '1px 5px', borderRadius: '10px' }}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="fox-modal-body" style={{ maxHeight: '72vh', overflowY: 'auto' }}>
          {errorMsg && <div className="fox-alert-error" style={{ marginBottom: '12px' }}>{errorMsg}</div>}
          {successMsg && <div className="fox-alert-success" style={{ marginBottom: '12px' }}>{successMsg}</div>}

          {/* TAB 1: الملخص والتنبيهات */}
          {activeTab === 'summary' && (
            <div>
              {/* إحصائيات سريعة */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px', marginBottom: '20px' }}>
                <div style={{ background: '#FEF3C7', border: '1.5px solid #FCD34D', borderRadius: '10px', padding: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, color: '#92400E' }}>⚠️ تنتهي خلال 30 يوم</span>
                    <span style={{ fontSize: '20px', fontWeight: 900, color: '#B45309' }}>
                      {summaryData?.expiringCount || 0} تشغيلة
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#B45309', marginTop: '6px' }}>
                    إجمالي القيمة المعرضة للخطر: <strong>{(summaryData?.expiringValue || 0).toFixed(2)} ج.م</strong>
                  </div>
                </div>

                <div style={{ background: '#FEE2E2', border: '1.5px solid #FCA5A5', borderRadius: '10px', padding: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, color: '#991B1B' }}>🚫 منتهية الصلاحية تماماً</span>
                    <span style={{ fontSize: '20px', fontWeight: 900, color: '#DC2626' }}>
                      {summaryData?.expiredCount || 0} تشغيلة
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#DC2626', marginTop: '6px' }}>
                    خسارة هالك محققة: <strong>{(summaryData?.expiredValue || 0).toFixed(2)} ج.م</strong>
                  </div>
                </div>
              </div>

              {/* جدول التشغيلات المنتهية الصلاحية */}
              {summaryData?.expiredBatches?.length > 0 && (
                <div style={{ marginBottom: '20px' }}>
                  <h5 style={{ margin: '0 0 8px 0', color: '#DC2626', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>🚫</span> أصناف منتهية الصلاحية (يجب إعدامها وتنزيلها من المخزون فوراً):
                  </h5>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {summaryData.expiredBatches.map((b) => (
                      <div
                        key={b.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          background: '#FFF1F2',
                          border: '1px solid #FECDD3',
                          borderRadius: '8px',
                          padding: '10px 14px',
                        }}
                      >
                        <div>
                          <span style={{ fontWeight: 700, color: '#9F1239' }}>{b.product_name}</span>
                          <div style={{ fontSize: '11px', color: '#E11D48', marginTop: '2px' }}>
                            رقم اللوت: <code>{b.batch_number || 'بدون'}</code> · انتهت في: <strong>{b.expiry_date}</strong> (منذ {b.days_expired} يوم)
                          </div>
                        </div>
                        <div style={{ textAlign: 'left' }}>
                          <span style={{ fontWeight: 800, color: '#E11D48' }}>{b.quantity} قطعة</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* جدول التشغيلات القريبة من الانتهاء */}
              <div>
                <h5 style={{ margin: '0 0 8px 0', color: '#92400E', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>⏳</span> أصناف تقترب من انتهاء الصلاحية (يمكن عمل عروض أو تخفيضات عليها):
                </h5>
                {summaryData?.expiringBatches?.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '20px', background: '#F8FAFC', borderRadius: '8px', color: '#10B981', fontWeight: 600 }}>
                    ✓ جميع تشغيلات المنتجات سارية ولا توجد أي سلع قريبة من الانتهاء خلال 30 يوم!
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {summaryData?.expiringBatches?.map((b) => (
                      <div
                        key={b.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          background: '#FFFBEB',
                          border: '1px solid #FDE68A',
                          borderRadius: '8px',
                          padding: '10px 14px',
                        }}
                      >
                        <div>
                          <span style={{ fontWeight: 700, color: '#92400E' }}>{b.product_name}</span>
                          <div style={{ fontSize: '11px', color: '#B45309', marginTop: '2px' }}>
                            لوت: <code>{b.batch_number || 'بدون'}</code> · تنتهي في: <strong>{b.expiry_date}</strong>
                          </div>
                        </div>
                        <div style={{ textAlign: 'left', display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <span style={{ background: '#F59E0B', color: '#fff', fontSize: '11px', padding: '2px 8px', borderRadius: '12px', fontWeight: 700 }}>
                            متبقي {b.days_remaining} يوم
                          </span>
                          <span style={{ fontWeight: 800, color: '#92400E' }}>{b.quantity} قطعة</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: تسجيل تشغيلة لوت جديدة */}
          {activeTab === 'add_batch' && (
            <form onSubmit={handleCreateBatch}>
              <div className="form-field-group">
                <label className="form-label">الصنف المرتبط من المخزن: <span className="req-star">*</span></label>
                <select
                  className="fox-lux-input"
                  value={batchForm.variant_id}
                  onChange={(e) => setBatchForm({ ...batchForm, variant_id: e.target.value })}
                  required
                >
                  <option value="">-- اختر صنفاً --</option>
                  {allVariants.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} ({v.barcode || v.sku || `ID: ${v.id}`})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '12px' }}>
                <div className="form-field-group">
                  <label className="form-label">رقم التشغيلة / اللوت (Lot Number):</label>
                  <input
                    type="text"
                    className="fox-lux-input"
                    placeholder="مثال: LOT-2026-X8"
                    value={batchForm.batch_number}
                    onChange={(e) => setBatchForm({ ...batchForm, batch_number: e.target.value })}
                  />
                </div>

                <div className="form-field-group">
                  <label className="form-label">الكمية الواردة: <span className="req-star">*</span></label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    className="fox-lux-input"
                    placeholder="مثال: 50"
                    value={batchForm.quantity}
                    onChange={(e) => setBatchForm({ ...batchForm, quantity: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-field-group">
                  <label className="form-label">تاريخ انتهاء الصلاحية (Expiry Date): <span className="req-star">*</span></label>
                  <input
                    type="date"
                    className="fox-lux-input"
                    value={batchForm.expiry_date}
                    onChange={(e) => setBatchForm({ ...batchForm, expiry_date: e.target.value })}
                    required
                  />
                </div>

                <div className="form-field-group">
                  <label className="form-label">تاريخ الإنتاج (Production Date):</label>
                  <input
                    type="date"
                    className="fox-lux-input"
                    value={batchForm.production_date}
                    onChange={(e) => setBatchForm({ ...batchForm, production_date: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-field-group">
                <label className="form-label">سعر الشراء للوحدة (اختياري):</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="fox-lux-input"
                  placeholder="سعر التكلفة"
                  value={batchForm.purchase_price}
                  onChange={(e) => setBatchForm({ ...batchForm, purchase_price: e.target.value })}
                />
              </div>

              <div className="form-field-group">
                <label className="form-label">ملاحظات التشغيلة:</label>
                <input
                  type="text"
                  className="fox-lux-input"
                  placeholder="مثال: فاتورة توريد رقم 102، ثلاجة 2"
                  value={batchForm.notes}
                  onChange={(e) => setBatchForm({ ...batchForm, notes: e.target.value })}
                />
              </div>

              <button
                type="submit"
                className="fox-btn-primary"
                style={{ width: '100%', marginTop: '12px', background: '#F59E0B', borderColor: '#F59E0B' }}
              >
                + حفظ التشغيلة في قاعدة البيانات
              </button>
            </form>
          )}

          {/* TAB 3: إعدادات ميزان الباركود الإلكتروني وأداة الاختبار الحية */}
          {activeTab === 'scale_config' && (
            <div>
              <form onSubmit={handleSaveScaleConfig} style={{ marginBottom: '24px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-field-group">
                    <label className="form-label">اسم إعداد الميزان:</label>
                    <input
                      type="text"
                      className="fox-lux-input"
                      value={scaleForm.name}
                      onChange={(e) => setScaleForm({ ...scaleForm, name: e.target.value })}
                      required
                    />
                  </div>

                  <div className="form-field-group">
                    <label className="form-label">بادئة الباركود (Prefix): <span className="req-star">*</span></label>
                    <input
                      type="text"
                      maxLength={3}
                      className="fox-lux-input"
                      placeholder="الشائع: 20 أو 21 أو 99"
                      value={scaleForm.prefix}
                      onChange={(e) => setScaleForm({ ...scaleForm, prefix: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-field-group">
                    <label className="form-label">طول كود الصنف (PLU Length):</label>
                    <select
                      className="fox-lux-input"
                      value={scaleForm.plu_length}
                      onChange={(e) => setScaleForm({ ...scaleForm, plu_length: Number(e.target.value) })}
                    >
                      <option value={4}>4 أرقام (مثال: 0142)</option>
                      <option value={5}>5 أرقام (القياسي الشائع: 00142)</option>
                      <option value={6}>6 أرقام</option>
                    </select>
                  </div>

                  <div className="form-field-group">
                    <label className="form-label">طريقة التشفير المطبوعة:</label>
                    <select
                      className="fox-lux-input"
                      value={scaleForm.encoding_type}
                      onChange={(e) => setScaleForm({ ...scaleForm, encoding_type: e.target.value })}
                    >
                      <option value="weight_grams">مشفر بالوزن (بالجرام) — الموصى به</option>
                      <option value="total_price">مشفر بالسعر الإجمالي (بالقروش/السنت)</option>
                    </select>
                  </div>
                </div>

                <button
                  type="submit"
                  className="fox-btn-primary"
                  style={{ width: '100%', marginTop: '6px', background: '#10B981', borderColor: '#10B981' }}
                >
                  ✓ حفظ إعدادات الميزان
                </button>
              </form>

              {/* أداة اختبار الباركود الحية */}
              <div style={{ background: '#F8FAFC', border: '1.5px dashed #CBD5E1', borderRadius: '10px', padding: '16px' }}>
                <h5 style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>🔬</span> أداة اختبار وتفكيك باركود الميزان الحية (Live Barcode Tester):
                </h5>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <input
                    type="text"
                    maxLength={13}
                    className="fox-lux-input"
                    style={{ flex: 1, letterSpacing: '1px', fontWeight: 700 }}
                    placeholder="امسح أو اكتب باركود الميزان المكون من 13 رقم (مثل 2000142003505)"
                    value={testBarcode}
                    onChange={(e) => setTestBarcode(e.target.value)}
                  />
                  <button
                    type="button"
                    className="fox-btn-secondary"
                    onClick={handleTestBarcode}
                    style={{ whiteSpace: 'nowrap' }}
                  >
                    🔍 فحص وتفكيك
                  </button>
                </div>

                {testResult && (
                  <div style={{ marginTop: '14px', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '12px' }}>
                    {testResult.error ? (
                      <span style={{ color: '#EF4444', fontWeight: 600 }}>❌ {testResult.error}</span>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', textAlign: 'center' }}>
                        <div>
                          <div style={{ fontSize: '11px', color: '#64748B' }}>كود الـ PLU:</div>
                          <div style={{ fontWeight: 800, color: '#0F172A', fontSize: '15px' }}>{testResult.pluCode}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '11px', color: '#64748B' }}>الوزن الصافي:</div>
                          <div style={{ fontWeight: 800, color: '#10B981', fontSize: '15px' }}>{testResult.weightKg} كجم</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '11px', color: '#64748B' }}>السعر الإجمالي:</div>
                          <div style={{ fontWeight: 800, color: '#3B82F6', fontSize: '15px' }}>{testResult.totalPrice} ج.م</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '11px', color: '#64748B' }}>الصنف المطابق:</div>
                          <div style={{ fontWeight: 700, color: testResult.variant ? '#10B981' : '#EF4444', fontSize: '13px' }}>
                            {testResult.variant ? testResult.variant.product_name : 'غير مسجل'}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
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
