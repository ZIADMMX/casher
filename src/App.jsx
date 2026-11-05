import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import LoginPage from './pages/LoginPage.jsx';
import InitialSetupPage from './pages/InitialSetupPage.jsx';
import ForcePasswordChangePage from './pages/ForcePasswordChangePage.jsx';
import Sidebar from './components/Sidebar.jsx';
import POSPage from './pages/POSPage.jsx';
import ReturnsPage from './pages/ReturnsPage.jsx';
import ProfileModal from './components/ProfileModal.jsx';
import ReviewModal from './components/ReviewModal.jsx';
import NotificationToast from './components/NotificationToast.jsx';
import RateLimitNotice from './components/RateLimitNotice.jsx';
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
import * as inventoryApi from './api/inventory.js';
import * as licenseApi from './api/license.js';
import PageErrorBoundary from './components/system/PageErrorBoundary.jsx';

// التحميل الكسول للصفحات الإدارية لتسريع فتح البرنامج وتقليل حجم الحزمة الأولى
const TodayPage = lazy(() => import('./pages/TodayPage.jsx'));
const ProductsPage = lazy(() => import('./pages/ProductsPage.jsx'));
const InventoryManagementPage = lazy(() => import('./pages/InventoryManagementPage.jsx'));
const AppointmentsPage = lazy(() => import('./pages/AppointmentsPage.jsx'));
const CRMPage = lazy(() => import('./pages/CRMPage.jsx'));
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
const KitchenDisplayPage = lazy(() => import('./pages/KitchenDisplayPage.jsx'));
const SubscriptionsPage = lazy(() => import('./pages/SubscriptionsPage.jsx'));
const CommissionsPage = lazy(() => import('./pages/CommissionsPage.jsx'));
const EnterpriseManagementPage = lazy(() => import('./pages/EnterpriseManagementPage.jsx'));
const RolesPage = lazy(() => import('./pages/RolesPage.jsx'));
const SalariesPage = lazy(() => import('./pages/SalariesPage.jsx'));
const WorkflowsPage = lazy(() => import('./pages/WorkflowsPage.jsx'));
const CasesPage = lazy(() => import('./pages/CasesPage.jsx'));
const CourtsPage = lazy(() => import('./pages/CourtsPage.jsx'));

function AppContent() {
  const { currentUser, setCurrentUser, logout, setupRequired, loadingSession } = useUser();
  const { configuration, isModuleEnabled } = useBusinessProfile();
  const { settings } = useSettings();
  const profileKey = configuration?.profile?.key || settings?.business_type || settings?.onboarding_sector || 'retail';
  const defaultPage = profileKey === 'law_firm' ? 'today' : profileKey === 'crm' ? 'crm' : 'pos';
  const [activePage, setActivePage] = useState(defaultPage);
  const [caseToOpen, setCaseToOpen] = useState(null);
  const [openNewCaseOnLoad, setOpenNewCaseOnLoad] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [licenseStatus, setLicenseStatus] = useState(null);
  const [licenseError, setLicenseError] = useState('');
  const [workOrderForCheckout, setWorkOrderForCheckout] = useState(null);
  function navigateToPage(page, options = {}) {
    setCaseToOpen(page === 'cases' ? options.caseId || null : null);
    setOpenNewCaseOnLoad(page === 'cases' && options.createCase === true);
    setActivePage(page);
  }

  const checkLicense = useCallback(async () => {
    setLicenseError('');
    try {
      const status = await licenseApi.getLicenseStatus();
      setLicenseStatus(status);
    } catch (error) {
      setLicenseError(error.message || 'تعذر التحقق من وقت الترخيص');
    }
  }, []);

  useEffect(() => {
    checkLicense();
    const unsubscribeStatus = licenseApi.onLicenseStatusChanged.ifAvailable((status) => {
      setLicenseStatus(status);
      setLicenseError('');
    }) || (() => {});
    const unsubscribeError = licenseApi.onLicenseVerificationFailed.ifAvailable((error) => {
      setLicenseError(error?.message || 'تعذر التحقق من وقت الترخيص');
    }) || (() => {});
    return () => {
      unsubscribeStatus();
      unsubscribeError();
    };
  }, [checkLicense]);

  useEffect(() => {
    if (!currentUser || profileKey === 'law_firm' || activePage !== 'pos') return;
    inventoryApi.getCentralServerConfig()
      .then((config) => {
        if (config.baseUrl && !config.warehouseId) setActivePage('branches');
      })
      .catch((error) => console.error('تعذر التحقق من إعداد فرع الجهاز:', error));
  }, [activePage, currentUser, profileKey]);

  useEffect(() => {
    if (!currentUser || loadingSession || activePage === 'pos' || showReviewModal) return undefined;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const status = await inventoryApi.getReviewPromptStatus({ claim: true });
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
        const config = await inventoryApi.getCentralServerConfig();
        if (!cancelled && config.baseUrl) {
          const result = await inventoryApi.syncReviews();
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
    setActivePage(defaultPage);
  }

  useEffect(() => {
    if (!isBusinessProfilePageEnabled(activePage, profileKey, isModuleEnabled)) {
      setActivePage(defaultPage);
    }
  }, [activePage, defaultPage, isModuleEnabled, profileKey]);

  if (licenseError) {
    return (
      <LicenseLockScreen
        hwid={licenseStatus?.hwid}
        error={licenseError}
        onRetry={checkLicense}
        onActivateSuccess={(newStatus) => {
          setLicenseStatus(newStatus);
          setLicenseError('');
        }}
      />
    );
  }

  if (!licenseStatus) {
    return (
      <ThreeLoadingScreen
        fullscreen
        text="جاري التحقق من الترخيص"
        subtext="يتم التحقق من وقت الخادم قبل فتح النظام..."
      />
    );
  }

  if (licenseStatus.isExpired && !licenseStatus.isActivated) {
    return (
      <LicenseLockScreen
        hwid={licenseStatus.hwid}
        onActivateSuccess={(newStatus) => setLicenseStatus(newStatus)}
      />
    );
  }

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

  if (currentUser.forcePasswordChange === true) {
    return (
      <ForcePasswordChangePage
        onSuccess={() => setCurrentUser((prev) => ({ ...prev, forcePasswordChange: false }))}
      />
    );
  }

  function renderPage() {
    if (!isBusinessProfilePageEnabled(activePage, profileKey, isModuleEnabled)) {
      if (profileKey === 'crm') return <CRMPage />;
      if (profileKey === 'law_firm') return <TodayPage onNavigate={navigateToPage} currentUser={currentUser} />;
      return <POSPage onNavigate={setActivePage} />;
    }

    const pagePermissions = {
      today: profileKey === 'law_firm' ? 'cases.view' : 'pos.view',
      pos: 'pos.view',
      kitchen: 'pos.view',
      orders: 'orders.view',
      appointments: 'appointments.view',
      courts: 'cases.view',
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
      salaries: 'team.view',
      settings: 'settings.view',
      profile: null,
      enterprise: 'enterprise.view',
      workflows: 'enterprise.view',
    };
    const hasPageAccess = activePage === 'profile'
      || (currentUser.role === 'admin' && !currentUser.systemRoleKey)
      || hasPermission(currentUser, pagePermissions[activePage]);
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
        return <TodayPage onNavigate={navigateToPage} currentUser={currentUser} />;
      case 'products':
        return <ProductsPage onNavigate={setActivePage} />;
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
              setActivePage(profileKey === 'law_firm' ? 'today' : 'pos');
            }}
          />
        );
      case 'kitchen':
        return <KitchenDisplayPage />;
      case 'subscriptions':
        return <SubscriptionsPage />;
      case 'commissions':
        return <CommissionsPage />;
      case 'returns':
        return <ReturnsPage />;
      case 'shifts':
        return <ShiftsPage />;
      case 'reports':
        return <ReportsPage onNavigate={setActivePage} />;
      case 'customers':
        return <CustomersPage onNavigate={setActivePage} />;
      case 'crm':
        return <CRMPage />;
      case 'suppliers':
        return <SuppliersPage />;
      case 'users':
        return (
          <PageErrorBoundary key={activePage} pageName="users">
            <UsersPage currentUser={currentUser} />
          </PageErrorBoundary>
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
        return (
          <CasesPage
            initialCaseId={caseToOpen}
            openCreateOnMount={openNewCaseOnLoad}
            onInitialActionHandled={() => {
              setCaseToOpen(null);
              setOpenNewCaseOnLoad(false);
            }}
          />
        );
      case 'courts':
        return <CourtsPage />;
      default:
        return profileKey === 'law_firm'
          ? <TodayPage onNavigate={navigateToPage} currentUser={currentUser} />
          : <POSPage onNavigate={setActivePage} />;
    }
  }

  return (
    <PageErrorBoundary key={activePage} pageName={activePage}>
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
    </PageErrorBoundary>
  );
}

function App() {
  return (
    <UserProvider>
      <SettingsProvider>
        <BusinessProfileProvider>
          <NotificationsProvider>
            <AppContent />
            <RateLimitNotice />
          </NotificationsProvider>
        </BusinessProfileProvider>
      </SettingsProvider>
    </UserProvider>
  );
}

export default App;