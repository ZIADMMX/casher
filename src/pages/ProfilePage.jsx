import { useCallback, useEffect, useMemo, useState } from 'react';
import { useUser } from '../contexts/UserContext.jsx';
import * as authApi from '../api/auth.js';
import '../styles/profile.css';

const EMPTY_PROFILE = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  gender: '',
  dateOfBirth: '',
  country: '',
  city: '',
  address: '',
};

const PROFILE_FIELDS = [
  { name: 'firstName', label: 'الاسم الأول', autoComplete: 'given-name', maxLength: 60 },
  { name: 'lastName', label: 'اسم العائلة', autoComplete: 'family-name', maxLength: 60 },
  { name: 'email', label: 'البريد الإلكتروني', type: 'email', autoComplete: 'email', maxLength: 254 },
  { name: 'phone', label: 'رقم الهاتف', type: 'tel', autoComplete: 'tel', maxLength: 30 },
  { name: 'dateOfBirth', label: 'تاريخ الميلاد', type: 'date' },
  { name: 'country', label: 'الدولة', autoComplete: 'country-name', maxLength: 100 },
  { name: 'city', label: 'المدينة', autoComplete: 'address-level2', maxLength: 100 },
  { name: 'address', label: 'العنوان', autoComplete: 'street-address', maxLength: 240 },
];

function formatValue(value) {
  return value || 'غير محدد';
}

function ProfilePage({ onOpenAccountSettings }) {
  const { currentUser, setCurrentUser } = useUser();
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState(EMPTY_PROFILE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (!authApi.getMyProfile.isAvailable()) {
        throw new Error('خدمة الملف الشخصي غير متاحة في هذا الإصدار');
      }
      const result = await authApi.getMyProfile();
      if (!result || typeof result !== 'object') {
        throw new Error('لم يستلم التطبيق بيانات الملف الشخصي');
      }
      const nextForm = Object.fromEntries(
        Object.keys(EMPTY_PROFILE).map((key) => [key, result[key] || '']),
      );
      setProfile(result);
      setForm(nextForm);
    } catch (loadError) {
      setError(loadError.message || 'تعذر تحميل الملف الشخصي');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const displayName = profile?.fullName
    || [profile?.firstName, profile?.lastName].filter(Boolean).join(' ')
    || currentUser?.username
    || 'المستخدم';
  const initials = useMemo(
    () => displayName.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '؟',
    [displayName],
  );
  const roleLabel = profile?.role === 'admin'
    ? 'مدير النظام'
    : profile?.role || 'مستخدم';

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((previous) => ({ ...previous, [name]: value }));
  }

  function cancelEdit() {
    setForm(Object.fromEntries(
      Object.keys(EMPTY_PROFILE).map((key) => [key, profile?.[key] || '']),
    ));
    setEditing(false);
    setError('');
    setSuccess('');
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      if (!authApi.saveMyProfile.isAvailable()) {
        throw new Error('خدمة حفظ الملف الشخصي غير متاحة في هذا الإصدار');
      }
      const payload = Object.fromEntries(
        Object.entries(form).map(([key, value]) => [key, value.trim() || null]),
      );
      const updated = await authApi.saveMyProfile(payload);
      if (!updated || typeof updated !== 'object') {
        throw new Error('لم يستلم التطبيق تأكيد تحديث الملف الشخصي');
      }

      setProfile(updated);
      setForm(Object.fromEntries(
        Object.keys(EMPTY_PROFILE).map((key) => [key, updated[key] || '']),
      ));
      setCurrentUser((user) => user ? {
        ...user,
        firstName: updated.firstName,
        lastName: updated.lastName,
        fullName: updated.fullName,
      } : user);
      setSuccess('تم حفظ بيانات الملف الشخصي بنجاح');
      setEditing(false);
    } catch (saveError) {
      setError(saveError.message || 'تعذر حفظ الملف الشخصي');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="profile-page" aria-labelledby="profile-page-title">
      <header className="profile-page-heading">
        <div>
          <span className="profile-page-eyebrow">الحساب الشخصي</span>
          <h1 id="profile-page-title">ملفي الشخصي</h1>
          <p>اعرض بياناتك الشخصية وحدّث معلومات التواصل والعنوان.</p>
        </div>
        {!editing && !loading && profile && (
          <button type="button" className="profile-action-primary" onClick={() => {
            setEditing(true);
            setSuccess('');
            setError('');
          }}>
            <span aria-hidden="true">✎</span>
            تعديل الملف الشخصي
          </button>
        )}
      </header>

      {error && (
        <div className="profile-feedback profile-feedback-error" role="alert">
          <span>{error}</span>
          {!profile && (
            <button type="button" onClick={loadProfile} disabled={loading}>
              إعادة المحاولة
            </button>
          )}
        </div>
      )}
      {success && <div className="profile-feedback profile-feedback-success" role="status">{success}</div>}

      {loading ? (
        <div className="profile-loading" role="status">جاري تحميل بيانات الملف الشخصي...</div>
      ) : profile ? (
        <>
          <article className="profile-summary-card">
            <div className="profile-avatar" aria-hidden="true">{initials}</div>
            <div className="profile-summary-info">
              <h2>{displayName}</h2>
              <p className="profile-username">@{profile.username}</p>
              <span className="profile-role-badge">{roleLabel}</span>
            </div>
            <div className="profile-account-date">
              <span>عضو منذ</span>
              <strong>{profile.createdAt
                ? new Date(profile.createdAt).toLocaleDateString('ar-EG')
                : 'غير محدد'}</strong>
            </div>
          </article>

          {editing ? (
            <form className="profile-details-card" onSubmit={handleSubmit}>
              <div className="profile-section-title">
                <div>
                  <h2>البيانات الشخصية</h2>
                  <p>حدّث معلوماتك، ثم احفظ التغييرات.</p>
                </div>
              </div>

              <div className="profile-form-grid">
                {PROFILE_FIELDS.map((field) => (
                  <label className={`profile-form-field${field.name === 'address' ? ' profile-form-field-wide' : ''}`} key={field.name}>
                    <span>{field.label}</span>
                    <input
                      name={field.name}
                      type={field.type || 'text'}
                      value={form[field.name]}
                      onChange={handleChange}
                      autoComplete={field.autoComplete}
                      maxLength={field.maxLength}
                    />
                  </label>
                ))}
                <label className="profile-form-field">
                  <span>النوع</span>
                  <select name="gender" value={form.gender} onChange={handleChange}>
                    <option value="">غير محدد</option>
                    <option value="male">ذكر</option>
                    <option value="female">أنثى</option>
                    <option value="prefer_not_to_say">أفضل عدم التحديد</option>
                  </select>
                </label>
              </div>

              <div className="profile-form-actions">
                <button type="button" className="profile-action-secondary" onClick={cancelEdit} disabled={saving}>
                  إلغاء
                </button>
                <button type="submit" className="profile-action-primary" disabled={saving}>
                  {saving ? 'جاري الحفظ...' : 'حفظ التغييرات'}
                </button>
              </div>
            </form>
          ) : (
            <article className="profile-details-card">
              <div className="profile-section-title">
                <div>
                  <h2>المعلومات الشخصية</h2>
                  <p>معلومات الملف الشخصي المرتبطة بحسابك.</p>
                </div>
              </div>
              <div className="profile-information-grid">
                <div><span>الاسم الأول</span><strong>{formatValue(profile.firstName)}</strong></div>
                <div><span>اسم العائلة</span><strong>{formatValue(profile.lastName)}</strong></div>
                <div><span>البريد الإلكتروني</span><strong dir="ltr">{formatValue(profile.email)}</strong></div>
                <div><span>رقم الهاتف</span><strong dir="ltr">{formatValue(profile.phone)}</strong></div>
                <div><span>النوع</span><strong>{profile.gender === 'male' ? 'ذكر' : profile.gender === 'female' ? 'أنثى' : profile.gender === 'prefer_not_to_say' ? 'أفضل عدم التحديد' : 'غير محدد'}</strong></div>
                <div><span>تاريخ الميلاد</span><strong>{formatValue(profile.dateOfBirth)}</strong></div>
              </div>
              <div className="profile-location-section">
                <h3>الموقع</h3>
                <div className="profile-information-grid">
                  <div><span>الدولة</span><strong>{formatValue(profile.country)}</strong></div>
                  <div><span>المدينة</span><strong>{formatValue(profile.city)}</strong></div>
                  <div className="profile-information-wide"><span>العنوان</span><strong>{formatValue(profile.address)}</strong></div>
                </div>
              </div>
              <div className="profile-account-actions">
                <span>اسم المستخدم وكلمة المرور</span>
                <button type="button" className="profile-action-secondary" onClick={onOpenAccountSettings}>
                  إدارة بيانات الدخول
                </button>
              </div>
            </article>
          )}
        </>
      ) : null}
    </section>
  );
}

export default ProfilePage;
