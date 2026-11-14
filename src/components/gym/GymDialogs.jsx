import { useCallback, useEffect, useState } from 'react';
import LegalModalShell from '../legal/LegalModalShell.jsx';
import { Icon, MemberPicker, Segmented } from './GymBits.jsx';
import * as subsApi from '../../api/subscriptions.js';
import { TONES, WEEKDAYS, dayOfMonth, monthName, timeLabel } from '../../utils/gymTraining.js';

const errText = (e) => (e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : 'حدث خطأ غير متوقع');

export function Sheet({ title, subtitle, onClose, children, footer }) {
  return (
    <LegalModalShell onClose={onClose} size="md" labelledBy="gym-dialog-title" className="gym-sheet">
      {(close) => (
        <>
          <header className="gym-sheet__head">
            <div>
              <h2 id="gym-dialog-title">{title}</h2>
              {subtitle && <p className="gym-muted">{subtitle}</p>}
            </div>
            <button type="button" className="gym-icon-btn" onClick={close} aria-label="إغلاق"><Icon name="x" /></button>
          </header>
          <div className="gym-sheet__body legal-rise">{children}</div>
          {footer && <footer className="gym-sheet__foot">{footer(close)}</footer>}
        </>
      )}
    </LegalModalShell>
  );
}

// Pick a member then run onConfirm(customerId); errors stay inside the window.
export function MemberDialog({ title, subtitle, confirmLabel, members, onConfirm, onClose }) {
  const [customerId, setCustomerId] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Sheet
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      footer={(close) => (
        <>
          <button type="button" className="gym-btn gym-btn--ghost" onClick={close}>إلغاء</button>
          <button
            type="button"
            className="gym-btn gym-btn--primary"
            disabled={!customerId || busy}
            onClick={async () => {
              setBusy(true);
              setError('');
              try { await onConfirm(customerId); close(); } catch (e) { setError(errText(e)); setBusy(false); }
            }}
          >
            {confirmLabel}
          </button>
        </>
      )}
    >
      <MemberPicker members={members} value={customerId} onChange={setCustomerId} autoFocus />
      {error && <p className="gym-alert" role="alert">{error}</p>}
    </Sheet>
  );
}

export function RosterDialog({ cls, members, canManage, onChanged, onClose }) {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try { setRows(await subsApi.getGymClassRoster({ classId: cls.id, date: cls.date })); } catch (e) { setError(errText(e)); }
  }, [cls.id, cls.date]);
  useEffect(() => { load(); }, [load]);

  async function run(action) {
    setError('');
    try { await action(); await load(); onChanged(); } catch (e) { setError(errText(e)); }
  }

  const booked = rows.filter((r) => r.status !== 'waitlist');
  const waiting = rows.filter((r) => r.status === 'waitlist');

  const renderRow = (r) => (
    <li key={r.id} className={`gym-roster__row is-${r.status}`}>
      <span className="gym-avatar gym-avatar--sm">{r.customer_name?.charAt(0)}</span>
      <span className="gym-roster__name">{r.customer_name}<small className="gym-muted">{r.phone || `#${r.customer_id}`}</small></span>
      {canManage && r.status !== 'waitlist' && (
        <button
          type="button"
          className={`gym-toggle${r.status === 'attended' ? ' is-on' : ''}`}
          aria-pressed={r.status === 'attended'}
          onClick={() => run(() => subsApi.setGymAttendance({ bookingId: r.id, attended: r.status !== 'attended' }))}
        >
          <Icon name="check" /> {r.status === 'attended' ? 'حضر' : 'تسجيل حضور'}
        </button>
      )}
      {canManage && (
        <button type="button" className="gym-icon-btn gym-icon-btn--danger" aria-label="إلغاء الحجز" onClick={() => run(() => subsApi.cancelGymBooking(r.id))}>
          <Icon name="x" />
        </button>
      )}
    </li>
  );

  if (adding) {
    return (
      <MemberDialog
        title="إضافة عضو للحصة"
        subtitle={`${cls.name} · ${WEEKDAYS[cls.weekday]} ${timeLabel(cls.start_time)}`}
        confirmLabel="احجز"
        members={members}
        onClose={() => setAdding(false)}
        onConfirm={async (customerId) => {
          await subsApi.bookGymClass({ classId: cls.id, customerId, date: cls.date });
          onChanged();
        }}
      />
    );
  }

  return (
    <Sheet
        title={`${cls.name} — ${cls.trainer_name}`}
        subtitle={`${WEEKDAYS[cls.weekday]} ${dayOfMonth(cls.date)} ${monthName(cls.date)} · ${timeLabel(cls.start_time)} · ${booked.length} من ${cls.capacity}`}
        onClose={onClose}
        footer={canManage ? (close) => (
          <>
            <button
              type="button"
              className="gym-btn gym-btn--ghost gym-btn--danger"
              onClick={() => run(async () => { await subsApi.deactivateGymClass(cls.id); close(); })}
            >
              حذف الحصة من الجدول
            </button>
            <button type="button" className="gym-btn gym-btn--primary" onClick={() => setAdding(true)}>
              <Icon name="plus" /> إضافة عضو
            </button>
          </>
        ) : null}
      >
        {error && <p className="gym-alert" role="alert">{error}</p>}
        <ul className="gym-roster">
          {booked.map(renderRow)}
          {!booked.length && <li className="gym-muted gym-picker__empty">لا يوجد حجوزات لهذه الحصة بعد</li>}
        </ul>
        {waiting.length > 0 && (
          <>
            <span className="gym-label">قائمة الانتظار</span>
            <ul className="gym-roster">{waiting.map(renderRow)}</ul>
          </>
        )}
      </Sheet>
  );
}

export function TrainerDialog({ trainer, onSaved, onClose }) {
  const [form, setForm] = useState({
    name: trainer?.name || 'م. ',
    specialty: trainer?.specialty || '',
    session_rate: trainer?.session_rate ?? 400,
    commission_pct: trainer?.commission_pct ?? 18,
    group_fee: trainer?.group_fee ?? 35,
  });
  const [error, setError] = useState('');
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  return (
    <Sheet
      title={trainer ? 'تعديل بيانات المدرب' : 'مدرب جديد'}
      subtitle="التعريفة والعمولة بيتحسب بيهم سعر الباقات وعمولة آخر الشهر"
      onClose={onClose}
      footer={(close) => (
        <>
          <button type="button" className="gym-btn gym-btn--ghost" onClick={close}>إلغاء</button>
          <button
            type="button"
            className="gym-btn gym-btn--primary"
            onClick={async () => {
              setError('');
              try {
                if (trainer) await subsApi.updateGymTrainer(trainer.id, form);
                else await subsApi.createGymTrainer(form);
                onSaved();
                close();
              } catch (e) { setError(errText(e)); }
            }}
          >
            حفظ
          </button>
        </>
      )}
    >
      <div className="gym-form">
        <label className="gym-field gym-field--wide"><span className="gym-label">الاسم</span><input className="gym-input" value={form.name} onChange={set('name')} autoFocus /></label>
        <label className="gym-field gym-field--wide"><span className="gym-label">التخصص</span><input className="gym-input" value={form.specialty} onChange={set('specialty')} placeholder="قوة وتأهيل إصابات" /></label>
        <label className="gym-field"><span className="gym-label">سعر الحصة الخاصة (ج.م)</span><input className="gym-input" type="number" min="0" value={form.session_rate} onChange={set('session_rate')} /></label>
        <label className="gym-field"><span className="gym-label">عمولة الحصص الخاصة %</span><input className="gym-input" type="number" min="0" max="100" value={form.commission_pct} onChange={set('commission_pct')} /></label>
        <label className="gym-field"><span className="gym-label">مبلغ الحصة الجماعية (ج.م)</span><input className="gym-input" type="number" min="0" value={form.group_fee} onChange={set('group_fee')} /></label>
      </div>
      {error && <p className="gym-alert" role="alert">{error}</p>}
    </Sheet>
  );
}

export function ClassDialog({ trainers, defaultWeekday, onSaved, onClose }) {
  const [form, setForm] = useState({
    name: '',
    tone: 'peach',
    trainer_id: trainers[0]?.id,
    weekday: defaultWeekday,
    start_time: '09:00',
    duration_min: 45,
    capacity: 20,
  });
  const [error, setError] = useState('');
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  return (
    <Sheet
      title="حصة جماعية جديدة"
      subtitle="بتتكرر كل أسبوع في نفس اليوم والوقت"
      onClose={onClose}
      footer={(close) => (
        <>
          <button type="button" className="gym-btn gym-btn--ghost" onClick={close}>إلغاء</button>
          <button
            type="button"
            className="gym-btn gym-btn--primary"
            disabled={!trainers.length}
            onClick={async () => {
              setError('');
              try { await subsApi.createGymClass(form); onSaved(); close(); } catch (e) { setError(errText(e)); }
            }}
          >
            أضف للجدول
          </button>
        </>
      )}
    >
      {!trainers.length && <p className="gym-alert" role="alert">أضف مدربًا أولًا.</p>}
      <div className="gym-form">
        <label className="gym-field gym-field--wide"><span className="gym-label">اسم الحصة</span><input className="gym-input" value={form.name} onChange={set('name')} placeholder="زومبا" autoFocus /></label>
        <div className="gym-field gym-field--wide">
          <span className="gym-label">اللون</span>
          <Segmented label="اللون" value={form.tone} onChange={(tone) => setForm((f) => ({ ...f, tone }))} options={TONES.map((t) => ({ value: t.key, label: t.label }))} size="sm" />
        </div>
        <label className="gym-field gym-field--wide">
          <span className="gym-label">المدرب</span>
          <select className="gym-input" value={form.trainer_id || ''} onChange={(e) => setForm((f) => ({ ...f, trainer_id: Number(e.target.value) }))}>
            {trainers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <label className="gym-field">
          <span className="gym-label">اليوم</span>
          <select className="gym-input" value={form.weekday} onChange={(e) => setForm((f) => ({ ...f, weekday: Number(e.target.value) }))}>
            {WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
          </select>
        </label>
        <label className="gym-field"><span className="gym-label">الوقت</span><input className="gym-input" type="time" value={form.start_time} onChange={set('start_time')} /></label>
        <label className="gym-field"><span className="gym-label">المدة (دقيقة)</span><input className="gym-input" type="number" min="10" value={form.duration_min} onChange={set('duration_min')} /></label>
        <label className="gym-field"><span className="gym-label">السعة</span><input className="gym-input" type="number" min="1" value={form.capacity} onChange={set('capacity')} /></label>
      </div>
      {error && <p className="gym-alert" role="alert">{error}</p>}
    </Sheet>
  );
}

export function ChangeTrainerDialog({ pkg, trainers, onSaved, onClose }) {
  const [trainerId, setTrainerId] = useState(pkg.trainer_id);
  const [error, setError] = useState('');
  return (
    <Sheet
      title="تغيير المدرب"
      subtitle={`${pkg.customer_name} · متبقي ${pkg.remaining} من ${pkg.sessions_total} حصة`}
      onClose={onClose}
      footer={(close) => (
        <>
          <button type="button" className="gym-btn gym-btn--ghost" onClick={close}>إلغاء</button>
          <button
            type="button"
            className="gym-btn gym-btn--primary"
            disabled={trainerId === pkg.trainer_id}
            onClick={async () => {
              try { await subsApi.changeGymPtTrainer({ packageId: pkg.id, trainerId }); onSaved(); close(); } catch (e) { setError(errText(e)); }
            }}
          >
            حفظ
          </button>
        </>
      )}
    >
      <Segmented label="المدرب" value={trainerId} onChange={setTrainerId} options={trainers.map((t) => ({ value: t.id, label: t.name }))} />
      <p className="gym-muted">الحصص الجاية بتتحسب في عمولة المدرب الجديد بنفس سعر الباقة.</p>
      {error && <p className="gym-alert" role="alert">{error}</p>}
    </Sheet>
  );
}

export { errText };
