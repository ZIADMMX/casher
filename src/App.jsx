import { Component, useState, useEffect, lazy, Suspense } from 'react';
import LoginPage from './pages/LoginPage.jsx';
import InitialSetupPage from './pages/InitialSetupPage.jsx';
import ForcePasswordChangePage from './pages/ForcePasswordChangePage.jsx';
import Sidebar from './components/Sidebar.jsx';
import POSPage from './pages/POSPage.jsx';
import ReturnsPage from './pages/ReturnsPage.jsx';
import ProfileModal from './components/ProfileModal.jsx';
import ReviewModal from './components/ReviewModal.jsx';
import NotificationToast from './components/NotificationToast.jsx';
import LicenseLockScreen from './components/LicenseLockScreen.jsx';
import LicenseBanner from './components/LicenseBanner.jsx';
import { UserProvider, useUser } from './contexts/UserContext.jsx';
import { SettingsProvider, useSettings } from './contexts/SettingsContext.jsx';
import { BusinessProfileProvider, useBusinessProfile } from './contexts/BusinessProfileContext.jsx';
import { NotificationsProvider } from './contexts/NotificationsContext.jsx';
import ThreeLoadingScreen from './components/ThreeLoadingScreen.jsx';
import { isBusinessProfilePageEnabled } from './utils/businessProfilePages.js';
import PageTutorial from './components/PageTutorial.jsx';
import { hasPermission } from './utils/accessControl.js';

// التحميل الكسول للصفحات الإدارية لتسريع فتح البرنامج وتقليل حجم الحزمة الأولى
const TodayPage = lazy(() => import('./pages/TodayPage.jsx'));
const ProductsPage = lazy(() => import('./pages/ProductsPage.jsx'));
const InventoryManagementPage = lazy(() => import('./pages/InventoryManagementPage.jsx'));
const AppointmentsPage = lazy(() => import('./pages/AppointmentsPage.jsx'));
const ReportsPage = lazy(() => import('./pages/ReportsPage.jsx'));
const CustomersPage = lazy(() => import('./pages/CustomersPage.jsx'));
const SuppliersPage = lazy(() => import('./pages/SuppliersPage.jsx'));
const ShiftsPage = lazy(() => import('./pages/ShiftsPage.jsx'));
const UsersPage = lazy(() => import('./pages/UsersPage.jsx'));
const AttendancePage = lazy(() => import('./pages/AttendancePage.jsx'));
const LeavesPage = lazy(() => import('./pages/LeavesPage.jsx'));
const SettingsPage = lazy(() => import('./pages/SettingsPage.jsx'));
const ProfilePage = lazy(() => import('./pages/ProfilePage.jsx'));
const OrdersPage = lazy(() => import('./pages/OrdersPage.jsx'));
const SubscriptionsPage = lazy(() => import('./pages/SubscriptionsPage.jsx'));
const CommissionsPage = lazy(() => import('./pages/CommissionsPage.jsx'));
const EnterpriseManagementPage = lazy(() => import('./pages/EnterpriseManagementPage.jsx'));
const RolesPage = lazy(() => import('./pages/RolesPage.jsx'));
const SalariesPage = lazy(() => import('./pages/SalariesPage.jsx'));
const WorkflowsPage = lazy(() => import('./pages/WorkflowsPage.jsx'));
const CasesPage = lazy(() => import('./pages/CasesPage.jsx'));

class UsersPageErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('تعذر عرض صفحة إدارة المستخدمين:', error, errorInfo);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="page-loading-spinner" role="alert">
          <p>حصل خطأ أثناء عرض صفحة المستخدمين: {this.state.error.message || 'خطأ غير معروف'}</p>
          <button type="button" className="primary-btn" onClick={() => this.setState({ error: null })}>
            إعادة المحاولة
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

class ApplicationPageErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    console.error(`تعذر عرض الصفحة ${this.props.pageName}:`, error, errorInfo);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="page-loading-spinner" role="alert">
          <h2>تعذر عرض الصفحة: {this.props.pageName}</h2>
          <p>{this.state.error.message || 'حدث خطأ غير معروف أثناء عرض الصفحة.'}</p>
          <button type="button" className="primary-btn" onClick={() => window.location.reload()}>
            إعادة تحميل التطبيق
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function AppContent() {
  const { currentUser, setCurrentUser, logout, setupRequired, loadingSession } = useUser();
  const { configuration, isModuleEnabled } = useBusinessProfile();
  const [activePage, setActivePage] = useState('pos');
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [licenseStatus, setLicenseStatus] = useState(null);
  const [workOrderForCheckout, setWorkOrderForCheckout] = useState(null);
  const { settings } = useSettings();
  const profileKey = configuration?.profile?.key || settings?.business_type || settings?.onboarding_sector || 'retail';

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

  useEffect(() => {
    if (!currentUser || activePage !== 'pos') return;
    window.electronAPI.getCentralServerConfig()
      .then((config) => {
        if (config.baseUrl && !config.warehouseId) setActivePage('branches');
      })
      .catch((error) => console.error('تعذر التحقق من إعداد فرع الجهاز:', error));
  }, [activePage, currentUser]);

  useEffect(() => {
    if (!currentUser || loadingSession || activePage === 'pos' || showReviewModal) return undefined;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const status = await window.electronAPI.getReviewPromptStatus({ claim: true });
        if (!cancelled && status.shouldPrompt) setShowReviewModal(true);
      } catch (error) {
        console.warn('تعذر التحقق من موعد طلب التقييم:', error);
      }
    }, 1200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activePage, currentUser, loadingSession, showReviewModal]);

  useEffect(() => {
    if (!currentUser) return undefined;
    let cancelled = false;
    async function syncReviewsIfConfigured() {
      try {
        const config = await window.electronAPI.getCentralServerConfig();
        if (!cancelled && config.baseUrl) {
          const result = await window.electronAPI.syncReviews();
          if (result.error && result.pendingCount > 0) {
            console.warn('تقييمات بانتظار المزامنة:', result.error);
          }
        }
      } catch (error) {
        console.warn('تعذرت مزامنة التقييمات المحفوظة:', error);
      }
    }
    window.addEventListener('online', syncReviewsIfConfigured);
    syncReviewsIfConfigured();
    return () => {
      cancelled = true;
      window.removeEventListener('online', syncReviewsIfConfigured);
    };
  }, [currentUser]);

  async function handleLogout() {
    await logout();
    setActivePage('pos');
  }

  useEffect(() => {
    if (!isBusinessProfilePageEnabled(activePage, profileKey, isModuleEnabled)) {
      setActivePage('pos');
    }
  }, [activePage, isModuleEnabled, profileKey]);

  if (loadingSession) {
    return (
      <ThreeLoadingScreen
        fullscreen
        text="أهلاً بك في نظام FOX.CLOUD"
        subtext="نسعد بخدمتك، نجهّز لك مساحة العمل الآن..."
      />
    );
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

  function renderPage() {
    if (!isBusinessProfilePageEnabled(activePage, profileKey, isModuleEnabled)) {
      return <POSPage onNavigate={setActivePage} />;
    }

    const pagePermissions = {
      today: 'pos.view',
      pos: 'pos.view',
      orders: 'orders.view',
      appointments: 'appointments.view',
      subscriptions: 'subscriptions.view',
      commissions: 'commissions.view',
      returns: 'pos.refund',
      products: 'products.view',
      branches: 'products.view',
      customers: 'customers.view',
      suppliers: 'suppliers.view',
      shifts: 'shifts.view',
      reports: 'reports.view',
      users: 'team.view',
      attendance: 'attendance.view',
      leaves: 'leaves.view',
      roles: 'roles.manage',
      salaries: 'team.view',
      settings: 'settings.view',
      profile: null,
      enterprise: 'enterprise.view',
      workflows: 'enterprise.view',
    };
    const hasPageAccess = activePage === 'profile' || (!currentUser.systemRoleKey
      ? currentUser.role === 'admin' || ['today', 'pos', 'orders', 'appointments', 'subscriptions', 'returns', 'customers', 'shifts', 'workflows'].includes(activePage)
      : hasPermission(currentUser, pagePermissions[activePage]));
    if (!hasPageAccess) {
      return (
        <section className="page-loading-spinner" role="alert">
          <p>لا تملك صلاحية الوصول إلى هذه الشاشة. تواصل مع مدير النظام لتحديث دورك.</p>
          <button type="button" className="primary-btn" onClick={handleLogout}>تسجيل الخروج</button>
        </section>
      );
    }

    switch (activePage) {
      case 'today':
        return <TodayPage onNavigate={setActivePage} currentUser={currentUser} />;
      case 'products':
        return <ProductsPage />;
      case 'branches':
        return <InventoryManagementPage />;
      case 'appointments':
        return <AppointmentsPage />;
      case 'pos':
        return (
          <POSPage
            onNavigate={setActivePage}
            workOrder={workOrderForCheckout}
            onWorkOrderCheckoutComplete={() => setWorkOrderForCheckout(null)}
          />
        );
      case 'orders':
        return (
          <OrdersPage
            onNavigate={setActivePage}
            onCheckoutOrder={(order) => {
              setWorkOrderForCheckout(order);
              setActivePage('pos');
            }}
          />
        );
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
        return (
          <UsersPageErrorBoundary key={activePage}>
            <UsersPage currentUser={currentUser} />
          </UsersPageErrorBoundary>
        );
      case 'attendance':
        return <AttendancePage />;
      case 'leaves':
        return <LeavesPage />;
      case 'settings':
        return <SettingsPage />;
      case 'profile':
        return <ProfilePage onOpenAccountSettings={() => setShowProfileModal(true)} />;
      case 'enterprise':
        return <EnterpriseManagementPage onNavigate={setActivePage} />;
      case 'roles':
        return <RolesPage />;
      case 'salaries':
        return <SalariesPage />;
      case 'workflows':
        return <WorkflowsPage />;
      case 'cases':
        return <CasesPage />;
      default:
        return <POSPage />;
    }
  }

  return (
    <ApplicationPageErrorBoundary key={activePage} pageName={activePage}>
      <div className="app-layout">
        <Sidebar
          activePage={activePage}
          onNavigate={setActivePage}
          currentUser={currentUser}
          onLogout={handleLogout}
          onOpenProfile={() => setActivePage('profile')}
          onOpenReview={() => setShowReviewModal(true)}
        />
        <main className="main-content">
          <LicenseBanner
            status={licenseStatus}
            onActivateSuccess={(newStatus) => setLicenseStatus(newStatus)}
          />
          <div className="main-content-body">
            <Suspense
              fallback={
                <ThreeLoadingScreen
                  size="md"
                  text="أهلاً بك"
                  subtext="لحظات ونكون جاهزين لخدمتك..."
                />
              }
            >
              {renderPage()}
            </Suspense>
          </div>
        </main>

        {showProfileModal && (
          <ProfileModal
            onClose={() => setShowProfileModal(false)}
          />
        )}

        {showReviewModal && (
          <ReviewModal onClose={() => setShowReviewModal(false)} />
        )}

        {currentUser.role === 'admin' && (
          <NotificationToast onNavigate={setActivePage} />
        )}

        <PageTutorial activePage={activePage} onNavigate={setActivePage} />
      </div>
    </ApplicationPageErrorBoundary>
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