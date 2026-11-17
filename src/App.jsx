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
import ConnectionBadge from './components/ConnectionBadge.jsx';
import LicenseLockScreen from './components/LicenseLockScreen.jsx';
import LicenseBanner from './components/LicenseBanner.jsx';
import { UserProvider, useUser } from './contexts/UserContext.jsx';
import { SettingsProvider, useSettings } from './contexts/SettingsContext.jsx';
import { BusinessProfileProvider, useBusinessProfile } from './contexts/BusinessProfileContext.jsx';
import { NotificationsProvider } from './contexts/NotificationsContext.jsx';
import ThreeLoadingScreen from './components/ThreeLoadingScreen.jsx';
import { isBusinessProfilePageEnabled } from './utils/businessProfilePages.js';
import PageTutorial from './components/PageTutorial.jsx';
import AgentChat from './components/AgentChat.jsx';
import { hasPermission } from './utils/accessControl.js';
import * as inventoryApi from './api/inventory.js';
import * as licenseApi from './api/license.js';
import * as notificationsApi from './api/notifications.js';
import PageErrorBoundary from './components/system/PageErrorBoundary.jsx';

// التحميل الكسول للصفحات الإدارية لتسريع فتح البرنامج وتقليل حجم الحزمة الأولى
const TodayPage = lazy(() => import('./pages/TodayPage.jsx'));
const ProductsPage = lazy(() => import('./pages/ProductsPage.jsx'));
const InventoryManagementPage = lazy(() => import('./pages/InventoryManagementPage.jsx'));
const AppointmentsPage = lazy(() => import('./pages/AppointmentsPage.jsx'));
const CRMPage = lazy(() => import('./pages/CRMPage.jsx'));
const ReportsPage = lazy(() => import('./pages/ReportsPage.jsx'));
const CustomersEntry = lazy(() => import('./pages/CustomersEntry.jsx'));
const SuppliersPage = lazy(() => import('./pages/SuppliersPage.jsx'));
const ShiftsPage = lazy(() => import('./pages/ShiftsPage.jsx'));
const UsersPage = lazy(() => import('./pages/UsersPage.jsx'));
const AttendancePage = lazy(() => import('./pages/AttendancePage.jsx'));
const LeavesPage = lazy(() => import('./pages/LeavesPage.jsx'));
const SettingsPage = lazy(() => import('./pages/SettingsPage.jsx'));
const ProfilePage = lazy(() => import('./pages/ProfilePage.jsx'));
const KitchenDisplayPage = lazy(() => import('./pages/KitchenDisplayPage.jsx'));
const ReservationsPage = lazy(() => import('./pages/ReservationsPage.jsx'));
const DeliveryOrdersPage = lazy(() => import('./pages/DeliveryOrdersPage.jsx'));
const MaintenanceWorkshopPage = lazy(() => import('./pages/MaintenanceWorkshopPage.jsx'));
const BatchesPage = lazy(() => import('./pages/BatchesPage.jsx'));
const SubscriptionsPage = lazy(() => import('./pages/SubscriptionsPage.jsx'));
const VehiclesPage = lazy(() => import('./pages/VehiclesPage.jsx'));
const WorkOrdersPage = lazy(() => import('./pages/WorkOrdersPage.jsx'));
const MaintenanceRemindersPage = lazy(() => import('./pages/MaintenanceRemindersPage.jsx'));
const WorkshopReportsPage = lazy(() => import('./pages/WorkshopReportsPage.jsx'));
const GymTrainingPage = lazy(() => import('./pages/GymTrainingPage.jsx'));
const GymGatePage = lazy(() => import('./pages/GymGatePage.jsx'));
const GymCheckoutPage = lazy(() => import('./pages/GymCheckoutPage.jsx'));const GymAttendancePage = lazy(() => import('./pages/GymAttendancePage.jsx'));
const CommissionsPage = lazy(() => import('./pages/CommissionsPage.jsx'));
const EnterpriseManagementPage = lazy(() => import('./pages/EnterpriseManagementPage.jsx'));
const RolesPage = lazy(() => import('./pages/RolesPage.jsx'));
const SalariesPage = lazy(() => import('./pages/SalariesPage.jsx'));
const WorkflowsPage = lazy(() => import('./pages/WorkflowsPage.jsx'));
const WebhooksPage = lazy(() => import('./pages/WebhooksPage.jsx'));
const CasesPage = lazy(() => import('./pages/CasesPage.jsx'));
const CourtsPage = lazy(() => import('./pages/CourtsPage.jsx'));
const SalonPage = lazy(() => import('./pages/SalonPage.jsx'));

function AppContent() {
  const { currentUser, setCurrentUser, logout, setupRequired, loadingSession } = useUser();
  const { configuration, isModuleEnabled } = useBusinessProfile();
  const { settings } = useSettings();
  const profileKey = configuration?.profile?.key || settings?.business_type || settings?.onboarding_sector || 'retail';
  const defaultPage = profileKey === 'law_firm' ? 'today' : profileKey === 'crm' ? 'crm' : 'pos';
  const [activePage, setActivePage] = useState(defaultPage);
  const [caseToOpen, setCaseToOpen] = useState(null);
  const [openNewCaseOnLoad, setOpenNewCaseOnLoad] = useState(false);
  const [appointmentsTab, setAppointmentsTab] = useState('appointments');
  const [inventoryTab, setInventoryTab] = useState('branches'); // set by the spare parts POS shortcuts (stock / stock count)
  const [gymIntent, setGymIntent] = useState(null); // set by the gym members directory to open a member in the subscriptions hub
  const [memberIntent, setMemberIntent] = useState(null); // opens a specific member's profile in the gym members directory (e.g. from the gate)
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [licenseStatus, setLicenseStatus] = useState(null);
  const [licenseError, setLicenseError] = useState('');
  function navigateToPage(page, options = {}) {
    setCaseToOpen(page === 'cases' ? options.caseId || null : null);
    setOpenNewCaseOnLoad(page === 'cases' && options.createCase === true);
    setAppointmentsTab(page === 'appointments' && options.tab ? options.tab : 'appointments');
    setInventoryTab(page === 'branches' && options.tab ? options.tab : 'branches');
    setGymIntent(page === 'gym-checkout' ? options.gymIntent || null : null);
    setMemberIntent(page === 'customers' ? options.memberIntent || null : null);
    setActivePage(page);
  }

  // Lets sector-specific themes (styles/sector-gym.css) key off the active business profile.
  useEffect(() => {
    document.documentElement.dataset.sector = profileKey;
    return () => { delete document.documentElement.dataset.sector; };
  }, [profileKey]);

  // A pending gym intent only applies to the page it was meant for.
  useEffect(() => {
    if (activePage !== 'gym-checkout') setGymIntent(null);
    if (activePage !== 'customers') setMemberIntent(null);
  }, [activePage]);

  // Old links (notifications, tutorials, "member file") still say 'subscriptions'; for a gym that is the checkout hub.
  useEffect(() => {
    if (profileKey === 'subscriptions_gym' && activePage === 'subscriptions') setActivePage('gym-checkout');
  }, [profileKey, activePage]);

  // Clicking a Windows notification opens the page it points to.
  useEffect(() => {
    if (!notificationsApi.onNotificationClicked.isAvailable()) return undefined;
    return notificationsApi.onNotificationClicked((notification) => {
      if (notification?.link_page) setActivePage(notification.link_page);
    });
  }, []);

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
        reason={licenseStatus.reason || ''}
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
    // The gym has no separate subscriptions page: it lives inside تحصيل الاشتراكات, so old links land there.
    const page = profileKey === 'subscriptions_gym' && activePage === 'subscriptions' ? 'gym-checkout' : activePage;
    if (!isBusinessProfilePageEnabled(page, profileKey, isModuleEnabled)) {
      if (profileKey === 'crm') return <CRMPage />;
      if (profileKey === 'law_firm') return <TodayPage onNavigate={navigateToPage} currentUser={currentUser} />;
      return <POSPage onNavigate={navigateToPage} />;
    }

    const pagePermissions = {
      today: profileKey === 'law_firm' ? 'cases.view' : 'pos.view',
      pos: 'pos.view',
      kitchen: 'pos.view',
      reservations: 'pos.view',
      'delivery-orders': 'pos.view',
      'maintenance-workshop': 'enterprise.view',
      batches: 'products.view',
      salon: 'pos.view',
      appointments: 'appointments.view',
      courts: 'cases.view',
      subscriptions: 'subscriptions.view',
      vehicles: 'enterprise.view',
      'work-orders': 'enterprise.view',
      'service-reminders': 'enterprise.view',
      'workshop-reports': 'reports.view',
      trainers: 'subscriptions.view',
      'gym-gate': 'subscriptions.view',
      'gym-checkout': 'subscriptions.view',
      'gym-attendance': 'subscriptions.view',
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
      webhooks: 'settings.manage',
    };
    const hasPageAccess = page === 'profile'
      || (currentUser.role === 'admin' && !currentUser.systemRoleKey)
      || hasPermission(currentUser, pagePermissions[page]);
    if (!hasPageAccess) {
      return (
        <section className="page-loading-spinner" role="alert">
          <p>لا تملك صلاحية الوصول إلى هذه الشاشة. تواصل مع مدير النظام لتحديث دورك.</p>
          <button type="button" className="primary-btn" onClick={handleLogout}>تسجيل الخروج</button>
        </section>
      );
    }

    switch (page) {
      case 'today':
        return <TodayPage onNavigate={navigateToPage} currentUser={currentUser} />;
      case 'products':
        return <ProductsPage onNavigate={setActivePage} />;
      case 'branches':
        return <InventoryManagementPage key={inventoryTab} initialTab={inventoryTab} />;
      case 'appointments':
        return <AppointmentsPage key={appointmentsTab} initialTab={appointmentsTab} onNavigate={navigateToPage} />;
      case 'pos':
        return (
          <POSPage onNavigate={navigateToPage} />
        );
      case 'kitchen':
        return <KitchenDisplayPage />;
      case 'reservations':
        return <ReservationsPage />;
      case 'delivery-orders':
        return <DeliveryOrdersPage />;
      case 'batches':
        return <BatchesPage />;
      case 'maintenance-workshop':
        return <MaintenanceWorkshopPage onNavigate={navigateToPage} />;
      case 'salon':
        return <SalonPage />;
      case 'subscriptions':
        return <SubscriptionsPage />;
      case 'vehicles':
        return <VehiclesPage />;
      case 'work-orders':
        return <WorkOrdersPage />;
      case 'service-reminders':
        return <MaintenanceRemindersPage />;
      case 'workshop-reports':
        return <WorkshopReportsPage onNavigate={navigateToPage} />;
      case 'trainers':
        return <GymTrainingPage />;
      case 'gym-gate':
        return <GymGatePage onNavigate={navigateToPage} />;
      case 'gym-checkout':
        return <GymCheckoutPage key={gymIntent ? `${gymIntent.action}-${gymIntent.customerId}` : 'hub'} intent={gymIntent} />;
      case 'gym-attendance':
        return <GymAttendancePage />;
      case 'commissions':
        return <CommissionsPage />;
      case 'returns':
        return <ReturnsPage />;
      case 'shifts':
        return <ShiftsPage />;
      case 'reports':
        return <ReportsPage onNavigate={setActivePage} />;
      case 'customers':
        return <CustomersEntry key={memberIntent ? `m-${memberIntent.customerId}` : 'list'} profileKey={profileKey} memberIntent={memberIntent} onNavigate={setActivePage} onNavigateWithOptions={navigateToPage} />;
      case 'crm':
        return <CRMPage />;
      case 'suppliers':
        return <SuppliersPage onNavigate={navigateToPage} />;
      case 'users':
        return (
          <PageErrorBoundary key={activePage} pageName="users">
            <UsersPage currentUser={currentUser} onNavigate={setActivePage} />
          </PageErrorBoundary>
        );
      case 'attendance':
        return <AttendancePage onNavigate={setActivePage} />;
      case 'leaves':
        return <LeavesPage onNavigate={setActivePage} />;
      case 'settings':
        return <SettingsPage />;
      case 'profile':
        return <ProfilePage onOpenAccountSettings={() => setShowProfileModal(true)} />;
      case 'enterprise':
        return <EnterpriseManagementPage onNavigate={setActivePage} />;
      case 'roles':
        return <RolesPage />;
      case 'salaries':
        return <SalariesPage onNavigate={setActivePage} />;
      case 'workflows':
        return <WorkflowsPage />;
      case 'webhooks':
        return <WebhooksPage />;
      case 'cases':
        return (
          <CasesPage
            onNavigate={navigateToPage}
            initialCaseId={caseToOpen}
            openCreateOnMount={openNewCaseOnLoad}
            onInitialActionHandled={() => {
              setCaseToOpen(null);
              setOpenNewCaseOnLoad(false);
            }}
          />
        );
      case 'courts':
        return <CourtsPage onNavigate={navigateToPage} />;
      default:
        return profileKey === 'law_firm'
          ? <TodayPage onNavigate={navigateToPage} currentUser={currentUser} />
          : <POSPage onNavigate={navigateToPage} />;
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

        {activePage !== 'pos' && (
          (currentUser.role === 'admin' && !currentUser.systemRoleKey) || hasPermission(currentUser, 'ai.view')
        ) && <AgentChat />}

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
            <ConnectionBadge />
          </NotificationsProvider>
        </BusinessProfileProvider>
      </SettingsProvider>
    </UserProvider>
  );
}

export default App;
