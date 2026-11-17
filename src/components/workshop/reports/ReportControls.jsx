import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import LineIcon from '../../icons/LineIcons.jsx';
import { PRESETS, addDays, formatRange, localIso } from '../../../utils/reportDates.js';

/** Glass popover anchored under its trigger, macOS style: grows out of the trigger, closes on Esc / outside click / scroll. */
function Popover({ anchor, onClose, width = 280, children }) {
  const [pos, setPos] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    const r = anchor.current.getBoundingClientRect();
    const left = Math.max(10, Math.min(r.right - width, window.innerWidth - width - 10));
    setPos({ top: r.bottom + 10, left, origin: `${Math.max(0, Math.min(width, r.left + r.width / 2 - left))}px top` });
  }, [anchor, width]);

  useEffect(() => {
    const down = (e) => { if (!ref.current?.contains(e.target) && !anchor.current?.contains(e.target)) onClose(); };
    const key = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', down);
    window.addEventListener('keydown', key);
    window.addEventListener('resize', onClose);
    return () => { document.removeEventListener('mousedown', down); window.removeEventListener('keydown', key); window.removeEventListener('resize', onClose); };
  }, [anchor, onClose]);

  if (!pos) return null;
  return createPortal(
    <div ref={ref} className="wr-pop" role="dialog" style={{ top: pos.top, left: pos.left, width, transformOrigin: pos.origin }}>{children}</div>,
    document.body,
  );
}

/** Period presets with a thumb that slides to the chosen one (-1 = custom range, thumb hidden). */
export function Segmented({ value, onChange }) {
  const index = PRESETS.findIndex((p) => p.key === value);
  return (
    <div className="wr-seg" role="tablist" style={{ '--i': Math.max(0, index), '--n': PRESETS.length }}>
      <i className={`wr-seg__thumb${index < 0 ? ' is-off' : ''}`} aria-hidden="true" />
      {PRESETS.map((p) => (
        <button key={p.key} type="button" role="tab" aria-selected={value === p.key} className={value === p.key ? 'is-on' : ''} onClick={() => onChange(p.key)}>{p.label}</button>
      ))}
    </div>
  );
}

export function RangePicker({ range, onApply }) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(range.start);
  const [to, setTo] = useState(range.end);
  const button = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  const today = localIso(new Date());
  const valid = from && to && from <= to;

  function toggle() { setFrom(range.start); setTo(range.end); setOpen((o) => !o); }
  const quick = [
    ['أمس', () => [addDays(today, -1), addDays(today, -1)]],
    ['آخر 14 يوم', () => [addDays(today, -13), today]],
    ['آخر 30 يوم', () => [addDays(today, -29), today]],
    ['الشهر الماضي', () => {
      const first = new Date(); first.setDate(1); first.setMonth(first.getMonth() - 1);
      const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
      return [localIso(first), localIso(last)];
    }],
  ];

  return (
    <>
      <button ref={button} type="button" className={`wr-chip${open ? ' is-open' : ''}`} onClick={toggle} aria-haspopup="dialog" aria-expanded={open}>
        <LineIcon name="calendar" size={16} />
        <span>{formatRange(range.start, range.end)}</span>
        <LineIcon name="chevronDown" size={14} />
      </button>
      {open && (
        <Popover anchor={button} onClose={close} width={300}>
          <p className="wr-pop__title">اختر الفترة</p>
          <div className="wr-pop__quick">
            {quick.map(([label, get]) => (
              <button key={label} type="button" onClick={() => { const [s, e] = get(); onApply(s, e); close(); }}>{label}</button>
            ))}
          </div>
          <label className="wr-pop__field"><span>من</span><input type="date" value={from} max={to || today} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="wr-pop__field"><span>إلى</span><input type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} /></label>
          <button type="button" className="wr-pop__apply" disabled={!valid} onClick={() => { onApply(from, to); close(); }}>تطبيق</button>
        </Popover>
      )}
    </>
  );
}

export function BranchPicker({ branches, value, onChange }) {
  const [open, setOpen] = useState(false);
  const button = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  const current = branches.find((b) => b.id === value);
  const options = [{ id: null, name: 'كل الفروع' }, ...branches];

  return (
    <>
      <button ref={button} type="button" className={`wr-chip${open ? ' is-open' : ''}`} onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open}>
        <LineIcon name="store" size={16} />
        <span><small>الفرع</small> {current ? current.name : 'كل الفروع'}</span>
        <LineIcon name="chevronDown" size={14} />
      </button>
      {open && (
        <Popover anchor={button} onClose={close} width={240}>
          <ul className="wr-pop__list" role="listbox">
            {options.map((b) => (
              <li key={b.id ?? 'all'}>
                <button type="button" role="option" aria-selected={b.id === value} className={b.id === value ? 'is-on' : ''} onClick={() => { onChange(b.id); close(); }}>
                  <span>{b.name}</span>
                  {b.id === value && <LineIcon name="check" size={14} />}
                </button>
              </li>
            ))}
          </ul>
        </Popover>
      )}
    </>
  );
}
