import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import '../../styles/legalMotion.css';

// The window grows out of the spot the user last clicked, like a macOS app opening from the Dock.
let lastPointer = null;
if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', (event) => {
    lastPointer = { x: event.clientX, y: event.clientY, at: Date.now() };
  }, true);
}

const EXIT_MS = 220;

/**
 * Overlay + dialog with pop-in / pop-out motion, Escape and backdrop close.
 * children may be a function receiving requestClose, so close buttons animate out too.
 */
export default function LegalModalShell({ onClose, locked = false, labelledBy, size = 'lg', className = '', children }) {
  const panelRef = useRef(null);
  const [closing, setClosing] = useState(false);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    const fresh = lastPointer && Date.now() - lastPointer.at < 1500;
    const x = fresh ? lastPointer.x - rect.left : rect.width / 2;
    const y = fresh ? lastPointer.y - rect.top : rect.height / 2;
    panel.style.transformOrigin = `${Math.round(x)}px ${Math.round(y)}px`;
    if (!panel.contains(document.activeElement)) panel.focus({ preventScroll: true });
  }, []);

  // The exit animation plays first, then the parent unmounts the window.
  useEffect(() => {
    if (!closing) return undefined;
    const timer = setTimeout(onClose, EXIT_MS);
    return () => clearTimeout(timer);
  }, [closing, onClose]);

  function requestClose() {
    if (!locked) setClosing(true);
  }

  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') requestClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div
      className={`legal-ds legal-sheet-overlay${closing ? ' is-closing' : ''}`}
      onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose(); }}
    >
      <section
        ref={panelRef}
        className={`legal-sheet legal-sheet--${size} ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        dir="rtl"
      >
        {typeof children === 'function' ? children(requestClose) : children}
      </section>
    </div>
  );
}
