import { useState } from 'react';
import { useUser } from '../contexts/UserContext.jsx';

function ForcePasswordChangePage({ onSuccess }) {
  const { changePassword } = useUser();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
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

  return (
    <div className="onyx-screen">
      <div className="onyx-hero">
        <div className="onyx-glow" />
        <svg className="onyx-hero-gem" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="tagBody2" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#FFFFFF" />
              <stop offset="100%" stopColor="#C7CBE0" />
            </linearGradient>
          </defs>
          <path
            d="M6 4H22L36 18C37.1 19.1 37.1 20.9 36 22L22 36C20.9 37.1 18 37.1 18L4 22V6C4 4.9 4.9 4 6 4Z"
            fill="url(#tagBody2)"
          />
          <circle cx="11" cy="11" r="2.4" fill="#2E5BFF" />
          <rect x="15" y="14" width="2.6" height="12" fill="#2E5BFF" />
          <rect x="19.2" y="10" width="2.6" height="16" fill="#2E5BFF" />
          <rect x="23.4" y="17" width="2.6" height="9" fill="#2E5BFF" />
        </svg>
        <div className="onyx-hero-text">
          <span className="onyx-hero-wordmark">onyx</span>
          <p className="onyx-hero-tagline">خطوة أمان أخيرة قبل البدء</p>
        </div>
      </div>

      <div className="onyx-form-panel">
        <div className="onyx-form-box">
          <h1>غيّر كلمة المرور</h1>
          <p className="onyx-form-subtitle">
            أنت تستخدم كلمة مرور افتراضية. لازم تغيّرها الأول عشان تكمل استخدام النظام بأمان.
          </p>

          <form onSubmit={handleSubmit}>
            <div className="onyx-field">
              <label htmlFor="force-new-password">كلمة المرور الجديدة</label>
              <input
                id="force-new-password"
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="6 أحرف على الأقل"
                autoFocus
                required
              />
            </div>

            <div className="onyx-field">
              <label htmlFor="force-confirm-password">تأكيد كلمة المرور</label>
              <input
                id="force-confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="أعد كتابة كلمة المرور"
                required
              />
            </div>

            {error && <p className="onyx-error">{error}</p>}

            <button type="submit" className="onyx-submit" disabled={loading}>
              {loading ? 'جاري الحفظ...' : 'حفظ والمتابعة'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default ForcePasswordChangePage;
