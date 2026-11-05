import { useCallback, useEffect, useState } from 'react';
import { formatProductImageUrl } from '../utils/media.js';
import * as attendanceApi from '../api/attendance.js';
import '../styles/attendance.css';

function getLocalDate() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

function formatTime(value) {
  if (!value) return '—';
  const date = new Date(String(value).replace(' ', 'T'));
  return Number.isNaN(date.getTime())
    ? String(value).slice(-8, -3)
    : date.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
}

function minutesBetween(later, earlier) {
  if (!later || !earlier) return 0;
  return Math.max(0, Math.round((later.getTime() - earlier.getTime()) / 60_000));
}

function scheduleDateTime(date, time, nextDay = false) {
  if (!date || !time) return null;
  const [year, month, day] = date.split('-').map(Number);
  const [hours, minutes] = time.split(':').map(Number);
  return new Date(year, month - 1, day + (nextDay ? 1 : 0), hours, minutes);
}

function formatDuration(minutes) {
  if (minutes < 60) return `${minutes} دقيقة`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours} س ${remainder} د` : `${hours} ساعة`;
}

function getEmployeeName(employee) {
  return employee.full_name
    || [employee.first_name, employee.last_name].filter(Boolean).join(' ')
    || employee.username;
}

function getAttendanceState(employee, date, now) {
  if (!employee.check_in) return { label: 'لم يسجل', tone: 'muted', badges: [] };

  const checkIn = new Date(employee.check_in.replace(' ', 'T'));
  const checkOut = employee.check_out ? new Date(employee.check_out.replace(' ', 'T')) : null;
  const hasSchedule = Boolean(employee.scheduled_start && employee.scheduled_end);
  const overnight = hasSchedule && employee.scheduled_end <= employee.scheduled_start;
  const scheduledStart = hasSchedule ? scheduleDateTime(date, employee.scheduled_start) : null;
  const scheduledEnd = hasSchedule ? scheduleDateTime(date, employee.scheduled_end, overnight) : null;
  const badges = [];

  if (scheduledStart && checkIn > scheduledStart) {
    badges.push({ label: `تأخير ${formatDuration(minutesBetween(checkIn, scheduledStart))}`, tone: 'late' });
  }

  if (scheduledEnd) {
    const overtimeAt = checkOut
      || (date === getLocalDate() && employee.check_in && now > scheduledEnd ? now : null);
    if (overtimeAt && overtimeAt > scheduledEnd) {
      badges.push({ label: `+${formatDuration(minutesBetween(overtimeAt, scheduledEnd))}`, tone: 'extra' });
    }
  }

  return {
    label: checkOut
      ? 'انصرف'
      : date === getLocalDate()
        ? 'حاضر'
        : 'لم يسجل الانصراف',
    tone: checkOut ? 'done' : date === getLocalDate() ? 'present' : 'muted',
    badges,
  };
}

function ScheduleEditor({ employee, onSave, disabled }) {
  const [start, setStart] = useState(employee.scheduled_start || '');
  const [end, setEnd] = useState(employee.scheduled_end || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const unchanged = start === (employee.scheduled_start || '')
    && end === (employee.scheduled_end || '');

  async function handleSubmit(event) {
    event.preventDefault();
    if (Boolean(start) !== Boolean(end)) {
      setError('حدد وقت البداية والنهاية معًا.');
      return;
    }
    if (start && start === end) {
      setError('يجب أن يختلف وقت البداية عن النهاية.');
      return;
    }
    setSaving(true);
    setError('');
    const result = await onSave(employee.user_id, start || null, end || null);
    setSaving(false);
    if (!result) setError('تعذر حفظ الجدول؛ حاول مرة أخرى.');
  }

  useEffect(() => {
    setStart(employee.scheduled_start || '');
    setEnd(employee.scheduled_end || '');
  }, [employee.scheduled_start, employee.scheduled_end]);

  return (
    <form className="attendance-schedule-editor" onSubmit={handleSubmit}>
      <div className="attendance-schedule-inputs">
        <label>
          <span className="sr-only">بداية الوردية</span>
          <input type="time" value={start} onChange={(event) => { setStart(event.target.value); setError(''); }} disabled={disabled || saving} />
        </label>
        <span aria-hidden="true">-</span>
        <label>
          <span className="sr-only">نهاية الوردية</span>
          <input type="time" value={end} onChange={(event) => { setEnd(event.target.value); setError(''); }} disabled={disabled || saving} />
        </label>
        {(!unchanged || (start && end && !employee.scheduled_start)) && (
          <button type="submit" disabled={disabled || saving} aria-label="حفظ الوردية المجدولة">
            {saving ? '...' : 'حفظ'}
          </button>
        )}
      </div>
      {error && <small className="attendance-inline-error">{error}</small>}
    </form>
  );
}

export default function AttendancePage() {
  const [selectedDate, setSelectedDate] = useState(getLocalDate);
  const [attendance, setAttendance] = useState([]);
  const [monthlySummary, setMonthlySummary] = useState([]);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [savingUserId, setSavingUserId] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [clock, setClock] = useState(() => new Date());
  const today = getLocalDate();
  const isToday = selectedDate === today;

  const loadAttendance = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const rows = await attendanceApi.getAttendanceByDate(selectedDate);
      if (!Array.isArray(rows)) throw new Error('تعذر تحميل سجل الحضور.');
      setAttendance(rows);
    } catch (requestError) {
      setError(requestError.message || 'تعذر تحميل سجل الحضور.');
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    loadAttendance();
  }, [loadAttendance]);

  useEffect(() => {
    let mounted = true;
    attendanceApi.getAttendanceSummary30Days()
      .then((rows) => { if (mounted) setMonthlySummary(Array.isArray(rows) ? rows : []); })
      .catch((requestError) => { if (mounted) setError(requestError.message || 'تعذر تحميل ملخص آخر 30 يومًا.'); })
      .finally(() => { if (mounted) setSummaryLoading(false); });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => setClock(new Date()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  const activeEmployees = attendance.filter((employee) => employee.is_active);
  const presentCount = attendance.filter((employee) => employee.check_in && !employee.check_out).length;
  const checkedOutCount = attendance.filter((employee) => employee.check_out).length;
  const lateCount = attendance.filter((employee) => (
    employee.check_in
      && employee.scheduled_start
      && new Date(employee.check_in.replace(' ', 'T')) > scheduleDateTime(selectedDate, employee.scheduled_start)
  )).length;
  const [selectedUserId, setSelectedUserId] = useState('');

  useEffect(() => {
    if (!activeEmployees.some((employee) => String(employee.user_id) === String(selectedUserId))) {
      setSelectedUserId(String(activeEmployees[0]?.user_id || ''));
    }
  }, [activeEmployees, selectedUserId]);

  const selectedEmployee = activeEmployees.find((employee) => String(employee.user_id) === String(selectedUserId));
  const selectedHasCheckIn = Boolean(selectedEmployee?.check_in);

  async function handleAction(userId, action) {
    if (!isToday || savingUserId) return;
    setSavingUserId(userId);
    setError('');
    setNotice('');
    try {
      const payload = { userId, date: selectedDate };
      if (action === 'checkOut') await attendanceApi.checkOutEmployee(payload);
      else await attendanceApi.checkInEmployee(payload);
      setNotice(action === 'checkOut' ? 'تم تسجيل الانصراف بنجاح.' : 'تم تسجيل الحضور بنجاح.');
      await loadAttendance();
    } catch (requestError) {
      setError(requestError.message || 'تعذر تسجيل الحركة.');
    } finally {
      setSavingUserId(null);
    }
  }

  async function handleSaveSchedule(userId, scheduledStart, scheduledEnd) {
    setError('');
    try {
      await attendanceApi.updateAttendanceSchedule({ userId, scheduledStart, scheduledEnd });
      setNotice('تم حفظ الوردية المجدولة.');
      await loadAttendance();
      return true;
    } catch (requestError) {
      setError(requestError.message || 'تعذر حفظ الوردية المجدولة.');
      return false;
    }
  }

  return (
    <div className="attendance-page">
      <header className="attendance-heading">
        <div>
          <span className="attendance-eyebrow">فريق العمل</span>
          <h1>الحضور والانصراف</h1>
          <p>سجل يومي لأوقات حضور الموظفين وانصرافهم مقارنة بالوردية المجدولة.</p>
        </div>
        <label className="attendance-date-picker">
          <span>تاريخ السجل</span>
          <input
            type="date"
            value={selectedDate}
            max={today}
            onChange={(event) => setSelectedDate(event.target.value || today)}
            aria-label="تاريخ سجل الحضور"
          />
        </label>
      </header>

      <section className="attendance-stats" aria-label="ملخص الحضور">
        <article><span>إجمالي الفريق</span><strong>{attendance.length}</strong></article>
        <article><span>{isToday ? 'حاضرون الآن' : 'حضور بلا انصراف'}</span><strong>{presentCount}</strong></article>
        <article><span>انصرفوا</span><strong>{checkedOutCount}</strong></article>
        <article><span>تأخير مسجل</span><strong>{lateCount}</strong></article>
      </section>

      <section className="attendance-30day-section">
        <div className="attendance-30day-heading">
          <div>
            <h2>ملخص آخر 30 يومًا</h2>
            <p>أيام غياب تعني أيامًا بلا سجل حضور، ولا تستبعد أيام الراحة الأسبوعية.</p>
          </div>
          <span>الكاشيرون النشطون</span>
        </div>
        <div className="attendance-30day-table-wrap">
          <table className="attendance-30day-table">
            <thead>
              <tr><th>الكاشير</th><th>أيام المتابعة</th><th>حضور</th><th>غياب بلا تسجيل</th></tr>
            </thead>
            <tbody>
              {summaryLoading ? (
                <tr><td colSpan="4" className="attendance-empty">جارٍ تحميل ملخص الشهر...</td></tr>
              ) : monthlySummary.length ? monthlySummary.map((employee) => (
                <tr key={employee.user_id}>
                  <td>{getEmployeeName(employee)}</td>
                  <td>{employee.monitored_days}</td>
                  <td><strong className="attendance-present-count">{employee.present_days}</strong></td>
                  <td><strong className="attendance-absent-count">{employee.absent_days}</strong></td>
                </tr>
              )) : (
                <tr><td colSpan="4" className="attendance-empty">لا يوجد كاشيرون نشطون لعرض سجلهم.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="attendance-toolbar">
        <div>
          <h2>{isToday ? 'تسجيل حركة اليوم' : 'سجل الحضور السابق'}</h2>
          <p>{isToday ? 'يسجل الوقت الحالي كوقت حضور أو انصراف.' : 'التسجيل الفوري متاح لتاريخ اليوم فقط.'}</p>
        </div>
        <div className="attendance-action-controls">
          <label>
            <span className="sr-only">اختر الموظف</span>
            <select
              value={selectedUserId}
              onChange={(event) => setSelectedUserId(event.target.value)}
              disabled={!activeEmployees.length}
              aria-label="اختر الموظف لتسجيل الحضور"
            >
              {activeEmployees.map((employee) => (
                <option key={employee.user_id} value={employee.user_id}>{getEmployeeName(employee)}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="attendance-primary-action"
            disabled={!isToday || !selectedEmployee || Boolean(selectedEmployee.check_out) || savingUserId === selectedEmployee?.user_id}
            onClick={() => handleAction(selectedEmployee.user_id, selectedHasCheckIn ? 'checkOut' : 'checkIn')}
          >
            {savingUserId === selectedEmployee?.user_id
              ? 'جارٍ التسجيل...'
              : selectedHasCheckIn
                ? 'تسجيل الانصراف الآن'
                : 'تسجيل الحضور الآن'}
          </button>
        </div>
      </section>

      {!isToday && <p className="attendance-history-note">يمكن استعراض الأيام السابقة، أما تسجيل الحضور والانصراف فيُسجل بالوقت الفعلي لليوم فقط.</p>}
      {error && <p className="attendance-alert is-error" role="alert">{error}</p>}
      {notice && <p className="attendance-alert is-success" role="status">{notice}</p>}

      <div className="attendance-table-wrap">
        <table className="attendance-table">
          <thead>
            <tr>
              <th>الموظف</th>
              <th>الوردية المجدولة</th>
              <th>وقت الحضور</th>
              <th>وقت الانصراف</th>
              <th>التأخير / الإضافي</th>
              <th>حالة الحضور</th>
              <th>الإجراء</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="7" className="attendance-empty">جارٍ تحميل سجل الحضور...</td></tr>
            ) : attendance.length ? attendance.map((employee) => {
              const state = getAttendanceState(employee, selectedDate, clock);
              const employeeName = getEmployeeName(employee);
              return (
                <tr key={employee.user_id} className={!employee.is_active ? 'is-inactive' : ''}>
                  <td>
                    <div className="attendance-employee">
                      {employee.profile_image ? (
                        <img src={formatProductImageUrl(employee.profile_image)} alt="" />
                      ) : (
                        <span className="attendance-avatar" aria-hidden="true">{employeeName.charAt(0)}</span>
                      )}
                      <span><strong>{employeeName}</strong><small>{employee.job_title || employee.username}</small></span>
                    </div>
                  </td>
                  <td>
                    <ScheduleEditor
                      employee={employee}
                      onSave={handleSaveSchedule}
                      disabled={Boolean(savingUserId)}
                    />
                  </td>
                  <td>{formatTime(employee.check_in)}</td>
                  <td>{formatTime(employee.check_out)}</td>
                  <td>
                    <div className="attendance-badges">
                      {state.badges.length
                        ? state.badges.map((badge) => (
                          <span className={`attendance-badge is-${badge.tone}`} key={badge.label}>{badge.label}</span>
                        ))
                        : <span className="attendance-no-variance">—</span>}
                    </div>
                  </td>
                  <td><span className={`attendance-state is-${state.tone}`}>{state.label}</span></td>
                  <td>
                    {!employee.is_active && !employee.check_in ? <span className="attendance-inactive-label">حساب معطل</span> : (
                      <button
                        type="button"
                        className={`attendance-row-action${employee.check_in ? ' is-checkout' : ''}`}
                        disabled={!isToday || Boolean(employee.check_out) || savingUserId === employee.user_id}
                        onClick={() => handleAction(employee.user_id, employee.check_in ? 'checkOut' : 'checkIn')}
                      >
                        {employee.check_out
                          ? 'اكتمل'
                          : savingUserId === employee.user_id
                            ? 'جارٍ...'
                            : employee.check_in
                              ? 'انصراف'
                              : 'حضور'}
                      </button>
                    )}
                  </td>
                </tr>
              );
            }) : (
              <tr><td colSpan="7" className="attendance-empty">لا يوجد موظفون في دليل الفريق.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="attendance-schedule-help">اضبط بداية ونهاية الوردية لكل موظف من حقلي الوقت؛ تُحسب دقائق التأخير والإضافي بعد تسجيل الحضور والانصراف.</p>
    </div>
  );
}
