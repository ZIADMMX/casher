import { useState } from 'react';
import { useUser } from '../contexts/UserContext.jsx';

function ProfileModal({ onClose, forcePasswordChange = false }) {
  const { currentUser, updateProfile, changePassword } = useUser();
  const [form, setForm] = useState({
    username: currentUser.username,
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const initial = currentUser.username ? currentUser.username.charAt(0).toUpperCase() : 'U';

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (!forcePasswordChange && !form.currentPassword) {
      setError('يرجى إدخال كلمة المرور الحالية لتأكيد التعديلات');
      return;
    }

    if (forcePasswordChange && !form.newPassword) {
      setError('يجب اختيار كلمة مرور جديدة قبل متابعة استخدام النظام');
      return;
    }

    if (form.newPassword && form.newPassword.length < 6) {
      setError('كلمة المرور الجديدة يجب أن تكون 6 خانات على الأقل');
      return;
    }

    if (form.newPassword && form.newPassword !== form.confirmPassword) {
      setError('كلمة المرور الجديدة وتأكيدها غير متطابقين');
      return;
    }

    setLoading(true);
    try {
      const res = forcePasswordChange
        ? await changePassword(form.newPassword)
        : await updateProfile({
            currentPassword: form.currentPassword,
            newUsername: form.username,
            newPassword: form.newPassword || undefined,
          });

      if (res?.success) {
        setSuccessMsg('تم تحديث بيانات البروفايل بنجاح! ✨');
        setForm((prev) => ({
          ...prev,
          currentPassword: '',
          newPassword: '',
          confirmPassword: '',
        }));
        setTimeout(() => {
          onClose();
        }, 1200);
      }
    } catch (err) {
      setError(err.message || 'فشل تحديث البيانات');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={forcePasswordChange ? undefined : onClose}>
      <div className="profile-modal-card reports-fade-in" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="profile-modal-header">
          <div className="profile-header-title">
            <span className="profile-badge-icon">👤</span>
            <h3>{forcePasswordChange ? 'تغيير كلمة المرور لأول دخول' : 'الملف الشخصي والحساب'}</h3>
          </div>
            {!forcePasswordChange && (
              <button className="modal-close" onClick={onClose}>×</button>
            )}
        </div>

        {/* User Visual Card */}
        <div className="profile-visual-card">
          <div className="profile-big-avatar">{initial}</div>
          <div className="profile-visual-info">
            <h4 className="profile-display-name">{currentUser.username}</h4>
            <div className="profile-role-pill">
              {currentUser.role === 'admin' ? (
                <span className="role-admin">🛡️ مدير النظام كامل الصلاحيات</span>
              ) : (
                <span className="role-cashier">💳 كاشير (نقطة البيع)</span>
              )}
            </div>
          </div>
        </div>

        {error && <div className="profile-alert-error">{error}</div>}
        {successMsg && <div className="profile-alert-success">{successMsg}</div>}
        {forcePasswordChange && !successMsg && (
          <div className="profile-alert-error">
            يجب تغيير كلمة المرور الافتراضية قبل استخدام النظام.
          </div>
        )}

        {/* Edit Form */}
        <form onSubmit={handleSubmit} className="profile-edit-form">
          <div className="profile-field-group">
            <label className="profile-label">اسم المستخدم (Username)</label>
            <div className="profile-input-wrap">
              <span className="profile-input-icon">👤</span>
              <input
                type="text"
                className="profile-input"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="profile-field-group">
              <label className="profile-label">
                كلمة المرور الحالية {!forcePasswordChange && <span className="req-star">* (مطلوبة لتأكيد التغيير)</span>}
              </label>
            <div className="profile-input-wrap">
              <span className="profile-input-icon">🔒</span>
              <input
                type="password"
                className="profile-input"
                placeholder="أدخل كلمة المرور الحالية"
                value={form.currentPassword}
                onChange={(e) => setForm({ ...form, currentPassword: e.target.value })}
                required={!forcePasswordChange}
              />
            </div>
          </div>

          <div className="profile-divider">
            <span>تغيير كلمة المرور (اختياري)</span>
          </div>

          <div className="profile-password-grid">
            <div className="profile-field-group">
              <label className="profile-label">
                كلمة المرور الجديدة {forcePasswordChange && <span className="req-star">*</span>}
              </label>
              <div className="profile-input-wrap">
                <span className="profile-input-icon">🔑</span>
                <input
                  type="password"
                  className="profile-input"
                  placeholder={forcePasswordChange ? 'أدخل كلمة مرور جديدة' : 'اتركها فارغة إذا لم ترد التغيير'}
                  value={form.newPassword}
                  onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
                  required={forcePasswordChange}
                />
              </div>
            </div>

            <div className="profile-field-group">
              <label className="profile-label">تأكيد كلمة المرور الجديدة</label>
              <div className="profile-input-wrap">
                <span className="profile-input-icon">🔑</span>
                <input
                  type="password"
                  className="profile-input"
                  placeholder="أعد كتابة كلمة المرور"
                  value={form.confirmPassword}
                  onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                />
              </div>
            </div>
          </div>

          <div className="profile-modal-actions">
            {!forcePasswordChange && (
              <button type="button" className="profile-cancel-btn" onClick={onClose} disabled={loading}>
                إلغاء
              </button>
            )}
            <button type="submit" className="profile-save-btn" disabled={loading}>
              {loading ? 'جاري الحفظ...' : 'حفظ التعديلات'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ProfileModal;