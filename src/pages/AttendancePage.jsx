import { useCallback, useEffect, useState } from 'react';
import { formatProductImageUrl } from '../utils/media.js';
import * as attendanceApi from '../api/attendance.js';
import { HrEmpty, HrHeader, HrStat } from '../components/hr/HrLayout.jsx';
import {
  AlertIcon, CalendarIcon, CheckIcon, ClockIcon, DownloadIcon, LogoutIcon, RefreshIcon, UsersIcon,
} from '../components/icons/PosIcons.jsx';
import { employeeCountLabel } from '../utils/hrStats.js';

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


const STATE_TONES = { muted: 'muted', present: 'success', done: 'info' };
const BADGE_TONES = { late: 'warning', extra: 'info' };

function formatDayHeading(date) {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('ar-EG', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

function exportAttendanceCsv(rows, date) {
  const cell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const lines = [
    ['الموظف', 'بداية الوردية', 'نهاية الوردية', 'الحضور', 'الانصراف'],
    ...rows.map((row) => [getEmployeeName(row), row.scheduled_start, row.scheduled_end, row.check_in, row.check_out]),
  ].map((line) => line.map(cell).join(','));
  // BOM so Excel opens the Arabic text as UTF-8.
  const url = URL.createObjectURL(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `attendance-${date}.csv`;
  link.click();
  URL.revokeObjectURL(url);
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
    <form onSubmit={handleSubmit}>
      <div className="hr-schedule">
        <span>من</span>
        <input className="hr-input is-time" type="time" aria-label="بداية الوردية" value={start} onChange={(event) => { setStart(event.target.value); setError(''); }} disabled={disabled || saving} />
        <span>إلى</span>
        <input className="hr-input is-time" type="time" aria-label="نهاية الوردية" value={end} onChange={(event) => { setEnd(event.target.value); setError(''); }} disabled={disabled || saving} />
        {!unchanged && (
          <button type="submit" className="hr-btn is-sm" disabled={disabled || saving} aria-label="حفظ الوردية المجدولة">
            {saving ? '...' : 'حفظ'}
          </button>
        )}
      </div>
      {error && <small className="hr-schedule-error">{error}</small>}
    </form>
  );
}

export default function AttendancePage({ onNavigate }) {
  const [selectedDate, setSelectedDate] = useState(getLocalDate);
  const [attendance, setAttendance] = useState([]);
  const [monthlySummary, setMonthlySummary] = useState([]);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [savingUserId, setSavingUserId] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [clock, setClock] = useState(() => new Date());
  const [selectedUserId, setSelectedUserId] = useState('');
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

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const rows = await attendanceApi.getAttendanceSummary30Days();
      setMonthlySummary(Array.isArray(rows) ? rows : []);
    } catch (requestError) {
      setError(requestError.message || 'تعذر تحميل ملخص آخر 30 يومًا.');
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAttendance();
  }, [loadAttendance]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    const interval = window.setInterval(() => setClock(new Date()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  const activeEmployees = attendance.filter((employee) => employee.is_active);
  const presentCount = attendance.filter((employee) => employee.check_in && !employee.check_out).length;
  const checkedOutCount = attendance.filter((employee) => employee.check_out).length;
  const waitingCount = activeEmployees.filter((employee) => !employee.check_in).length;
  const hasAnySchedule = attendance.some((employee) => employee.scheduled_start && employee.scheduled_end);
  const hasSummaryData = monthlySummary.some((employee) => Number(employee.present_days) > 0);
  const lateCount = attendance.filter((employee) => (
    employee.check_in
      && employee.scheduled_start
      && new Date(employee.check_in.replace(' ', 'T')) > scheduleDateTime(selectedDate, employee.scheduled_start)
  )).length;

  useEffect(() => {
    if (!activeEmployees.some((employee) => String(employee.user_id) === String(selectedUserId))) {
      setSelectedUserId(String(activeEmployees[0]?.user_id || ''));
    }
  }, [activeEmployees, selectedUserId]);

  const selectedEmployee = activeEmployees.find((employee) => String(employee.user_id) === String(selectedUserId));
  const selectedBusy = !isToday || !selectedEmployee || savingUserId === selectedEmployee?.user_id;

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
    <div className="hr-page">
      <HrHeader
        active="attendance"
        onNavigate={onNavigate}
        title="الحضور والانصراف"
        subtitle="سجّل حركة اليوم وقارن أوقات الفريق بالوردية المحدّدة لكل موظف."
        actions={(
          <>
            <label className="hr-field">
              تاريخ السجل
              <input
                className="hr-input"
                type="date"
                value={selectedDate}
                max={today}
                onChange={(event) => setSelectedDate(event.target.value || today)}
              />
            </label>
            <button type="button" className="hr-btn" disabled={!attendance.length} onClick={() => exportAttendanceCsv(attendance, selectedDate)}>
              <DownloadIcon size={18} /> تصدير السجل
            </button>
          </>
        )}
      />

      <div className="hr-body">
        <section className="hr-stats" aria-label="ملخص الحضور">
          <HrStat Icon={UsersIcon} tone="brand" label="إجمالي الفريق" value={attendance.length} note="مطلوب منهم تسجيل اليوم" />
          <HrStat Icon={ClockIcon} tone="success" label={isToday ? 'حاضرون الآن' : 'حضور بلا انصراف'} value={presentCount} total={activeEmployees.length} note="سجّلوا حضور ولم ينصرفوا" />
          <HrStat Icon={LogoutIcon} tone="info" label="انصرفوا" value={checkedOutCount} note="أنهوا ورديتهم اليوم" />
          <HrStat Icon={AlertIcon} tone="warning" label="تأخير مسجّل" value={lateCount} note={hasAnySchedule ? 'مقارنة بالوردية المحدّدة' : 'يُحسب بعد تحديد الوردية'} />
        </section>

        {error && <p className="hr-alert is-error" role="alert">{error}</p>}
        {notice && <p className="hr-alert is-success" role="status">{notice}</p>}

        <section className="hr-card hr-action-card">
          <div className="hr-card-head">
            <div>
              <h2>{isToday ? 'تسجيل حركة اليوم' : 'سجل يوم سابق'}</h2>
              <p>{isToday
                ? 'اختار الموظف واضغط الزر — النظام يسجّل الوقت الحالي كحضور أو انصراف تلقائيًا.'
                : 'التسجيل الفوري متاح لتاريخ النهارده بس.'}</p>
            </div>
            <div className="hr-action-controls">
              <label className="hr-field">
                الموظف
                <select
                  className="hr-select"
                  value={selectedUserId}
                  onChange={(event) => setSelectedUserId(event.target.value)}
                  disabled={!activeEmployees.length}
                >
                  {activeEmployees.map((employee) => (
                    <option key={employee.user_id} value={employee.user_id}>
                      {getEmployeeName(employee)}{employee.job_title ? ` — ${employee.job_title}` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="hr-btn is-success"
                disabled={selectedBusy || Boolean(selectedEmployee?.check_in)}
                onClick={() => handleAction(selectedEmployee.user_id, 'checkIn')}
              >
                <CheckIcon size={18} /> تسجيل حضور
              </button>
              <button
                type="button"
                className="hr-btn"
                disabled={selectedBusy || !selectedEmployee?.check_in || Boolean(selectedEmployee?.check_out)}
                onClick={() => handleAction(selectedEmployee.user_id, 'checkOut')}
              >
                <LogoutIcon size={18} /> تسجيل انصراف
              </button>
            </div>
          </div>
        </section>

        <section className="hr-card">
          <header className="hr-card-head">
            <div>
              <h2>{isToday ? 'سجل اليوم' : 'سجل يوم'} — {formatDayHeading(selectedDate)}</h2>
              <p>اضبط بداية ونهاية الوردية لكل موظف ليتحسب التأخير والوقت الإضافي.</p>
            </div>
            {isToday && waitingCount > 0 && (
              <span className="hr-pill">{employeeCountLabel(waitingCount)} بانتظار التسجيل</span>
            )}
          </header>
          <div className="hr-table-wrap">
            <table className="hr-table">
              <thead>
                <tr>
                  <th>الموظف</th>
                  <th>الوردية المجدولة</th>
                  <th>وقت الحضور</th>
                  <th>وقت الانصراف</th>
                  <th>التأخير / الإضافي</th>
                  <th>الحالة</th>
                  <th><span className="sr-only">الإجراء</span></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="7" className="hr-loading">جارٍ تحميل سجل الحضور...</td></tr>
                ) : attendance.length ? attendance.map((employee) => {
                  const state = getAttendanceState(employee, selectedDate, clock);
                  const employeeName = getEmployeeName(employee);
                  return (
                    <tr key={employee.user_id} className={!employee.is_active ? 'is-muted' : ''}>
                      <td>
                        <div className="hr-person">
                          {employee.profile_image
                            ? <img className="hr-avatar" src={formatProductImageUrl(employee.profile_image)} alt="" />
                            : <span className="hr-avatar" aria-hidden="true">{employeeName.charAt(0).toUpperCase()}</span>}
                          <span><strong>{employeeName}</strong><small>{employee.job_title || employee.username}</small></span>
                        </div>
                      </td>
                      <td>
                        <ScheduleEditor employee={employee} onSave={handleSaveSchedule} disabled={Boolean(savingUserId)} />
                      </td>
                      <td>{formatTime(employee.check_in)}</td>
                      <td>{formatTime(employee.check_out)}</td>
                      <td>
                        {state.badges.length ? (
                          <div className="hr-pills">
                            {state.badges.map((badge) => (
                              <span className={`hr-pill is-${BADGE_TONES[badge.tone]}`} key={badge.label}>{badge.label}</span>
                            ))}
                          </div>
                        ) : <span className="hr-dash">—</span>}
                      </td>
                      <td><span className={`hr-pill is-dot is-${STATE_TONES[state.tone]}`}>{state.label}</span></td>
                      <td className="hr-cell-end">
                        {!employee.is_active && !employee.check_in ? <span className="hr-pill">حساب معطل</span>
                          : employee.check_out ? <span className="hr-pill is-success">اكتمل</span> : (
                            <button
                              type="button"
                              className={`hr-btn is-sm${employee.check_in ? '' : ' is-primary'}`}
                              disabled={!isToday || savingUserId === employee.user_id}
                              onClick={() => handleAction(employee.user_id, employee.check_in ? 'checkOut' : 'checkIn')}
                            >
                              {savingUserId === employee.user_id ? 'جارٍ...' : employee.check_in ? 'تسجيل انصراف' : 'تسجيل حضور'}
                            </button>
                          )}
                      </td>
                    </tr>
                  );
                }) : (
                  <tr><td colSpan="7" className="hr-loading">مفيش موظفين في الفريق لسه.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="hr-card">
          <header className="hr-card-head">
            <div>
              <h2>ملخص آخر ٣٠ يومًا</h2>
              <p>يوم الغياب = يوم عمل بلا تسجيل. أيام الراحة الأسبوعية غير محسوبة.</p>
            </div>
            <button type="button" className="hr-btn is-sm" onClick={loadSummary} disabled={summaryLoading}>
              <RefreshIcon size={16} /> تحديث
            </button>
          </header>
          {summaryLoading ? (
            <p className="hr-loading">جارٍ تحميل ملخص الشهر...</p>
          ) : hasSummaryData ? (
            <div className="hr-table-wrap">
              <table className="hr-table">
                <thead>
                  <tr><th>الموظف</th><th>أيام المتابعة</th><th>حضور</th><th>غياب بلا تسجيل</th></tr>
                </thead>
                <tbody>
                  {monthlySummary.map((employee) => (
                    <tr key={employee.user_id}>
                      <td><strong>{getEmployeeName(employee)}</strong></td>
                      <td>{employee.monitored_days}</td>
                      <td><span className="hr-pill is-success">{employee.present_days}</span></td>
                      <td><span className={`hr-pill ${Number(employee.absent_days) ? 'is-danger' : ''}`}>{employee.absent_days}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <HrEmpty
              Icon={CalendarIcon}
              title="لسه مفيش سجل حضور كافي"
              text="الملخص بيظهر بعد أول تسجيل حضور. ابدأ بتحديد ورديات الفريق، وبعدها سجّل أول حركة من الكارت اللي فوق."
            >
              <button
                type="button"
                className="hr-btn is-primary"
                onClick={() => document.querySelector('.hr-schedule input')?.focus()}
                disabled={!attendance.length}
              >
                تحديد ورديات الفريق
              </button>
              <button type="button" className="hr-btn" onClick={() => onNavigate?.('users')}>عرض الموظفين</button>
            </HrEmpty>
          )}
        </section>
      </div>
    </div>
  );
}
