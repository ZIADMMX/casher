import INTAKE from '../../../shared/vehicleIntake.json';

const SHAPES = { scratch: 'round', dent: 'square', break: 'diamond' };

/** Top view of the car. Tap it to drop a marker; markers are numbered and the selected one is ringed. */
export default function CarDiagram({ damages, selected, onAdd, onSelect, readOnly = false }) {
  function tap(e) {
    if (readOnly || !onAdd) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 100;
    const y = ((e.clientY - r.top) / r.height) * 100;
    if (x < 8 || x > 92 || y < 1 || y > 99) return; // taps on the empty margin are not on the car
    onAdd(Math.round(x * 10) / 10, Math.round(y * 10) / 10);
  }
  return (
    <div className="cd">
      <span className="cd-end is-top">الأمام</span>
      <div className={`cd-stage${readOnly ? '' : ' is-live'}`} onClick={tap} role={readOnly ? 'img' : 'application'} aria-label="رسم السيارة من أعلى. اضغط لإضافة ملاحظة">
        <svg viewBox={INTAKE.diagram.viewBox} aria-hidden="true" dangerouslySetInnerHTML={{ __html: INTAKE.diagram.shapes }} />
        {damages.map((d, i) => (
          <button key={i} type="button" className={`cd-mk is-${SHAPES[d.type]}${selected === i ? ' is-sel' : ''}`} style={{ left: `${d.x}%`, top: `${d.y}%` }}
            onClick={(e) => { e.stopPropagation(); onSelect?.(i); }} aria-label={`ملاحظة ${i + 1}: ${INTAKE.damageTypes[d.type]} ${d.zone}`}><b>{i + 1}</b></button>
        ))}
      </div>
      <span className="cd-end is-bottom">الخلف</span>
    </div>
  );
}
