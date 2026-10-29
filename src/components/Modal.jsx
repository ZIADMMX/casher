function Modal({ title, children, onClose, actions, width }) {
  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        background: 'rgba(15, 23, 42, 0.55)',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onClick={(event) => event.stopPropagation()}
        style={{
          width: width || 'min(460px, 100%)',
          borderRadius: '16px',
          background: '#FFFFFF',
          padding: '24px',
          boxShadow: '0 20px 60px rgba(15, 23, 42, 0.3)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'center' }}>
          <h2 id="modal-title" style={{ margin: 0, color: '#991B1B', fontSize: '20px' }}>{title}</h2>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="modal-close-btn">✕</button>
        </div>
        <div style={{ marginTop: '16px', color: '#334155', lineHeight: 1.7 }}>{children}</div>
        {actions && <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>{actions}</div>}
      </div>
    </div>
  );
}

export default Modal;
