import { useState, useEffect } from 'react';
import * as settingsApi from '../../api/settings.js';

// Copy of the daily backup on a USB stick or another drive, so a dead disk does not lose the shop's data.
export default function ExternalBackupCard() {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  async function load() {
    try {
      if (settingsApi.getExternalBackupStatus.isAvailable()) {
        setStatus(await settingsApi.getExternalBackupStatus());
      }
    } catch {
      setStatus(null); // admin only: hide the card for everyone else
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleChoose() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await settingsApi.chooseExternalBackupFolder();
      if (res?.canceled) return;
      if (res?.copy?.success) setMessage({ type: 'success', text: 'تم حفظ نسخة في المكان ده ✅ وهتتعمل نسخة كل يوم.' });
      else setMessage({ type: 'error', text: 'اتحفظ المكان، بس النسخة الأولى فشلت. اتأكد إن الفلاشة متوصلة وفيها مساحة.' });
      if (res?.status) setStatus(res.status);
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'تعذر اختيار المجلد' });
    } finally {
      setBusy(false);
    }
  }

  async function handleClear() {
    setBusy(true);
    setMessage(null);
    try {
      setStatus(await settingsApi.clearExternalBackupFolder());
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'تعذر الإيقاف' });
    } finally {
      setBusy(false);
    }
  }

  if (!status) return null;

  const lastText = status.lastAt
    ? new Date(status.lastAt).toLocaleString('ar-EG')
    : 'لم تتم أي نسخة خارجية بعد';
  const badge = !status.configured
    ? { bg: '#FEE2E2', color: '#991B1B', text: 'غير مفعّل' }
    : !status.available
      ? { bg: '#FEF3C7', color: '#92400E', text: 'المكان غير متاح' }
      : status.stale
        ? { bg: '#FEF3C7', color: '#92400E', text: 'متأخرة' }
        : { bg: '#DCFCE7', color: '#166534', text: '✓ شغالة' };

  return (
    <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', padding: '24px', boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#1E293B', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>💾</span> النسخ الاحتياطي الخارجي
        </h3>
        <span style={{ background: badge.bg, color: badge.color, padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold' }}>
          {badge.text}
        </span>
      </div>

      <p style={{ color: '#64748B', fontSize: '13px', margin: '0 0 16px 0' }}>
        البرنامج بياخد نسخة كل يوم على نفس الجهاز. اختار فلاشة أو هارد تاني عشان تتحفظ نسخة كمان بره الجهاز، فلو الهارد باظ أو الجهاز اتسرق بياناتك متضيعش.
      </p>

      <div style={{ fontSize: '13px', color: '#334155', display: 'grid', gap: '6px', marginBottom: '16px' }}>
        <div><strong>المكان:</strong> {status.folder || '—'}</div>
        <div><strong>آخر نسخة خارجية:</strong> {lastText}</div>
      </div>

      {message && (
        <div style={{
          padding: '10px 14px',
          borderRadius: '8px',
          marginBottom: '14px',
          fontSize: '13px',
          background: message.type === 'success' ? '#ECFDF5' : '#FEF2F2',
          color: message.type === 'success' ? '#065F46' : '#991B1B',
          border: `1px solid ${message.type === 'success' ? '#A7F3D0' : '#FECACA'}`,
        }}>
          {message.text}
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px' }}>
        <button type="button" className="primary-btn" onClick={handleChoose} disabled={busy}>
          {busy ? 'جاري الحفظ...' : status.configured ? 'تغيير المكان' : 'اختيار فلاشة أو مجلد'}
        </button>
        {status.configured && (
          <button type="button" className="secondary-btn" onClick={handleClear} disabled={busy}>
            إيقاف
          </button>
        )}
      </div>
    </div>
  );
}
