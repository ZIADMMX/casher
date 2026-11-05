import { LockIcon, PlayIcon } from '../icons/PosIcons.jsx';

/**
 * ShiftGateBanner — shown at the top of the cart while no shift is open.
 * Walks the cashier through the steps that unlock selling:
 *   1) register attendance (only when the signed-in user manages their own attendance)
 *   2) open the shift (receive the cash drawer)
 * The cart can still be filled; the pay button stays locked until a shift is open.
 */
export default function ShiftGateBanner({ attendance, onOpenStartShift }) {
  const showAttendanceStep = Boolean(attendance?.canManage);
  const attendanceDone = Boolean(attendance?.isPresent);
  const attendanceClosedForDay = Boolean(attendance?.isCheckedOut);
  const openStepNumber = showAttendanceStep ? 2 : 1;

  let attendanceStatus = null;
  if (attendanceDone) attendanceStatus = 'تم تسجيل حضورك';
  else if (attendanceClosedForDay) attendanceStatus = 'سُجّل انصرافك اليوم';

  return (
    <section className="pos-shift-gate" role="status" aria-labelledby="pos-shift-gate-title">
      <div className="pos-shift-gate-head">
        <span className="pos-shift-gate-icon" aria-hidden="true"><LockIcon size={20} /></span>
        <div>
          <h4 id="pos-shift-gate-title">البيع متوقف — لا توجد وردية مفتوحة</h4>
          <p>يمكنك تجهيز السلة الآن، وسيُفتح الدفع بعد بدء الوردية.</p>
        </div>
      </div>

      <ol className="pos-shift-gate-steps">
        {showAttendanceStep && (
          <li className={`pos-shift-gate-step${attendanceDone ? ' is-done' : ''}${attendanceClosedForDay ? ' is-blocked' : ''}`}>
            <span className="pos-step-number" aria-hidden="true">{attendanceDone ? '✓' : '1'}</span>
            <span className="pos-step-label">سجّل حضورك</span>
            {attendanceStatus ? (
              <span className="pos-step-status">{attendanceStatus}</span>
            ) : (
              <button
                type="button"
                className="pos-step-btn"
                onClick={attendance.toggle}
                disabled={attendance.buttonDisabled}
              >
                {attendance.buttonText}
              </button>
            )}
          </li>
        )}
        <li className={`pos-shift-gate-step${showAttendanceStep && !attendanceDone ? ' is-waiting' : ''}`}>
          <span className="pos-step-number" aria-hidden="true">{openStepNumber}</span>
          <span className="pos-step-label">استلم الدرج وابدأ الوردية</span>
          <button
            type="button"
            className="pos-step-btn is-primary"
            onClick={onOpenStartShift}
          >
            <PlayIcon size={16} />
            فتح وردية
          </button>
        </li>
      </ol>
    </section>
  );
}
