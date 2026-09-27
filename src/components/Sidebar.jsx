import { useSettings } from '../contexts/SettingsContext.jsx';
import { useBusinessProfile } from '../contexts/BusinessProfileContext.jsx';
import NotificationBell from './NotificationBell.jsx';

function Sidebar({ activePage, onNavigate, currentUser, onLogout, onOpenProfile }) {
  const { settings } = useSettings();
  const { isModuleEnabled, getTerm } = useBusinessProfile();

  const allLinks = [
    {
      key: 'pos',
      label: 'نقطة البيع (POS)',
      badge: 'سريع',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="17" x2="12" y2="21" />
        </svg>
      ),
      roles: ['admin', 'cashier'],
    },
    {
      key: 'orders',
      label: `مركز ${getTerm('order', 'العمليات والطلبات')}`,
      badge: 'جديد',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
      ),
      roles: ['admin', 'cashier'],
    },
    {
      key: 'subscriptions',
      label: 'الاشتراكات والباقات',
      badge: 'عضويات',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
          <line x1="1" y1="10" x2="23" y2="10" />
        </svg>
      ),
      roles: ['admin', 'cashier'],
    },
    {
      key: 'commissions',
      label: 'العمولات والحوافز',
      badge: 'حوافز',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="8" r="7" />
          <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88" />
        </svg>
      ),
      roles: ['admin'],
    },
    {
      key: 'returns',
      label: 'المرتجعات والاستبدال',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="1 4 1 10 7 10" />
          <polyline points="23 20 23 14 17 14" />
          <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
        </svg>
      ),
      roles: ['admin', 'cashier'],
    },
    {
      key: 'products',
      label: 'المنتجات والمخزون',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
          <line x1="3" y1="6" x2="21" y2="6" />
          <path d="M16 10a4 4 0 0 1-8 0" />
        </svg>
      ),
      roles: ['admin'],
    },
    {
      key: 'customers',
      label: `${getTerm('customer', 'العملاء')} والديون`,
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      ),
      roles: ['admin', 'cashier'],
    },
    {
      key: 'suppliers',
      label: 'الموردين والمشتريات',
      badge: 'الآجل',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="1" y="3" width="15" height="13" rx="2" />
          <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
          <circle cx="5.5" cy="18.5" r="2.5" />
          <circle cx="18.5" cy="18.5" r="2.5" />
        </svg>
      ),
      roles: ['admin'],
    },
    {
      key: 'shifts',
      label: 'الورديات و Z-Report',
      badge: 'الدرج',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      ),
      roles: ['admin', 'cashier'],
    },
    {
      key: 'reports',
      label: 'التقارير والأرباح',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="20" x2="18" y2="10" />
          <line x1="12" y1="20" x2="12" y2="4" />
          <line x1="6" y1="20" x2="6" y2="14" />
        </svg>
      ),
      roles: ['admin'],
    },
    {
      key: 'users',
      label: 'المستخدمين والصلاحيات',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      ),
      roles: ['admin'],
    },
    {
      key: 'settings',
      label: 'إعدادات وتخصيص المحل',
      badge: 'تخصيص',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      ),
      roles: ['admin'],
    },
    {
      key: 'enterprise',
      label: 'محرك البنية والديناميكية',
      badge: 'Enterprise',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="12 2 2 7 12 12 22 7 12 2" />
          <polyline points="2 17 12 22 22 17" />
          <polyline points="2 12 12 17 22 12" />
        </svg>
      ),
      roles: ['admin'],
    },
  ];

  const pageModules = {
    pos: 'pos',
    orders: 'orders',
    subscriptions: 'subscriptions',
    commissions: 'commissions',
    returns: 'returns',
    products: 'inventory',
    customers: 'customers',
    suppliers: 'purchases',
    shifts: 'shifts',
    reports: 'reports',
    users: 'users',
    settings: 'settings',
    enterprise: 'enterprise',
  };
  const visibleLinks = allLinks.filter((link) =>
    link.roles.includes(currentUser.role) && isModuleEnabled(pageModules[link.key])
  );

  const initial = currentUser.username ? currentUser.username.charAt(0).toUpperCase() : 'U';
  const storeName = settings?.store_name || 'بوتيك الفخامة';

  return (
    <nav className="sidebar">
      {/* Brand Header */}
      <div className="sidebar-brand" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
          <div className="sidebar-brand-icon-wrap" style={{ flexShrink: 0 }}>
            {settings?.store_logo ? (
              <img
                src={settings.store_logo}
                alt="Logo"
                style={{ width: '34px', height: '34px', borderRadius: '8px', objectFit: 'contain' }}
              />
            ) : (
              <svg width="22" height="22" viewBox="0 0 40 40" fill="none">
                <rect width="40" height="40" rx="10" fill="var(--primary-color)" />
                <path d="M20 9L29 15.5V24.5L20 31L11 24.5V15.5L20 9Z" fill="#15151A" />
                <path d="M20 13L26 17.5V22.5L20 27L14 22.5V17.5L20 13Z" fill="var(--primary-color)" fillOpacity="0.85" />
                <path d="M20 16L23.5 18.8V21.2L20 24L16.5 21.2V18.8L20 16Z" fill="#FFFFFF" />
              </svg>
            )}
          </div>
          <div className="sidebar-brand-text" style={{ minWidth: 0 }}>
            <h2 className="sidebar-title" title={storeName} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '170px', fontSize: '14px' }}>
              {storeName}
            </h2>
            <span className="sidebar-subtitle" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ color: 'var(--primary-color)', fontWeight: '800' }}>ONYX</span> POS
            </span>
          </div>
        </div>

        {currentUser.role === 'admin' && (
          <NotificationBell onNavigate={onNavigate} />
        )}
      </div>

      {/* Navigation Links */}
      <div className="sidebar-menu-wrapper">
        <span className="sidebar-nav-heading">القائمة الرئيسية</span>
        <ul className="sidebar-links">
          {visibleLinks.map((link) => {
            const isActive = activePage === link.key;
            return (
              <li key={link.key}>
                <button
                  className={`sidebar-nav-btn ${isActive ? 'active' : ''}`}
                  onClick={() => onNavigate(link.key)}
                >
                  <span className="sidebar-link-icon">{link.icon}</span>
                  <span className="sidebar-link-label">{link.label}</span>
                  {link.badge && !isActive && (
                    <span className="sidebar-pill-badge">{link.badge}</span>
                  )}
                  {isActive && <span className="sidebar-active-indicator" />}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Footer Profile & Logout */}
      <div className="sidebar-footer">
        <div className="sidebar-profile-card">
          <div
            className="sidebar-profile-clickable"
            onClick={onOpenProfile}
            title="انقر لتعديل البروفايل وكلمة المرور"
          >
            <div className="user-avatar-badge">{initial}</div>
            <div className="user-info">
              <span className="user-name">{currentUser.username}</span>
              <span className="user-role">
                {currentUser.role === 'admin' ? '🛡️ مدير النظام' : '💳 كاشير المبيعات'}
              </span>
            </div>
          </div>
          <button
            className="sidebar-logout-icon-btn"
            onClick={onLogout}
            title="تسجيل الخروج"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </div>
      </div>
    </nav>
  );
}

export default Sidebar;
