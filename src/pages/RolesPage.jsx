import { useCallback, useEffect, useMemo, useState } from 'react';
import permissionGroups from '../../shared/permissions.json';
import defaultRolePermissions from '../../shared/defaultRolePermissions.json';
import * as enterpriseApi from '../api/enterprise.js';
import {
  AlertIcon, BarsIcon, CardIcon, CheckIcon, ClipboardCheckIcon, ClockIcon, CurrencyIcon,
  DrawerIcon, GiftIcon, InfoIcon, KeyIcon, MonitorIcon, PackageIcon, PlusIcon, ReceiptIcon,
  RefreshIcon, ScaleIcon, SearchIcon, ShieldIcon, SlidersIcon, StarIcon, StoreIcon, UserIcon,
  WarehouseIcon,
} from '../components/icons/PosIcons.jsx';
import '../styles/roles.css';

const MODULE_ICONS = {
  pos: MonitorIcon, inventory: PackageIcon, sales: ReceiptIcon, customers: UserIcon,
  subscriptions: CardIcon, commissions: CurrencyIcon, reports: BarsIcon, settings: ShieldIcon,
  enterprise: SlidersIcon, team: UserIcon, attendance: ClockIcon, leaves: ClipboardCheckIcon,
  roles: KeyIcon, procurement: WarehouseIcon, shifts: DrawerIcon, appointments: ClockIcon,
  promotions: GiftIcon, channels: StoreIcon, ai: StarIcon, cases: ScaleIcon,
};
const ROLE_ICONS = { admin: ShieldIcon, manager: StoreIcon, cashier: MonitorIcon };

const ALL_PERMISSIONS = permissionGroups.flatMap((group) => group.permissions);
const SENSITIVE = new Set(permissionGroups.flatMap((group) => group.sensitive || []));
const LABELS = Object.assign({}, ...permissionGroups.map((group) => group.labels || {}));

const FILTERS = [
  { key: 'all', label: 'الكل' },
  { key: 'enabled', label: 'المفعلة' },
  { key: 'sensitive', label: 'الحساسة' },
];

// "مدير فرع / تشغيل (Manager)" -> "مدير فرع / تشغيل"
const displayName = (name = '') => name.replace(/\s*\([^)]*\)\s*$/, '');
const expand = (permissions = []) => (permissions.includes('*') ? ALL_PERMISSIONS : permissions);

export function countChanges(saved, draft) {
  const a = new Set(saved);
  const b = new Set(draft);
  return [...a].filter((p) => !b.has(p)).length + [...b].filter((p) => !a.has(p)).length;
}

function RolesPage() {
  const [roles, setRoles] = useState([]);
  const [selectedRoleKey, setSelectedRoleKey] = useState('');
  const [draft, setDraft] = useState([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [form, setForm] = useState({ roleKey: '', roleName: '', description: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadRoles = useCallback(async (preferredKey) => {
    setError('');
    try {
      const result = await enterpriseApi.getSystemRoles();
      if (!Array.isArray(result)) throw new Error('استجابة الأدوار غير صالحة');
      setRoles(result);
      const selected = result.find((role) => role.role_key === preferredKey) || result[0];
      if (selected) {
        setSelectedRoleKey(selected.role_key);
        setDraft(expand(selected.permissions));
      }
    } catch (loadError) {
      setError(loadError.message || 'تعذر تحميل الأدوار والصلاحيات');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRoles();
  }, [loadRoles]);

  const selectedRole = roles.find((role) => role.role_key === selectedRoleKey);
  const isAdminRole = selectedRoleKey === 'admin';
  const saved = useMemo(() => expand(selectedRole?.permissions), [selectedRole]);
  const changes = countChanges(saved, draft);
  const draftSet = useMemo(() => new Set(draft), [draft]);

  function selectRole(roleKey) {
    if (roleKey === selectedRoleKey) return;
    if (changes && !window.confirm('فيه تغييرات مش محفوظة على الدور الحالي. تتجاهلها؟')) return;
    const role = roles.find((item) => item.role_key === roleKey);
    setSelectedRoleKey(roleKey);
    setDraft(expand(role?.permissions));
    setMessage('');
  }

  function togglePermission(permission) {
    if (isAdminRole) return;
    setDraft((current) => (current.includes(permission)
      ? current.filter((item) => item !== permission)
      : [...current, permission]));
  }

  function toggleGroup(permissions) {
    if (isAdminRole) return;
    const allSelected = permissions.every((permission) => draftSet.has(permission));
    setDraft((current) => (allSelected
      ? current.filter((permission) => !permissions.includes(permission))
      : [...new Set([...current, ...permissions])]));
  }

  function copyFrom(roleKey) {
    const source = roles.find((role) => role.role_key === roleKey);
    if (source) setDraft([...expand(source.permissions)]);
  }

  async function createRole(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const newKey = form.roleKey.trim().toLowerCase();
      await enterpriseApi.createSystemRole({
        roleKey: newKey,
        roleName: form.roleName.trim(),
        description: form.description.trim(),
      });
      setForm({ roleKey: '', roleName: '', description: '' });
      setShowCreateModal(false);
      await loadRoles(newKey);
      setMessage('تم إنشاء الدور. اختر صلاحياته ثم احفظها.');
    } catch (saveError) {
      setError(saveError.message || 'تعذر إنشاء الدور');
    } finally {
      setSaving(false);
    }
  }

  async function savePermissions() {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await enterpriseApi.setRolePermissions(selectedRoleKey, draft);
      await loadRoles(selectedRoleKey);
      setMessage('تم حفظ الصلاحيات وتطبيقها فورًا على الحسابات المرتبطة بالدور.');
    } catch (saveError) {
      setError(saveError.message || 'تعذر حفظ الصلاحيات');
    } finally {
      setSaving(false);
    }
  }

  function openCreate() {
    if (changes && !window.confirm('فيه تغييرات مش محفوظة على الدور الحالي. تتجاهلها؟')) return;
    setDraft(saved);
    setShowCreateModal(true);
  }

  const q = query.trim().toLowerCase();
  const visibleGroups = permissionGroups
    .map((group) => ({
      ...group,
      visible: group.permissions.filter((permission) => {
        if (filter === 'enabled' && !draftSet.has(permission)) return false;
        if (filter === 'sensitive' && !SENSITIVE.has(permission)) return false;
        if (!q) return true;
        return permission.toLowerCase().includes(q)
          || (LABELS[permission] || '').toLowerCase().includes(q)
          || group.moduleName.toLowerCase().includes(q);
      }),
    }))
    .filter((group) => group.visible.length);

  const fullModules = permissionGroups.filter((group) => group.permissions.every((p) => draftSet.has(p))).length;
  const sensitiveOn = [...SENSITIVE].filter((p) => draftSet.has(p)).length;
  const enabledCount = ALL_PERMISSIONS.filter((p) => draftSet.has(p)).length;
  const otherRoles = roles.filter((role) => role.role_key !== selectedRoleKey);
  const defaults = defaultRolePermissions[selectedRoleKey] || [];

  return (
    <section className="roles-page">
      <header className="roles-head">
        <div>
          <nav className="roles-crumbs" aria-label="مسار الصفحة">
            <span>الإعدادات</span><span aria-hidden="true">›</span>
            <span>المستخدمون</span><span aria-hidden="true">›</span>
            <span aria-current="page">الأدوار والصلاحيات</span>
          </nav>
          <h1>الأدوار والصلاحيات</h1>
          <p>كل دور بيحدد الشاشات والعمليات المتاحة للمستخدمين التابعين له. التغييرات تسري فورًا بعد الحفظ.</p>
        </div>
        <div className="roles-head-actions">
          <button type="button" className="roles-btn" onClick={openCreate}>
            <PlusIcon size={18} /> إنشاء دور
          </button>
          <button
            type="button"
            className="roles-btn roles-btn--primary"
            onClick={savePermissions}
            disabled={saving || isAdminRole || !selectedRole || !changes}
          >
            <CheckIcon size={18} /> {saving ? 'جارٍ الحفظ...' : 'حفظ الصلاحيات'}
          </button>
        </div>
      </header>

      {error && <p className="roles-alert is-error" role="alert">{error}</p>}
      {message && <p className="roles-alert is-success" role="status">{message}</p>}

      {loading ? (
        <p role="status" className="roles-empty">جارٍ تحميل الأدوار...</p>
      ) : !roles.length ? (
        <p className="roles-empty roles-card">لا توجد أدوار متاحة.</p>
      ) : (
        <div className="roles-layout">
          <aside className="roles-card roles-list" aria-label="الأدوار">
            <header className="roles-list-head">
              <h2>الأدوار</h2>
              <span>{roles.length} أدوار</span>
            </header>
            <ul>
              {roles.map((role) => {
                const Icon = ROLE_ICONS[role.role_key] || KeyIcon;
                const isAll = (role.permissions || []).includes('*');
                const granted = expand(role.permissions).length;
                return (
                  <li key={role.role_key}>
                    <button
                      type="button"
                      className="roles-list-item"
                      aria-current={role.role_key === selectedRoleKey ? 'true' : undefined}
                      onClick={() => selectRole(role.role_key)}
                    >
                      <span className="roles-icon"><Icon size={18} /></span>
                      <span className="roles-list-body">
                        <span className="roles-list-name">
                          {displayName(role.role_name)}
                          <span className="roles-badge">{role.is_system ? 'نظامي' : 'مخصص'}</span>
                        </span>
                        <span className="roles-muted">
                          {role.user_count ?? 0} مستخدم · {isAll ? 'كل الصلاحيات' : `${granted} من ${ALL_PERMISSIONS.length} صلاحية`}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="roles-list-footer">
              <button type="button" className="roles-btn roles-btn--dashed" onClick={openCreate}>
                <PlusIcon size={18} /> إنشاء دور جديد
              </button>
            </div>
          </aside>

          {selectedRole && (
            <div className="roles-main">
              <section className="roles-card roles-summary" aria-labelledby="role-title">
                <div className="roles-summary-top">
                  <div>
                    <h2 id="role-title">
                      {displayName(selectedRole.role_name)}
                      <code className="roles-code">{selectedRole.role_key}</code>
                    </h2>
                    {selectedRole.description && <p>{selectedRole.description}</p>}
                  </div>
                  {!isAdminRole && (
                    <div className="roles-summary-actions">
                      <select
                        className="roles-btn roles-select"
                        aria-label="نسخ الصلاحيات من دور آخر"
                        value=""
                        onChange={(event) => copyFrom(event.target.value)}
                      >
                        <option value="" disabled>نسخ من دور آخر</option>
                        {otherRoles.map((role) => (
                          <option key={role.role_key} value={role.role_key}>{displayName(role.role_name)}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="roles-btn"
                        onClick={() => setDraft([...defaults])}
                        title={selectedRole.is_system ? 'صلاحيات الدور الأصلية' : 'دور مخصص: الافتراضي بدون صلاحيات'}
                      >
                        <RefreshIcon size={16} /> إعادة للافتراضي
                      </button>
                    </div>
                  )}
                </div>
                <div className="roles-summary-bottom">
                  <div className="roles-progress">
                    <div className="roles-progress-label">
                      <span>الصلاحيات المفعلة</span>
                      <span><b>{enabledCount}</b> من {ALL_PERMISSIONS.length}</span>
                    </div>
                    <div
                      className="roles-progress-track"
                      role="progressbar"
                      aria-label="الصلاحيات المفعلة"
                      aria-valuemin={0}
                      aria-valuemax={ALL_PERMISSIONS.length}
                      aria-valuenow={enabledCount}
                    >
                      <span style={{ '--pct': `${(enabledCount / ALL_PERMISSIONS.length) * 100}%` }} />
                    </div>
                  </div>
                  <div className="roles-summary-chips">
                    <span className="roles-badge roles-badge--lg roles-badge--success">
                      <CheckIcon size={14} /> {fullModules} أقسام مفعلة بالكامل
                    </span>
                    {sensitiveOn > 0 && (
                      <span className="roles-badge roles-badge--lg roles-badge--danger">
                        <AlertIcon size={14} /> {sensitiveOn} صلاحيات حساسة مفعلة
                      </span>
                    )}
                  </div>
                </div>
                {isAdminRole && (
                  <p className="roles-note">مدير النظام يمتلك جميع الصلاحيات، ولا يمكن تقليص صلاحياته.</p>
                )}
              </section>

              <div className="roles-toolbar">
                <label className="roles-search">
                  <SearchIcon size={18} />
                  <input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="ابحث باسم الصلاحية أو الكود..."
                    aria-label="بحث في الصلاحيات"
                  />
                </label>
                <div className="roles-segmented" role="group" aria-label="تصفية الصلاحيات">
                  {FILTERS.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      aria-pressed={filter === item.key}
                      onClick={() => setFilter(item.key)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {!visibleGroups.length && <p className="roles-card roles-empty">مفيش صلاحيات مطابقة.</p>}

              {visibleGroups.map((group) => {
                const Icon = MODULE_ICONS[group.moduleKey] || ShieldIcon;
                const onCount = group.permissions.filter((p) => draftSet.has(p)).length;
                const allOn = onCount === group.permissions.length;
                return (
                  <section
                    key={group.moduleKey}
                    className={`roles-card roles-group${group.restricted ? ' is-restricted' : ''}`}
                    aria-labelledby={`group-${group.moduleKey}`}
                  >
                    <header className="roles-group-head">
                      <span className="roles-icon"><Icon size={18} /></span>
                      <div className="roles-group-title">
                        <h3 id={`group-${group.moduleKey}`}>{group.moduleName}</h3>
                        <span className="roles-muted">{group.description} · {group.permissions.length} صلاحيات</span>
                      </div>
                      <span className={`roles-badge roles-count${allOn ? ' roles-badge--success' : ''}`} dir="ltr">
                        {onCount} / {group.permissions.length}
                      </span>
                      <label className="roles-all">
                        الكل
                        <input
                          type="checkbox"
                          role="switch"
                          className="roles-switch"
                          checked={allOn}
                          disabled={isAdminRole}
                          onChange={() => toggleGroup(group.permissions)}
                          aria-label={`كل صلاحيات ${group.moduleName}`}
                        />
                      </label>
                    </header>
                    <ul className="roles-perm-grid">
                      {group.visible.map((permission) => (
                        <li key={permission}>
                          <label className="roles-perm">
                            <input
                              type="checkbox"
                              role="switch"
                              className="roles-switch"
                              checked={draftSet.has(permission)}
                              disabled={isAdminRole}
                              onChange={() => togglePermission(permission)}
                            />
                            <span className="roles-perm-text">
                              <span className="roles-perm-name">{LABELS[permission] || permission}</span>
                              <span className="roles-perm-tags">
                                <code className="roles-code">{permission}</code>
                                {SENSITIVE.has(permission) && (
                                  <span className="roles-badge roles-badge--danger">حساسة</span>
                                )}
                              </span>
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}

              {changes > 0 && (
                <div className="roles-dirtybar" role="status">
                  <InfoIcon size={18} />
                  <p>
                    عندك <b>{changes} تغييرات</b> لسه مش محفوظة على دور «{displayName(selectedRole.role_name)}»
                  </p>
                  <button type="button" className="roles-btn roles-btn--ghost-inverse" onClick={() => setDraft(saved)} disabled={saving}>
                    تراجع
                  </button>
                  <button type="button" className="roles-btn roles-btn--primary" onClick={savePermissions} disabled={saving}>
                    {saving ? 'جارٍ الحفظ...' : 'حفظ الصلاحيات'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {showCreateModal && (
        <div
          className="roles-modal-overlay"
          onClick={() => !saving && setShowCreateModal(false)}
          onKeyDown={(event) => event.key === 'Escape' && !saving && setShowCreateModal(false)}
        >
          <form
            className="roles-create-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-role-title"
            onSubmit={createRole}
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="new-role-title">إنشاء دور وظيفي</h2>
            <label>
              المفتاح البرمجي
              <input
                value={form.roleKey}
                onChange={(event) => setForm({ ...form, roleKey: event.target.value })}
                pattern="[a-zA-Z][a-zA-Z0-9_-]{1,31}"
                minLength={2}
                maxLength={32}
                placeholder="مثال: accountant"
                required
                autoFocus
                dir="ltr"
              />
            </label>
            <label>
              اسم الدور
              <input
                value={form.roleName}
                onChange={(event) => setForm({ ...form, roleName: event.target.value })}
                maxLength={80}
                required
              />
            </label>
            <label>
              الوصف
              <textarea
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                maxLength={300}
                rows={3}
              />
            </label>
            <div className="roles-modal-actions">
              <button type="button" className="roles-btn" onClick={() => setShowCreateModal(false)} disabled={saving}>إلغاء</button>
              <button type="submit" className="roles-btn roles-btn--primary" disabled={saving}>
                {saving ? 'جارٍ الإنشاء...' : 'إنشاء الدور'}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}

export default RolesPage;
