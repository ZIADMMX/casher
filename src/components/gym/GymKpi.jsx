const KPI_TICKS = 12;

/** A glass KPI card with a row of ticks showing the share (ratio 0..1) of the whole. */
export default function Kpi({ label, value, hint, tone, ratio }) {
  const on = Math.round(Math.min(1, Math.max(0, ratio)) * KPI_TICKS);
  return (
    <article className={`gms-card gms-kpi is-${tone}`}>
      <span className="gms-kpi__label"><i aria-hidden="true" />{label}</span>
      <strong>{value}</strong>
      <small>{hint}</small>
      <div className="gms-kpi__ticks" aria-hidden="true">
        {Array.from({ length: KPI_TICKS }, (_, i) => <i key={i} className={i < on ? 'is-on' : ''} />)}
      </div>
    </article>
  );
}
