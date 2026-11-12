import { useEffect, useState } from 'react';
import eula from '../../../shared/eula.json';
import * as licenseApi from '../../api/license.js';
import LegalDocumentText, { fillPlaceholders, printLegalDocument } from '../LegalDocumentText.jsx';

const VALUES = {
  product_name: eula.productName,
  vendor_name: eula.vendor.name,
  vendor_phone: eula.vendor.phone,
  vendor_email: eula.vendor.email,
  vendor_address: eula.vendor.address,
};

const vendorNotFilled = Object.values(eula.vendor).some((value) => value.startsWith('('));

const formatTime = (iso) => (iso ? new Date(iso).toLocaleString('ar-EG') : null);

// عقد الاستخدام واتفاقية الاشتراك: القبول بيتسجل وقت التفعيل، والكارت ده
// بيعرض النص ويطبعه ويقول النسخة اللي اتقبلت وإمتى.
export default function EulaCard() {
  const [open, setOpen] = useState(false);
  const [acceptance, setAcceptance] = useState(null);

  useEffect(() => {
    if (!licenseApi.getLicenseAgreement.isAvailable()) return;
    licenseApi.getLicenseAgreement()
      .then((data) => setAcceptance({ version: data?.acceptedVersion, at: data?.acceptedAt }))
      .catch(() => {});
  }, []);

  function print() {
    printLegalDocument({
      title: `${eula.title} — ${eula.productName}`,
      subtitle: `نسخة ${eula.version} · آخر تحديث ${eula.updatedAt}`,
      sections: eula.sections,
      values: VALUES,
      footer: `<div class="box"><p>${fillPlaceholders(eula.acceptanceText, VALUES)}</p>
        <p>اسم المنشأة: ............................ التوقيع: ............................ التاريخ: ....../....../..........</p></div>`,
    });
  }

  return (
    <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', padding: '24px', boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}>
      <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#1E293B', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span>📄</span> عقد الاستخدام واتفاقية الاشتراك
      </h3>
      <p style={{ color: '#64748B', fontSize: '13px', margin: '0 0 12px 0' }}>
        الشروط اللي بيتباع بيها البرنامج: حق الاستخدام، التجديد، ومسؤولية كل طرف عن البيانات.
        القبول بيتسجل وقت تفعيل البرنامج.
      </p>

      <p style={{ color: '#B45309', fontSize: '13px', margin: '0 0 12px 0' }}>{eula.disclaimer}</p>

      {vendorNotFilled && (
        <p role="status" style={{ color: '#B45309', fontSize: '13px', margin: '0 0 12px 0' }}>
          بيانات الجهة البايعة لسه فاضية في <code>shared/eula.json</code>، فالعقد هيتطبع بأقواس بدل الاسم.
        </p>
      )}

      <p style={{ color: '#334155', fontSize: '13px', margin: '0 0 12px 0' }}>
        {acceptance?.version
          ? `اتقبل العقد نسخة ${acceptance.version} يوم ${formatTime(acceptance.at) || '—'}.`
          : 'لسه مفيش قبول مسجل على النسخة دي — بيتسجل أول ما تفعّل البرنامج بمفتاح.'}
      </p>

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <button type="button" className="secondary-btn" onClick={() => setOpen((value) => !value)}>
          {open ? 'إخفاء نص العقد' : 'اقرا نص العقد'}
        </button>
        <button type="button" className="secondary-btn" onClick={print}>
          اطبع العقد ونموذج التوقيع
        </button>
      </div>

      {open && (
        <>
          <p style={{ color: '#64748B', fontSize: '13px', marginTop: '14px' }}>
            نسخة {eula.version} · آخر تحديث {eula.updatedAt}
          </p>
          <LegalDocumentText sections={eula.sections} values={VALUES} style={{ maxHeight: '420px', overflowY: 'auto' }} />
        </>
      )}
    </div>
  );
}
