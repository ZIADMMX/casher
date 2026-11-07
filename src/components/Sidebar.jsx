import { useEffect, useState } from 'react';
import { useSettings } from '../contexts/SettingsContext.jsx';
import { useBusinessProfile } from '../contexts/BusinessProfileContext.jsx';
import NotificationBell from './NotificationBell.jsx';
import { isBusinessProfilePageEnabled } from '../utils/businessProfilePages.js';
import foxLogo from '../assets/fox-logo.png';
import { hasPermission } from '../utils/accessControl.js';
import * as appApi from '../api/app.js';

const PAGE_PERMISSIONS = {
  today: 'pos.view',
  pos: 'pos.view',
  kitchen: 'pos.view',
  cases: 'cases.view',
  courts: 'cases.view',
  appointments: 'appointments.view',
  subscriptions: 'subscriptions.view',
  commissions: 'commissions.view',
  returns: 'pos.refund',
  products: 'products.view',
  branches: 'inventory.view',
  customers: 'customers.view',
  crm: 'customers.view',
  suppliers: 'suppliers.view',
  shifts: 'shifts.view',
  reports: 'reports.view',
  users: 'team.view',
  attendance: 'attendance.view',
  leaves: 'leaves.view',
  roles: 'roles.manage',
  settings: 'settings.view',
  profile: null,
  enterprise: 'enterprise.view',
  workflows: 'enterprise.view',
};

const SECTOR_LABELS = {
  retail: 'تجزئة',
  electronics: 'إلكترونيات',
  maintenance: 'صيانة',
  auto_workshop: 'ورشة',
  subscriptions_gym: 'جيم',
  grocery: 'سوبرماركت',
  spare_parts: 'قطع غيار',
  law_firm: 'محاماة',
  cafe_restaurant: 'مطعم',
  salon_barbershop: 'صالون',
  crm: 'CRM',
};

// Badge text -> pill tone; "live" and "new" also show a dot on the collapsed rail.
const BADGE_TONES = { 'مباشر': 'live', 'جديد': 'new', 'الدرج': 'gold' };
const COLLAPSE_KEY = 'fox.sidebar.collapsed';

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}

function Sidebar({ activePage, onNavigate, currentUser, onLogout, onOpenProfile, onOpenReview }) {
  const [isTeamMenuOpen, setIsTeamMenuOpen] = useState(false);
  const [isRestarting, setIsRestarting] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(readCollapsed);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, isCollapsed ? '1' : '0');
    } catch {
      // Storage blocked: the choice just won't survive a restart.
    }
  }, [isCollapsed]);

  useEffect(() => {
    const update = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  const { settings } = useSettings();
  const { configuration, isModuleEnabled, getTerm } = useBusinessProfile();
  const profileKey = configuration?.profile?.key || settings?.business_type || settings?.onboarding_sector || 'retail';

  useEffect(() => {
    if (['users', 'attendance', 'leaves', 'roles', 'salaries'].includes(activePage)) setIsTeamMenuOpen(true);
  }, [activePage]);

  const allLinks = [
    {
      key: 'today',
      label: 'اليوم',
      badge: 'مباشر',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      ),
      roles: ['admin', 'cashier'],
    },
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
      key: 'kitchen',
      label: 'شاشة المطبخ (KDS)',
      badge: 'مباشر',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 10h16v10H4z" />
          <path d="M7 10V6a5 5 0 0 1 10 0v4M8 14h8M8 17h5" />
        </svg>
      ),
      roles: ['admin', 'cashier'],
    },
    {
      key: 'cases',
      label: 'القضايا والمحاكم',
      badge: 'قضايا',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3v18" />
          <path d="M4 7h16" />
          <path d="M4 7l3 7h-6l3-7z" />
          <path d="M20 7l3 7h-6l3-7z" />
          <path d="M9 21h6" />
        </svg>
      ),
      roles: ['admin', 'cashier'],
    },
    {
      key: 'courts',
      label: 'المحاكم',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9h18M5 9v10m4-10v10m6-10v10m4-10v10M3 21h18M12 3 2 8h20L12 3Z" />
        </svg>
      ),
      roles: ['admin', 'cashier'],
    },
    {
      key: 'appointments',
      label: getTerm('appointments', 'حجوزات المواعيد والجلسات'),
      badge: 'مواعيد',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="17" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18M8 14h3M8 17h7" />
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
      roles: ['admin', 'cashier'],
    },
    {
      key: 'branches',
      label: 'الفروع والمخازن',
      badge: 'مخزون',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 21V8l9-5 9 5v13" />
          <path d="M9 21v-8h6v8M3 10h18" />
        </svg>
      ),
      roles: ['admin'],
    },
    {
      key: 'customers',
      label: profileKey === 'law_firm'
        ? 'الموكلون'
        : `${getTerm('customer', 'العملاء')} والديون`,
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
      key: 'crm',
      label: 'إدارة علاقات العملاء (CRM)',
      badge: 'CRM',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="9" cy="8" r="4" />
          <path d="M3 21v-2a6 6 0 0 1 12 0v2" />
          <path d="M16 11a4 4 0 1 0 0-8" />
          <path d="M18 14a5 5 0 0 1 3 5v2" />
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
      key: 'team',
      label: 'فريق العمل',
      children: [
        { key: 'users', label: 'فريق العمل', available: true },
        { key: 'attendance', label: 'الحضور', available: true },
        { key: 'leaves', label: 'الإجازات', available: true },
        { key: 'roles', label: 'الأدوار والصلاحيات', available: true },
        { key: 'salaries', label: 'الرواتب والمستحقات', available: true },
      ],
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="10" cy="7" r="4" />
          <path d="M20 8v6M23 11h-6" />
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
      key: 'workflows',
      label: 'سير العمل ولوحة Kanban',
      badge: 'SLA',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="5" height="18" rx="1" />
          <rect x="11" y="3" width="5" height="12" rx="1" />
          <rect x="19" y="3" width="2" height="18" rx="1" />
        </svg>
      ),
      roles: ['admin', 'manager', 'cashier'],
    },
  ];

  function canAccess(page) {
    if (page === 'profile') return true;
    // The owner sees everything; everyone else sees exactly what their permissions
    // allow (the same rules the main process enforces), cashiers included.
    if (currentUser.role === 'admin' && !currentUser.systemRoleKey) return true;
    const permission = profileKey === 'law_firm' && page === 'today'
      ? 'cases.view'
      : PAGE_PERMISSIONS[page];
    return permission ? hasPermission(currentUser, permission) : false;
  }

  const visibleLinks = allLinks.flatMap((link) => {
    if (link.children) {
      const children = link.children.filter((child) => (
        child.available
        && canAccess(child.key)
        && isBusinessProfilePageEnabled(child.key, profileKey, isModuleEnabled)
      ));
      return children.length
        ? [{ ...link, children }]
        : [];
    }
    return canAccess(link.key)
      && isBusinessProfilePageEnabled(link.key, profileKey, isModuleEnabled)
      ? [link]
      : [];
  });

  const displayName = currentUser.fullName
    || [currentUser.firstName, currentUser.lastName].filter(Boolean).join(' ')
    || currentUser.username;
  const initial = displayName ? displayName.charAt(0).toUpperCase() : 'U';
  const storeName = settings?.store_name || 'بوتيك الفخامة';

  async function handleRestart() {
    if (isRestarting || !window.confirm('سيتم إعادة تشغيل البرنامج. قد تفقد أي بيانات لم تحفظها. هل تريد المتابعة؟')) {
      return;
    }

    setIsRestarting(true);
    try {
      await appApi.restartApp();
    } catch (error) {
      setIsRestarting(false);
      console.error('تعذر إعادة تشغيل التطبيق:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isRestartHandlerMissing = errorMessage.includes("No handler registered for 'app:restart'");
      window.alert(isRestartHandlerMissing
        ? 'ميزة إعادة التشغيل غير مفعّلة في جلسة البرنامج الحالية. أغلق البرنامج بالكامل وافتحه مرة واحدة لتفعيلها.'
        : errorMessage || 'تعذر إعادة تشغيل التطبيق');
    }
  }

  const sectorLabel = SECTOR_LABELS[profileKey];
  const roleLabel = currentUser.role === 'admin'
    ? 'مدير النظام'
    : currentUser.systemRoleKey ? currentUser.role : 'كاشير المبيعات';

  function labelFor(link) {
    if (profileKey === 'law_firm' && link.key === 'reports') return 'التقارير القانونية';
    if (profileKey === 'law_firm' && link.key === 'settings') return 'إعدادات مكتب المحاماة';
    return link.label;
  }

  const logo = (
    <div className={`sidebar-brand-icon-wrap ${settings?.store_logo ? 'has-store-logo' : ''}`}>
      {settings?.store_logo ? (
        <img
          src={settings.store_logo}
          alt={`شعار ${storeName}`}
        />
      ) : (
        <img src={foxLogo} alt="شعار FOX.CLOUD" />
      )}
    </div>
  );

  return (
    <nav className={`sidebar ${isCollapsed ? 'is-collapsed' : ''}`} aria-label="القائمة الرئيسية">
      <div className="sidebar-brand">
        <div className="sidebar-brand-main">
          {isCollapsed ? (
            <button
              type="button"
              className="sidebar-brand-expand"
              onClick={() => setIsCollapsed(false)}
              title="توسيع القائمة"
              aria-label="توسيع القائمة"
              aria-expanded="false"
            >
              {logo}
            </button>
          ) : logo}
          <div className="sidebar-brand-text">
            <h2 className="sidebar-title" title="FOX.CLOUD">FOX<span>.</span>CLOUD</h2>
            <span className="sidebar-store-name" title={storeName}>{storeName}</span>
          </div>
        </div>

        <div className="sidebar-header-actions">
          {currentUser.role === 'admin' && (
            <div className="sidebar-notification-wrap">
              <NotificationBell onNavigate={onNavigate} />
            </div>
          )}
          <button
            type="button"
            className="sidebar-icon-btn"
            onClick={() => setIsCollapsed(true)}
            title="طي القائمة"
            aria-label="طي القائمة"
            aria-expanded="true"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="4" width="18" height="16" rx="3" />
              <path d="M15 4v16" />
            </svg>
          </button>
        </div>
      </div>

      <div className="sidebar-chips">
        <span className="sidebar-chip sidebar-chip--brand">POS</span>
        {sectorLabel && <span className="sidebar-chip">{sectorLabel}</span>}
        <span className={`sidebar-chip sidebar-chip--status ${isOnline ? 'is-online' : 'is-offline'}`}>
          <span className="sidebar-dot" aria-hidden="true" />
          {isOnline ? 'متصل' : 'غير متصل'}
        </span>
      </div>

      {/* Navigation Links */}
      <div className="sidebar-menu-wrapper">
        <span className="sidebar-nav-heading">القائمة الرئيسية</span>
        <ul className="sidebar-links">
          {visibleLinks.map((link) => {
            const label = labelFor(link);
            if (link.children) {
              const isActive = link.children.some((child) => child.key === activePage);
              const isExpanded = isTeamMenuOpen && !isCollapsed;
              return (
                <li className="sidebar-menu-item" key={link.key}>
                  <button
                    type="button"
                    className={`sidebar-nav-btn ${isActive ? 'active' : ''}`}
                    onClick={() => {
                      if (isCollapsed) {
                        setIsCollapsed(false);
                        setIsTeamMenuOpen(true);
                      } else {
                        setIsTeamMenuOpen((open) => !open);
                      }
                    }}
                    aria-expanded={isExpanded}
                    aria-controls="team-work-submenu"
                    title={isCollapsed ? label : undefined}
                    aria-label={isCollapsed ? label : undefined}
                  >
                    {isActive && <span className="sidebar-active-indicator" aria-hidden="true" />}
                    <span className="sidebar-link-icon">{link.icon}</span>
                    <span className="sidebar-link-label">{label}</span>
                    <svg
                      className={`sidebar-submenu-chevron ${isExpanded ? 'is-open' : ''}`}
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>
                  {isExpanded && (
                    <ul className="sidebar-submenu" id="team-work-submenu">
                      {link.children.map((child) => (
                        <li key={child.key}>
                          <button
                            type="button"
                            className={`sidebar-submenu-btn ${activePage === child.key ? 'active' : ''}`}
                            onClick={() => child.available && onNavigate(child.key)}
                            disabled={!child.available}
                            title={child.available ? undefined : 'هذا القسم غير متاح بعد'}
                            aria-current={activePage === child.key ? 'page' : undefined}
                          >
                            <span>{child.label}</span>
                            {!child.available && <span className="sidebar-submenu-soon">قريباً</span>}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            }

            const isActive = activePage === link.key;
            const tone = BADGE_TONES[link.badge] || 'neutral';
            return (
              <li key={link.key}>
                <button
                  type="button"
                  className={`sidebar-nav-btn ${isActive ? 'active' : ''}`}
                  onClick={() => onNavigate(link.key)}
                  aria-current={isActive ? 'page' : undefined}
                  title={isCollapsed ? label : undefined}
                  aria-label={isCollapsed ? label : undefined}
                >
                  {isActive && <span className="sidebar-active-indicator" aria-hidden="true" />}
                  <span className="sidebar-link-icon">{link.icon}</span>
                  <span className="sidebar-link-label">{label}</span>
                  {link.badge && !isActive && (
                    <span className={`sidebar-pill-badge is-${tone}`}>
                      {tone === 'live' && <span className="sidebar-dot" aria-hidden="true" />}
                      {link.badge}
                    </span>
                  )}
                  {link.badge && !isActive && (tone === 'live' || tone === 'new') && (
                    <span className={`sidebar-rail-dot is-${tone}`} aria-hidden="true" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Footer: review, profile & logout */}
      <div className="sidebar-footer">
        <button
          type="button"
          className="sidebar-review-btn"
          onClick={onOpenReview}
          title={isCollapsed ? 'قيّم تجربتك' : undefined}
          aria-label={isCollapsed ? 'قيّم تجربتك' : undefined}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />
          </svg>
          <span className="sidebar-link-label">قيّم تجربتك</span>
          <svg className="sidebar-review-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m15 6-6 6 6 6" />
          </svg>
        </button>

        <div className="sidebar-profile-card">
          <button
            type="button"
            className="sidebar-profile-clickable"
            onClick={onOpenProfile}
            title="عرض الملف الشخصي"
            aria-label={`عرض الملف الشخصي لـ ${displayName}`}
          >
            <div className="user-avatar-badge">{initial}</div>
            <div className="user-info">
              <span className="user-name">{displayName}</span>
              <span className="user-role">
                {currentUser.role === 'admin' && (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6z" />
                  </svg>
                )}
                {roleLabel}
              </span>
            </div>
          </button>
          <button
            type="button"
            className="sidebar-icon-btn sidebar-restart-btn"
            onClick={handleRestart}
            disabled={isRestarting}
            title="إعادة تشغيل البرنامج"
            aria-label="إعادة تشغيل البرنامج"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 7v5h-5" />
              <path d="M4.93 4.93a9 9 0 1 1-1.42 10.02" />
              <path d="M4 7v5h5" />
            </svg>
          </button>
          <button
            type="button"
            className="sidebar-icon-btn sidebar-logout-icon-btn"
            onClick={onLogout}
            title="تسجيل الخروج"
            aria-label="تسجيل الخروج"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
