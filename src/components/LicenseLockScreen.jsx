import { useState } from 'react';
import { normalizeErrorMessage } from '../utils/normalizeError';
import * as licenseApi from '../api/license.js';

function LicenseLockScreen({ hwid, error: verificationError, onRetry, onActivateSuccess }) {
  const [serialKey, setSerialKey] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function handleCopyHwid() {
    navigator.clipboard.writeText(hwid);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  }

  async function handleActivate(e) {
    e.preventDefault();
    setError('');
    if (!serialKey.trim()) {
      setError('الرجاء إدخال مفتاح التفعيل');
      return;
    }

    setLoading(true);
    try {
      if (licenseApi.activateSoftware.isAvailable()) {
        const result = await licenseApi.activateSoftware(serialKey.trim());
        if (result?.success) {
          onActivateSuccess(result.status);
        }
      }
    } catch (err) {
      const friendlyMessage = normalizeErrorMessage(err);
      setError(friendlyMessage || 'مفتاح التفعيل غير صحيح. تأكد من صحة المفتاح المخصص لجهازك.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="license-lock-screen">
      <div className="license-lock-box">
        <div className="license-lock-header">
          <div className="license-lock-icon">🔒</div>
          <h2>{verificationError ? 'تعذر التحقق من وقت الترخيص' : 'انتهت الفترة التجريبية (14 يوماً)'}</h2>
          <p>{verificationError
            ? 'اتصل بالإنترنت ثم أعد المحاولة. لن تُحذف بيانات المتجر.'
            : 'يرجى تفعيل البرنامج بواسطة مفتاح التفعيل الخاص بك لمتابعة الاستخدام. بيانات المتجر محفوظة.'}</p>
        </div>

        <div className="license-modal-content" style={{ padding: '24px 28px' }}>
          {error && (
            <div className="license-modal-error">
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          {verificationError && (
            <div className="license-modal-error" role="alert">
              <span>⚠️</span>
              <span>{verificationError}</span>
            </div>
          )}

          {verificationError && (
            <button type="button" className="license-btn-submit" onClick={onRetry} disabled={loading}>
              إعادة التحقق من وقت الخادم
            </button>
          )}

          {/* Machine ID */}
          <div className="license-hwid-panel">
            <div className="license-hwid-header">
              <span>💻</span>
              <span>معرّف جهازك الفريد (Machine ID):</span>
            </div>
            <div className="license-hwid-display">
              <code className="hwid-code-text">{hwid || '---'}</code>
              <button
                type="button"
                className={`hwid-copy-action ${copied ? 'copied' : ''}`}
                onClick={handleCopyHwid}
                disabled={!hwid}
              >
                {copied ? '✓ تم النسخ' : '📋 نسخ الرمز'}
              </button>
            </div>
            <p className="hwid-help-note">
              أرسل هذا الرمز للمطور لاستلام مفتاح التفعيل المعتمد الخاص بهذا الجهاز.
            </p>
          </div>

          <form onSubmit={handleActivate} className="license-modal-form" style={{ marginTop: '8px' }}>
            <div className="license-input-panel">
              <label htmlFor="serial-key-input" className="license-input-label">
                <span>🔐 أدخل مفتاح التفعيل (Serial Key):</span>
              </label>
              <input
                id="serial-key-input"
                type="text"
                className="license-key-textbox"
                placeholder="مثال: KASH-7F89B2AC-365D-A4F89B12"
                value={serialKey}
                onChange={(e) => setSerialKey(e.target.value)}
                required
                spellCheck="false"
                autoComplete="off"
              />
            </div>

            <button
              type="submit"
              className="license-btn-submit"
              style={{ width: '100%', justifyContent: 'center', marginTop: '20px', padding: '13px 24px', fontSize: '15px' }}
              disabled={loading || !serialKey.trim()}
            >
              {loading ? '⏳ جاري التحقق والتفعيل...' : '🚀 تفعيل البرنامج ومتابعة الاستخدام'}
            </button>
          </form>

          <div style={{ textAlign: 'center', marginTop: '16px', fontSize: '11.5px', color: '#94a3b8' }}>
            foxcloud POS · نظام ERP متكامل متعدد القطاعات
          </div>
        </div>
      </div>
    </div>
  );
}

export default LicenseLockScreen;
