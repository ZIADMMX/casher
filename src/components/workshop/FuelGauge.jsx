import INTAKE from '../../../shared/vehicleIntake.json';

const CX = 200; const CY = 190; const R = 140;
const point = (deg, r) => [CX + r * Math.cos((deg * Math.PI) / 180), CY - r * Math.sin((deg * Math.PI) / 180)];
const arc = (from, to) => {
  const [x1, y1] = point(from, R); const [x2, y2] = point(to, R);
  return `M${x1.toFixed(1)} ${y1.toFixed(1)} A${R} ${R} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`;
};

/** Half-dial fuel gauge with a segmented selector underneath (E, ¼, ½, ¾, F). */
export default function FuelGauge({ level, onChange }) {
  const angle = 180 - level * 45; // E at 180deg (left), F at 0deg (right)
  const [nx, ny] = point(angle, R - 28);
  const current = INTAKE.fuel[level];
  return (
    <div className="fg">
      <svg viewBox="0 0 400 230" role="img" aria-label={`مستوى الوقود: ${current.label}`}>
        <defs><linearGradient id="fg-fill" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="#FDBA74" /><stop offset="1" stopColor="#F97316" /></linearGradient></defs>
        <path d={arc(180, 0)} className="fg-track" />
        {level > 0 && <path d={arc(180, angle)} className="fg-fill" />}
        {[135, 90, 45].map((deg) => { const [a, b] = point(deg, R + 12); const [c, d] = point(deg, R - 12); return <line key={deg} x1={a} y1={b} x2={c} y2={d} className="fg-tick" />; })}
        {[[180, 'E'], [135, '¼'], [90, '½'], [45, '¾'], [0, 'F']].map(([deg, t]) => {
          const [x, y] = point(deg, R + 34);
          return <text key={t} x={x} y={deg === 180 || deg === 0 ? y + 38 : y + 5} textAnchor="middle" className="fg-mark">{t}</text>;
        })}
        <line x1={CX} y1={CY} x2={nx} y2={ny} className="fg-needle" />
        <circle cx={CX} cy={CY} r="13" className="fg-hub" /><circle cx={CX} cy={CY} r="5" fill="#fff" />
      </svg>
      <p className="fg-label"><b>{current.label}</b>{current.warn && <i className="fg-warn"><span aria-hidden="true" />منخفض</i>}</p>
      <div className="fg-seg" role="radiogroup" aria-label="مستوى الوقود">
        {INTAKE.fuel.map((f) => (
          <button key={f.level} type="button" role="radio" aria-checked={level === f.level} className={level === f.level ? 'is-on' : ''} onClick={() => onChange(f.level)}>{f.mark}</button>
        ))}
      </div>
    </div>
  );
}
