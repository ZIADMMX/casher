import { useState } from 'react';
import { useUser } from '../contexts/UserContext.jsx';
import { normalizeErrorMessage } from '../utils/normalizeError.js';
import AdminRecoveryModal from '../components/AdminRecoveryModal.jsx';

function LoginPage() {
  const { login } = useUser();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(username, password);
    } catch (err) {
      setError(normalizeErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="onyx-screen">
      {/* بانل الهوية - التيكيت البطل */}
      <div className="onyx-hero">
        <div className="onyx-glow" />

        <svg className="onyx-hero-gem" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="tagBody" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#FFFFFF" />
              <stop offset="100%" stopColor="#C7CBE0" />
            </linearGradient>
          </defs>
          <path d="M6 4H22L36 18C37.1 19.1 37.1 20.9 36 22L22 36C20.9 37.1 19.1 37.1 18 36L4 22V6C4 4.9 4.9 4 6 4Z"
                fill="url(#tagBody)" />
          <circle cx="11" cy="11" r="2.4" fill="#2E5BFF" />
          <rect x="15" y="14" width="2.6" height="12" fill="#2E5BFF" />
          <rect x="19.2" y="10" width="2.6" height="16" fill="#2E5BFF" />
          <rect x="23.4" y="17" width="2.6" height="9" fill="#2E5BFF" />
        </svg>

        <div className="onyx-hero-text">
          <span className="onyx-hero-wordmark">onyx</span>
          <p className="onyx-hero-tagline">نظام إدارة ذكي لأعمالك</p>
        </div>
      </div>

      {/* بانل الفورم */}
      <div className="onyx-form-panel">
        <div className="onyx-form-box">
          <h1>تسجيل الدخول</h1>
          <p className="onyx-form-subtitle">ادخل بيانات حسابك للوصول إلى لوحة التحكم</p>

          <form onSubmit={handleSubmit}>
            <div className="onyx-field">
              <label htmlFor="username">اسم المستخدم أو البريد</label>
              <div className="onyx-input-wrapper">
                <span className="onyx-input-icon">
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </span>
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="أدخل اسم المستخدم أو البريد"
                  autoFocus
                  required
                />
              </div>
            </div>

            <div className="onyx-field">
              <label htmlFor="password">كلمة المرور</label>
              <div className="onyx-input-wrapper onyx-password-wrapper">
                <span className="onyx-input-icon">
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </span>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="أدخل كلمة المرور"
                  required
                />
                <button
                  type="button"
                  className="onyx-toggle-password"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                >
                  {showPassword ? (
                    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 3l18 18M10.6 10.6a3 3 0 004.2 4.2M9.9 4.24A9.6 9.6 0 0112 4c5 0 9 4 10 8-.36 1.4-1.02 2.7-1.9 3.8M6.1 6.1C3.9 7.5 2.3 9.6 2 12c1 4 5 8 10 8 1.5 0 2.9-.3 4.2-.9" strokeLinecap="round"/></svg>
                  ) : (
                    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M2 12c1-4 5-8 10-8s9 4 10 8c-1 4-5 8-10 8s-9-4-10-8z" strokeLinecap="round" strokeLinejoin="round"/><circle cx="12" cy="12" r="3"/></svg>
                  )}
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-start', margin: '4px 0 16px 0' }}>
              <button
                type="button"
                onClick={() => setShowRecoveryModal(true)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#2E5BFF',
                  fontSize: '12.5px',
                  fontWeight: '700',
                  cursor: 'pointer',
                  padding: 0,
                  fontFamily: 'inherit',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                🔑 نسيت كلمة مرور المدير؟
              </button>
            </div>

            {error && <p className="onyx-error">{error}</p>}

            <button type="submit" className="onyx-submit" disabled={loading}>
              {loading ? (
                <span className="onyx-loading-content">
                  <svg className="onyx-spin-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round" />
                  </svg>
                  جاري التحقق...
                </span>
              ) : 'تسجيل الدخول'}
            </button>
          </form>
        </div>

        <span className="onyx-footer">onyx · v1.0</span>
      </div>

      <AdminRecoveryModal
        isOpen={showRecoveryModal}
        onClose={() => setShowRecoveryModal(false)}
        onResetSuccess={() => {
          setError('');
        }}
      />
    </div>
  );
}

export default LoginPage;
