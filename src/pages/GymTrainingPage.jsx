import { useCallback, useEffect, useMemo, useState } from 'react';
import * as subsApi from '../api/subscriptions.js';
import * as customersApi from '../api/customers.js';
import { useUser } from '../contexts/UserContext.jsx';
import { hasPermission } from '../utils/accessControl.js';
import GymSchedule from '../components/gym/GymSchedule.jsx';
import GymPackages, { AssignCard } from '../components/gym/GymPrivate.jsx';
import { PackagePicker, TrainerCard, TrainerCompare } from '../components/gym/GymTrainerPanel.jsx';
import { Icon, Segmented } from '../components/gym/GymBits.jsx';
import { ChangeTrainerDialog, ClassDialog, MemberDialog, RosterDialog, TrainerDialog, errText } from '../components/gym/GymDialogs.jsx';
import { WEEKDAYS, addDays, isoDate, slashDate, weekLabel, weekStartOf, weekdayOf } from '../utils/gymTraining.js';
import '../styles/gymTraining.css';

const VIEWS = [
  { value: 'classes', label: 'الحصص والمدربين' },
  { value: 'private', label: 'التدريب الخاص' },
];

export default function GymTrainingPage() {
  const { currentUser } = useUser();
  const canManage = hasPermission(currentUser, 'subscriptions.manage');

  const today = isoDate(new Date());
  const [view, setView] = useState('classes');
  const [mode, setMode] = useState('week');
  const [weekStart, setWeekStart] = useState(() => weekStartOf(today));
  const [focusDay, setFocusDay] = useState(() => weekdayOf(today));
  const [week, setWeek] = useState({ weekStart, today, classes: [] });
  const [trainers, setTrainers] = useState([]);
  const [packages, setPackages] = useState([]);
  const [members, setMembers] = useState([]);
  const [trainerId, setTrainerId] = useState(null);
  const [sessions, setSessions] = useState(12);
  const [selectedClassId, setSelectedClassId] = useState(null);
  const [assign, setAssign] = useState({ customerId: null, trainerId: null, sessions: 12 });
  const [dialog, setDialog] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loaded, setLoaded] = useState(false);

  const loadWeek = useCallback(async () => {
    setWeek(await subsApi.getGymWeek({ weekStart }));
  }, [weekStart]);

  const loadTrainers = useCallback(async () => {
    const list = await subsApi.getGymTrainers({ date: weekStart });
    setTrainers(list);
    setTrainerId((id) => (list.some((t) => t.id === id) ? id : list[0]?.id ?? null));
    setAssign((a) => (list.some((t) => t.id === a.trainerId) ? a : { ...a, trainerId: list[0]?.id ?? null }));
  }, [weekStart]);

  const loadPackages = useCallback(async () => setPackages(await subsApi.getGymPtPackages()), []);

  const refresh = useCallback(async () => {
    setError('');
    try {
      await Promise.all([loadWeek(), loadTrainers(), loadPackages()]);
    } catch (e) {
      setError(`تعذر تحميل بيانات المدربين: ${errText(e)}`);
    } finally {
      setLoaded(true);
    }
  }, [loadWeek, loadTrainers, loadPackages]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    customersApi.getAllCustomersWithStats()
      .then((rows) => setMembers((rows || []).filter((c) => c.is_active !== 0)))
      .catch(() => setMembers([]));
  }, []);

  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(''), 3200);
    return () => clearTimeout(t);
  }, [notice]);

  const trainer = useMemo(() => trainers.find((t) => t.id === trainerId) || null, [trainers, trainerId]);

  async function act(fn, message) {
    setBusy(true);
    setError('');
    try {
      await fn();
      if (message) setNotice(message);
      await refresh();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  }

  const goWeek = (delta) => {
    if (mode === 'day') {
      const next = focusDay + delta;
      if (next < 0 || next > 6) setWeekStart((w) => addDays(w, delta * 7));
      setFocusDay((next + 7) % 7);
    } else {
      setWeekStart((w) => addDays(w, delta * 7));
    }
    setSelectedClassId(null);
  };

  const goToday = () => {
    setWeekStart(weekStartOf(today));
    setFocusDay(weekdayOf(today));
  };

  const selectClass = useCallback((cls) => setSelectedClassId((id) => (id === cls.id ? null : cls.id)), []);
  const openRoster = useCallback((cls) => setDialog({ type: 'roster', cls }), []);
  const bookClass = useCallback((cls) => setDialog({ type: 'book', cls }), []);
  const logSession = useCallback((pkg) => act(
    () => subsApi.logGymPtSession(pkg.id),
    `اتسجلت حصة لـ ${pkg.customer_name} — متبقي ${pkg.remaining - 1}`,
  ), []); // eslint-disable-line react-hooks/exhaustive-deps
  const changeTrainer = useCallback((pkg) => setDialog({ type: 'trainer-change', pkg }), []);

  const isThisWeek = weekStart === weekStartOf(today);
  const noTrainers = loaded && !trainers.length;

  return (
    <div className="legal-ds gym-page" dir="rtl">
      <div className="gym-ambient" aria-hidden="true"><i /><i /><i /></div>

      <header className="gym-top">
        <div className="gym-top__title">
          <span className="gym-logo">ن</span>
          <h1>{view === 'classes' ? 'الحصص والمدربين' : 'المدربين والتدريب الخاص'}</h1>
        </div>
        <Segmented label="العرض" value={view} onChange={setView} options={VIEWS} />
        <div className="gym-top__nav">
          <button type="button" className="gym-icon-btn" aria-label="السابق" onClick={() => goWeek(-1)}><Icon name="prev" /></button>
          <span className="gym-top__range" key={`${weekStart}-${focusDay}-${mode}`}>
            {mode === 'day' && view === 'classes' ? `${WEEKDAYS[focusDay]} ${slashDate(addDays(weekStart, focusDay))}` : weekLabel(weekStart)}
          </span>
          <button type="button" className="gym-icon-btn" aria-label="التالي" onClick={() => goWeek(1)}><Icon name="next" /></button>
          <button type="button" className={`gym-btn gym-btn--today${isThisWeek ? ' is-on' : ''}`} onClick={goToday}>اليوم</button>
          {view === 'classes' && (
            <Segmented label="المدى" size="sm" value={mode} onChange={setMode} options={[{ value: 'week', label: 'أسبوع' }, { value: 'day', label: 'يوم' }]} />
          )}
          {canManage && (
            <button type="button" className="gym-btn gym-btn--ghost" onClick={() => setDialog({ type: 'trainer' })}>
              <Icon name="plus" /> مدرب
            </button>
          )}
        </div>
      </header>

      {error && <p className="gym-alert gym-alert--page" role="alert">{error}</p>}
      {notice && <p className="gym-toast" role="status" key={notice}><Icon name="check" /> {notice}</p>}

      {noTrainers ? (
        <section className="gym-card gym-empty gym-empty--hero">
          <span className="gym-empty__icon"><Icon name="users" /></span>
          <strong>ابدأ بإضافة المدربين</strong>
          <p className="gym-muted">سجّل كل مدرب بسعر الحصة الخاصة ونسبة عمولته، وبعدها اعمل جدول الحصص الجماعية وباقات التدريب الخاص.</p>
          {canManage && <button type="button" className="gym-btn gym-btn--primary" onClick={() => setDialog({ type: 'trainer' })}>أضف أول مدرب</button>}
        </section>
      ) : (
        <div className={`gym-layout gym-layout--${view}`} key={view}>
          <main className="gym-main">
            {view === 'classes' ? (
              <GymSchedule
                week={week}
                mode={mode}
                focusDay={focusDay}
                selectedId={selectedClassId}
                onSelect={selectClass}
                onOpenRoster={openRoster}
                onBook={bookClass}
                onAddClass={() => setDialog({ type: 'class' })}
                canManage={canManage}
              />
            ) : (
              <>
                {canManage && (
                  <AssignCard
                    members={members}
                    trainers={trainers}
                    form={assign}
                    setForm={setAssign}
                    busy={busy}
                    onAssign={() => act(async () => {
                      const { total } = await subsApi.createGymPtPackage(assign);
                      setAssign((a) => ({ ...a, customerId: null }));
                      return total;
                    }, 'اتسندت الباقة وبدأت')}
                  />
                )}
                <GymPackages packages={packages} onLog={logSession} onChangeTrainer={changeTrainer} busy={busy} canManage={canManage} />
              </>
            )}
          </main>

          <aside className="gym-side">
            {view === 'classes' && canManage && trainers.length > 0 && (
              <PackagePicker
                trainers={trainers}
                trainerId={trainerId}
                onTrainer={setTrainerId}
                sessions={sessions}
                onSessions={setSessions}
                busy={busy}
                onStart={() => setDialog({ type: 'package' })}
              />
            )}
            {view === 'private' && trainers.length > 1 && (
              <Segmented label="المدرب" value={trainerId} onChange={setTrainerId} options={trainers.map((t) => ({ value: t.id, label: t.name }))} />
            )}
            <TrainerCard
              trainer={trainer}
              showWeek={view === 'private'}
              todayIndex={isThisWeek ? weekdayOf(today) : -1}
              onEdit={canManage ? () => setDialog({ type: 'trainer', trainer }) : undefined}
            />
            {view === 'private' && trainers.length > 1 && (
              <TrainerCompare trainers={trainers} selectedId={trainerId} onSelect={setTrainerId} />
            )}
          </aside>
        </div>
      )}

      {dialog?.type === 'roster' && (
        <RosterDialog
          cls={dialog.cls}
          members={members}
          canManage={canManage}
          onChanged={() => { loadWeek(); loadTrainers(); }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === 'book' && (
        <MemberDialog
          title={`حجز ${dialog.cls.name}`}
          subtitle={`مع ${dialog.cls.trainer_name}${dialog.cls.booked >= dialog.cls.capacity ? ' · الحصة مكتملة، العضو هيتضاف لقائمة الانتظار' : ''}`}
          confirmLabel="احجز"
          members={members}
          onClose={() => setDialog(null)}
          onConfirm={async (customerId) => {
            const { status } = await subsApi.bookGymClass({ classId: dialog.cls.id, customerId, date: dialog.cls.date });
            setNotice(status === 'waitlist' ? 'الحصة مكتملة — العضو اتضاف لقائمة الانتظار' : 'تم الحجز');
            loadWeek();
          }}
        />
      )}
      {dialog?.type === 'package' && trainer && (
        <MemberDialog
          title="بدء باقة تدريب خاص"
          subtitle={`${sessions} حصة مع ${trainer.name}`}
          confirmLabel="ابدأ الباقة"
          members={members}
          onClose={() => setDialog(null)}
          onConfirm={async (customerId) => {
            await subsApi.createGymPtPackage({ customerId, trainerId: trainer.id, sessions });
            setNotice('اتسندت الباقة وبدأت');
            refresh();
          }}
        />
      )}
      {dialog?.type === 'trainer' && (
        <TrainerDialog trainer={dialog.trainer} onSaved={refresh} onClose={() => setDialog(null)} />
      )}
      {dialog?.type === 'class' && (
        <ClassDialog trainers={trainers} defaultWeekday={focusDay} onSaved={loadWeek} onClose={() => setDialog(null)} />
      )}
      {dialog?.type === 'trainer-change' && (
        <ChangeTrainerDialog pkg={dialog.pkg} trainers={trainers} onSaved={refresh} onClose={() => setDialog(null)} />
      )}
    </div>
  );
}
