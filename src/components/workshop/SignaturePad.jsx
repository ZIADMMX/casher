import { useEffect, useRef, useState } from 'react';

/** Finger / pen / mouse signature. Reports a PNG data URL after each stroke, or null when cleared. */
export default function SignaturePad({ onChange }) {
  const canvas = useRef(null);
  const drawing = useRef(false);
  const [inked, setInked] = useState(false);

  useEffect(() => {
    const c = canvas.current;
    const ratio = window.devicePixelRatio || 1;
    c.width = c.clientWidth * ratio;
    c.height = c.clientHeight * ratio;
    const ctx = c.getContext('2d');
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#1F3A68';
  }, []);

  const pos = (e) => { const r = canvas.current.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  function down(e) {
    canvas.current.setPointerCapture(e.pointerId);
    drawing.current = true;
    const ctx = canvas.current.getContext('2d');
    const [x, y] = pos(e);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 0.01, y); ctx.stroke();
  }
  function move(e) {
    if (!drawing.current) return;
    const ctx = canvas.current.getContext('2d');
    const [x, y] = pos(e);
    ctx.lineTo(x, y); ctx.stroke();
  }
  function up() {
    if (!drawing.current) return;
    drawing.current = false;
    setInked(true);
    onChange(canvas.current.toDataURL('image/png'));
  }
  function clear() {
    const c = canvas.current;
    c.getContext('2d').clearRect(0, 0, c.width, c.height);
    setInked(false);
    onChange(null);
  }

  return (
    <div className="sp">
      <button type="button" className="sp-clear" onClick={clear} disabled={!inked}>مسح</button>
      <div className="sp-box">
        <canvas ref={canvas} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} aria-label="مساحة توقيع العميلة" />
        {!inked && <span className="sp-hint">وقّع بالإصبع أو بالقلم</span>}
        <i className="sig-line" aria-hidden="true" />
      </div>
    </div>
  );
}
