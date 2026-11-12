import { useMemo, useState } from 'react';
import policy from '../../../shared/privacyPolicy.json';
import { useSettings } from '../../contexts/SettingsContext.jsx';
import LegalDocumentText, { fillPlaceholders, printLegalDocument } from '../LegalDocumentText.jsx';

// سياسة الخصوصية ونص الموافقة (قانون 151/2020): المحل محتاج يعرضهم للعميل
// ويطبعهم، والنص الواحد ده هو نفسه اللي نسخته بتتسجل مع موافقة كل عميل.
export default function PrivacyPolicyCard() {
  const { settings } = useSettings();
  const [open, setOpen] = useState(false);

  // بيانات المحل بتتملى في نص السياسة، عشان الورقة اللي بتعلّقها للعميل تبقى باسمك.
  const store = useMemo(() => ({
    store_name: settings?.store_name?.trim() || '(اسم المحل — املاه في إعدادات المحل فوق)',
    store_phone: settings?.store_phone?.trim() || '(رقم التليفون — املاه في إعدادات المحل فوق)',
    store_address: settings?.store_address?.trim() || '(العنوان — املاه في إعدادات المحل فوق)',
  }), [settings]);

  const missingStoreData = !settings?.store_name?.trim()
    || !settings?.store_phone?.trim()
    || !settings?.store_address?.trim();

  function printPolicy() {
    printLegalDocument({
      title: `سياسة الخصوصية — ${store.store_name}`,
      subtitle: `${policy.law} · نسخة ${policy.version} · آخر تحديث ${policy.updatedAt}`,
      sections: policy.sections,
      values: store,
      footer: `<div class="box"><h2>نص الموافقة</h2><p>${fillPlaceholders(policy.consentText, store)}</p>
        <p>الاسم: ............................ التوقيع: ............................ التاريخ: ....../....../..........</p></div>`,
    });
  }

  return (
    <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', padding: '24px', boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}>
      <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#1E293B', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span>🔒</span> سياسة الخصوصية وموافقة العملاء
      </h3>
      <p style={{ color: '#64748B', fontSize: '13px', margin: '0 0 12px 0' }}>
        {policy.law}. البرنامج بيحتفظ بأسماء وتليفونات عملائك وبيبعتلهم رسائل، وده بيلزمك
        بسياسة مكتوبة معروضة للعميل وبموافقة متسجلة قبل أي رسالة تسويقية.
      </p>

      <p style={{ color: '#B45309', fontSize: '13px', margin: '0 0 12px 0' }}>
        {policy.disclaimer}
      </p>

      {missingStoreData && (
        <p role="status" style={{ color: '#B45309', fontSize: '13px', margin: '0 0 12px 0' }}>
          اكتب اسم المحل والتليفون والعنوان في «إعدادات المحل» فوق، عشان يظهروا في السياسة المطبوعة.
        </p>
      )}

      <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '14px', marginBottom: '12px' }}>
        <strong style={{ display: 'block', marginBottom: '6px', color: '#1E293B' }}>نص الموافقة (اقراه للعميل قبل ما تسجّل موافقته)</strong>
        <span style={{ color: '#334155', fontSize: '13px', lineHeight: 1.9 }}>{fillPlaceholders(policy.consentText, store)}</span>
      </div>

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <button type="button" className="secondary-btn" onClick={() => setOpen((value) => !value)}>
          {open ? 'إخفاء نص السياسة' : 'اقرا نص السياسة'}
        </button>
        <button type="button" className="secondary-btn" onClick={printPolicy}>
          اطبع السياسة ونموذج الموافقة
        </button>
      </div>

      {open && (
        <div style={{ marginTop: '14px' }}>
          <p style={{ color: '#64748B', fontSize: '13px' }}>نسخة {policy.version} · آخر تحديث {policy.updatedAt}</p>
          <LegalDocumentText sections={policy.sections} values={store} style={{ maxHeight: '420px', overflowY: 'auto' }} />
        </div>
      )}
    </div>
  );
}
