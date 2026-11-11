import { useEffect, useId } from 'react';
import { CloseIcon } from '../icons/PosIcons.jsx';

/**
 * The shell every CRM dialog shares: icon, title and one-line hint on top, Escape and the
 * backdrop close it. Children are the body and footer (usually one <form>).
 */
function CRMModal({ title, subtitle, icon: Icon, onClose, className = '', children }) {
  const titleId = useId();

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="crm-modal-backdrop" onClick={onClose}>
      <div
        className={`crm-modal-box ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="crm-modal-header">
          {Icon && <span className="crm-ov-chip"><Icon size={20} /></span>}
          <div className="crm-modal-heading">
            <h3 id={titleId}>{title}</h3>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button type="button" className="crm-modal-close" aria-label="إغلاق" onClick={onClose}>
            <CloseIcon size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default CRMModal;
