import { useState, useRef, useEffect } from 'react';
import { useSettings } from '../contexts/SettingsContext.jsx';
import { normalizeBarcodeText } from '../hooks/useBarcodeScanner.js';
import { playSuccessBeep, playErrorBeep } from '../utils/beep.js';
import Modal from '../components/Modal.jsx';

const THEME_PRESETS = [
  { id: 'onyx_blue', name: 'أزرق كلاسيكي (ONYX Blue)', primary: '#2E5BFF', secondary: '#1D4ED8' },
  { id: 'emerald_green', name: 'زمردي فاخر (Emerald Luxury)', primary: '#059669', secondary: '#047857' },
  { id: 'imperial_violet', name: 'بنفسجي ملكي (Imperial Violet)', primary: '#7C3AED', secondary: '#6D28D9' },
  { id: 'royal_amber', name: 'ذهبي عنبر (Royal Amber Gold)', primary: '#D97706', secondary: '#B45309' },
  { id: 'ruby_crimson', name: 'ياقوتي جذاب (Ruby Crimson)', primary: '#E11D48', secondary: '#BE123C' },
  { id: 'modern_teal', name: 'فيروزي حديث (Modern Teal)', primary: '#0D9488', secondary: '#0F766E' },
  { id: 'midnight_navy', name: 'أزرق كحلي (Midnight Navy)', primary: '#2563EB', secondary: '#1E40AF' },
  { id: 'dark_slate', name: 'فحمي أونيكس (Dark Slate)', primary: '#475569', secondary: '#334155' },
];

function SettingsPage() {
  const { settings, saveSettings, uploadLogo, backupDatabase, restoreDatabase } = useSettings();

  const [formData, setFormData] = useState({
    store_name: '',
    store_tagline: '',
    store_phone: '',
    store_address: '',
    store_logo: '',
    receipt_footer: '',
    receipt_paper_size: '80mm',
    show_logo_on_receipt: '1',
    show_barcode_on_receipt: '1',
    show_cashier_name: '1',
    app_branding_mode: 'onyx_with_store',
    primary_color: '#2E5BFF',
    secondary_color: '#1D4ED8',
    theme_preset: 'onyx_blue',
  });

  const [saving, setSaving] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState(null);
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupError, setBackupError] = useState(null);
  const [restoreLoading, setRestoreLoading] = useState(false);

  // حالة اختبار وفحص قارئ الباركود
  const [testBarcode, setTestBarcode] = useState('');
  const [testResult, setTestResult] = useState(null);
  const [testLoading, setTestLoading] = useState(false);
  const testInputRef = useRef(null);

  // مزامنة إعدادات المحل من الـ Context إلى الفورم المحلي عند تغيرها
  useEffect(() => {
    if (settings) {
      setFormData({
        store_name: settings.store_name || 'بوتيك الفخامة',
        store_tagline: settings.store_tagline || '',
        store_phone: settings.store_phone || '',
        store_address: settings.store_address || '',
        store_logo: settings.store_logo || '',
        receipt_footer: settings.receipt_footer || 'الاستبدال والاسترجاع خلال 14 يوماً من تاريخ الشراء بالفاتورة الأصلية. شكراً لزيارتكم!',
        receipt_paper_size: settings.receipt_paper_size || '80mm',
        show_logo_on_receipt: settings.show_logo_on_receipt ?? '1',
        show_barcode_on_receipt: settings.show_barcode_on_receipt ?? '1',
        show_cashier_name: settings.show_cashier_name ?? '1',
        app_branding_mode: settings.app_branding_mode || 'onyx_with_store',
        primary_color: settings.primary_color || '#2E5BFF',
        secondary_color: settings.secondary_color || '#1D4ED8',
        theme_preset: settings.theme_preset || 'onyx_blue',
      });
    }
  }, [settings]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? (checked ? '1' : '0') : value,
    }));
  };

  const handleThemePreset = (preset) => {
    setFormData((prev) => ({
      ...prev,
      theme_preset: preset.id,
      primary_color: preset.primary,
      secondary_color: preset.secondary,
    }));
  };

  const handleSave = async (e) => {
    e?.preventDefault();
    setSaving(true);
    setFeedbackMsg(null);

    if (!/^#[0-9A-Fa-f]{6}$/.test(formData.primary_color) || !/^#[0-9A-Fa-f]{6}$/.test(formData.secondary_color)) {
      setSaving(false);
      setFeedbackMsg({ type: 'error', text: 'يرجى إدخال ألوان Hex صحيحة مثل #2E5BFF' });
      return;
    }

    const res = await saveSettings(formData);
    setSaving(false);

    if (res?.success) {
      setFeedbackMsg({ type: 'success', text: 'تم حفظ وتحديث إعدادات المحل والفاتورة بنجاح! ✨' });
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
        setFeedbackMsg({ type: 'success', text: 'تم تحديث شعار المحل بنجاح 🖼️' });
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

  const handleTestScan = async (code) => {
    const clean = normalizeBarcodeText(code);
    if (!clean) return;
    setTestLoading(true);
    try {
      const startTime = performance.now();
      const variant = await window.electronAPI.getProductByBarcode(clean);
      const elapsed = Math.round(performance.now() - startTime);

      if (variant) {
        playSuccessBeep();
        const res = {
          success: true,
          code: clean,
          product: variant,
          time: new Date().toLocaleTimeString('ar-EG'),
          lookupMs: elapsed,
        };
        setTestResult(res);
      } else {
        playErrorBeep();
        const res = {
          success: false,
          code: clean,
          time: new Date().toLocaleTimeString('ar-EG'),
          lookupMs: elapsed,
        };
        setTestResult(res);
      }
    } catch (err) {
      playErrorBeep();
      console.error('Barcode test error:', err);
    } finally {
      setTestLoading(false);
      setTestBarcode('');
    }
  };

  return (
    <div className="settings-page-wrapper" style={{ padding: '24px 32px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '26px', fontWeight: '800', color: '#0F172A', display: 'flex', alignItems: 'center', gap: '10px', margin: 0 }}>
            <span>⚙️</span> إعدادات المحل وتخصيص الفاتورة
          </h1>
          <p style={{ color: '#64748B', fontSize: '14px', margin: '4px 0 0 0' }}>
            تخصيص اسم وهوية المتجر، تصميم الإيصالات الحرارية، والنسخ الاحتياطي مع الحفاظ على هوية <strong>ONYX</strong>
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
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.35fr) minmax(360px, 0.95fr)', gap: '24px', alignItems: 'start' }}>
        
        {/* Left Column: Settings Cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Card 1: الهوية ومسمى المحل */}
          <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', padding: '24px', boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#1E293B', marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>🏢</span> هوية ومسمى المحل
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label" style={{ fontWeight: '700' }}>
                  اسم المحل التجاري <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <input
                  type="text"
                  name="store_name"
                  className="form-input form-input-lg"
                  placeholder="مثال: بوتيك الفخامة، محل براند ستور..."
                  value={formData.store_name}
                  onChange={handleChange}
                  required
                />
                <span className="form-helper">يظهر اسم المحل في الترويسة العليا، القائمة الجانبية، وأعلى الفواتير المطبوعة.</span>
              </div>

              <div className="form-group">
                <label className="form-label">الشعار اللفظي أو الوصف القصير (Tagline)</label>
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
                <label className="form-label">شعار المحل (Logo)</label>
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
                  <p style={{ margin: 0 }}>{backupError}</p>
                </Modal>
              )}
            </div>
          </div>

          {/* Card 2: هوية وألوان المتجر */}
          <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', padding: '24px', boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#1E293B', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>🎨</span> هوية وألوان المتجر
            </h3>
            <p style={{ color: '#64748B', fontSize: '12px', marginBottom: '16px' }}>
              اختر باقة جاهزة أو أدخل ألوان هوية المحل. ستظهر المعاينة فوراً، ويتم تطبيقها بعد الحفظ.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '10px' }}>
              {THEME_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleThemePreset(preset)}
                  style={{
                    textAlign: 'right',
                    padding: '10px',
                    borderRadius: '10px',
                    border: formData.theme_preset === preset.id ? `2px solid ${preset.primary}` : '1px solid #E2E8F0',
                    background: formData.theme_preset === preset.id ? `${preset.primary}12` : '#FFFFFF',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  <span style={{ display: 'flex', gap: '5px', marginBottom: '7px' }}>
                    <i style={{ width: '22px', height: '22px', borderRadius: '50%', background: preset.primary, display: 'block' }} />
                    <i style={{ width: '22px', height: '22px', borderRadius: '50%', background: preset.secondary, display: 'block' }} />
                  </span>
                  <span style={{ display: 'block', color: '#334155', fontSize: '11px', fontWeight: '700' }}>{preset.name}</span>
                </button>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '16px' }}>
              <label className="form-group">
                <span className="form-label">اللون الأساسي</span>
                <span style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input type="color" name="primary_color" value={formData.primary_color} onChange={(e) => setFormData((prev) => ({ ...prev, primary_color: e.target.value, theme_preset: 'custom' }))} style={{ width: '42px', height: '38px', padding: '2px', cursor: 'pointer' }} />
                  <input type="text" name="primary_color" className="form-input" value={formData.primary_color} onChange={(e) => setFormData((prev) => ({ ...prev, primary_color: e.target.value, theme_preset: 'custom' }))} maxLength={7} />
                </span>
              </label>
              <label className="form-group">
                <span className="form-label">اللون الثانوي</span>
                <span style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input type="color" name="secondary_color" value={formData.secondary_color} onChange={(e) => setFormData((prev) => ({ ...prev, secondary_color: e.target.value, theme_preset: 'custom' }))} style={{ width: '42px', height: '38px', padding: '2px', cursor: 'pointer' }} />
                  <input type="text" name="secondary_color" className="form-input" value={formData.secondary_color} onChange={(e) => setFormData((prev) => ({ ...prev, secondary_color: e.target.value, theme_preset: 'custom' }))} maxLength={7} />
                </span>
              </label>
            </div>
            <div style={{ marginTop: '16px', padding: '16px', borderRadius: '12px', background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
              <div style={{ fontSize: '12px', fontWeight: '700', color: '#475569', marginBottom: '10px' }}>معاينة الهوية</div>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                <button type="button" style={{ background: `linear-gradient(135deg, ${formData.primary_color}, ${formData.secondary_color})`, color: '#FFF', border: 0, borderRadius: '8px', padding: '9px 16px', fontFamily: 'inherit', fontWeight: '700' }}>إتمام البيع</button>
                <span style={{ background: formData.primary_color, color: '#FFF', borderRadius: '16px', padding: '6px 12px', fontSize: '12px', fontWeight: '700' }}>تصنيف نشط</span>
                <span style={{ color: formData.primary_color, fontSize: '20px' }}>🛒</span>
              </div>
            </div>
          </div>

          {/* Card 3: بيانات الاتصال وتذييل الفاتورة */}
          <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', padding: '24px', boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#1E293B', marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>🧾</span> بيانات الاتصال وسياسة الفاتورة
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

            <div className="form-group" style={{ marginTop: '12px' }}>
              <label className="form-label">تذييل الفاتورة وسياسة الاسترجاع والاستبدال</label>
              <textarea
                name="receipt_footer"
                className="form-input"
                rows="3"
                placeholder="الاستبدال والاسترجاع خلال 14 يوماً مع إحضار أصل الفاتورة..."
                value={formData.receipt_footer}
                onChange={handleChange}
              ></textarea>
              <span className="form-helper">تظهر هذه الرسالة أسفل كل إيصال مطبوع للزبون.</span>
            </div>
          </div>

          {/* Card 3: خيارات الطابعة والطباعة الحرارية */}
          <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', padding: '24px', boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#1E293B', marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>🖨️</span> خيارات الطابعة الحرارية
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">عرض ورق الفاتورة</label>
                <select
                  name="receipt_paper_size"
                  className="form-input"
                  value={formData.receipt_paper_size}
                  onChange={handleChange}
                >
                  <option value="80mm">80 ملم (العرض القياسي لطابعات الكاشير)</option>
                  <option value="58mm">58 ملم (المقاس الصغير والمحمول)</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '14px', background: '#F8FAFC', padding: '14px 18px', borderRadius: '12px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '13.5px', fontWeight: '600', color: '#334155' }}>
                <input
                  type="checkbox"
                  name="show_logo_on_receipt"
                  checked={formData.show_logo_on_receipt === '1'}
                  onChange={handleChange}
                  style={{ width: '16px', height: '16px', accentColor: '#2E5BFF' }}
                />
                <span>طباعة الشعار (Logo) في رأس الفاتورة</span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '13.5px', fontWeight: '600', color: '#334155' }}>
                <input
                  type="checkbox"
                  name="show_barcode_on_receipt"
                  checked={formData.show_barcode_on_receipt === '1'}
                  onChange={handleChange}
                  style={{ width: '16px', height: '16px', accentColor: '#2E5BFF' }}
                />
                <span>طباعة باركود الفاتورة في أسفل الإيصال للبحث السريع عند الإرجاع</span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '13.5px', fontWeight: '600', color: '#334155' }}>
                <input
                  type="checkbox"
                  name="show_cashier_name"
                  checked={formData.show_cashier_name === '1'}
                  onChange={handleChange}
                  style={{ width: '16px', height: '16px', accentColor: '#2E5BFF' }}
                />
                <span>إظهار اسم الكاشير ورقم الوردية على الإيصال</span>
              </label>
            </div>
          </div>

          {/* Card 4: النسخ الاحتياطي والأمان */}
          <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', padding: '24px', boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#1E293B', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>🛡️</span> النسخ الاحتياطي وأمان البيانات
            </h3>
            <p style={{ color: '#64748B', fontSize: '13px', margin: '0 0 16px 0' }}>
              احمِ بيانات المبيعات والمخزون وحسابات الموردين والعملاء بأخذ نسخ احتياطية دورية وحفظها على فلاشة ميموري.
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

          {/* Card 5: فحص واختبار قارئ الباركود */}
          <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', padding: '24px', boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#1E293B', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>📟</span> فحص واختبار قارئ الباركود (Barcode Scanner)
              </h3>
              <span style={{
                background: '#ECFDF5',
                border: '1px solid #A7F3D0',
                color: '#065F46',
                padding: '4px 12px',
                borderRadius: '20px',
                fontSize: '12px',
                fontWeight: '700',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10B981' }}></span>
                الوضع: لوحة مفاتيح HID (متصل وجاهز)
              </span>
            </div>

            <p style={{ color: '#64748B', fontSize: '13px', margin: '0 0 16px 0', lineHeight: '1.6' }}>
              قارئ الباركود يعمل مباشرة بمجرد توصيل كابل الـ USB أو دونجل اللاسلكي بدون تعريفات إضافية (Plug & Play). استخدم منطقة الاختبار أدناه للتأكد من سرعة استجابة القارئ ومطابقة المنتجات.
            </p>

            {/* Test Input Box */}
            <div style={{ background: '#F8FAFC', border: '2px dashed #CBD5E1', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
              <label style={{ display: 'block', fontWeight: '700', fontSize: '13.5px', color: '#334155', marginBottom: '8px' }}>
                🎯 منطقة الاختبار الحي: وجّه القارئ واضغط على أي باركود
              </label>

              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <input
                  ref={testInputRef}
                  type="text"
                  placeholder="انقر هنا ووجّه قارئ الباركود لأي منتج أو اكتب الكود واضغط Enter..."
                  value={testBarcode}
                  onChange={(e) => setTestBarcode(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleTestScan(testBarcode);
                    }
                  }}
                  style={{
                    flex: '1',
                    minWidth: '240px',
                    padding: '12px 16px',
                    borderRadius: '8px',
                    border: '1px solid #94A3B8',
                    fontSize: '14px',
                    fontFamily: 'monospace',
                    background: '#FFFFFF'
                  }}
                />
                <button
                  type="button"
                  className="primary-btn"
                  onClick={() => handleTestScan(testBarcode)}
                  disabled={testLoading || !testBarcode.trim()}
                  style={{ padding: '10px 18px', fontSize: '13.5px', fontWeight: '700' }}
                >
                  {testLoading ? 'جاري الفحص...' : 'فحص الكود 🔍'}
                </button>
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => {
                    playSuccessBeep();
                    setFeedbackMsg({ type: 'success', text: 'تم اختبار صوت التنبيه بنجاح 🔔' });
                  }}
                  style={{ padding: '10px 16px', fontSize: '13px' }}
                  title="تجربة صوت الصفارة التنبيهية"
                >
                  🔊 تجربة الصوت
                </button>
              </div>

              {/* Scan Result */}
              {testResult && (
                <div style={{
                  marginTop: '14px',
                  padding: '14px 16px',
                  borderRadius: '10px',
                  background: testResult.success ? '#F0FDF4' : '#FFFBEB',
                  border: `1px solid ${testResult.success ? '#86EFAC' : '#FDE68A'}`,
                  color: testResult.success ? '#166534' : '#92400E'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '800', fontSize: '14px' }}>
                      <span>{testResult.success ? '✅' : '⚠️'}</span>
                      <span>الكود المقروء: <code style={{ background: '#FFFFFF', padding: '2px 8px', borderRadius: '4px', border: '1px solid #CBD5E1' }}>{testResult.code}</code></span>
                    </div>
                    <span style={{ fontSize: '12px', color: '#64748B' }}>
                      زمن الاستجابة: {testResult.lookupMs} مللي ثانية ({testResult.time})
                    </span>
                  </div>

                  {testResult.success ? (
                    <div style={{ fontSize: '13px', marginTop: '6px', lineHeight: '1.6' }}>
                      <div>📦 <strong>اسم المنتج:</strong> {testResult.product.productName}</div>
                      <div>🎨 <strong>المقاس واللون:</strong> {testResult.product.size || 'عادي'} - {testResult.product.color || 'افتراضي'}</div>
                      <div>💰 <strong>سعر البيع:</strong> {testResult.product.selling_price} ج.م | <strong>المخزون المتاح:</strong> {testResult.product.stock_quantity} قطعة</div>
                    </div>
                  ) : (
                    <div style={{ fontSize: '12.5px', marginTop: '4px' }}>
                      القارئ يعمل ويرسل البيانات بشكل سليم تماماً! ولكن هذا الكود غير مسجل كباركود أو كود صنف (SKU) لأي منتج في متجرك حالياً. يمكنك ربطه بأي منتج من شاشة المنتجات.
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Practical Advice */}
            <div style={{ background: '#F1F5F9', borderRadius: '10px', padding: '12px 16px', fontSize: '12.5px', color: '#475569', lineHeight: '1.6' }}>
              <strong style={{ color: '#1E293B', display: 'block', marginBottom: '4px' }}>💡 نصائح وإرشادات هامة لقارئ الباركود:</strong>
              <ul style={{ margin: 0, paddingRight: '20px' }}>
                <li>تأكد من أن لغة لوحة المفاتيح في ويندوز تدعم الإدخال القياسي، علماً بأن النظام يقوم تلقائياً بتحويل الأرقام العربية إلى الإنجليزية.</li>
                <li>إذا كان القارئ لا يضيف المنتج فورياً في شاشة البيع، تأكد من برمجة القارئ على إرسال زر الإدخال <strong>(Enter / Carriage Return Suffix)</strong> بعد كل مسحة عبر مسح كود التفعيل من دليل الاستخدام المرفق مع القارئ.</li>
                <li>في شاشة البيع، يمكنك المسح في أي وقت وبدون الحاجة للضغط بالماوس داخل مربع البحث.</li>
              </ul>
            </div>
          </div>

        </div>

        {/* Right Column: Live Receipt Simulator Preview */}
        <div style={{ position: 'sticky', top: '24px' }}>
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
                {formData.receipt_paper_size}
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
                {formData.show_logo_on_receipt === '1' && formData.store_logo && (
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
                {formData.show_cashier_name === '1' && (
                  <div style={{ fontSize: '10px', color: '#64748B' }}>
                    الكاشير: أحمد (وردية #3)
                  </div>
                )}
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

                {formData.show_barcode_on_receipt === '1' && (
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
                )}
              </div>
            </div>

            {/* Note on ONYX Engine */}
            <div style={{ marginTop: '16px', textAlign: 'center', fontSize: '11.5px', color: '#94A3B8' }}>
              <span>⚡ مدعوم بمحرك نقاط البيع الذكي </span>
              <strong style={{ color: '#60A5FA' }}>ONYX POS Engine</strong>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

export default SettingsPage;
