import { useState } from 'react';
import { useUser } from '../contexts/UserContext.jsx';
import foxLogo from '../assets/fox-logo.png';
import './LoginPage.css';

function ForcePasswordChangePage({ onSuccess }) {
  const { changePassword } = useUser();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');

    if (newPassword !== confirmPassword) {
      setError('كلمة المرور وتأكيدها غير متطابقين');
      return;
    }
    if (newPassword.length < 6) {
      setError('كلمة المرور لازم تكون 6 أحرف على الأقل');
      return;
    }

    setLoading(true);
    try {
      await changePassword(newPassword);
      onSuccess();
    } catch (err) {
      setError(err.message || 'فشل تغيير كلمة المرور');
    } finally {
      setLoading(false);
    }
  }

  const eyeOpen = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );

  const eyeClosed = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );

  return (
    <div className="login-container">
      <div className="login-bg-glow" />

      <div className="login-card">
        {/* Brand Header */}
        <div className="login-header">
          <div className="login-logo-wrap">
            <img src={foxLogo} alt="FOX .CLOUD" className="login-logo-img" />
          </div>
          <h1 className="login-title">
            FOX <span className="login-title-dot">.</span><span className="login-title-cloud">CLOUD</span>
          </h1>
          <p className="login-subtitle">
            خطوة أمان أخيرة قبل البدء
          </p>
        </div>

        {/* Divider */}
        <div className="login-divider">
          <span>غيّر كلمة المرور</span>
        </div>

        <p style={{ fontSize: '13px', color: '#94A3B8', textAlign: 'center', marginBottom: '16px', lineHeight: 1.6 }}>
          أنت تستخدم كلمة مرور افتراضية. لازم تغيّرها الأول عشان تكمل استخدام النظام بأمان.
        </p>

        <form className="login-form" onSubmit={handleSubmit}>
          {/* New Password */}
          <div className="login-field">
            <label className="login-label" htmlFor="force-new-password">
              كلمة المرور الجديدة <span className="field-sub">(New Password)</span>
            </label>
            <div className="login-input-box">
              <span className="login-field-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </span>
              <input
                id="force-new-password"
                type={showNewPassword ? 'text' : 'password'}
                className="login-input login-input-with-icon login-input-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="6 أحرف على الأقل"
                autoFocus
                required
              />
              <button
                type="button"
                className="login-eye-btn"
                onClick={() => setShowNewPassword(!showNewPassword)}
                title={showNewPassword ? 'إخفاء' : 'إظهار'}
              >
                {showNewPassword ? eyeClosed : eyeOpen}
              </button>
            </div>
          </div>

          {/* Confirm Password */}
          <div className="login-field">
            <label className="login-label" htmlFor="force-confirm-password">
              تأكيد كلمة المرور <span className="field-sub">(Confirm Password)</span>
            </label>
            <div className="login-input-box">
              <span className="login-field-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </span>
              <input
                id="force-confirm-password"
                type={showConfirmPassword ? 'text' : 'password'}
                className="login-input login-input-with-icon login-input-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="أعد كتابة كلمة المرور"
                required
              />
              <button
                type="button"
                className="login-eye-btn"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                title={showConfirmPassword ? 'إخفاء' : 'إظهار'}
              >
                {showConfirmPassword ? eyeClosed : eyeOpen}
              </button>
            </div>
          </div>

          {/* Error Message */}
          {error && <div className="login-error-banner">{error}</div>}

          {/* Submit Button */}
          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? (
              <span className="login-btn-loading">
                <span className="login-spinner" /> جاري الحفظ...
              </span>
            ) : (
              'حفظ والمتابعة • Save & Continue'
            )}
          </button>
        </form>

        <div className="login-footer">
          <span>FOX .CLOUD • Enterprise Smart POS</span>
        </div>
      </div>
    </div>
  );
}

export default ForcePasswordChangePage;
