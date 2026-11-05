import { useCallback, useEffect, useState } from 'react';
import permissionGroups from '../../shared/permissions.json';
import * as enterpriseApi from '../api/enterprise.js';
import '../styles/roles.css';

function RolesPage() {
  const [roles, setRoles] = useState([]);
  const [selectedRoleKey, setSelectedRoleKey] = useState('');
  const [selectedPermissions, setSelectedPermissions] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [form, setForm] = useState({ roleKey: '', roleName: '', description: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadRoles = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await enterpriseApi.getSystemRoles();
      if (!Array.isArray(result)) throw new Error('استجابة الأدوار غير صالحة');
      setRoles(result);
      const selected = result.find((role) => role.role_key === selectedRoleKey) || result[0];
      if (selected) {
        setSelectedRoleKey(selected.role_key);
        setSelectedPermissions(selected.permissions || []);
      }
    } catch (loadError) {
      setError(loadError.message || 'تعذر تحميل الأدوار والصلاحيات');
    } finally {
      setLoading(false);
    }
  }, [selectedRoleKey]);

  useEffect(() => {
    loadRoles();
  }, [loadRoles]);

  function selectRole(roleKey) {
    const role = roles.find((item) => item.role_key === roleKey);
    setSelectedRoleKey(roleKey);
    setSelectedPermissions(role?.permissions || []);
    setMessage('');
  }

  function togglePermission(permission) {
    if (selectedPermissions.includes('*')) return;
    setSelectedPermissions((current) => current.includes(permission)
      ? current.filter((item) => item !== permission)
      : [...current, permission]);
  }

  function toggleGroup(permissions) {
    if (selectedPermissions.includes('*')) return;
    const allSelected = permissions.every((permission) => selectedPermissions.includes(permission));
    setSelectedPermissions((current) => allSelected
      ? current.filter((permission) => !permissions.includes(permission))
      : [...new Set([...current, ...permissions])]);
  }

  async function createRole(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await enterpriseApi.createSystemRole({
        roleKey: form.roleKey.trim().toLowerCase(),
        roleName: form.roleName.trim(),
        description: form.description.trim(),
      });
      const newKey = form.roleKey.trim().toLowerCase();
      setForm({ roleKey: '', roleName: '', description: '' });
      setShowCreateModal(false);
      await loadRoles();
      selectRole(newKey);
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
      await enterpriseApi.setRolePermissions(selectedRoleKey, selectedPermissions);
      setMessage('تم حفظ الصلاحيات وتطبيقها فورًا على الحسابات المرتبطة بالدور.');
      await loadRoles();
    } catch (saveError) {
      setError(saveError.message || 'تعذر حفظ الصلاحيات');
    } finally {
      setSaving(false);
    }
  }

  const selectedRole = roles.find((role) => role.role_key === selectedRoleKey);
  const isAdminRole = selectedRoleKey === 'admin';

  return (
    <section className="roles-page">
      <header className="roles-page-header">
        <div>
          <h1>الأدوار والصلاحيات</h1>
          <p>تُطبق الصلاحيات المحفوظة على الشاشات وعمليات النظام مباشرةً.</p>
        </div>
        <button type="button" className="primary-btn" onClick={() => setShowCreateModal(true)}>
          + إنشاء دور
        </button>
      </header>

      {error && <p className="roles-alert is-error" role="alert">{error}</p>}
      {message && <p className="roles-alert is-success" role="status">{message}</p>}

      {loading ? (
        <p role="status">جارٍ تحميل الأدوار...</p>
      ) : (
        <>
          {!roles.length ? (
            <p className="roles-empty">لا توجد أدوار متاحة.</p>
          ) : (
            <>
              <div className="roles-toolbar">
                <label htmlFor="roles-select">الدور الوظيفي</label>
                <select id="roles-select" value={selectedRoleKey} onChange={(event) => selectRole(event.target.value)}>
                  {roles.map((role) => (
                    <option key={role.role_key} value={role.role_key}>
                      {role.role_name} ({role.role_key}){role.is_system ? ' — نظامي' : ''}
                    </option>
                  ))}
                </select>
                <button type="button" className="primary-btn" onClick={savePermissions} disabled={saving || isAdminRole || !selectedRole}>
                  {saving ? 'جارٍ الحفظ...' : 'حفظ الصلاحيات'}
                </button>
              </div>
              {isAdminRole ? (
                <p className="roles-admin-note">مدير النظام يمتلك جميع الصلاحيات، ولا يمكن تقليص صلاحياته.</p>
              ) : (
                <div className="roles-permission-groups">
                  {permissionGroups.map((group) => (
                    <section className="roles-permission-group" key={group.moduleKey}>
                      <header>
                        <h2>{group.moduleName}</h2>
                        <button type="button" className="secondary-btn" onClick={() => toggleGroup(group.permissions)}>
                          {group.permissions.every((permission) => selectedPermissions.includes(permission))
                            ? 'إلغاء تحديد الكل'
                            : 'تحديد الكل'}
                        </button>
                      </header>
                      <div className="roles-permission-list">
                        {group.permissions.map((permission) => (
                          <label key={permission}>
                            <input
                              type="checkbox"
                              checked={selectedPermissions.includes(permission)}
                              onChange={() => togglePermission(permission)}
                            />
                            <code>{permission}</code>
                          </label>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}

      {showCreateModal && (
        <div className="modal-overlay roles-modal-overlay" onClick={() => !saving && setShowCreateModal(false)}>
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
              <button type="button" className="secondary-btn" onClick={() => setShowCreateModal(false)} disabled={saving}>إلغاء</button>
              <button type="submit" className="primary-btn" disabled={saving}>{saving ? 'جارٍ الإنشاء...' : 'إنشاء الدور'}</button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}

export default RolesPage;
