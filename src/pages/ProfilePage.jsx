import { useCallback, useEffect, useState } from 'react';
import { useUser } from '../contexts/UserContext.jsx';
import * as authApi from '../api/auth.js';
import * as auditApi from '../api/audit.js';
import { getActionMeta } from '../utils/auditActions.js';
import {
  LockIcon, MapPinIcon, PencilIcon, PlusIcon, ShieldIcon, UserIcon,
} from '../components/icons/PosIcons.jsx';
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

const GENDER_LABELS = { male: 'ذكر', female: 'أنثى', prefer_not_to_say: 'أفضل عدم التحديد' };

const SECTIONS = [
  {
    key: 'basic',
    title: 'البيانات الأساسية',
    hint: 'الاسم وبيانات التواصل المرتبطة بحسابك',
    Icon: UserIcon,
    tone: 'primary',
    fields: [
      { name: 'firstName', label: 'الاسم الأول', autoComplete: 'given-name', maxLength: 60 },
      { name: 'lastName', label: 'اسم العائلة', autoComplete: 'family-name', maxLength: 60 },
      { name: 'phone', label: 'رقم الهاتف', type: 'tel', autoComplete: 'tel', maxLength: 30, ltr: true },
      { name: 'email', label: 'البريد الإلكتروني', type: 'email', autoComplete: 'email', maxLength: 254, ltr: true },
      { name: 'gender', label: 'النوع', options: GENDER_LABELS },
      { name: 'dateOfBirth', label: 'تاريخ الميلاد', type: 'date' },
    ],
  },
  {
    key: 'location',
    title: 'الموقع والعنوان',
    hint: 'يستخدم في الفواتير وبيانات الفرع',
    Icon: MapPinIcon,
    tone: 'info',
    fields: [
      { name: 'country', label: 'الدولة', autoComplete: 'country-name', maxLength: 100 },
      { name: 'city', label: 'المدينة', autoComplete: 'address-level2', maxLength: 100 },
      { name: 'address', label: 'العنوان', autoComplete: 'street-address', maxLength: 240, wide: true },
    ],
  },
];

const ALL_FIELDS = SECTIONS.flatMap((section) => section.fields);
// Fields that matter most for receipts and account recovery, named in the completion hint.
const KEY_FIELDS = ['email', 'firstName'];

function toForm(source) {
  return Object.fromEntries(Object.keys(EMPTY_PROFILE).map((key) => [key, source?.[key] || '']));
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const time = date.toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit' });
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return `اليوم — ${time}`;
  if (date.toDateString() === yesterday.toDateString()) return `أمس — ${time}`;
  return `${date.toLocaleDateString('ar-EG', { day: 'numeric', month: 'long' })} — ${time}`;
}

function displayValue(field, value) {
  if (field.options) return field.options[value] || '';
  return value;
}

function ProfilePage({ onOpenAccountSettings }) {
  const { currentUser, setCurrentUser } = useUser();
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState(EMPTY_PROFILE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activity, setActivity] = useState(null);

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
      setProfile(result);
      setForm(toForm(result));
    } catch (loadError) {
      setError(loadError.message || 'تعذر تحميل الملف الشخصي');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  // The audit log is admin-only on the backend; other roles simply don't get the activity card.
  useEffect(() => {
    if (!profile?.id || profile.role !== 'admin' || !auditApi.getAuditLogs.isAvailable()) return;
    let cancelled = false;
    auditApi.getAuditLogs({ userId: profile.id, limit: 4 })
      .then((result) => { if (!cancelled) setActivity(result?.items || []); })
      .catch(() => { if (!cancelled) setActivity(null); });
    return () => { cancelled = true; };
  }, [profile?.id, profile?.role]);

  const displayName = profile?.fullName
    || [profile?.firstName, profile?.lastName].filter(Boolean).join(' ')
    || profile?.username
    || currentUser?.username
    || 'المستخدم';
  const initial = displayName.trim().charAt(0).toUpperCase() || '؟';
  const isAdmin = profile?.role === 'admin';
  const roleLabel = isAdmin ? 'مدير النظام' : profile?.role || 'مستخدم';

  const missing = ALL_FIELDS.filter((field) => !profile?.[field.name]);
  const completion = Math.round(((ALL_FIELDS.length - missing.length) / ALL_FIELDS.length) * 100);
  const missingKey = KEY_FIELDS
    .filter((name) => missing.some((field) => field.name === name))
    .map((name) => ALL_FIELDS.find((field) => field.name === name).label);

  const lastLogin = activity?.find((log) => log.action_type === 'login')?.created_at;
  const stats = [
    { label: 'عضو منذ', value: formatDate(profile?.createdAt) },
    { label: 'آخر دخول', value: formatDateTime(lastLogin) },
    { label: 'اسم المستخدم', value: profile?.username, ltr: true },
    { label: 'الصلاحيات', value: isAdmin ? 'كامل الصلاحيات' : roleLabel },
  ].filter((stat) => stat.value);

  function startEdit(sectionKey) {
    setForm(toForm(profile));
    setEditing(sectionKey);
    setError('');
    setSuccess('');
  }

  function cancelEdit() {
    setForm(toForm(profile));
    setEditing(null);
    setError('');
  }

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((previous) => ({ ...previous, [name]: value }));
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
      setForm(toForm(updated));
      setCurrentUser((user) => (user ? {
        ...user,
        firstName: updated.firstName,
        lastName: updated.lastName,
        fullName: updated.fullName,
      } : user));
      setSuccess('تم حفظ بيانات الملف الشخصي بنجاح');
      setEditing(null);
    } catch (saveError) {
      setError(saveError.message || 'تعذر حفظ الملف الشخصي');
    } finally {
      setSaving(false);
    }
  }

  function renderField(field, sectionKey) {
    const value = profile[field.name];
    const className = `prf-field${field.wide ? ' prf-field--wide' : ''}`;

    if (editing === sectionKey) {
      const id = `prf-${field.name}`;
      return (
        <div className={className} key={field.name}>
          <label htmlFor={id}>{field.label}</label>
          {field.options ? (
            <select id={id} name={field.name} className="prf-input" value={form[field.name]} onChange={handleChange}>
              <option value="">غير محدد</option>
              {Object.entries(field.options).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          ) : (
            <input
              id={id}
              className="prf-input"
              name={field.name}
              type={field.type || 'text'}
              dir={field.ltr ? 'ltr' : undefined}
              value={form[field.name]}
              onChange={handleChange}
              autoComplete={field.autoComplete}
              maxLength={field.maxLength}
            />
          )}
        </div>
      );
    }

    return (
      <div className={className} key={field.name}>
        <span>{field.label}</span>
        {value ? (
          <strong dir={field.ltr ? 'ltr' : undefined}>{displayValue(field, value)}</strong>
        ) : (
          <button
            type="button"
            className="prf-add"
            onClick={() => startEdit(sectionKey)}
            aria-label={`إضافة ${field.label}`}
          >
            <PlusIcon size={16} aria-hidden="true" />
            إضافة
          </button>
        )}
      </div>
    );
  }

  return (
    <section className="prf-page" aria-labelledby="prf-title">
      <nav className="prf-crumbs" aria-label="مسار الصفحة">
        <span>الحساب الشخصي</span>
        <span aria-hidden="true">‹</span>
        <span id="prf-title" aria-current="page">ملفي الشخصي</span>
      </nav>

      {error && (
        <div className="prf-feedback prf-feedback--error" role="alert">
          <span>{error}</span>
          {!profile && (
            <button type="button" className="prf-btn prf-btn--ghost" onClick={loadProfile} disabled={loading}>
              إعادة المحاولة
            </button>
          )}
        </div>
      )}
      {success && <div className="prf-feedback prf-feedback--success" role="status">{success}</div>}

      {loading ? (
        <div className="prf-loading" role="status">جاري تحميل بيانات الملف الشخصي...</div>
      ) : profile ? (
        <>
          <header className="prf-hero">
            <div className="prf-hero-top">
              <div className="prf-identity">
                <div className="prf-avatar" aria-hidden="true">{initial}</div>
                <div>
                  <h1>{displayName}</h1>
                  <p dir={profile.email ? 'ltr' : undefined}>{profile.email || 'لا يوجد بريد إلكتروني مسجّل'}</p>
                  <div className="prf-chips">
                    <span className="prf-chip prf-chip--role">
                      <ShieldIcon size={14} aria-hidden="true" />
                      {roleLabel}
                    </span>
                    <span className="prf-chip prf-chip--online">
                      <span className="prf-dot" aria-hidden="true" />
                      نشط الآن
                    </span>
                  </div>
                </div>
              </div>
              <div className="prf-hero-actions">
                <button type="button" className="prf-btn prf-btn--primary" onClick={() => startEdit('basic')}>
                  <PencilIcon size={16} aria-hidden="true" />
                  تعديل الملف الشخصي
                </button>
                <button type="button" className="prf-btn prf-btn--on-dark" onClick={onOpenAccountSettings}>
                  <LockIcon size={16} aria-hidden="true" />
                  تغيير كلمة المرور
                </button>
              </div>
            </div>
            {stats.length > 0 && (
              <dl className="prf-stats">
                {stats.map((stat) => (
                  <div key={stat.label}>
                    <dt>{stat.label}</dt>
                    <dd dir={stat.ltr ? 'ltr' : undefined}>{stat.value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </header>

          {missing.length > 0 && (
            <article className="prf-card prf-completion">
              <div className="prf-completion-body">
                <h2>
                  اكتمال الملف الشخصي
                  <span className="prf-completion-pct">{completion.toLocaleString('en-US')}%</span>
                </h2>
                <div
                  className="prf-progress"
                  role="progressbar"
                  aria-valuenow={completion}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="نسبة اكتمال الملف الشخصي"
                >
                  <span style={{ inlineSize: `${completion}%` }} />
                </div>
                <p>
                  فاضل {missing.length === 2 ? 'حقلين' : `${missing.length.toLocaleString('ar-EG')} ${missing.length > 2 && missing.length < 11 ? 'حقول' : 'حقل'}`} عشان الملف يكمل
                  {missingKey.length > 0 && ` — ${missingKey.join(' و')} أهمهم`}.
                </p>
              </div>
              <button type="button" className="prf-btn prf-btn--ghost" onClick={() => startEdit(
                SECTIONS.find((section) => section.fields.some((field) => !profile[field.name])).key,
              )}>
                أكمل بياناتك
              </button>
            </article>
          )}

          <div className="prf-layout">
            <div className="prf-main">
              {SECTIONS.map((section) => (
                <form
                  key={section.key}
                  className="prf-card prf-section"
                  onSubmit={handleSubmit}
                  aria-labelledby={`prf-section-${section.key}`}
                >
                  <div className="prf-section-head">
                    <span className={`prf-icon prf-icon--${section.tone}`} aria-hidden="true">
                      <section.Icon size={18} />
                    </span>
                    <div className="prf-section-titles">
                      <h2 id={`prf-section-${section.key}`}>{section.title}</h2>
                      <p>{section.hint}</p>
                    </div>
                    {editing !== section.key && (
                      <button
                        type="button"
                        className="prf-btn prf-btn--ghost prf-btn--sm"
                        onClick={() => startEdit(section.key)}
                        disabled={saving}
                      >
                        تعديل
                      </button>
                    )}
                  </div>
                  <div className="prf-grid">
                    {section.fields.map((field) => renderField(field, section.key))}
                  </div>
                  {editing === section.key && (
                    <div className="prf-form-actions">
                      <button type="button" className="prf-btn prf-btn--ghost" onClick={cancelEdit} disabled={saving}>
                        إلغاء
                      </button>
                      <button type="submit" className="prf-btn prf-btn--primary" disabled={saving}>
                        {saving ? 'جاري الحفظ...' : 'حفظ التغييرات'}
                      </button>
                    </div>
                  )}
                </form>
              ))}
            </div>

            <aside className="prf-side">
              <article className="prf-card prf-side-card" aria-labelledby="prf-security-title">
                <div className="prf-side-head">
                  <span className="prf-icon prf-icon--success" aria-hidden="true"><ShieldIcon size={18} /></span>
                  <h2 id="prf-security-title">الأمان</h2>
                </div>
                <div className="prf-kv">
                  <span>اسم المستخدم</span>
                  <strong dir="ltr">{profile.username}</strong>
                </div>
                <button type="button" className="prf-btn prf-btn--primary prf-btn--block" onClick={onOpenAccountSettings}>
                  تغيير كلمة المرور
                </button>
              </article>

              {activity && activity.length > 0 && (
                <article className="prf-card prf-side-card" aria-labelledby="prf-activity-title">
                  <h2 id="prf-activity-title">آخر النشاط</h2>
                  <ol className="prf-timeline">
                    {activity.map((log) => (
                      <li key={log.id} data-action={log.action_type}>
                        <strong>{getActionMeta(log.action_type).label}</strong>
                        <span>{formatDateTime(log.created_at)}</span>
                      </li>
                    ))}
                  </ol>
                </article>
              )}
            </aside>
          </div>
        </>
      ) : null}
    </section>
  );
}

export default ProfilePage;
