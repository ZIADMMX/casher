import { useState } from 'react';
import { CalendarIcon, GiftIcon, PercentIcon, TagIcon, UsersIcon } from '../components/icons/PosIcons.jsx';
import SalonAppointmentsTab from '../components/salon/SalonAppointmentsTab.jsx';
import SalonCouponsTab from '../components/salon/SalonCouponsTab.jsx';
import SalonPackagesTab from '../components/salon/SalonPackagesTab.jsx';
import SalonServicesTab from '../components/salon/SalonServicesTab.jsx';
import SalonTeamTab from '../components/salon/SalonTeamTab.jsx';
import '../styles/hr.css';
import '../styles/salon.css';

const TABS = [
  { key: 'appointments', label: 'المواعيد', Icon: CalendarIcon, Tab: SalonAppointmentsTab },
  { key: 'services', label: 'الخدمات والأسعار', Icon: TagIcon, Tab: SalonServicesTab },
  { key: 'team', label: 'الحلاقين والعمولات', Icon: UsersIcon, Tab: SalonTeamTab },
  { key: 'packages', label: 'الباقات', Icon: GiftIcon, Tab: SalonPackagesTab },
  { key: 'coupons', label: 'الكوبونات', Icon: PercentIcon, Tab: SalonCouponsTab },
];

export default function SalonPage() {
  const [active, setActive] = useState('appointments');
  const { Tab } = TABS.find((t) => t.key === active);

  return (
    <div className="hr-page">
      <header className="hr-header">
        <div className="hr-header-top">
          <div>
            <span className="hr-eyebrow"><UsersIcon size={16} /> الصالون</span>
            <h1>إدارة الصالون</h1>
            <p>المواعيد، قائمة الخدمات، عمولات الحلاقين، الباقات والكوبونات في مكان واحد.</p>
          </div>
        </div>
        <nav className="hr-tabs" aria-label="أقسام الصالون">
          {TABS.map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              className={`hr-tab${key === active ? ' is-active' : ''}`}
              aria-current={key === active ? 'page' : undefined}
              onClick={() => setActive(key)}
            >
              <Icon size={18} /> {label}
            </button>
          ))}
        </nav>
      </header>
      <div className="hr-body">
        <Tab key={active} />
      </div>
    </div>
  );
}
