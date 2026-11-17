import { useEffect, useMemo, useRef, useState } from 'react';
import { longDay } from '../../../utils/reportDates.js';

export const money = (n) => Math.round(Number(n) || 0).toLocaleString('en-US');
export const compact = (n) => {
  const v = Math.abs(n);
  if (v >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(Math.round(n));
};
const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Eases a number toward its target, starting from wherever it currently is (so a refresh glides instead of restarting). */
export function useCountUp(target, duration = 1000) {
  const [value, setValue] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (reduced() || !Number.isFinite(target)) { from.current = target; setValue(target); return undefined; }
    const begin = from.current;
    const t0 = performance.now();
    let raf;
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / duration);
      const v = begin + (target - begin) * (1 - (1 - p) ** 4);
      from.current = v;
      setValue(v);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

/** false on the first paint, true one frame later: lets CSS transition from the "before" state. */
function useReveal() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setOn(true)));
    return () => cancelAnimationFrame(id);
  }, []);
  return on;
}

// ---- donut: labor vs parts ----
const SEGMENTS = [['parts', 'قطع الغيار'], ['labor', 'العمالة']];

export function Donut({ parts, labor }) {
  const on = useReveal();
  const [hover, setHover] = useState(null);
  const total = parts + labor;
  const amount = { parts, labor };
  const pct = { parts: total ? (parts / total) * 100 : 0, labor: total ? (labor / total) * 100 : 0 };
  const gap = pct.parts > 0 && pct.labor > 0 ? 1.4 : 0;
  const start = { parts: 0, labor: pct.parts };
  const shown = useCountUp(hover ? amount[hover] : total);

  return (
    <div className="wr-donut">
      <div className="wr-donut__ring" role="img" aria-label={total ? `قطع الغيار ${pct.parts.toFixed(1)}٪ والعمالة ${pct.labor.toFixed(1)}٪` : 'لا توجد بيانات'}>
        <svg viewBox="0 0 200 200">
          <defs>
            <linearGradient id="wr-g-parts" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="var(--wr-orange-2)" /><stop offset="1" stopColor="var(--wr-orange)" /></linearGradient>
            <linearGradient id="wr-g-labor" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="var(--wr-gold-2)" /><stop offset="1" stopColor="var(--wr-gold)" /></linearGradient>
          </defs>
          <circle className="wr-donut__track" cx="100" cy="100" r="70" pathLength="100" />
          {SEGMENTS.map(([key]) => {
            const len = Math.max(0, pct[key] - gap);
            return (
              <circle
                key={key} className={`wr-donut__seg${hover && hover !== key ? ' is-dim' : ''}${hover === key ? ' is-hot' : ''}`}
                cx="100" cy="100" r="70" pathLength="100" stroke={`url(#wr-g-${key})`}
                strokeDasharray={on ? `${len} ${100 - len}` : '0 100'} strokeDashoffset={-start[key] - gap / 2}
                onMouseEnter={() => setHover(key)} onMouseLeave={() => setHover(null)}
              />
            );
          })}
        </svg>
        <div className="wr-donut__center">
          <small>{hover ? SEGMENTS.find(([k]) => k === hover)[1] : 'الإجمالي'}</small>
          <b>{compact(shown)}</b>
        </div>
      </div>
      <ul className="wr-donut__legend">
        {SEGMENTS.map(([key, label]) => (
          <li key={key} className={hover === key ? 'is-hot' : ''} onMouseEnter={() => setHover(key)} onMouseLeave={() => setHover(null)}>
            <i className={`is-${key}`} aria-hidden="true" />
            <span>{label}</span>
            <b>{money(amount[key])} ج.م</b>
            <em>{pct[key].toFixed(1)}%</em>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---- daily completed orders: smooth area line ----
const W = 760;
const H = 280;
const PAD = { l: 38, r: 14, t: 16, b: 28 };

// Monotone cubic: smooth like a spline but never dips below zero between points.
function monotone(pts) {
  const n = pts.length;
  if (n < 2) return '';
  const dx = []; const m = [];
  for (let i = 0; i < n - 1; i += 1) { dx[i] = pts[i + 1].x - pts[i].x; m[i] = (pts[i + 1].y - pts[i].y) / dx[i]; }
  const t = [m[0]];
  for (let i = 1; i < n - 1; i += 1) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  t[n - 1] = m[n - 2];
  for (let i = 0; i < n - 1; i += 1) {
    if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
    const a = t[i] / m[i]; const b = t[i + 1] / m[i]; const s = a * a + b * b;
    if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
  }
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < n - 1; i += 1) {
    d += `C${pts[i].x + dx[i] / 3},${pts[i].y + (t[i] * dx[i]) / 3} ${pts[i + 1].x - dx[i] / 3},${pts[i + 1].y - (t[i + 1] * dx[i]) / 3} ${pts[i + 1].x},${pts[i + 1].y}`;
  }
  return d;
}

const niceStep = (raw) => [1, 2, 5, 10, 20, 50, 100, 200, 500].find((s) => s >= raw) || 1000;

export function AreaChart({ daily }) {
  const on = useReveal();
  const [active, setActive] = useState(null);
  const box = useRef(null);
  const n = daily.length;

  const geo = useMemo(() => {
    const max = Math.max(1, ...daily.map((d) => d.orders));
    const step = niceStep(max / 4);
    const yMax = step * (Math.floor(max / step) + 1);
    const x = (i) => (n === 1 ? (PAD.l + W - PAD.r) / 2 : PAD.l + (i * (W - PAD.l - PAD.r)) / (n - 1));
    const y = (v) => H - PAD.b - (v / yMax) * (H - PAD.t - PAD.b);
    const pts = daily.map((d, i) => ({ x: x(i), y: y(d.orders) }));
    const ticks = Array.from({ length: Math.round(yMax / step) + 1 }, (_, i) => i * step);
    const every = Math.ceil(n / 14);
    return { pts, ticks, y, line: monotone(pts), every };
  }, [daily, n]);

  const baseline = H - PAD.b;
  const label = (day) => (n <= 31 ? String(Number(day.slice(8))) : `${Number(day.slice(8))}/${Number(day.slice(5, 7))}`);

  function onMove(e) {
    const r = box.current.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = n === 1 ? 0 : Math.round(((px - PAD.l) / (W - PAD.l - PAD.r)) * (n - 1));
    setActive(Math.max(0, Math.min(n - 1, i)));
  }
  const a = active == null ? null : daily[active];

  return (
    <div className="wr-area" ref={box} onPointerMove={onMove} onPointerLeave={() => setActive(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`الأوامر المكتملة يوميًا: ${daily.reduce((s, d) => s + d.orders, 0)} أمرًا خلال ${n} يوم`}>
        <defs>
          <linearGradient id="wr-line" gradientUnits="userSpaceOnUse" x1={PAD.l} y1="0" x2={W - PAD.r} y2="0">
            <stop offset="0" stopColor="var(--wr-gold)" /><stop offset="1" stopColor="var(--wr-orange)" />
          </linearGradient>
          <linearGradient id="wr-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--wr-orange-2)" stopOpacity="0.34" /><stop offset="1" stopColor="var(--wr-orange-2)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {geo.ticks.map((t) => (
          <g key={t} className="wr-area__grid">
            <line x1={PAD.l} x2={W - PAD.r} y1={geo.y(t)} y2={geo.y(t)} />
            <text x={PAD.l - 12} y={geo.y(t) + 4} textAnchor="end">{t}</text>
          </g>
        ))}
        {daily.map((d, i) => (i % geo.every === 0 || i === n - 1) && (
          <text key={d.day} className="wr-area__x" x={geo.pts[i].x} y={H - 8} textAnchor="middle">{label(d.day)}</text>
        ))}
        {n > 1 && (
          <>
            <path className={`wr-area__fill${on ? ' is-in' : ''}`} d={`${geo.line}L${geo.pts[n - 1].x},${baseline}L${geo.pts[0].x},${baseline}Z`} />
            <path className={`wr-area__line${on ? ' is-in' : ''}`} d={geo.line} pathLength="1" />
          </>
        )}
        {a && <line className="wr-area__cross" x1={geo.pts[active].x} x2={geo.pts[active].x} y1={PAD.t} y2={baseline} />}
        {n <= 31 && geo.pts.map((p, i) => (
          <circle key={daily[i].day} className={`wr-area__dot${on ? ' is-in' : ''}${active === i ? ' is-hot' : ''}`} cx={p.x} cy={p.y} r={active === i ? 6 : 4} style={{ '--d': i }} />
        ))}
      </svg>
      {a && (
        <div className="wr-tip" style={{ left: `${(geo.pts[active].x / W) * 100}%`, top: `${(geo.pts[active].y / H) * 100}%` }}>
          <small>{longDay(a.day)}</small>
          <b>{a.orders} أمرًا</b>
          <span>{money(a.revenue)} ج.م</span>
        </div>
      )}
    </div>
  );
}

// ---- ranked horizontal bars (top services / mechanics) ----
const initial = (name) => String(name).replace(/^م\.\s*/, '').trim().charAt(0) || '؟';

export function RankBars({ rows, dual = false, ranked = false }) {
  const on = useReveal();
  const maxRev = Math.max(1, ...rows.map((r) => r.revenue));
  const maxOrd = Math.max(1, ...rows.map((r) => r.orders));
  return (
    <ol className={`wr-rank${dual ? ' is-dual' : ''}${on ? ' is-in' : ''}`}>
      {rows.map((r, i) => (
        <li key={r.name} style={{ '--i': i }} title={`${r.name}: ${money(r.revenue)} ج.م في ${r.orders} أمرًا`}>
          <span className="wr-rank__who">
            {ranked ? <b className="wr-rank__n">{i + 1}</b> : <i className={`wr-av tone-${i % 5}`} aria-hidden="true">{initial(r.name)}</i>}
            <span>{r.name}</span>
          </span>
          <span className="wr-rank__bars">
            <span className="wr-rank__track"><span className="wr-rank__bar is-rev" style={{ '--w': r.revenue / maxRev }} /></span>
            {dual && <span className="wr-rank__track"><span className="wr-rank__bar is-ord" style={{ '--w': r.orders / maxOrd }} /></span>}
          </span>
          <span className="wr-rank__fig"><b>{money(r.revenue)} ج.م</b><small>{r.orders} أمرًا</small></span>
        </li>
      ))}
    </ol>
  );
}
