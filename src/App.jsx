import { useState, useEffect, lazy, Suspense } from 'react';
import LoginPage from './pages/LoginPage.jsx';
import InitialSetupPage from './pages/InitialSetupPage.jsx';
import ForcePasswordChangePage from './pages/ForcePasswordChangePage.jsx';
import Sidebar from './components/Sidebar.jsx';
import POSPage from './pages/POSPage.jsx';
import ReturnsPage from './pages/ReturnsPage.jsx';
import ProfileModal from './components/ProfileModal.jsx';
import NotificationToast from './components/NotificationToast.jsx';
import LicenseLockScreen from './components/LicenseLockScreen.jsx';
import LicenseBanner from './components/LicenseBanner.jsx';
import { UserProvider, useUser } from './contexts/UserContext.jsx';
import { SettingsProvider } from './contexts/SettingsContext.jsx';
import { BusinessProfileProvider, useBusinessProfile } from './contexts/BusinessProfileContext.jsx';
import { NotificationsProvider } from './contexts/NotificationsContext.jsx';

// التحميل الكسول للصفحات الإدارية لتسريع فتح البرنامج وتقليل حجم الحزمة الأولى
const ProductsPage = lazy(() => import('./pages/ProductsPage.jsx'));
const ReportsPage = lazy(() => import('./pages/ReportsPage.jsx'));
const CustomersPage = lazy(() => import('./pages/CustomersPage.jsx'));
const SuppliersPage = lazy(() => import('./pages/SuppliersPage.jsx'));
const ShiftsPage = lazy(() => import('./pages/ShiftsPage.jsx'));
const UsersPage = lazy(() => import('./pages/UsersPage.jsx'));
const SettingsPage = lazy(() => import('./pages/SettingsPage.jsx'));
const OrdersPage = lazy(() => import('./pages/OrdersPage.jsx'));
const SubscriptionsPage = lazy(() => import('./pages/SubscriptionsPage.jsx'));
const CommissionsPage = lazy(() => import('./pages/CommissionsPage.jsx'));
const EnterpriseManagementPage = lazy(() => import('./pages/EnterpriseManagementPage.jsx'));

function AppContent() {
  const { currentUser, setCurrentUser, logout, setupRequired, loadingSession } = useUser();
  const { loading: loadingBusinessConfig, error: businessConfigError, refreshConfiguration, isModuleEnabled } = useBusinessProfile();
  const [activePage, setActivePage] = useState('pos');
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [licenseStatus, setLicenseStatus] = useState(null);

  useEffect(() => {
    async function checkLicense() {
      if (window.electronAPI?.getLicenseStatus) {
        try {
          const status = await window.electronAPI.getLicenseStatus();
          setLicenseStatus(status);
        } catch (e) {
          console.error('فشل فحص الترخيص:', e);
        }
      }
    }
    checkLicense();
  }, []);

  async function handleLogout() {
    await logout();
    setActivePage('pos');
  }

  if (loadingSession) {
    return <div className="page-loading-spinner">جاري تجهيز النظام...</div>;
  }

  if (!currentUser) {
    return setupRequired ? <InitialSetupPage /> : <LoginPage />;
  }

  // Lock Screen if trial expired and not activated
  if (licenseStatus && licenseStatus.isExpired && !licenseStatus.isActivated) {
    return (
      <LicenseLockScreen
        hwid={licenseStatus.hwid}
        onActivateSuccess={(newStatus) => setLicenseStatus(newStatus)}
      />
    );
  }

  if (currentUser.forcePasswordChange === true) {
    return (
      <ForcePasswordChangePage
        onSuccess={() => setCurrentUser((prev) => ({ ...prev, forcePasswordChange: false }))}
      />
    );
  }

  if (loadingBusinessConfig) {
    return <div className="page-loading-spinner">جاري تحميل تكوين النشاط...</div>;
  }

  if (businessConfigError) {
    return (
      <div className="page-loading-spinner" role="alert">
        <p>تعذر تحميل إعدادات النشاط التجاري: {businessConfigError}</p>
        <button type="button" className="primary-btn" onClick={() => refreshConfiguration()}>
          إعادة المحاولة
        </button>
      </div>
    );
  }

  function renderPage() {
    const pageModules = {
      products: 'inventory',
      orders: 'orders',
      subscriptions: 'subscriptions',
      commissions: 'commissions',
      returns: 'returns',
      shifts: 'shifts',
      reports: 'reports',
      customers: 'customers',
      suppliers: 'purchases',
      users: 'users',
      settings: 'settings',
      enterprise: 'enterprise',
    };
    if (pageModules[activePage] && !isModuleEnabled(pageModules[activePage])) {
      return <POSPage onNavigate={setActivePage} />;
    }

    const adminOnlyPages = ['products', 'suppliers', 'reports', 'users', 'settings', 'enterprise'];
    if (currentUser.role !== 'admin' && adminOnlyPages.includes(activePage)) {
      return <POSPage />;
    }

    switch (activePage) {
      case 'products':
        return <ProductsPage />;
      case 'pos':
        return <POSPage onNavigate={setActivePage} />;
      case 'orders':
        return <OrdersPage onNavigate={setActivePage} />;
      case 'subscriptions':
        return <SubscriptionsPage />;
      case 'commissions':
        return <CommissionsPage />;
      case 'returns':
        return <ReturnsPage />;
      case 'shifts':
        return <ShiftsPage />;
      case 'reports':
        return <ReportsPage />;
      case 'customers':
        return <CustomersPage />;
      case 'suppliers':
        return <SuppliersPage />;
      case 'users':
        return <UsersPage currentUser={currentUser} />;
      case 'settings':
        return <SettingsPage />;
      case 'enterprise':
        return <EnterpriseManagementPage />;
      default:
        return <POSPage />;
    }
  }

  return (
    <div className="app-layout">
      <Sidebar
        activePage={activePage}
        onNavigate={setActivePage}
        currentUser={currentUser}
        onLogout={handleLogout}
        onOpenProfile={() => setShowProfileModal(true)}
      />
      <main className="main-content">
        <LicenseBanner
          status={licenseStatus}
          onActivateSuccess={(newStatus) => setLicenseStatus(newStatus)}
        />
        <Suspense fallback={<div className="page-loading-spinner" style={{ padding: '30px', textAlign: 'center', color: '#94A3B8' }}>جاري التحميل...</div>}>
          {renderPage()}
        </Suspense>
      </main>

      {showProfileModal && (
        <ProfileModal
          onClose={() => setShowProfileModal(false)}
        />
      )}

      {currentUser.role === 'admin' && (
        <NotificationToast onNavigate={setActivePage} />
      )}
    </div>
  );
}

function App() {
  return (
    <UserProvider>
      <SettingsProvider>
        <BusinessProfileProvider>
          <NotificationsProvider>
            <AppContent />
          </NotificationsProvider>
        </BusinessProfileProvider>
      </SettingsProvider>
    </UserProvider>
  );
}

export default App;