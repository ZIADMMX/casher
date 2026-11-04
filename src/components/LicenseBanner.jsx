import { useState } from 'react';
import { normalizeErrorMessage } from '../utils/normalizeError';

function LicenseBanner({ status, onActivateSuccess }) {
  const [showModal, setShowModal] = useState(false);
  const [serialKey, setSerialKey] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!status || !status.isTrial || status.isExpired) return null;

  function handleCopyHwid() {
    navigator.clipboard.writeText(status.hwid);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  }

  async function handleActivate(e) {
    e.preventDefault();
    setError('');
    if (!serialKey.trim()) return;

    setLoading(true);
    try {
      if (window.electronAPI?.activateSoftware) {
        const result = await window.electronAPI.activateSoftware(serialKey.trim());
        if (result?.success) {
          onActivateSuccess(result.status);
          setShowModal(false);
        }
      }
    } catch (err) {
      const friendlyMessage = normalizeErrorMessage(err);
      setError(friendlyMessage || 'مفتاح التفعيل غير صحيح. تأكد من صحة المفتاح ثم حاول مرة أخرى.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="license-trial-banner">
        <div className="license-trial-info">
          <span className="license-trial-badge">⏳ النسخة التجريبية</span>
          {status.warning ? (
            <strong role="alert">تحذير: تنتهي الفترة التجريبية خلال {status.remainingDays === 1 ? 'يوم واحد' : 'يومين'}. فعّل النظام قبل انتهائها؛ ستظل بيانات المتجر محفوظة.</strong>
          ) : (
            <span>متبقي <strong>{status.remainingDays} يوماً</strong> على انتهاء الفترة التجريبية (14 يوماً)</span>
          )}
        </div>
        <button
          type="button"
          className="license-banner-activate-btn"
          onClick={() => setShowModal(true)}
        >
          🔑 تفعيل النسخة الآن
        </button>
      </div>

      {showModal && (
        <div className="license-modal-backdrop" onClick={() => setShowModal(false)}>
          <div className="license-modal-card" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="license-modal-header">
              <div className="license-modal-icon-badge">
                <span>🔑</span>
              </div>
              <div className="license-modal-title-wrap">
                <h3 className="license-modal-title">تفعيل كاشير POS</h3>
                <p className="license-modal-subtitle">أدخل مفتاح التفعيل لفتح البرنامج بشكل دائم وموثق</p>
              </div>
              <button
                type="button"
                className="license-modal-close"
                onClick={() => setShowModal(false)}
                title="إغلاق"
              >
                ✕
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleActivate} className="license-modal-form">
              <div className="license-modal-content">
                {error && (
                  <div className="license-modal-error">
                    <span>⚠️</span>
                    <span>{error}</span>
                  </div>
                )}

                {/* Machine ID Box */}
                <div className="license-hwid-panel">
                  <div className="license-hwid-header">
                    <span>💻</span>
                    <span>معرّف جهازك الخاص (Machine ID):</span>
                  </div>
                  <div className="license-hwid-display">
                    <code className="hwid-code-text">{status.hwid}</code>
                    <button
                      type="button"
                      className={`hwid-copy-action ${copied ? 'copied' : ''}`}
                      onClick={handleCopyHwid}
                    >
                      {copied ? '✓ تم النسخ' : '📋 نسخ الرمز'}
                    </button>
                  </div>
                  <p className="hwid-help-note">
                    انسخ هذا المعرّف وأرسله للمطور لاستخراج مفتاح التفعيل المناسب لجهازك.
                  </p>
                </div>

                {/* Serial Key Input */}
                <div className="license-input-panel">
                  <label htmlFor="modal-serial-key" className="license-input-label">
                    <span>🔐 أدخل مفتاح التفعيل (Serial Key):</span>
                  </label>
                  <input
                    id="modal-serial-key"
                    type="text"
                    className="license-key-textbox"
                    placeholder="KASH-XXXX-XXXX-XXXX"
                    value={serialKey}
                    onChange={(e) => setSerialKey(e.target.value)}
                    required
                    autoFocus
                    spellCheck="false"
                    autoComplete="off"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="license-modal-actions">
                <button
                  type="button"
                  className="license-btn-cancel"
                  onClick={() => setShowModal(false)}
                  disabled={loading}
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="license-btn-submit"
                  disabled={loading || !serialKey.trim()}
                >
                  {loading ? '⏳ جاري التفعيل...' : '🚀 تفعيل البرنامج الآن'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

export default LicenseBanner;
