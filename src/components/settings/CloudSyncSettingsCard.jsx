import { useEffect, useState } from 'react';
import { configureCloudSync, getCloudSyncStatus, syncCloudNow } from '../../api/settings.js';
import { normalizeErrorMessage } from '../../utils/normalizeError.js';

const formatTime = (iso) => (iso ? new Date(iso).toLocaleString('ar-EG') : '—');

// Uploads this desktop's sales, products and customers to erp-api so the mobile app can read them.
// The POS keeps working offline; missed rows go up once the connection is back.
export default function CloudSyncSettingsCard() {
  const [status, setStatus] = useState(null);
  const [baseUrl, setBaseUrl] = useState('');
  const [deviceKey, setDeviceKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);

  async function run(action, successText) {
    setBusy(true);
    setFeedback(null);
    try {
      const next = await action();
      setStatus(next);
      if (successText) setFeedback({ type: 'success', text: successText });
    } catch (error) {
      setFeedback({ type: 'error', text: normalizeErrorMessage(error, 'حصل خطأ') });
      getCloudSyncStatus().then(setStatus).catch(() => {});
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    getCloudSyncStatus()
      .then((s) => { setStatus(s); setBaseUrl(s?.baseUrl || ''); })
      .catch((error) => setFeedback({ type: 'error', text: normalizeErrorMessage(error, 'تعذر قراءة حالة المزامنة') }));
  }, []);

  return (
    <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', padding: '24px', boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}>
      <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#1E293B', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span>☁️</span> الربط مع تطبيق الموبايل
      </h3>
      <p style={{ color: '#64748B', fontSize: '13px', margin: '0 0 16px 0' }}>
        البرنامج بيرفع المبيعات والأصناف والعملاء للسيرفر كل دقيقة. لو النت فصل، البيع بيكمل عادي، والبيانات بتترفع أول ما النت يرجع.
      </p>

      <div style={{ display: 'grid', gap: '10px', marginBottom: '12px' }}>
        <input
          className="form-input"
          dir="ltr"
          placeholder="https://erp-api.onrender.com"
          aria-label="رابط السيرفر"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
        />
        <input
          className="form-input"
          dir="ltr"
          type="password"
          autoComplete="off"
          placeholder={status?.configured ? 'المفتاح محفوظ، اكتب مفتاح جديد لتغييره' : 'fsk_...'}
          aria-label="مفتاح الجهاز"
          value={deviceKey}
          onChange={(e) => setDeviceKey(e.target.value)}
        />
      </div>

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <button
          type="button"
          className="primary-btn"
          disabled={busy || !baseUrl.trim() || !deviceKey.trim()}
          onClick={() => run(async () => {
            const saved = await configureCloudSync({ baseUrl, deviceKey });
            setDeviceKey('');
            return saved;
          }, 'تم الحفظ، والرفع هيبدأ خلال دقيقة')}
        >
          حفظ
        </button>
        <button type="button" className="secondary-btn" disabled={busy || !status?.configured} onClick={() => run(syncCloudNow, 'تم الرفع')}>
          {busy ? 'جارٍ...' : 'ارفع دلوقتي'}
        </button>
        <button
          type="button"
          className="secondary-btn"
          disabled={busy || !status?.configured}
          onClick={() => run(() => configureCloudSync(null), 'تم إيقاف الربط')}
        >
          إيقاف الربط
        </button>
      </div>

      {status?.configured && (
        <p style={{ color: '#64748B', fontSize: '13px', marginTop: '12px' }}>
          آخر رفع ناجح: {formatTime(status.lastSuccessAt)} · صفوف آخر مرة: {status.lastPushed ?? 0}
          {status.lastError && <span style={{ color: '#DC2626', display: 'block' }}>آخر خطأ: {status.lastError}</span>}
        </p>
      )}
      {feedback && (
        <p role={feedback.type === 'error' ? 'alert' : 'status'} style={{ marginTop: '10px', color: feedback.type === 'error' ? '#DC2626' : '#16A34A' }}>
          {feedback.text}
        </p>
      )}
    </div>
  );
}
