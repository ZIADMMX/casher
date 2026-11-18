import { useState, useEffect } from 'react';
import * as licenseApi from '../../api/license.js';
import LicenseCertificateModal from '../LicenseCertificateModal.jsx';

export default function LicenseCertificateCard() {
  const [cert, setCert] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [message, setMessage] = useState(null);

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

  useEffect(() => {
    loadCert();
  }, []);

  async function handleSyncCloud() {
    try {
      setSyncing(true);
      setMessage(null);
      if (licenseApi.syncCertificate.isAvailable()) {
        const res = await licenseApi.syncCertificate();
        if (res.success) {
          setMessage({ type: 'success', text: 'تم توثيق وحفظ الشهادة في السحابة المركزية بنجاح ✅' });
          if (res.certificate) setCert(res.certificate);
        } else {
          setMessage({ type: 'error', text: res.error || 'فشلت المزامنة مع السحابة' });
        }
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'تعذر الاتصال بالسحابة' });
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', padding: '24px', boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#1E293B', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>📜</span> شهادة الترخيص والاشتراك الرسمية
        </h3>
        {cert?.isActivated ? (
          <span style={{ background: '#DCFCE7', color: '#166534', padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold' }}>
            ✓ ترخيص نشط وموثق
          </span>
        ) : (
          <span style={{ background: '#FEF3C7', color: '#92400E', padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold' }}>
            نسخة تجريبية
          </span>
        )}
      </div>

      <p style={{ color: '#64748B', fontSize: '13px', margin: '0 0 16px 0' }}>
        شهادة الترخيص الرسمية المعتمدة لمتجرك والمحفوظة على السحابة المركزية (Cloudflare D1)، تثبت حقك القانوني والرسمي في تشغيل النسخة وملكيتها.
      </p>

      {message && (
        <div style={{
          padding: '10px 14px',
          borderRadius: '8px',
          marginBottom: '14px',
          fontSize: '13px',
          background: message.type === 'success' ? '#ECFDF5' : '#FEF2F2',
          color: message.type === 'success' ? '#065F46' : '#991B1B',
          border: `1px solid ${message.type === 'success' ? '#A7F3D0' : '#FECACA'}`
        }}>
          {message.text}
        </div>
      )}

      {cert && (
        <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '14px', marginBottom: '16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
          <div>
            <span style={{ fontSize: '11px', color: '#64748B', display: 'block' }}>رقم الشهادة:</span>
            <strong style={{ fontSize: '12px', color: '#0F172A', fontFamily: 'monospace' }}>{cert.certificateNumber}</strong>
          </div>
          <div>
            <span style={{ fontSize: '11px', color: '#64748B', display: 'block' }}>نوع الاشتراك:</span>
            <strong style={{ fontSize: '13px', color: '#B45309' }}>{cert.planType}</strong>
          </div>
          <div>
            <span style={{ fontSize: '11px', color: '#64748B', display: 'block' }}>كود الجهاز (HWID):</span>
            <strong style={{ fontSize: '12px', color: '#4F46E5', fontFamily: 'monospace' }}>{cert.hwid}</strong>
          </div>
          <div>
            <span style={{ fontSize: '11px', color: '#64748B', display: 'block' }}>تاريخ الإصدار:</span>
            <strong style={{ fontSize: '13px', color: '#334155' }}>{cert.activatedDateAr}</strong>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <button
          type="button"
          className="primary-btn"
          onClick={() => setShowModal(true)}
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <span>📜</span>
          <span>عرض وتحميل شهادة الترخيص (PDF)</span>
        </button>

        <button
          type="button"
          className="secondary-btn"
          onClick={handleSyncCloud}
          disabled={syncing}
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <span>☁️</span>
          <span>{syncing ? 'جارٍ الحفظ في السحابة...' : 'توثيق الشهادة في السحابة'}</span>
        </button>
      </div>

      <LicenseCertificateModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        initialCertificate={cert}
      />
    </div>
  );
}
