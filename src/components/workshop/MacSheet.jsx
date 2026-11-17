import { useEffect } from 'react';
import LineIcon from '../icons/LineIcons.jsx';
import '../../styles/workshop.css';

/**
 * A frosted, macOS-style sheet: Escape and an outside click close it.
 * With `icon` it gets the panel header (icon tile + title, X on the left) and the wide layout.
 */
export default function MacSheet({ title, subtitle, label, icon, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="wk-overlay" onClick={onClose}>
      <div className={`wk-sheet${icon ? ' is-panel' : ''}`} role="dialog" aria-modal="true" aria-label={label || title} onClick={(e) => e.stopPropagation()}>
        {icon ? (
          <header className="wk-panelbar">
            <span className="wk-panelbar__tile"><LineIcon name={icon} size={24} /></span>
            <div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
            <button type="button" className="wk-panelbar__x" onClick={onClose} aria-label="إغلاق"><LineIcon name="x" size={20} /></button>
          </header>
        ) : (
          <header className="wk-sheet__bar">
            <button type="button" className="wk-sheet__dot" onClick={onClose} aria-label="إغلاق"><LineIcon name="x" size={9} strokeWidth={3.5} /></button>
            <div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
          </header>
        )}
        {children}
      </div>
    </div>
  );
}
