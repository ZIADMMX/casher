import { memo, useMemo } from 'react';
import { Icon } from './GymBits.jsx';
import { WEEKDAYS, addDays, dayOfMonth, monthName, timeLabel } from '../../utils/gymTraining.js';

const ClassCard = memo(function ClassCard({ cls, selected, past, onSelect, onOpen, index }) {
  const full = cls.booked >= cls.capacity;
  const pct = Math.min(100, Math.round((cls.booked / cls.capacity) * 100));
  return (
    <button
      type="button"
      className={`gym-class gym-tone--${cls.tone}${selected ? ' is-selected' : ''}${full ? ' is-full' : ''}${past ? ' is-past' : ''}`}
      style={{ '--i': index }}
      onClick={() => onSelect(cls)}
      onDoubleClick={() => onOpen(cls)}
      aria-pressed={selected}
    >
      <strong className="gym-class__name">{cls.name}</strong>
      <span className="gym-class__coach">{cls.trainer_name}</span>
      <span className="gym-bar" style={{ '--pct': `${pct}%` }}><i /></span>
      <span className="gym-class__count">
        {full
          ? <>مكتمل · انتظار {cls.waitlist}</>
          : <bdi>{cls.booked} / {cls.capacity}</bdi>}
      </span>
    </button>
  );
});

export default function GymSchedule({ week, mode, focusDay, selectedId, onSelect, onOpenRoster, onBook, onAddClass, canManage }) {
  const { weekStart, today, classes } = week;

  const days = useMemo(() => {
    const all = WEEKDAYS.map((label, i) => ({ i, label, date: addDays(weekStart, i) }));
    return mode === 'day' ? all.filter((d) => d.i === focusDay) : all;
  }, [weekStart, mode, focusDay]);

  const rows = useMemo(() => {
    const times = [...new Set(classes.map((c) => c.start_time))].sort();
    const byKey = new Map(classes.map((c) => [`${c.start_time}|${c.weekday}`, c]));
    return times.map((t) => ({ time: t, cells: days.map((d) => byKey.get(`${t}|${d.i}`) || null) }));
  }, [classes, days]);

  const legend = useMemo(() => {
    const seen = new Map();
    classes.forEach((c) => { if (!seen.has(c.name)) seen.set(c.name, c.tone); });
    return [...seen];
  }, [classes]);

  const selected = classes.find((c) => c.id === selectedId) || null;
  const free = selected ? Math.max(0, selected.capacity - selected.booked) : 0;

  return (
    <section className="gym-card gym-schedule">
      <header className="gym-card__head">
        <h2>جدول الأسبوع</h2>
        <div className="gym-legend">
          {legend.map(([name, tone]) => (
            <span key={name} className={`gym-legend__item gym-tone--${tone}`}><i />{name}</span>
          ))}
          {canManage && (
            <button type="button" className="gym-btn gym-btn--ghost gym-btn--sm" onClick={onAddClass}>
              <Icon name="plus" /> حصة
            </button>
          )}
        </div>
      </header>

      {!classes.length ? (
        <div className="gym-empty">
          <span className="gym-empty__icon"><Icon name="cal" /></span>
          <strong>لا توجد حصص في الجدول بعد</strong>
          <p className="gym-muted">أضف حصة أسبوعية (زومبا، كروس فيت، سباحة…) وحدد المدرب والسعة.</p>
          {canManage && <button type="button" className="gym-btn gym-btn--primary" onClick={onAddClass}>أضف أول حصة</button>}
        </div>
      ) : (
        <div className="gym-grid-wrap">
          <div className="gym-grid" style={{ '--cols': days.length }} key={`${weekStart}-${mode}-${focusDay}`}>
            <div className="gym-grid__corner" />
            {days.map((d) => (
              <div key={d.i} className={`gym-grid__day${d.date === today ? ' is-today' : ''}`}>
                <span>{d.label}</span>
                <strong>{dayOfMonth(d.date)}</strong>
              </div>
            ))}
            {rows.map((row, r) => (
              <div className="gym-grid__row" key={row.time} style={{ '--r': r }}>
                <div className="gym-grid__time">{timeLabel(row.time)}</div>
                {row.cells.map((cls, c) => (
                  <div key={days[c].i} className={`gym-grid__cell${days[c].date === today ? ' is-today' : ''}`}>
                    {cls && (
                      <ClassCard
                        cls={cls}
                        index={r + c}
                        selected={cls.id === selectedId}
                        past={cls.date < today}
                        onSelect={onSelect}
                        onOpen={onOpenRoster}
                      />
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {selected && (
        <footer className="gym-selected" key={selected.id}>
          <span className="gym-selected__icon"><Icon name="cal" /></span>
          <div className="gym-selected__info">
            <strong>{selected.name} — {selected.trainer_name}</strong>
            <span className="gym-muted">
              {WEEKDAYS[selected.weekday]} {dayOfMonth(selected.date)} {monthName(selected.date)} · {timeLabel(selected.start_time)} · {selected.duration_min} دقيقة
            </span>
          </div>
          <div className="gym-selected__seats">
            <span className="gym-muted">الأماكن المتاحة</span>
            <strong><bdi>{free} من {selected.capacity}</bdi></strong>
          </div>
          <button type="button" className="gym-btn gym-btn--ghost" onClick={() => onOpenRoster(selected)}>
            <Icon name="users" /> الحاضرين
          </button>
          <button
            type="button"
            className="gym-btn gym-btn--primary"
            disabled={selected.date < today}
            onClick={() => onBook(selected)}
          >
            {free ? 'احجز الحصة' : 'أضف للانتظار'}
          </button>
        </footer>
      )}
    </section>
  );
}
