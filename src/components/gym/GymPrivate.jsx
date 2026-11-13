import { memo, useMemo, useState } from 'react';
import { CountUp, Icon, Ring, Segmented } from './GymBits.jsx';
import { PACKAGE_STATUS, PT_PLANS, money, quote, slashDate } from '../../utils/gymTraining.js';

const FILTERS = [
  { value: 'all', label: 'الكل' },
  { value: 'active', label: 'نشطة' },
  { value: 'ending', label: 'قاربت تخلص' },
  { value: 'done', label: 'منتهية' },
];

const matches = (filter, status) => filter === 'all'
  || filter === status
  || (filter === 'done' && (status === 'expired' || status === 'used_up'));

const RING_TONE = { active: 'gold', ending: 'gold', used_up: 'muted', expired: 'danger' };

const PackageRow = memo(function PackageRow({ pkg, index, onLog, onChangeTrainer, busy, canManage }) {
  const status = PACKAGE_STATUS[pkg.status];
  const usable = pkg.status === 'active' || pkg.status === 'ending';
  return (
    <li className="gym-pkg" style={{ '--i': index }}>
      <Ring remaining={pkg.remaining} total={pkg.sessions_total} tone={RING_TONE[pkg.status]} />
      <div className="gym-pkg__who">
        <strong>{pkg.customer_name}</strong>
        <span className="gym-muted">#{pkg.customer_id} · مع {pkg.trainer_name}</span>
      </div>
      <div className="gym-pkg__date">
        <span className="gym-muted">آخر حصة</span>
        <strong>{slashDate(pkg.last_session)}</strong>
      </div>
      <div className="gym-pkg__date">
        <span className="gym-muted">تنتهي</span>
        <strong>{slashDate(pkg.valid_until)}</strong>
      </div>
      <span className={`gym-badge gym-badge--${status.tone}`}>{status.label}</span>
      {canManage && (
        <div className="gym-pkg__actions">
          <button type="button" className="gym-btn gym-btn--ghost" disabled={!usable || busy} onClick={() => onLog(pkg)}>حجز حصة</button>
          <button type="button" className="gym-btn gym-btn--soft" disabled={busy} onClick={() => onChangeTrainer(pkg)}>تغيير المدرب</button>
        </div>
      )}
    </li>
  );
});

export function AssignCard({ members, trainers, form, setForm, onAssign, busy }) {
  const trainer = trainers.find((t) => t.id === form.trainerId);
  const { total } = quote(trainer?.session_rate || 0, form.sessions);
  return (
    <section className="gym-card gym-assign">
      <header className="gym-card__head gym-card__head--flat">
        <div>
          <h2>إسناد مدرب لعضو</h2>
          <p className="gym-muted">اختر العضو والمدرب وعدد الحصص — السعر بيتحسب من تعريفة المدرب</p>
        </div>
        <span className="gym-chip">باقة جديدة</span>
      </header>
      <div className="gym-assign__row">
        <label className="gym-field">
          <span className="gym-label">العضو</span>
          <select
            className="gym-input"
            value={form.customerId || ''}
            onChange={(e) => setForm((f) => ({ ...f, customerId: Number(e.target.value) || null }))}
          >
            <option value="">اختر العضو…</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.name} — #{m.id}</option>)}
          </select>
        </label>
        <div className="gym-field">
          <span className="gym-label">المدرب</span>
          <Segmented
            label="المدرب"
            value={form.trainerId}
            onChange={(trainerId) => setForm((f) => ({ ...f, trainerId }))}
            options={trainers.map((t) => ({ value: t.id, label: t.name.replace(/^م\.\s*/, ''), hint: `${money(t.session_rate)}/حصة` }))}
          />
        </div>
        <div className="gym-field">
          <span className="gym-label">عدد الحصص</span>
          <Segmented
            label="عدد الحصص"
            size="lg"
            value={form.sessions}
            onChange={(sessions) => setForm((f) => ({ ...f, sessions }))}
            options={PT_PLANS.map((p) => ({ value: p.sessions, label: String(p.sessions) }))}
          />
        </div>
        <div className="gym-assign__total">
          <span className="gym-muted">الإجمالي</span>
          <strong><CountUp value={total} /> <small>ج.م</small></strong>
        </div>
        <button type="button" className="gym-btn gym-btn--primary gym-btn--tall" disabled={!form.customerId || !trainer || busy} onClick={onAssign}>
          إسناد وبدء الباقة
        </button>
      </div>
    </section>
  );
}

export default function GymPackages({ packages, onLog, onChangeTrainer, busy, canManage }) {
  const [filter, setFilter] = useState('all');
  const list = useMemo(() => packages.filter((p) => matches(filter, p.status)), [packages, filter]);
  return (
    <section className="gym-card gym-pkgs">
      <header className="gym-card__head">
        <h2>باقات التدريب الخاص <small className="gym-muted">{packages.length} باقة</small></h2>
        <Segmented label="تصفية الباقات" value={filter} onChange={setFilter} options={FILTERS} size="sm" />
      </header>
      {list.length ? (
        <ul className="gym-pkgs__list" key={filter}>
          {list.map((p, i) => (
            <PackageRow key={p.id} pkg={p} index={i} onLog={onLog} onChangeTrainer={onChangeTrainer} busy={busy} canManage={canManage} />
          ))}
        </ul>
      ) : (
        <div className="gym-empty">
          <span className="gym-empty__icon"><Icon name="users" /></span>
          <strong>{packages.length ? 'لا توجد باقات بهذه الحالة' : 'لا توجد باقات تدريب خاص بعد'}</strong>
          <p className="gym-muted">ابدأ بإسناد مدرب لعضو من الكارت اللي فوق.</p>
        </div>
      )}
    </section>
  );
}
