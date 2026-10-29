import React, { useEffect } from 'react';
import './Toast.css';

/**
 * Toast notification component.
 * Props:
 *   - message: string – text to display
 *   - type: 'success' | 'danger' | 'warning' | 'info' (default 'info')
 *   - duration: number – ms before auto‑close (default 3000)
 *   - onClose: function – called when toast is dismissed
 */
export default function Toast({
  message = '',
  type = 'info',
  duration = 3000,
  onClose = () => {}
}) {
  // Show animation when mounted
  const [visible, setVisible] = React.useState(false);

  const handleClose = () => {
    setVisible(false);
    // wait for animation before notifying parent
    setTimeout(onClose, 300);
  };

  useEffect(() => {
    // trigger show after mount
    const tick = setTimeout(() => setVisible(true), 10);
    // auto‑close after duration
    const timer = setTimeout(() => handleClose(), duration);
    return () => {
      clearTimeout(tick);
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const className = `toast toast--${type}${visible ? ' show' : ''}`;

  return (
    <div className={className} role="alert" aria-live="assertive">
      <span>{message}</span>
      <button className="close-btn" aria-label="Close" onClick={handleClose}>
        ×
      </button>
    </div>
  );
}
