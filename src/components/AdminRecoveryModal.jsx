import { useState, useEffect } from 'react';
import { normalizeErrorMessage } from '../utils/normalizeError';

function AdminRecoveryModal({ isOpen, onClose, onResetSuccess }) {
  const [activeTab, setActiveTab] = useState('rescue_key'); // 'rescue_key' | 'challenge_otp'
  
  // Tab 1: Rescue Key State
  const [rescueKey, setRescueKey] = useState('');
  const [newPassword1, setNewPassword1] = useState('');
  const [confirmPassword1, setConfirmPassword1] = useState('');
  
  // Tab 2: Challenge OTP State
  const [challengeCode, setChallengeCode] = useState('');
  const [copiedChallenge, setCopiedChallenge] = useState(false);
  const [responseOtp, setResponseOtp] = useState('');
  const [newPassword2, setNewPassword2] = useState('');
  const [confirmPassword2, setConfirmPassword2] = useState('');
  
  // Shared State
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successData, setSuccessData] = useState(null); // { message, newRecoveryKey }
  const [copiedNewKey, setCopiedNewKey] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (isOpen && window.electronAPI?.getRecoveryChallenge) {
      window.electronAPI.getRecoveryChallenge()
        .then((code) => {
          if (!cancelled) setChallengeCode(code);
        })
        .catch((err) => console.error('فشل جلب رمز التحدي:', err));
    }
    return () => { cancelled = true; };
  }, [isOpen]);

  if (!isOpen) return null;

  function handleCopyChallenge() {
    if (!challengeCode) return;
    navigator.clipboard.writeText(challengeCode);
    setCopiedChallenge(true);
    setTimeout(() => setCopiedChallenge(false), 3000);
  }

  function handleCopyNewKey() {
    if (!successData?.newRecoveryKey) return;
    navigator.clipboard.writeText(successData.newRecoveryKey);
    setCopiedNewKey(true);
    setTimeout(() => setCopiedNewKey(false), 3000);
  }

  // Handle Tab 1: Reset with Rescue Key
  async function handleResetWithRescueKey(e) {
    e.preventDefault();
    setError('');

    if (!rescueKey.trim()) {
      setError('يرجى إدخال مفتاح الطوارئ الذهبي');
      return;
    }
    if (newPassword1.length < 6) {
      setError('كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل');
      return;
    }
    if (newPassword1 !== confirmPassword1) {
      setError('كلمة المرور وتأكيدها غير متطابقين');
      return;
    }

    setLoading(true);
    try {
      if (window.electronAPI?.resetAdminPasswordWithRecoveryKey) {
        const res = await window.electronAPI.resetAdminPasswordWithRecoveryKey({
          recoveryKey: rescueKey.trim(),
          newPassword: newPassword1,
        });
        if (res?.success) {
          setSuccessData(res);
          if (onResetSuccess) onResetSuccess();
        }
      }
    } catch (err) {
      setError(normalizeErrorMessage(err) || 'فشل استرداد الحساب بمفتاح الطوارئ');
    } finally {
      setLoading(false);
    }
  }

  // Handle Tab 2: Reset with Challenge OTP
  async function handleResetWithChallenge(e) {
    e.preventDefault();
    setError('');

    if (!challengeCode) {
      setError('لم يتم توليد رمز التحدي بنجاح');
      return;
    }
    if (!responseOtp.trim()) {
      setError('يرجى إدخال كود استجابة الدعم الفني');
      return;
    }
    if (newPassword2.length < 6) {
      setError('كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل');
      return;
    }
    if (newPassword2 !== confirmPassword2) {
      setError('كلمة المرور وتأكيدها غير متطابقين');
      return;
    }

    setLoading(true);
    try {
      if (window.electronAPI?.resetAdminPasswordWithChallenge) {
        const res = await window.electronAPI.resetAdminPasswordWithChallenge({
          challengeCode,
          responseOtp: responseOtp.trim(),
          newPassword: newPassword2,
        });
        if (res?.success) {
          setSuccessData(res);
          if (onResetSuccess) onResetSuccess();
        }
      }
    } catch (err) {
      setError(normalizeErrorMessage(err) || 'فشل التحقق من كود الاستجابة');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="license-modal-backdrop" onClick={onClose}>
      <div className="license-modal-card" style={{ maxWidth: '520px' }} onClick={(e) => e.stopPropagation()}>
        
        {/* Header */}
        <div className="license-modal-header">
          <div className="license-modal-icon-badge" style={{ background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.25) 0%, rgba(220, 38, 38, 0.45) 100%)', borderColor: 'rgba(248, 113, 113, 0.35)' }}>
            <span>🛡️</span>
          </div>
          <div className="license-modal-title-wrap">
            <h3 className="license-modal-title">استرداد حساب المدير (Admin Recovery)</h3>
            <p className="license-modal-subtitle">إثبات الملكية وتعيين كلمة مرور جديدة بأمان تام</p>
          </div>
          <button type="button" className="license-modal-close" onClick={onClose} title="إغلاق">
            ✕
          </button>
        </div>

        {/* If successfully reset: Show Success & New Recovery Key Card */}
        {successData ? (
          <div className="license-modal-content" style={{ padding: '28px 24px', textAlign: 'center' }}>
            <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#dcfce7', color: '#15803d', fontSize: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              ✓
            </div>
            <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', marginBottom: '8px' }}>
              تم استعادة الحساب وتعيين كلمة المرور بنجاح! 🎉
            </h3>
            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '20px' }}>
              يمكنك الآن تسجيل الدخول بكلمة المرور الجديدة.
            </p>

            {/* New Golden Key */}
            {successData.newRecoveryKey && (
              <div className="license-hwid-panel" style={{ textAlign: 'right', background: '#fffbeb', borderColor: '#fde68a', marginBottom: '20px' }}>
                <div className="license-hwid-header" style={{ color: '#92400e' }}>
                  <span>🔑</span>
                  <span>مفتاح الطوارئ الذهبي الجديد (احفظه الآن):</span>
                </div>
                <div className="license-hwid-display" style={{ background: '#1c1917' }}>
                  <code className="hwid-code-text" style={{ color: '#f59e0b' }}>{successData.newRecoveryKey}</code>
                  <button
                    type="button"
                    className={`hwid-copy-action ${copiedNewKey ? 'copied' : ''}`}
                    onClick={handleCopyNewKey}
                  >
                    {copiedNewKey ? '✓ تم النسخ' : '📋 نسخ'}
                  </button>
                </div>
                <p className="hwid-help-note" style={{ color: '#b45309' }}>
                  ⚠️ تم توليد هذا المفتاح كبديل للمفتاح القديم لضمان أمان النظام في المستقبل.
                </p>
              </div>
            )}

            <button
              type="button"
              className="license-btn-submit"
              style={{ width: '100%', justifyContent: 'center', padding: '12px' }}
              onClick={onClose}
            >
              الذهاب إلى تسجيل الدخول 🚀
            </button>
          </div>
        ) : (
          <>
            {/* Tabs Navigation */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', background: '#f8fafc', borderBottom: '1.5px solid #e2e8f0', padding: '6px' }}>
              <button
                type="button"
                onClick={() => { setActiveTab('rescue_key'); setError(''); }}
                style={{
                  padding: '10px 12px',
                  border: 'none',
                  borderRadius: '10px',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  background: activeTab === 'rescue_key' ? '#ffffff' : 'transparent',
                  color: activeTab === 'rescue_key' ? '#F2600C' : '#64748B',
                  boxShadow: activeTab === 'rescue_key' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none',
                  transition: 'all 0.2s',
                  fontFamily: 'inherit',
                }}
              >
                🔑 بمفتاح الطوارئ
              </button>
              <button
                type="button"
                onClick={() => { setActiveTab('challenge_otp'); setError(''); }}
                style={{
                  padding: '10px 12px',
                  border: 'none',
                  borderRadius: '10px',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  background: activeTab === 'challenge_otp' ? '#ffffff' : 'transparent',
                  color: activeTab === 'challenge_otp' ? '#F2600C' : '#64748B',
                  boxShadow: activeTab === 'challenge_otp' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none',
                  transition: 'all 0.2s',
                  fontFamily: 'inherit',
                }}
              >
                🛡️ عبر الدعم الفني
              </button>
            </div>

            {/* Content Form */}
            <div className="license-modal-content">
              {error && (
                <div className="license-modal-error">
                  <span>⚠️</span>
                  <span>{error}</span>
                </div>
              )}

              {/* TAB 1: Rescue Key */}
              {activeTab === 'rescue_key' && (
                <form onSubmit={handleResetWithRescueKey} className="license-modal-form">
                  <div className="license-input-panel">
                    <label htmlFor="rescue-key-input" className="license-input-label">
                      <span>🔑 مفتاح الطوارئ الذهبي (Rescue Key):</span>
                    </label>
                    <input
                      id="rescue-key-input"
                      type="text"
                      className="license-key-textbox"
                      placeholder="مثال: REC-88FA-9912-BB01"
                      value={rescueKey}
                      onChange={(e) => setRescueKey(e.target.value.toUpperCase())}
                      required
                      autoFocus
                      spellCheck="false"
                      autoComplete="off"
                    />
                    <small style={{ fontSize: '11.5px', color: '#64748b', marginTop: '2px' }}>
                      هو الرمز المكوّن من 16 خانة الذي تم توليده لك عند أول تثبيت للبرنامج.
                    </small>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '14px' }}>
                    <div className="license-input-panel">
                      <label htmlFor="new-pass-1" className="license-input-label">
                        <span>🔒 كلمة المرور الجديدة:</span>
                      </label>
                      <input
                        id="new-pass-1"
                        type="password"
                        className="form-input"
                        placeholder="6 خانات على الأقل"
                        value={newPassword1}
                        onChange={(e) => setNewPassword1(e.target.value)}
                        minLength={6}
                        required
                      />
                    </div>
                    <div className="license-input-panel">
                      <label htmlFor="confirm-pass-1" className="license-input-label">
                        <span>🔒 تأكيد كلمة المرور:</span>
                      </label>
                      <input
                        id="confirm-pass-1"
                        type="password"
                        className="form-input"
                        placeholder="أعد كتابتها"
                        value={confirmPassword1}
                        onChange={(e) => setConfirmPassword1(e.target.value)}
                        minLength={6}
                        required
                      />
                    </div>
                  </div>

                  <div className="license-modal-actions" style={{ marginTop: '20px', padding: '16px 0 0 0', background: 'transparent' }}>
                    <button type="button" className="license-btn-cancel" onClick={onClose} disabled={loading}>
                      إلغاء
                    </button>
                    <button type="submit" className="license-btn-submit" disabled={loading || !rescueKey.trim()}>
                      {loading ? '⏳ جاري التحقق...' : '🚀 فك القفل وتغيير الباسورد'}
                    </button>
                  </div>
                </form>
              )}

              {/* TAB 2: Challenge OTP */}
              {activeTab === 'challenge_otp' && (
                <form onSubmit={handleResetWithChallenge} className="license-modal-form">
                  {/* Challenge Code Display */}
                  <div className="license-hwid-panel">
                    <div className="license-hwid-header">
                      <span>💻</span>
                      <span>رمز التحدي لليوم الحالي (Challenge Code):</span>
                    </div>
                    <div className="license-hwid-display">
                      <code className="hwid-code-text" style={{ fontSize: '14.5px' }}>{challengeCode || '---'}</code>
                      <button
                        type="button"
                        className={`hwid-copy-action ${copiedChallenge ? 'copied' : ''}`}
                        onClick={handleCopyChallenge}
                      >
                        {copiedChallenge ? '✓ تم النسخ' : '📋 نسخ الرمز'}
                      </button>
                    </div>
                    <p className="hwid-help-note">
                      📞 انسخ هذا الرمز وأرسله للمطور مع إثبات الشراء لاستلام كود الاستجابة الفوري لمرة واحدة.
                    </p>
                  </div>

                  {/* Response OTP Input */}
                  <div className="license-input-panel" style={{ marginTop: '12px' }}>
                    <label htmlFor="response-otp-input" className="license-input-label">
                      <span>🛡️ كود استجابة الدعم الفني (Developer OTP):</span>
                    </label>
                    <input
                      id="response-otp-input"
                      type="text"
                      className="license-key-textbox"
                      placeholder="XXXX-XXXX"
                      value={responseOtp}
                      onChange={(e) => setResponseOtp(e.target.value.toUpperCase())}
                      required
                      spellCheck="false"
                      autoComplete="off"
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '14px' }}>
                    <div className="license-input-panel">
                      <label htmlFor="new-pass-2" className="license-input-label">
                        <span>🔒 كلمة المرور الجديدة:</span>
                      </label>
                      <input
                        id="new-pass-2"
                        type="password"
                        className="form-input"
                        placeholder="6 خانات على الأقل"
                        value={newPassword2}
                        onChange={(e) => setNewPassword2(e.target.value)}
                        minLength={6}
                        required
                      />
                    </div>
                    <div className="license-input-panel">
                      <label htmlFor="confirm-pass-2" className="license-input-label">
                        <span>🔒 تأكيد كلمة المرور:</span>
                      </label>
                      <input
                        id="confirm-pass-2"
                        type="password"
                        className="form-input"
                        placeholder="أعد كتابتها"
                        value={confirmPassword2}
                        onChange={(e) => setConfirmPassword2(e.target.value)}
                        minLength={6}
                        required
                      />
                    </div>
                  </div>

                  <div className="license-modal-actions" style={{ marginTop: '20px', padding: '16px 0 0 0', background: 'transparent' }}>
                    <button type="button" className="license-btn-cancel" onClick={onClose} disabled={loading}>
                      إلغاء
                    </button>
                    <button type="submit" className="license-btn-submit" disabled={loading || !responseOtp.trim()}>
                      {loading ? '⏳ جاري التحقق...' : '🚀 فك القفل وتغيير الباسورد'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </>
        )}

      </div>
    </div>
  );
}

export default AdminRecoveryModal;
