import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { money } from '../../utils/gymTraining.js';

// Animated number: eases from the previous value to the new one.
export const CountUp = memo(function CountUp({ value, format = money }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    const b = Number(value) || 0;
    if (a === b || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      from.current = b;
      setShown(b);
      return undefined;
    }
    let raf;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / 650);
      const v = a + (b - a) * (1 - (1 - t) ** 3);
      setShown(v);
      if (t < 1) raf = requestAnimationFrame(tick);
      else from.current = b;
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); from.current = b; };
  }, [value]);
  return format(shown);
});

// Segmented control with a pill that slides to the active option.
export function Segmented({ options, value, onChange, size = 'md', label }) {
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div
      className={`gym-seg gym-seg--${size}`}
      role="radiogroup"
      aria-label={label}
      style={{ '--seg-count': options.length, '--seg-index': index }}
    >
      <span className="gym-seg__pill" aria-hidden="true" />
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={`gym-seg__opt${o.value === value ? ' is-active' : ''}`}
          onClick={() => onChange(o.value)}
        >
          <span className="gym-seg__label">{o.label}</span>
          {o.hint && <small>{o.hint}</small>}
        </button>
      ))}
    </div>
  );
}

// Remaining sessions ring; the arc draws itself on mount and on change.
export function Ring({ remaining, total, tone }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const pct = total ? remaining / total : 0;
  return (
    <div className={`gym-ring gym-ring--${tone}`}>
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="32" cy="32" r={r} className="gym-ring__track" />
        <circle
          cx="32" cy="32" r={r}
          className="gym-ring__arc"
          style={{ strokeDasharray: c, '--ring-off': c * (1 - pct), '--ring-full': c }}
        />
      </svg>
      <strong>{remaining}</strong>
      <small>من {total}</small>
    </div>
  );
}

// Searchable member list for picking a customer.
export function MemberPicker({ members, value, onChange, autoFocus }) {
  const [query, setQuery] = useState('');
  const list = useMemo(() => {
    const q = query.trim();
    const rows = q ? members.filter((m) => m.name?.includes(q) || m.phone?.includes(q) || String(m.id) === q) : members;
    return rows.slice(0, 40);
  }, [members, query]);
  return (
    <div className="gym-picker">
      <input
        className="gym-input"
        placeholder="ابحث بالاسم أو الموبايل…"
        value={query}
        autoFocus={autoFocus}
        onChange={(e) => setQuery(e.target.value)}
      />
      <ul className="gym-picker__list" role="listbox" aria-label="الأعضاء">
        {list.map((m) => (
          <li key={m.id}>
            <button
              type="button"
              role="option"
              aria-selected={m.id === value}
              className={m.id === value ? 'is-active' : ''}
              onClick={() => onChange(m.id)}
            >
              <span className="gym-avatar gym-avatar--sm">{m.name?.charAt(0)}</span>
              <span>{m.name}</span>
              <small>{m.phone || `#${m.id}`}</small>
            </button>
          </li>
        ))}
        {!list.length && <li className="gym-muted gym-picker__empty">لا يوجد عضو بهذا الاسم</li>}
      </ul>
    </div>
  );
}

export function Icon({ name }) {
  const paths = {
    prev: <path d="m9 18 6-6-6-6" />,
    next: <path d="m15 18-6-6 6-6" />,
    cal: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M16 3v4M8 3v4M3 11h18" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    users: <><circle cx="9" cy="8" r="4" /><path d="M2 21a7 7 0 0 1 14 0M16 4a4 4 0 0 1 0 8M22 21a7 7 0 0 0-5-6.7" /></>,
    check: <path d="m5 12 5 5 9-10" />,
    x: <path d="M6 6l12 12M18 6 6 18" />,
  };
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}
