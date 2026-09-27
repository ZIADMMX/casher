import { useState } from 'react';
import useUsers from '../hooks/useUsers.js';

function getAvatarColor(username) {
  const colors = ['#2E5BFF', '#00B894', '#6C5CE7', '#E17055', '#E84393', '#0984E3'];
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

function UsersPage({ currentUser }) {
  const { users, addCashier, removeUser, toggleActive, loading, error } = useUsers();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ username: '', password: '' });

  function updateForm(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const success = await addCashier(form);
    if (success) {
      setForm({ username: '', password: '' });
      setShowForm(false);
    }
  }

  async function handleToggleActive(user) {
    const action = user.is_active ? 'تعطيل' : 'تفعيل';
    if (!window.confirm(`متأكد إنك عايز ${action} حساب "${user.username}"؟`)) return;
    await toggleActive(user.id);
  }

  async function handleRemove(userId, username) {
    if (!window.confirm(`متأكد إنك عايز حذف نهائي لحساب "${username}"؟`)) return;
    await removeUser(userId);
  }

  return (
    <div className="users-page-container">
      <div className="page-header-row">
        <div>
          <h1>إدارة المستخدمين</h1>
          <p className="page-subtitle">{users.length} مستخدم مسجل</p>
        </div>
        <button className="primary-btn" onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'إلغاء' : '+ إضافة كاشير جديد'}
        </button>
      </div>

      {showForm && (
        <form className="product-form" onSubmit={handleSubmit}>
          <h3>إضافة حساب كاشير جديد</h3>
          {error && <p className="form-error">{error}</p>}
          <div className="form-row-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
            <input
              type="text"
              placeholder="اسم المستخدم"
              value={form.username}
              onChange={(e) => updateForm('username', e.target.value)}
              required
            />
            <input
              type="password"
              placeholder="كلمة المرور (6 أحرف على الأقل)"
              value={form.password}
              onChange={(e) => updateForm('password', e.target.value)}
              required
            />
          </div>
          <button type="submit" className="primary-btn">إنشاء الحساب</button>
        </form>
      )}

      {loading ? (
        <p>جاري التحميل...</p>
      ) : (
        <div className="users-grid">
          {users.map((u) => (
            <div key={u.id} className={u.is_active ? 'user-card' : 'user-card user-card-disabled'}>
              <div className="user-card-top">
                <div
                  className="user-avatar"
                  style={{ backgroundColor: getAvatarColor(u.username), opacity: u.is_active ? 1 : 0.4 }}
                >
                  {u.username.charAt(0).toUpperCase()}
                </div>
                {u.id === currentUser?.id ? (
                  <span className="user-you-tag">أنت</span>
                ) : (
                  <div className="user-card-actions">
                    <button
                      className={u.is_active ? 'icon-btn' : 'icon-btn icon-btn-success'}
                      title={u.is_active ? 'تعطيل الحساب' : 'تفعيل الحساب'}
                      onClick={() => handleToggleActive(u)}
                    >
                      {u.is_active ? '⏸' : '▶'}
                    </button>
                    <button
                      className="icon-btn icon-btn-danger"
                      title="حذف نهائي"
                      onClick={() => handleRemove(u.id, u.username)}
                    >
                      🗑
                    </button>
                  </div>
                )}
              </div>

              <div className="user-card-body">
                <h3 className="user-card-name">{u.username}</h3>
              </div>

              <div className="user-card-footer">
                <span className={u.role === 'admin' ? 'badge badge-success' : 'badge badge-warning'}>
                  {u.role === 'admin' ? '⚙ مدير' : '🛒 كاشير'}
                </span>
                {!u.is_active && <span className="badge badge-danger">معطل</span>}
                <span className="user-date">منذ {u.created_at?.split(' ')[0]}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default UsersPage;