import Modal from '../ui/Modal.jsx';

export function SalonAlert({ error, notice }) {
  if (!error && !notice) return null;
  return (
    <p className={`hr-alert ${error ? 'is-error' : 'is-success'}`} role={error ? 'alert' : 'status'}>
      {error || notice}
    </p>
  );
}

/** A modal form in the hr look; the Modal is portaled to <body>, so the form carries .hr-page for the tokens. */
export function SalonFormModal({ isOpen, onClose, title, subtitle, onSubmit, busy, error, submitLabel, children }) {
  return (
    <Modal isOpen={isOpen} onClose={() => !busy && onClose()}>
      <form
        className="hr-page salon-form"
        aria-label={title}
        onSubmit={(event) => { event.preventDefault(); onSubmit(); }}
      >
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
        <div className="salon-form-grid">{children}</div>
        <SalonAlert error={error} />
        <footer>
          <button type="button" className="hr-btn" onClick={onClose} disabled={busy}>إلغاء</button>
          <button type="submit" className="hr-btn is-primary" disabled={busy}>{busy ? 'جارٍ الحفظ...' : submitLabel}</button>
        </footer>
      </form>
    </Modal>
  );
}

export function Field({ label, wide, children }) {
  return (
    <label className={`hr-field${wide ? ' is-wide' : ''}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}
