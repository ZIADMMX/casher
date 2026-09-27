import { useState } from 'react';
import { useUser } from '../contexts/UserContext.jsx';

function InitialSetupPage() {
  const { createInitialAdmin, completeInitialSetup } = useUser();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Step 2: Rescue Key Display
  const [step, setStep] = useState('form'); // 'form' | 'recovery_key'
  const [createdUser, setCreatedUser] = useState(null);
  const [recoveryKey, setRecoveryKey] = useState('');
  const [copiedKey, setCopiedKey] = useState(false);
  const [confirmedSaved, setConfirmedSaved] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('كلمة المرور وتأكيدها غير متطابقين');
      return;
    }

    setLoading(true);
    try {
      const res = await createInitialAdmin(username, password, false);
      if (res?.recoveryKey) {
        setCreatedUser(res.user);
        setRecoveryKey(res.recoveryKey);
        setStep('recovery_key');
      } else {
        completeInitialSetup(res.user);
      }
    } catch (err) {
      setError(err.message || 'حدث خطأ أثناء إنشاء حساب المدير');
    } finally {
      setLoading(false);
    }
  }

  function handleCopyKey() {
    if (!recoveryKey) return;
    navigator.clipboard.writeText(recoveryKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 3000);
  }

  function handleFinishSetup() {
    if (!confirmedSaved) {
      setError('يرجى تأكيد حفظ مفتاح الاسترداد قبل المتابعة');
      return;
    }
    completeInitialSetup(createdUser);
  }

  return (
    <div className="onyx-screen">
      <div className="onyx-hero">
        <div className="onyx-glow" />
        <div className="onyx-hero-text">
          <span className="onyx-hero-wordmark">onyx</span>
          <p className="onyx-hero-tagline">إعداد النظام لأول مرة</p>
        </div>
      </div>

      <div className="onyx-form-panel">
        <div className="onyx-form-box" style={{ maxWidth: step === 'recovery_key' ? '460px' : '400px' }}>
          
          {step === 'form' ? (
            <>
              <h1>إنشاء حساب المدير</h1>
              <p className="onyx-form-subtitle">أنشئ حساب المدير الأول للبدء باستخدام النظام</p>

              <form onSubmit={handleSubmit}>
                <div className="onyx-field">
                  <label htmlFor="initial-admin-username">اسم المستخدم</label>
                  <div className="onyx-input-wrapper">
                    <input
                      id="initial-admin-username"
                      type="text"
                      value={username}
                      onChange={(event) => setUsername(event.target.value)}
                      placeholder="أدخل اسم مستخدم المدير"
                      autoFocus
                      required
                    />
                  </div>
                </div>

                <div className="onyx-field">
                  <label htmlFor="initial-admin-password">كلمة المرور</label>
                  <div className="onyx-input-wrapper onyx-password-wrapper">
                    <input
                      id="initial-admin-password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="6 أحرف على الأقل"
                      minLength="6"
                      required
                    />
                    <button
                      type="button"
                      className="onyx-toggle-password"
                      onClick={() => setShowPassword((value) => !value)}
                      aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                    >
                      {showPassword ? 'إخفاء' : 'إظهار'}
                    </button>
                  </div>
                </div>

                <div className="onyx-field">
                  <label htmlFor="initial-admin-confirm-password">تأكيد كلمة المرور</label>
                  <div className="onyx-input-wrapper">
                    <input
                      id="initial-admin-confirm-password"
                      type={showPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      placeholder="أعد كتابة كلمة المرور"
                      minLength="6"
                      required
                    />
                  </div>
                </div>

                {error && <p className="onyx-error">{error}</p>}

                <button type="submit" className="onyx-submit" disabled={loading}>
                  {loading ? 'جاري إنشاء الحساب...' : 'إنشاء حساب المدير'}
                </button>
              </form>
            </>
          ) : (
            <>
              <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: '#fef3c7', color: '#b45309', fontSize: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                  🔑
                </div>
                <h1 style={{ fontSize: '20px' }}>مفتاح الاسترداد الذهبي للطوارئ</h1>
                <p className="onyx-form-subtitle">
                  تم إنشاء حسابك بنجاح! هذا المفتاح هو وسيلتك الوحيدة لاسترجاع حسابك إذا نسيت كلمة المرور مستقبلاً بدون إنترنت.
                </p>
              </div>

              {/* Recovery Key Box */}
              <div className="license-hwid-panel" style={{ background: '#0f172a', borderColor: '#1e293b', marginBottom: '16px' }}>
                <div className="license-hwid-header" style={{ color: '#94a3b8' }}>
                  <span>🛡️</span>
                  <span>مفتاح الطوارئ الخاص بك (Rescue Key):</span>
                </div>
                <div className="license-hwid-display" style={{ background: '#1e293b', border: '1px dashed #334155' }}>
                  <code className="hwid-code-text" style={{ color: '#fbbf24', fontSize: '17px' }}>
                    {recoveryKey}
                  </code>
                  <button
                    type="button"
                    className={`hwid-copy-action ${copiedKey ? 'copied' : ''}`}
                    onClick={handleCopyKey}
                  >
                    {copiedKey ? '✓ تم النسخ' : '📋 نسخ الرمز'}
                  </button>
                </div>
                <p className="hwid-help-note" style={{ color: '#cbd5e1' }}>
                  💡 اكتب هذا المفتاح في ورقة خارجية أو احفظه في مكان آمن وخاص بك وحدك.
                </p>
              </div>

              {/* Confirmation Checkbox */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '16px 0', cursor: 'pointer' }} onClick={() => setConfirmedSaved(!confirmedSaved)}>
                <input
                  type="checkbox"
                  id="confirm-saved"
                  checked={confirmedSaved}
                  onChange={(e) => setConfirmedSaved(e.target.checked)}
                  style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#2E5BFF' }}
                />
                <label htmlFor="confirm-saved" style={{ fontSize: '13px', fontWeight: '700', color: '#334155', cursor: 'pointer' }}>
                  أقر بأنني قمت بحفظ هذا المفتاح في مكان آمن
                </label>
              </div>

              {error && <p className="onyx-error" style={{ marginBottom: '12px' }}>{error}</p>}

              <button
                type="button"
                className="onyx-submit"
                onClick={handleFinishSetup}
                disabled={!confirmedSaved}
              >
                متابعة للدخول إلى النظام 🚀
              </button>
            </>
          )}

        </div>

        <span className="onyx-footer">onyx · الإعداد الأولي</span>
      </div>
    </div>
  );
}

export default InitialSetupPage;

