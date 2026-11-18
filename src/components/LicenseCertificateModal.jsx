import { useState, useEffect } from 'react';
import * as licenseApi from '../api/license.js';
import './LicenseCertificateModal.css';

export default function LicenseCertificateModal({ isOpen, onClose, initialCertificate }) {
  const [cert, setCert] = useState(initialCertificate || null);
  const [loading, setLoading] = useState(!initialCertificate);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    if (initialCertificate) {
      setCert(initialCertificate);
      setLoading(false);
      return;
    }

    async function loadCert() {
      try {
        setLoading(true);
        if (licenseApi.getCertificate.isAvailable()) {
          const data = await licenseApi.getCertificate();
          setCert(data);
        }
      } catch (err) {
        console.error('Failed to load certificate:', err);
      } finally {
        setLoading(false);
      }
    }

    loadCert();
  }, [isOpen, initialCertificate]);

  if (!isOpen) return null;

  function handlePrint() {
    window.print();
  }

  function handleCopyDetails() {
    if (!cert) return;
    const text = `
=============================================
شهادة ترخيص رسمية - foxcloud POS
=============================================
رقم الشهادة: ${cert.certificateNumber}
اسم المنشأة: ${cert.storeName}
المدير المسؤول: ${cert.ownerName}
كود الجهاز (HWID): ${cert.hwid}
نوع الاشتراك: ${cert.planType}
تاريخ التفعيل: ${cert.activatedDateAr}
تاريخ الصلاحية: ${cert.expiryDateAr}
مفتاح التفعيل: ${cert.licenseKey}
التحقق السحابي: معتمد ومسجل على السحابة المركزية ✅
=============================================
`.trim();
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  }

  return (
    <div className="cert-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="cert-modal-wrapper" onClick={(e) => e.stopPropagation()}>
        {/* Modal Toolbar */}
        <div className="cert-modal-toolbar">
          <div className="cert-toolbar-actions">
            <button
              type="button"
              className="cert-btn cert-btn--primary"
              onClick={handlePrint}
              title="طباعة الشهادة أو حفظها بصيغة PDF"
            >
              <span>🖨️</span>
              <span>طباعة / حفظ PDF</span>
            </button>
            <button
              type="button"
              className="cert-btn cert-btn--secondary"
              onClick={handleCopyDetails}
              title="نسخ تفاصيل الشهادة"
            >
              <span>{copied ? '✅' : '📋'}</span>
              <span>{copied ? 'تم النسخ!' : 'نسخ البيانات'}</span>
            </button>
          </div>

          <button
            type="button"
            className="cert-btn cert-btn--close"
            onClick={onClose}
            aria-label="إغلاق"
          >
            ✕
          </button>
        </div>

        {/* Certificate Scroll Area */}
        <div className="cert-modal-scroll">
          {loading ? (
            <div style={{ padding: '60px', color: '#cbd5e1', textAlign: 'center' }}>
              جارٍ تحميل شهادة الترخيص المعتمدة...
            </div>
          ) : !cert ? (
            <div style={{ padding: '60px', color: '#f87171', textAlign: 'center' }}>
              تعذر استرجاع بيانات الشهادة. تأكد من تفعيل البرنامج أولاً.
            </div>
          ) : (
            <div className="license-certificate-document" id="printable-certificate">
              {/* Corner Ornaments */}
              <div className="cert-corner-ornament top-right" />
              <div className="cert-corner-ornament top-left" />
              <div className="cert-corner-ornament bottom-right" />
              <div className="cert-corner-ornament bottom-left" />

              <div className="cert-inner-frame">
                {/* Header */}
                <div className="cert-doc-header">
                  <div className="cert-doc-logo">
                    <span className="cert-logo-icon">🦊</span>
                    <span className="cert-logo-title">foxcloud Systems</span>
                  </div>
                  <h1 className="cert-doc-main-title">شهادة ترخيص واستخدام معتمدة</h1>
                  <p className="cert-doc-subtitle">Official Software License & Authentication Certificate</p>
                  <div className="cert-doc-number-badge">
                    {cert.certificateNumber}
                  </div>
                </div>

                {/* Details Body */}
                <div className="cert-doc-body">
                  <div className="cert-grid">
                    <div className="cert-field-card">
                      <span className="cert-field-label">اسم المنشأة / المتجر المعتمد:</span>
                      <span className="cert-field-value">{cert.storeName || 'غير محدد'}</span>
                    </div>

                    <div className="cert-field-card">
                      <span className="cert-field-label">اسم المالك / المدير المسؤول:</span>
                      <span className="cert-field-value">{cert.ownerName || 'المدير العام'}</span>
                    </div>

                    <div className="cert-field-card">
                      <span className="cert-field-label">نوع الاشتراك والترخيص:</span>
                      <span className="cert-field-value highlight-gold">{cert.planType}</span>
                    </div>

                    <div className="cert-field-card">
                      <span className="cert-field-label">رمز الجهاز المرخص (HWID):</span>
                      <span className="cert-field-value code-font">{cert.hwid}</span>
                    </div>

                    <div className="cert-field-card">
                      <span className="cert-field-label">تاريخ الإصدار والتفعيل:</span>
                      <span className="cert-field-value">{cert.activatedDateAr}</span>
                    </div>

                    <div className="cert-field-card">
                      <span className="cert-field-label">صلاحية الترخيص:</span>
                      <span className="cert-field-value">{cert.expiryDateAr}</span>
                    </div>

                    <div className="cert-field-card full-width">
                      <span className="cert-field-label">مفتاح التفعيل المشفر الرسمي (License Key):</span>
                      <span className="cert-field-value code-font">{cert.licenseKey}</span>
                    </div>
                  </div>
                </div>

                {/* Footer with Seal & Signatures */}
                <div className="cert-doc-footer">
                  <div className="cert-seal-badge">
                    <div className="cert-seal-circle">
                      🛡️
                    </div>
                    <div className="cert-seal-text">
                      <h5>اعتماد foxcloud السحابي</h5>
                      <p>● موثقة على السحابة المركزية</p>
                    </div>
                  </div>

                  <div className="cert-signature-area">
                    <div className="cert-signature-title">الاعتماد والختم الرقمي</div>
                    <div className="cert-signature-line">foxcloud Verified</div>
                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>{cert.verificationDomain}</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

