import React, { useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import './Modal.css';

/**
 * Simple accessible modal.
 * Props:
 *   - isOpen: boolean – controls visibility
 *   - onClose: function – called when the modal requests to close
 *   - children: modal content
 */
export default function Modal({ isOpen, onClose, children }) {
  const overlayRef = useRef(null);
  const contentRef = useRef(null);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  // Focus trap – keep focus inside modal when open
  useEffect(() => {
    if (!isOpen) return;
    const focusable = contentRef.current.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const trap = (e) => {
      if (e.key !== 'Tab') return;
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', trap);
    // focus first element
    first && first.focus();
    return () => document.removeEventListener('keydown', trap);
  }, [isOpen]);

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div className="modal-overlay" ref={overlayRef} onClick={(e) => e.target === overlayRef.current && onClose()}>
      <div className="modal-content" ref={contentRef} role="dialog" aria-modal="true">
        {children}
      </div>
    </div>,
    document.body
  );
}
