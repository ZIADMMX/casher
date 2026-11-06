import { useState } from 'react';
import { normalizeErrorMessage } from '../utils/normalizeError';
import * as licenseApi from '../api/license.js';

// The owner can always take the shop's data out while the app is locked.
function ExportDataSection() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleExport(e) {
    e.preventDefault();
    setMessage('');
    setBusy(true);
    try {
      const result = await licenseApi.exportAllData({ username: username.trim(), password });
      if (!result?.canceled) setMessage(`✓ تم حفظ البيانات في: ${result.path}`);
      setPassword('');
    } catch (err) {
      setMessage(normalizeErrorMessage(err) || 'تعذر تصدير البيانات');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleExport} className="license-modal-form" style={{ marginTop: '20px' }}>
      <div className="license-input-panel">
        <span className="license-input-label">📤 تصدير كل بيانات المحل (Excel) بحساب مدير النظام:</span>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <input
            aria-label="اسم مستخدم المدير"
            className="form-input"
            placeholder="اسم المستخدم"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
          />
          <input
            aria-label="كلمة مرور المدير"
            type="password"
            className="form-input"
            placeholder="كلمة المرور"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>
      </div>
      {message && <p className="hwid-help-note" role="status">{message}</p>}
      <button type="submit" className="license-btn-submit" style={{ width: '100%', justifyContent: 'center', marginTop: '12px' }} disabled={busy}>
        {busy ? '⏳ جاري التصدير...' : '📤 تصدير كل البيانات'}
      </button>
    </form>
  );
}

function lockHeading(verificationError, reason) {
  if (verificationError) {
    return {
      title: 'تعذر التحقق من وقت الترخيص',
      body: 'اتصل بالإنترنت ثم أعد المحاولة. لن تُحذف بيانات المتجر.',
    };
  }
  if (reason) {
    return {
      title: 'التفعيل متوقف',
      body: `${reason}. أرسل معرّف جهازك للدعم الفني لاستلام مفتاح جديد. بيانات المتجر محفوظة ويمكنك تصديرها بالأسفل.`,
    };
  }
  return {
    title: 'انتهت الفترة التجريبية (14 يوماً)',
    body: 'يرجى تفعيل البرنامج بواسطة مفتاح التفعيل الخاص بك لمتابعة الاستخدام. بيانات المتجر محفوظة ويمكنك تصديرها بالأسفل.',
  };
}

function LicenseLockScreen({ hwid, error: verificationError, reason = '', onRetry, onActivateSuccess }) {
  const heading = lockHeading(verificationError, reason);
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
          <h2>{heading.title}</h2>
          <p>{heading.body}</p>
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
                placeholder="الصق مفتاح التفعيل هنا (يبدأ بـ FOX1-)"
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

          {!verificationError && <ExportDataSection />}

          <div style={{ textAlign: 'center', marginTop: '16px', fontSize: '11.5px', color: '#94a3b8' }}>
            foxcloud POS · نظام ERP متكامل متعدد القطاعات
          </div>
        </div>
      </div>
    </div>
  );
}

export default LicenseLockScreen;
