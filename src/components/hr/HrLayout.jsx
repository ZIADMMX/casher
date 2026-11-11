import { CalendarIcon, CashIcon, ClockIcon, UserIcon, UsersIcon } from '../icons/PosIcons.jsx';
import '../../styles/hr.css';

const HR_TABS = [
  { key: 'users', label: 'فريق العمل', Icon: UserIcon },
  { key: 'attendance', label: 'الحضور والانصراف', Icon: ClockIcon },
  { key: 'leaves', label: 'الإجازات', Icon: CalendarIcon },
  { key: 'salaries', label: 'الرواتب', Icon: CashIcon },
];

export function HrHeader({ active, title, subtitle, actions, onNavigate }) {
  return (
    <header className="hr-header">
      <div className="hr-header-top">
        <div>
          <span className="hr-eyebrow"><UsersIcon size={16} /> شؤون الموظفين</span>
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {actions && <div className="hr-header-actions">{actions}</div>}
      </div>
      <nav className="hr-tabs" aria-label="أقسام شؤون الموظفين">
        {HR_TABS.map(({ key, label, Icon }) => (
          <button
            key={key}
            type="button"
            className={`hr-tab${key === active ? ' is-active' : ''}`}
            aria-current={key === active ? 'page' : undefined}
            onClick={() => key !== active && onNavigate?.(key)}
          >
            <Icon size={18} />
            {label}
          </button>
        ))}
      </nav>
    </header>
  );
}

export function HrStat({ Icon, tone = 'brand', label, value, total, note }) {
  return (
    <article className="hr-stat">
      <span className={`hr-stat-icon is-${tone}`}><Icon size={22} /></span>
      <div>
        <span className="hr-stat-label">{label}</span>
        <strong className="hr-stat-value">
          {value}
          {total !== undefined && <small> من {total}</small>}
        </strong>
        {note && <span className="hr-stat-note">{note}</span>}
      </div>
    </article>
  );
}

export function HrEmpty({ Icon, title, text, children }) {
  return (
    <div className="hr-empty">
      <span className="hr-empty-icon"><Icon size={28} /></span>
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {children && <div className="hr-empty-actions">{children}</div>}
    </div>
  );
}
