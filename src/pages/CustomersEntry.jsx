import CustomersPage from './CustomersPage.jsx';
import GymMembersPage from './GymMembersPage.jsx';

/**
 * The "customers" route. The gym gets its own members directory; every other sector keeps the
 * shared customers / CRM page exactly as it was.
 */
export default function CustomersEntry({ profileKey, memberIntent, onNavigate, onNavigateWithOptions }) {
  return profileKey === 'subscriptions_gym'
    ? <GymMembersPage onNavigate={onNavigateWithOptions} openMemberId={memberIntent?.customerId ?? null} />
    : <CustomersPage onNavigate={onNavigate} />;
}
