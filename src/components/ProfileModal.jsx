import { useEffect, useRef, useState } from 'react';
import { useUser } from '../contexts/UserContext.jsx';
import { CloseIcon, LockIcon } from './icons/PosIcons.jsx';
import { passwordStrength, STRENGTH_LABELS } from '../utils/passwordStrength.js';
import '../styles/profile.css';

const MIN_PASSWORD = 6; // matches auth.service updateProfile

function ProfileModal({ onClose }) {
  const { currentUser, updateProfile } = useUser();
  const [form, setForm] = useState({
    username: currentUser.username,
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [changePassword, setChangePassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const dialogRef = useRef(null);

  const initial = currentUser.username ? currentUser.username.charAt(0).toUpperCase() : 'U';
  const roleLabel = currentUser.role === 'admin' ? 'مدير النظام — كامل الصلاحيات' : 'كاشير — نقطة البيع';
  const strength = passwordStrength(form.newPassword);

  useEffect(() => {
    dialogRef.current?.querySelector('input')?.focus();
  }, []);

  useEffect(() => {
    function onKey(event) {
      if (event.key === 'Escape' && !loading) onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, loading]);

  function setField(name) {
    return (event) => setForm((prev) => ({ ...prev, [name]: event.target.value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setSuccessMsg('');

    if (!form.currentPassword) {
      setError('يرجى إدخال كلمة المرور الحالية لتأكيد التعديلات');
      return;
    }
    if (!form.username.trim()) {
      setError('اسم المستخدم مطلوب');
      return;
    }
    if (changePassword) {
      if (form.newPassword.length < MIN_PASSWORD) {
        setError(`كلمة المرور الجديدة يجب أن تكون ${MIN_PASSWORD.toLocaleString('ar-EG')} أحرف على الأقل`);
        return;
      }
      if (form.newPassword !== form.confirmPassword) {
        setError('كلمة المرور الجديدة وتأكيدها غير متطابقين');
        return;
      }
    }

    setLoading(true);
    try {
      const res = await updateProfile({
        currentPassword: form.currentPassword,
        newUsername: form.username,
        newPassword: changePassword ? form.newPassword : undefined,
      });
      if (res?.success) {
        setSuccessMsg('تم تحديث بيانات الدخول بنجاح');
        setForm((prev) => ({ ...prev, currentPassword: '', newPassword: '', confirmPassword: '' }));
        setTimeout(onClose, 1200);
      }
    } catch (err) {
      setError(err.message || 'فشل تحديث البيانات');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="prf-overlay" role="presentation" onClick={loading ? undefined : onClose}>
      <form
        ref={dialogRef}
        className="prf-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="prf-dialog-title"
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
        noValidate
      >
        <div className="prf-dialog-head">
          <span className="prf-icon prf-icon--primary" aria-hidden="true"><LockIcon size={20} /></span>
          <h2 id="prf-dialog-title">اسم المستخدم وكلمة المرور</h2>
          <button type="button" className="prf-close" onClick={onClose} disabled={loading} aria-label="إغلاق">
            <CloseIcon size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="prf-dialog-body">
          <div className="prf-user-card">
            <div className="prf-avatar" aria-hidden="true">{initial}</div>
            <div>
              <strong dir="ltr">{currentUser.username}</strong>
              <span>{roleLabel}</span>
            </div>
          </div>

          {error && <div className="prf-feedback prf-feedback--error" role="alert">{error}</div>}
          {successMsg && <div className="prf-feedback prf-feedback--success" role="status">{successMsg}</div>}

          <div className="prf-form-field">
            <label htmlFor="prf-username">اسم المستخدم</label>
            <input
              id="prf-username"
              className="prf-input"
              dir="ltr"
              autoComplete="username"
              value={form.username}
              onChange={setField('username')}
              required
            />
          </div>

          <div className="prf-form-field">
            <label htmlFor="prf-current-password">
              كلمة المرور الحالية <span className="prf-req" aria-hidden="true">*</span>
            </label>
            <input
              id="prf-current-password"
              className="prf-input"
              type="password"
              autoComplete="current-password"
              placeholder="مطلوبة لتأكيد أي تعديل"
              value={form.currentPassword}
              onChange={setField('currentPassword')}
              aria-describedby="prf-current-hint"
              required
            />
            <small id="prf-current-hint">من غيرها مش هنقدر نحفظ أي تغيير.</small>
          </div>

          <div className="prf-password-box">
            <div className="prf-toggle-row">
              <div>
                <strong id="prf-toggle-label">تغيير كلمة المرور</strong>
                <span>اختياري — سيبها قافلة لو مش عايز تغيّر</span>
              </div>
              <button
                type="button"
                className="prf-switch"
                role="switch"
                aria-checked={changePassword}
                aria-labelledby="prf-toggle-label"
                onClick={() => setChangePassword((on) => !on)}
              />
            </div>

            {changePassword && (
              <>
                <div className="prf-form-field">
                  <label htmlFor="prf-new-password">كلمة المرور الجديدة</label>
                  <input
                    id="prf-new-password"
                    className="prf-input"
                    type="password"
                    autoComplete="new-password"
                    placeholder={`${MIN_PASSWORD.toLocaleString('ar-EG')} أحرف على الأقل`}
                    value={form.newPassword}
                    onChange={setField('newPassword')}
                  />
                  {strength > 0 && (
                    <div className="prf-strength" data-level={strength}>
                      <div className="prf-strength-bars" aria-hidden="true"><span /><span /><span /></div>
                      <small aria-live="polite">{STRENGTH_LABELS[strength]}</small>
                    </div>
                  )}
                </div>

                <div className="prf-form-field">
                  <label htmlFor="prf-confirm-password">تأكيد كلمة المرور</label>
                  <input
                    id="prf-confirm-password"
                    className="prf-input"
                    type="password"
                    autoComplete="new-password"
                    placeholder="أعد كتابة كلمة المرور"
                    value={form.confirmPassword}
                    onChange={setField('confirmPassword')}
                  />
                </div>
              </>
            )}
          </div>
        </div>

        <div className="prf-dialog-foot">
          <button type="button" className="prf-btn prf-btn--ghost" onClick={onClose} disabled={loading}>
            إلغاء
          </button>
          <button type="submit" className="prf-btn prf-btn--primary" disabled={loading}>
            {loading ? 'جاري الحفظ...' : 'حفظ التعديلات'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default ProfileModal;
