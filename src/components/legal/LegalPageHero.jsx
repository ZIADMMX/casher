import LegalIcon from './LegalIcon.jsx';
import '../../styles/legalClients.css';

export default function LegalPageHero({ eyebrow, title, subtitle, icon = 'scale', children }) {
  return (
    <header className="legal-ds legal-page-hero">
      <div className="legal-page-hero-title">
        <span className="legal-page-hero-mark"><LegalIcon name={icon} size={24} /></span>
        <div>
          {eyebrow && <span className="legal-page-hero-eyebrow">{eyebrow}</span>}
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
      </div>
      <div className="legal-page-hero-actions">{children}</div>
    </header>
  );
}
