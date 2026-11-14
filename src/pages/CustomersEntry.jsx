import CustomersPage from './CustomersPage.jsx';
import GymMembersPage from './GymMembersPage.jsx';

/**
 * The "customers" route. The gym gets its own members directory; every other sector keeps the
 * shared customers / CRM page exactly as it was.
 */
export default function CustomersEntry({ profileKey, onNavigate, onNavigateWithOptions }) {
  return profileKey === 'subscriptions_gym'
    ? <GymMembersPage onNavigate={onNavigateWithOptions} />
    : <CustomersPage onNavigate={onNavigate} />;
}
