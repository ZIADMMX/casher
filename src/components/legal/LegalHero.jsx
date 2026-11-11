import LegalIcon from './LegalIcon.jsx';
import '../../styles/legalHero.css';

// One navigation for the law-firm workspace: "cases" is its own page, the rest are appointments tabs.
export const LEGAL_SECTIONS = [
  ['cases', 'ملفات القضايا'],
  ['appointments', 'جدول الجلسات'],
  ['resources', 'المحامون والقاعات'],
  ['services', 'أنواع الجلسات'],
  ['holidays', 'أوقات عدم التوفر'],
];

export default function LegalHero({ title, subtitle, actions, active, onSelect }) {
  return (
    <header className="legal-hero">
      <div className="legal-hero-top">
        <div className="legal-hero-title">
          <span className="legal-hero-mark"><LegalIcon name="scale" size={24} /></span>
          <div>
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>
        </div>
        <div className="legal-hero-actions">{actions}</div>
      </div>
      <nav className="legal-hero-tabs" aria-label="أقسام المكتب القانوني">
        {LEGAL_SECTIONS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={active === key ? 'active' : ''}
            aria-current={active === key ? 'page' : undefined}
            onClick={() => active !== key && onSelect?.(key)}
          >
            {label}
          </button>
        ))}
      </nav>
    </header>
  );
}
