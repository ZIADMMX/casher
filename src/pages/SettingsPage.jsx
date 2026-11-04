import { useState, useEffect } from 'react';
import { useSettings } from '../contexts/SettingsContext.jsx';
import { useBusinessProfile } from '../contexts/BusinessProfileContext.jsx';
import Modal from '../components/Modal.jsx';

function SettingsPage() {
  const { settings, saveSettings, uploadLogo, backupDatabase, restoreDatabase } = useSettings();
  const { configuration } = useBusinessProfile();
  const isLawFirm = configuration?.profile?.key === 'law_firm';

  const [formData, setFormData] = useState({
    store_name: '',
    store_tagline: '',
    store_phone: '',
    store_address: '',
    store_logo: '',
    receipt_footer: '',
  });

  const [saving, setSaving] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState(null);
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupError, setBackupError] = useState(null);
  const [restoreLoading, setRestoreLoading] = useState(false);

  // مزامنة إعدادات المحل من الـ Context إلى الفورم المحلي عند تغيرها
  useEffect(() => {
    if (settings) {
      setFormData({
        store_name: settings.store_name || (isLawFirm ? 'مكتب المحاماة' : 'بوتيك الفخامة'),
        store_tagline: settings.store_tagline || '',
        store_phone: settings.store_phone || '',
        store_address: settings.store_address || '',
        store_logo: settings.store_logo || '',
        receipt_footer: settings.receipt_footer || 'الاستبدال والاسترجاع خلال 14 يوماً من تاريخ الشراء بالفاتورة الأصلية. شكراً لزيارتكم!',
      });
    }
  }, [isLawFirm, settings]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? (checked ? '1' : '0') : value,
    }));
  };

  const handleSave = async (e) => {
    e?.preventDefault();
    setSaving(true);
    setFeedbackMsg(null);

    const res = await saveSettings(formData);
    setSaving(false);

    if (res?.success) {
      setFeedbackMsg({
        type: 'success',
        text: isLawFirm ? 'تم حفظ بيانات مكتب المحاماة بنجاح! ✨' : 'تم حفظ وتحديث إعدادات المحل بنجاح! ✨',
      });
    } else {
      setFeedbackMsg({ type: 'error', text: res?.error || 'حدث خطأ أثناء حفظ الإعدادات' });
    }

    setTimeout(() => {
      setFeedbackMsg(null);
    }, 4000);
  };

  const handleUploadLogo = async () => {
    try {
      const res = await uploadLogo();
      if (res?.success && res?.dataUrl) {
        setFormData((prev) => ({ ...prev, store_logo: res.dataUrl }));
        setFeedbackMsg({
          type: 'success',
          text: isLawFirm ? 'تم تحديث شعار المكتب بنجاح 🖼️' : 'تم تحديث شعار المحل بنجاح 🖼️',
        });
      }
    } catch (err) {
      setFeedbackMsg({ type: 'error', text: err.message || 'فشل تحميل الشعار' });
    }
  };

  const handleRemoveLogo = () => {
    setFormData((prev) => ({ ...prev, store_logo: '' }));
  };

  const handleBackup = async () => {
    setBackupLoading(true);
    setBackupError(null);
    try {
      const res = await backupDatabase();
      if (res?.success) {
        setFeedbackMsg(null);
        setFeedbackMsg({
          type: 'success',
          text: `تم تصدير النسخة الاحتياطية بنجاح إلى: ${res.filePath || res.path} 💾`,
        });
      } else if (!res?.canceled) {
        setFeedbackMsg(null);
        setBackupError(res?.message || 'فشل النسخ الاحتياطي');
      }
    } catch (err) {
      setFeedbackMsg(null);
      setBackupError(err.message || 'فشل النسخ الاحتياطي');
    } finally {
      setBackupLoading(false);
    }
  };

  const retryBackup = async () => {
    setBackupError(null);
    await handleBackup();
  };

  const handleRestore = async () => {
    if (!window.confirm('تحذير هام: استعادة قاعدة البيانات ستستبدل البيانات الحالية ببيانات النسخة المختارة. هل أنت متأكد من المتابعة؟')) {
      return;
    }
    setRestoreLoading(true);
    try {
      const res = await restoreDatabase();
      if (res?.success) {
        setFeedbackMsg({ type: 'success', text: 'تمت استعادة قاعدة البيانات بنجاح! يرجى إعادة فحص الشاشات. 🔄' });
      }
    } catch (err) {
      setFeedbackMsg({ type: 'error', text: `فشل الاستعادة: ${err.message}` });
    } finally {
      setRestoreLoading(false);
    }
  };

  return (
    <div className="settings-page-wrapper" style={{ padding: '24px 32px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '26px', fontWeight: '800', color: '#0F172A', display: 'flex', alignItems: 'center', gap: '10px', margin: 0 }}>
            <span>⚙️</span> {isLawFirm ? 'إعدادات مكتب المحاماة' : 'إعدادات المحل وتخصيص الفاتورة'}
          </h1>
          <p style={{ color: '#64748B', fontSize: '14px', margin: '4px 0 0 0' }}>
            {isLawFirm
              ? <>تحديث بيانات المكتب وشعاره وإدارة النسخ الاحتياطي مع الحفاظ على هوية <strong>FOX.CLOUD</strong></>
              : <>تخصيص اسم وهوية المتجر، تصميم الإيصالات الحرارية، والنسخ الاحتياطي مع الحفاظ على هوية <strong>FOX.CLOUD</strong></>}
          </p>
        </div>

        <button
          type="button"
          className="primary-btn"
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: '12px 28px',
            fontSize: '15px',
            fontWeight: '700',
            borderRadius: '10px',
            boxShadow: '0 4px 14px rgba(46, 91, 255, 0.25)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            cursor: 'pointer'
          }}
        >
          {saving ? 'جاري الحفظ...' : '💾 حفظ التغييرات'}
        </button>
      </div>

      {/* Feedback Banner */}
      {feedbackMsg && (
        <div
          style={{
            padding: '14px 20px',
            borderRadius: '12px',
            marginBottom: '20px',
            fontWeight: '600',
            fontSize: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            background: feedbackMsg.type === 'success' ? '#DCFCE7' : '#FEE2E2',
            color: feedbackMsg.type === 'success' ? '#15803D' : '#B91C1C',
            border: `1px solid ${feedbackMsg.type === 'success' ? '#86EFAC' : '#FCA5A5'}`,
            animation: 'fadeIn 0.3s ease'
          }}
        >
          <span>{feedbackMsg.type === 'success' ? '✅' : '⚠️'}</span>
          <span>{feedbackMsg.text}</span>
        </div>
      )}

      {/* Main Grid Layout */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isLawFirm ? 'minmax(0, 1fr)' : 'minmax(0, 1.35fr) minmax(360px, 0.95fr)',
        gap: '24px',
        alignItems: 'start',
      }}>
        
        {/* Left Column: Settings Cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', gridColumn: isLawFirm ? '1 / -1' : undefined }}>
          
          {/* Card 1: الهوية ومسمى المحل */}
          <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', padding: '24px', boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#1E293B', marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>🏢</span> {isLawFirm ? 'هوية مكتب المحاماة' : 'هوية ومسمى المحل'}
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label" style={{ fontWeight: '700' }}>
                  {isLawFirm ? 'اسم مكتب المحاماة' : 'اسم المحل التجاري'} <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <input
                  type="text"
                  name="store_name"
                  className="form-input form-input-lg"
                  placeholder={isLawFirm ? 'مثال: مكتب الأستاذ / شركة المحاماة' : 'مثال: بوتيك الفخامة، محل براند ستور...'}
                  value={formData.store_name}
                  onChange={handleChange}
                  required
                />
                <span className="form-helper">
                  {isLawFirm
                    ? 'يظهر اسم المكتب في واجهة النظام والمستندات القانونية.'
                    : 'يظهر اسم المحل في الترويسة العليا، القائمة الجانبية، وأعلى الفواتير المطبوعة.'}
                </span>
              </div>

              <div className="form-group">
                <label className="form-label">{isLawFirm ? 'وصف المكتب' : 'الشعار اللفظي أو الوصف القصير (Tagline)'}</label>
                <input
                  type="text"
                  name="store_tagline"
                  className="form-input"
                  placeholder="مثال: أرقى صيحات الموضة والأزياء الرجالية والنسائية"
                  value={formData.store_tagline}
                  onChange={handleChange}
                />
              </div>

              {/* Logo Upload Section */}
              <div className="form-group">
                <label className="form-label">{isLawFirm ? 'شعار مكتب المحاماة' : 'شعار المحل (Logo)'}</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '18px', marginTop: '6px', background: '#F8FAFC', padding: '16px', borderRadius: '12px', border: '1px dashed #CBD5E1' }}>
                  <div style={{
                    width: '80px',
                    height: '80px',
                    borderRadius: '12px',
                    background: '#FFFFFF',
                    border: '1px solid #E2E8F0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                    flexShrink: 0
                  }}>
                    {formData.store_logo ? (
                      <img src={formData.store_logo} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    ) : (
                      <span style={{ fontSize: '32px' }}>🏪</span>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        className="secondary-btn"
                        onClick={handleUploadLogo}
                        style={{ padding: '8px 14px', fontSize: '13px' }}
                      >
                        📁 اختيار صورة الشعار
                      </button>
                      {formData.store_logo && (
                        <button
                          type="button"
                          className="danger-btn"
                          onClick={handleRemoveLogo}
                          style={{ padding: '8px 12px', fontSize: '13px', background: '#FEE2E2', color: '#DC2626', border: 'none' }}
                        >
                          🗑️ إزالة
                        </button>
                      )}
                    </div>
                    <span style={{ fontSize: '12px', color: '#64748B' }}>يفضل صورة مربعة PNG بخلفية شفافة</span>
                  </div>
                </div>
              </div>
              {backupError && (
                <Modal
                  title="فشل النسخ الاحتياطي"
                  onClose={() => setBackupError(null)}
                  actions={(
                    <>
                      <button type="button" className="secondary-btn" onClick={() => setBackupError(null)}>إغلاق</button>
                      <button type="button" className="primary-btn" onClick={retryBackup} disabled={backupLoading}>
                        {backupLoading ? 'جاري المحاولة...' : 'إعادة المحاولة'}
                      </button>
                    </>
                  )}
                >
                  <p style={{ margin: '0 0 12px 0', fontWeight: '600', color: '#DC2626' }}>{backupError}</p>
                  {(backupError.includes('full') || backupError.includes('ممتلئ')) && (
                    <div style={{ background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: '8px', padding: '12px', color: '#92400E', fontSize: '13px', lineHeight: '1.6' }}>
                      💡 <strong>نصيحة لحل المشكلة:</strong> مساحة القرص (C:) ممتلئة تقريباً على هذا الجهاز. عند فتح نافذة الحفظ، اختر حفظ الملف على <strong>القرص (D:)</strong> أو على <strong>فلاشة USB</strong> خارجية لتجنب امتلاء القرص.
                    </div>
                  )}
                </Modal>
              )}
            </div>
          </div>

          {/* Card 2: Contact and receipt policy */}
          <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', padding: '24px', boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#1E293B', marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>{isLawFirm ? '📇' : '🧾'}</span>
              {isLawFirm ? 'بيانات التواصل والعنوان' : 'بيانات الاتصال وسياسة الفاتورة'}
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">رقم الهاتف / واتساب</label>
                <input
                  type="text"
                  name="store_phone"
                  className="form-input"
                  placeholder="مثال: 01012345678"
                  value={formData.store_phone}
                  onChange={handleChange}
                />
              </div>

              <div className="form-group">
                <label className="form-label">العنوان بالتفصيل</label>
                <input
                  type="text"
                  name="store_address"
                  className="form-input"
                  placeholder="مثال: شارع الجمهورية - أمام مول النصر"
                  value={formData.store_address}
                  onChange={handleChange}
                />
              </div>
            </div>

            {!isLawFirm && (
              <div className="form-group" style={{ marginTop: '12px' }}>
                <label className="form-label">تذييل الفاتورة وسياسة الاسترجاع والاستبدال</label>
                <textarea
                  name="receipt_footer"
                  className="form-input"
                  rows="3"
                  placeholder="الاستبدال والاسترجاع خلال 14 يوماً مع إحضار أصل الفاتورة..."
                  value={formData.receipt_footer}
                  onChange={handleChange}
                />
                <span className="form-helper">تظهر هذه الرسالة أسفل كل إيصال مطبوع للزبون.</span>
              </div>
            )}
          </div>

          {/* Card 3: النسخ الاحتياطي والأمان */}
          <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', padding: '24px', boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#1E293B', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>🛡️</span> النسخ الاحتياطي وأمان البيانات
            </h3>
            <p style={{ color: '#64748B', fontSize: '13px', margin: '0 0 16px 0' }}>
              {isLawFirm
                ? 'احمِ بيانات القضايا والموكلين والمستندات بأخذ نسخ احتياطية دورية.'
                : 'احمِ بيانات المبيعات والمخزون وحسابات الموردين والعملاء بأخذ نسخ احتياطية دورية وحفظها على فلاشة ميموري.'}
            </p>

            <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="secondary-btn"
                onClick={handleBackup}
                disabled={backupLoading}
                style={{
                  padding: '12px 20px',
                  fontWeight: '700',
                  fontSize: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: '#F0FDF4',
                  borderColor: '#86EFAC',
                  color: '#166534',
                }}
              >
                <span>💾</span>
                {backupLoading ? 'جاري التصدير...' : 'تصدير نسخة احتياطية (.db)'}
              </button>

              <button
                type="button"
                className="secondary-btn"
                onClick={handleRestore}
                disabled={restoreLoading}
                style={{
                  padding: '12px 20px',
                  fontWeight: '700',
                  fontSize: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: '#FEF2F2',
                  borderColor: '#FECACA',
                  color: '#991B1B',
                }}
              >
                <span>🔄</span>
                {restoreLoading ? 'جاري الاستعادة...' : 'استعادة من نسخة سابقة'}
              </button>
            </div>
          </div>

        </div>

        {/* Receipt preview is only relevant to sectors that use POS receipts. */}
        {!isLawFirm && <div style={{ position: 'sticky', top: '24px' }}>
          <div style={{
            background: '#1E293B',
            borderRadius: '20px',
            padding: '20px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
            border: '1px solid #334155',
            color: '#F8FAFC'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '18px' }}>🧾</span>
                <span style={{ fontWeight: '800', fontSize: '15px' }}>معاينة حية لشكل الفاتورة</span>
              </div>
              <span style={{
                fontSize: '11px',
                background: '#0F172A',
                padding: '3px 8px',
                borderRadius: '6px',
                color: '#94A3B8',
                fontWeight: '700'
              }}>
                80mm
              </span>
            </div>

            {/* Receipt Simulation Paper */}
            <div style={{
              background: '#FFFFFF',
              color: '#000000',
              borderRadius: '10px',
              padding: '18px 14px',
              boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
              fontFamily: 'monospace',
              fontSize: '12px',
              lineHeight: '1.4'
            }}>
              {/* Header */}
              <div style={{ textAlign: 'center', borderBottom: '1px dashed #94A3B8', paddingBottom: '10px', marginBottom: '10px' }}>
                {formData.store_logo && (
                  <div style={{ marginBottom: '8px' }}>
                    <img src={formData.store_logo} alt="Logo" style={{ maxHeight: '45px', maxWidth: '120px', objectFit: 'contain' }} />
                  </div>
                )}
                <div style={{ fontWeight: '900', fontSize: '16px', fontFamily: 'Cairo, sans-serif' }}>
                  {formData.store_name || 'اسم المحل التجاري'}
                </div>
                {formData.store_tagline && (
                  <div style={{ fontSize: '11px', color: '#475569', fontFamily: 'Cairo, sans-serif' }}>
                    {formData.store_tagline}
                  </div>
                )}
                {formData.store_phone && (
                  <div style={{ fontSize: '11px', marginTop: '2px' }}>
                    📞 {formData.store_phone}
                  </div>
                )}
                {formData.store_address && (
                  <div style={{ fontSize: '10.5px', color: '#334155', fontFamily: 'Cairo, sans-serif', marginTop: '1px' }}>
                    📍 {formData.store_address}
                  </div>
                )}
                <div style={{ fontSize: '10.5px', marginTop: '6px', color: '#64748B' }}>
                  فاتورة #1042 • {new Date().toLocaleDateString('ar-EG')}
                </div>
                <div style={{ fontSize: '10px', color: '#64748B' }}>
                  الكاشير: أحمد (وردية #3)
                </div>
              </div>

              {/* Sample Items Table */}
              <div style={{ borderBottom: '1px dashed #94A3B8', paddingBottom: '8px', marginBottom: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '11px', borderBottom: '1px solid #E2E8F0', paddingBottom: '4px' }}>
                  <span>الصنف</span>
                  <span>الكمية</span>
                  <span>السعر</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginTop: '6px' }}>
                  <span>قميص كاجوال (L - أزرق)</span>
                  <span>1</span>
                  <span>350.00</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginTop: '4px' }}>
                  <span>بنطلون جينز (32 - أسود)</span>
                  <span>1</span>
                  <span>450.00</span>
                </div>
              </div>

              {/* Totals */}
              <div style={{ borderBottom: '1px dashed #94A3B8', paddingBottom: '8px', marginBottom: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '900', fontSize: '14px', fontFamily: 'Cairo, sans-serif' }}>
                  <span>الإجمالي المطلوب:</span>
                  <span>800.00 ج.م</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#475569', marginTop: '2px' }}>
                  <span>طريقة الدفع:</span>
                  <span>نقدي (كاش)</span>
                </div>
              </div>

              {/* Footer Policy & Barcode */}
              <div style={{ textAlign: 'center', paddingTop: '4px' }}>
                <p style={{ fontSize: '10.5px', fontFamily: 'Cairo, sans-serif', color: '#334155', margin: '4px 0 8px 0', whiteSpace: 'pre-wrap' }}>
                  {formData.receipt_footer || 'شكراً لزيارتكم!'}
                </p>

                <div style={{
                  background: '#F1F5F9',
                  padding: '6px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  letterSpacing: '3px',
                  fontWeight: 'bold',
                  border: '1px solid #E2E8F0'
                }}>
                  |||| || ||||| |||| |||
                  <div style={{ fontSize: '9px', letterSpacing: 'normal', color: '#64748B' }}>SALE-1042</div>
                </div>
              </div>
            </div>

            {/* Note on FOX.CLOUD Engine */}
            <div style={{ marginTop: '16px', textAlign: 'center', fontSize: '11.5px', color: '#94A3B8' }}>
              <span>⚡ مدعوم بمحرك نقاط البيع الذكي </span>
              <strong style={{ color: '#60A5FA' }}>FOX.CLOUD POS Engine</strong>
            </div>
          </div>
        </div>}

      </div>
    </div>
  );
}

export default SettingsPage;
