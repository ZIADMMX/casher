import { useSettings } from '../contexts/SettingsContext.jsx';
import { useBusinessProfile } from '../contexts/BusinessProfileContext.jsx';
import CRMReportsPage from './CRMReportsPage.jsx';
import LawFirmReportsPage from '../components/legal/LawFirmReportsPage.jsx';
import SalesReportsView from '../components/reports/SalesReportsView.jsx';

// One sales report for every selling sector (retail, restaurant, salon, clinic...).
// Sectors whose work is not invoices get their own report.
function ReportsPage({ onNavigate }) {
  const { configuration } = useBusinessProfile();
  const { settings } = useSettings();
  const profileKey = configuration?.profile?.key
    || settings?.business_type
    || settings?.onboarding_sector
    || 'retail';

  if (profileKey === 'law_firm') return <LawFirmReportsPage />;
  return profileKey === 'crm' ? <CRMReportsPage /> : <SalesReportsView onNavigate={onNavigate} />;
}

export default ReportsPage;
