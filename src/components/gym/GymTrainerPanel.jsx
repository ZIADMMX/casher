import { CountUp, Segmented } from './GymBits.jsx';
import { PT_PLANS, WEEKDAYS, initialOf, monthName, money, quote } from '../../utils/gymTraining.js';

// Trainer picker + plan list + price, used to start a private-training package.
export function PackagePicker({ trainers, trainerId, onTrainer, sessions, onSessions, onStart, busy }) {
  const trainer = trainers.find((t) => t.id === trainerId);
  const rate = trainer?.session_rate || 0;
  const { total } = quote(rate, sessions);
  return (
    <section className="gym-card gym-pack">
      <header className="gym-pack__head">
        <h2>باقات التدريب الخاص</h2>
        <p className="gym-muted">اختر المدرب ثم عدد الحصص — السعر يتحسب تلقائيًا</p>
      </header>
      <span className="gym-label">المدرب</span>
      <Segmented
        label="المدرب"
        value={trainerId}
        onChange={onTrainer}
        options={trainers.map((t) => ({ value: t.id, label: t.name.replace(/^م\.\s*/, ''), hint: `${money(t.session_rate)}/حصة` }))}
      />
      <div className="gym-plans" role="radiogroup" aria-label="عدد الحصص">
        {PT_PLANS.map((p) => {
          const active = p.sessions === sessions;
          return (
            <button
              key={p.sessions}
              type="button"
              role="radio"
              aria-checked={active}
              className={`gym-plan${active ? ' is-active' : ''}`}
              onClick={() => onSessions(p.sessions)}
            >
              <span className="gym-plan__num">{p.sessions}</span>
              <span className="gym-plan__text">
                <strong>{p.sessions} حصص</strong>
                <small>{p.label}{p.discountPct ? ` · خصم ${p.discountPct}%` : ''}</small>
              </span>
              <span className="gym-plan__price">
                <strong>{money(quote(rate, p.sessions).total)}</strong>
                <small>ج.م</small>
              </span>
            </button>
          );
        })}
      </div>
      <div className="gym-pack__sum">
        <span>{sessions} حصة مع {trainer?.name} × {money(rate)}</span>
        <strong><CountUp value={total} /> ج.م</strong>
      </div>
      <button type="button" className="gym-btn gym-btn--primary gym-btn--block" disabled={!trainer || busy} onClick={onStart}>
        ابدأ الباقة
      </button>
    </section>
  );
}

function CommissionRows({ trainer }) {
  const { month, commission } = trainer;
  return (
    <div className="gym-comm">
      <h3>العمولة — {monthName(month.from)}</h3>
      <dl>
        <div><dt>قيمة الحصص الخاصة</dt><dd className="gym-muted">{month.ptSessions} حصة</dd><dd>{money(month.ptValue)}</dd></div>
        <div><dt>عمولة الحصص الخاصة</dt><dd className="gym-muted">{trainer.commission_pct}%</dd><dd>{money(commission.ptCommission)}</dd></div>
        <div><dt>الحصص الجماعية</dt><dd className="gym-muted">{trainer.group_fee} × {month.groupClasses}</dd><dd>{money(commission.groupCommission)}</dd></div>
      </dl>
      <div className="gym-comm__total">
        <span>إجمالي العمولة</span>
        <strong><CountUp value={commission.total} /> <small>ج.م</small></strong>
      </div>
      <p className="gym-muted gym-comm__note">
        بتتحسب تلقائيًا: {trainer.commission_pct}% من قيمة الحصص الخاصة المنفّذة + {trainer.group_fee} ج.م لكل حصة جماعية. تُصرف مع رواتب آخر الشهر.
      </p>
    </div>
  );
}

export function TrainerCard({ trainer, showWeek, todayIndex, onEdit }) {
  if (!trainer) return null;
  return (
    <section className="gym-card gym-trainer" key={trainer.id}>
      <header className="gym-trainer__head">
        <span className="gym-avatar">{initialOf(trainer.name)}</span>
        <div>
          <h2>{trainer.name}</h2>
          <p className="gym-muted">{trainer.specialty || '—'}</p>
        </div>
        <button type="button" className="gym-chip" onClick={onEdit} title="تعديل بيانات المدرب">★ {Number(trainer.rating).toFixed(1)}</button>
      </header>

      {showWeek && (
        <div className="gym-weekdots">
          <span className="gym-label">حصص الأسبوع</span>
          <div className="gym-weekdots__row">
            {WEEKDAYS.map((d, i) => (
              <div key={d} className={`gym-weekdot${i === todayIndex ? ' is-today' : ''}${trainer.week[i] ? '' : ' is-zero'}`} style={{ '--i': i }}>
                <small>{d.replace(/^ال/, '')}</small>
                <strong>{trainer.week[i]}</strong>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="gym-stats">
        <div><strong><CountUp value={trainer.month.ptSessions} /></strong><span>{showWeek ? 'حصة هذا الشهر' : 'حصة منفذة'}</span></div>
        <div>
          <strong>{showWeek ? <CountUp value={trainer.members} /> : <CountUp value={trainer.month.groupClasses} />}</strong>
          <span>{showWeek ? 'عضو مسند' : 'حصة جماعية'}</span>
        </div>
        <div><strong>{trainer.attendancePct == null ? '—' : <><CountUp value={trainer.attendancePct} />%</>}</strong><span>نسبة حضور</span></div>
      </div>

      <CommissionRows trainer={trainer} />
    </section>
  );
}

export function TrainerCompare({ trainers, selectedId, onSelect }) {
  const max = Math.max(1, ...trainers.map((t) => t.month.ptSessions));
  return (
    <section className="gym-card gym-compare">
      <h3>مقارنة بالمدربين</h3>
      {trainers.map((t, i) => (
        <button
          key={t.id}
          type="button"
          className={`gym-compare__row${t.id === selectedId ? ' is-active' : ''}`}
          style={{ '--i': i }}
          onClick={() => onSelect(t.id)}
        >
          <span className="gym-compare__name">{t.name}</span>
          <span className="gym-compare__val"><strong>{t.month.ptSessions}</strong> حصة</span>
          <span className="gym-bar gym-bar--wide" style={{ '--pct': `${(t.month.ptSessions / max) * 100}%` }}><i /></span>
        </button>
      ))}
    </section>
  );
}
