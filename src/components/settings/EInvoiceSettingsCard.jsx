import { useCallback, useEffect, useState } from 'react';
import {
  getEInvoiceConfig,
  saveEInvoiceConfig,
  getEInvoiceQueue,
  submitPendingEInvoices,
  resubmitEInvoiceDocument,
  getEInvoiceItemCodes,
  setEInvoiceItemCode,
} from '../../api/einvoice.js';
import { normalizeErrorMessage } from '../../utils/normalizeError.js';

const STATUS_LABELS = {
  pending: 'في الانتظار',
  submitted: 'قيد المراجعة',
  valid: 'مقبولة',
  invalid: 'غير صالحة',
  rejected: 'مرفوضة',
  cancelled: 'ملغاة',
  failed: 'فشل الإرسال',
};

const STATUS_COLORS = {
  pending: '#64748B',
  submitted: '#0369A1',
  valid: '#16A34A',
  invalid: '#DC2626',
  rejected: '#DC2626',
  cancelled: '#92400E',
  failed: '#DC2626',
};

const EMPTY_FORM = {
  enabled: false,
  documentKind: 'invoice',
  deviceSerial: '',
  environment: 'preprod',
  taxNumber: '',
  issuerName: '',
  branchId: '0',
  activityCode: '',
  governate: '',
  regionCity: '',
  street: '',
  buildingNumber: '',
  clientId: '',
  clientSecret: '',
  vatRate: '14',
  itemCodeType: 'EGS',
  defaultItemCode: '',
  signerPath: '',
};

const RETRYABLE = ['rejected', 'invalid', 'failed'];

const formatTime = (value) => (value ? new Date(value).toLocaleString('ar-EG') : '—');

// الفاتورة الإلكترونية المصرية: الإعدادات، وحالة كل فاتورة، وإعادة إرسال المرفوض.
export default function EInvoiceSettingsCard() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [config, setConfig] = useState(null);
  const [queue, setQueue] = useState({ documents: [], counts: {} });
  const [missingCodes, setMissingCodes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const applyConfig = useCallback((next) => {
    if (!next) return;
    setConfig(next);
    setForm((prev) => {
      const merged = { ...prev };
      for (const key of Object.keys(EMPTY_FORM)) {
        if (key === 'clientSecret' || next[key] == null) continue;
        merged[key] = key === 'enabled' ? Boolean(next[key]) : String(next[key]);
      }
      merged.clientSecret = '';
      return merged;
    });
  }, []);

  const refresh = useCallback(async () => {
    const next = await getEInvoiceQueue({ limit: 50 });
    setQueue({ documents: next?.documents || [], counts: next?.counts || {} });
    applyConfig(next?.config);
  }, [applyConfig]);

  useEffect(() => {
    getEInvoiceConfig().then(applyConfig).catch(() => {});
    refresh().catch(() => {});
  }, [applyConfig, refresh]);

  async function run(action, successText) {
    setBusy(true);
    setFeedback(null);
    try {
      await action();
      await refresh();
      if (successText) setFeedback({ type: 'success', text: successText });
    } catch (error) {
      setFeedback({ type: 'error', text: normalizeErrorMessage(error, 'حصل خطأ') });
      refresh().catch(() => {});
    } finally {
      setBusy(false);
    }
  }

  const change = (key) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const field = (key, label, placeholder, extra = {}) => (
    <div className="form-group" key={key}>
      <label className="form-label" htmlFor={`eta-${key}`}>{label}</label>
      <input
        id={`eta-${key}`}
        className="form-input"
        placeholder={placeholder}
        value={form[key]}
        onChange={change(key)}
        {...extra}
      />
    </div>
  );

  async function loadMissingCodes() {
    setMissingCodes(await getEInvoiceItemCodes({ onlyMissing: true, limit: 50 }));
  }

  return (
    <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', padding: '24px', boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}>
      <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#1E293B', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span>🧾</span> المستندات الإلكترونية (مصلحة الضرائب)
      </h3>
      <p style={{ color: '#64748B', fontSize: '13px', margin: '0 0 16px 0' }}>
        كل عملية بيع بتتسجل هنا وبتتبعت للمصلحة موقّعة بالتوكن. لو النت فصل بتفضل في الانتظار وتتبعت لوحدها أول ما يرجع.
        الأسعار في البرنامج تُعتبر <strong>شاملة</strong> ضريبة القيمة المضافة.
      </p>

      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', fontWeight: 700, color: '#1E293B' }}>
        <input type="checkbox" checked={form.enabled} onChange={change('enabled')} />
        تفعيل إرسال المستندات للمصلحة
      </label>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
        <div className="form-group">
          <label className="form-label" htmlFor="eta-documentKind">نظام التسجيل</label>
          <select id="eta-documentKind" className="form-input" value={form.documentKind} onChange={change('documentKind')}>
            <option value="invoice">فاتورة إلكترونية (بيع للشركات)</option>
            <option value="receipt">إيصال إلكتروني (كاشير وتجزئة)</option>
          </select>
          <span className="form-helper">اختر المنظومة اللي المنشأة مسجلة عليها عند المصلحة.</span>
        </div>
        {form.documentKind === 'receipt'
          && field('deviceSerial', 'الرقم المسلسل لنقطة البيع', 'POS-0001', { dir: 'ltr' })}
        <div className="form-group">
          <label className="form-label" htmlFor="eta-environment">البيئة</label>
          <select id="eta-environment" className="form-input" value={form.environment} onChange={change('environment')}>
            <option value="preprod">تجريبية (Pre-production)</option>
            <option value="production">إنتاج (Production)</option>
          </select>
        </div>
        {field('taxNumber', 'الرقم الضريبي', '123456789', { dir: 'ltr', inputMode: 'numeric' })}
        {field('issuerName', 'اسم المُصدِر كما في البطاقة الضريبية', 'شركة ...')}
        {field('branchId', 'كود الفرع', '0', { dir: 'ltr' })}
        {field('activityCode', 'كود النشاط', '4711', { dir: 'ltr', inputMode: 'numeric' })}
        {field('governate', 'المحافظة', 'القاهرة')}
        {field('regionCity', 'المدينة / المنطقة', 'مدينة نصر')}
        {field('street', 'الشارع', 'شارع الطيران')}
        {field('buildingNumber', 'رقم المبنى', '12', { dir: 'ltr' })}
        {field('vatRate', 'نسبة القيمة المضافة %', '14', { dir: 'ltr', inputMode: 'decimal' })}
        <div className="form-group">
          <label className="form-label" htmlFor="eta-itemCodeType">نوع كود الصنف</label>
          <select id="eta-itemCodeType" className="form-input" value={form.itemCodeType} onChange={change('itemCodeType')}>
            <option value="EGS">EGS (كود داخلي معتمد)</option>
            <option value="GS1">GS1</option>
          </select>
        </div>
        {field('defaultItemCode', 'كود الصنف الافتراضي', 'EG-123456789-001', { dir: 'ltr' })}
        {field('clientId', 'Client ID', '', { dir: 'ltr', autoComplete: 'off' })}
        {field(
          'clientSecret',
          'Client Secret',
          config?.hasClientSecret ? 'محفوظ — اكتب سرًا جديدًا لتغييره' : '',
          { dir: 'ltr', type: 'password', autoComplete: 'off' }
        )}
        {field('signerPath', 'أداة التوقيع على التوكن (مسار الملف)', 'C:\\eta\\sign.exe', { dir: 'ltr' })}
      </div>

      {config && !config.configValid && (
        <p role="status" style={{ color: '#B45309', fontSize: '13px', marginTop: '4px' }}>
          ناقص لتفعيل المنظومة: {(config.missingFields || []).join('، ')}
        </p>
      )}
      {config?.enabled && !config?.hasSigner && (
        <p role="status" style={{ color: '#B45309', fontSize: '13px', marginTop: '4px' }}>
          الفواتير بتتسجل بس مش بتتبعت: أداة التوقيع على التوكن غير محددة.
        </p>
      )}

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '12px' }}>
        <button
          type="button"
          className="primary-btn"
          disabled={busy}
          onClick={() => run(() => saveEInvoiceConfig(form), 'تم حفظ إعدادات الفاتورة الإلكترونية')}
        >
          حفظ الإعدادات
        </button>
        <button
          type="button"
          className="secondary-btn"
          disabled={busy || !config?.enabled}
          onClick={() => run(submitPendingEInvoices, 'تمت محاولة إرسال الفواتير المعلّقة')}
        >
          {busy ? 'جارٍ...' : 'ابعت المعلّق دلوقتي'}
        </button>
        <button type="button" className="secondary-btn" disabled={busy} onClick={() => run(loadMissingCodes)}>
          أصناف بغير كود ضريبي
        </button>
      </div>

      {missingCodes && (
        <div style={{ marginTop: '14px' }}>
          {missingCodes.length === 0 ? (
            <p style={{ color: '#16A34A', fontSize: '13px' }}>كل الأصناف لها كود ضريبي.</p>
          ) : (
            <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
              <caption style={{ textAlign: 'right', color: '#64748B', paddingBottom: '6px' }}>
                أصناف بغير كود ضريبي ({missingCodes.length}) — بتستخدم الكود الافتراضي لحد ما تتكوّد
              </caption>
              <tbody>
                {missingCodes.map((item) => (
                  <tr key={item.variantId}>
                    <td style={{ padding: '4px 0' }}>
                      {[item.productName, item.size, item.color].filter(Boolean).join(' ')}
                    </td>
                    <td style={{ padding: '4px 0', width: '220px' }}>
                      <input
                        className="form-input"
                        dir="ltr"
                        aria-label={`كود الصنف ${item.productName}`}
                        onBlur={(e) => {
                          const code = e.target.value.trim();
                          if (code) run(() => setEInvoiceItemCode(item.variantId, code).then(loadMissingCodes));
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '18px', fontSize: '13px' }}>
        {Object.entries(STATUS_LABELS).map(([key, label]) => (
          <span key={key} style={{ color: STATUS_COLORS[key], fontWeight: 700 }}>
            {label}: {queue.counts?.[key] ?? 0}
          </span>
        ))}
      </div>

      {queue.documents.length > 0 && (
        <table style={{ width: '100%', marginTop: '12px', fontSize: '13px', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ color: '#64748B', textAlign: 'right' }}>
              <th style={{ padding: '6px 0' }}>المستند</th>
              <th>النوع</th>
              <th>الإجمالي</th>
              <th>الحالة</th>
              <th>التاريخ</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {queue.documents.map((doc) => (
              <tr key={doc.id} style={{ borderTop: '1px solid #E2E8F0' }}>
                <td style={{ padding: '6px 0' }}>{doc.internal_id}</td>
                <td>{doc.document_kind === 'receipt' ? 'إيصال' : 'فاتورة'}</td>
                <td>{Number(doc.total_amount || 0).toFixed(2)}</td>
                <td style={{ color: STATUS_COLORS[doc.status], fontWeight: 700 }}>
                  {STATUS_LABELS[doc.status] || doc.status}
                  {doc.error_message && (
                    <span style={{ display: 'block', color: '#DC2626', fontWeight: 400 }}>{doc.error_message}</span>
                  )}
                </td>
                <td>{formatTime(doc.created_at)}</td>
                <td>
                  {RETRYABLE.includes(doc.status) && (
                    <button
                      type="button"
                      className="secondary-btn"
                      disabled={busy}
                      onClick={() => run(() => resubmitEInvoiceDocument(doc.id), 'تمت إعادة الإرسال')}
                    >
                      إعادة إرسال
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {feedback && (
        <p role={feedback.type === 'error' ? 'alert' : 'status'} style={{ marginTop: '10px', color: feedback.type === 'error' ? '#DC2626' : '#16A34A' }}>
          {feedback.text}
        </p>
      )}
    </div>
  );
}
