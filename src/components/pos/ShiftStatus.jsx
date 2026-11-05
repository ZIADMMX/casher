/**
 * ShiftStatus — the POS status strip.
 * One row with the cashier's attendance, the shift (with expense / X / Z actions),
 * the cash drawer and the scanner.
 *
 * When the shift is closed, the step-by-step actions (attendance + open shift) live in
 * ShiftGateBanner inside the cart, so this strip only shows the closed state and
 * never repeats those buttons.
 *
 * Props:
 *  - activeShift: current shift or null
 *  - shiftLoaded: true once the current shift has been fetched
 *  - posSessionUser: signed-in user
 *  - attendance: result of usePosAttendance
 *  - onOpenExpenseModal, onShowXReport, onCloseShiftModal: shift actions
 *  - onOpenCashDrawer: opens the drawer (F7)
 *  - playSuccessBeep, setMessage: feedback helpers
 */
export default function ShiftStatus({
  activeShift,
  shiftLoaded = true,
  posSessionUser,
  attendance,
  onOpenExpenseModal,
  onShowXReport,
  onCloseShiftModal,
  onOpenCashDrawer,
  playSuccessBeep,
  setMessage,
}) {
  // While the shift is closed and the cashier has not checked in, the banner owns the attendance step.
  const showAttendance = Boolean(attendance?.canManage) && (Boolean(activeShift) || attendance.isCheckedIn);

  return (
    <div className="pos-status-strip" role="group" aria-label="حالة الوردية والأجهزة">
      {activeShift ? (
        <div className="shift-pos-pill active" title="الوردية الحالية نشطة ومفتوحة">
          <span className="pos-status-dot is-live" aria-hidden="true" />
          <span className="shift-pill-title">
            <strong>وردية #{activeShift.id}</strong>
            <span className="shift-pill-cashier">{activeShift.cashier_username || activeShift.opened_by_name}</span>
          </span>
          <div className="shift-pill-actions">
            <button
              type="button"
              className="shift-action-btn"
              onClick={onOpenExpenseModal}
              title="تسجيل مصروف من الدرج"
            >
              💸 مصروف
            </button>
            {posSessionUser?.role === 'admin' && (
              <button
                type="button"
                className="shift-action-btn"
                onClick={onShowXReport}
                title="تقرير استطلاعي X-Report"
              >
                📊 X
              </button>
            )}
            <button
              type="button"
              className="shift-action-btn is-danger"
              onClick={onCloseShiftModal}
              title="إغلاق الوردية وإصدار Z-Report"
            >
              🔒 إغلاق Z
            </button>
          </div>
        </div>
      ) : (
        <div className="shift-pos-pill closed" role="status">
          <span className="pos-status-dot is-off" aria-hidden="true" />
          <span className="shift-pill-title">
            <strong>{shiftLoaded ? 'الوردية مغلقة' : 'جارٍ التحقق من الوردية...'}</strong>
            {shiftLoaded && <span className="shift-pill-cashier">البيع متوقف حتى تفتح وردية</span>}
          </span>
        </div>
      )}

      {showAttendance && (
        <div className={`attendance-clock-pill${attendance.isPresent ? ' is-present' : ''}`}>
          <span>{attendance.isCheckedIn ? 'الحضور' : 'لم تسجّل حضورك'}</span>
          <button
            type="button"
            onClick={attendance.toggle}
            disabled={attendance.buttonDisabled}
            title={attendance.ownsOpenShift ? 'يمكن تسجيل الانصراف بعد إغلاق الوردية' : 'تسجيل حضورك أو انصرافك'}
          >
            {attendance.buttonText}
          </button>
        </div>
      )}

      <div className="pos-status-strip-end">
        <button
          type="button"
          className="pos-status-chip"
          onClick={onOpenCashDrawer}
          title="فتح درج النقود (اختصار F7)"
        >
          <span aria-hidden="true">💵</span>
          <span>فتح الدرج</span>
          <kbd>F7</kbd>
        </button>

        <button
          type="button"
          className="pos-status-chip is-ok scanner-status-chip"
          title="قارئ الباركود متصل وجاهز للاستخدام - اضغط للتأكيد"
          onClick={() => {
            playSuccessBeep?.();
            setMessage?.({
              type: 'success',
              text: 'قارئ الباركود متصل وجاهز! وجّه القارئ لأي باركود لمسحه فوراً إلى السلة.',
            });
          }}
        >
          <span className="pos-status-dot is-live" aria-hidden="true" />
          <span>الماسح جاهز</span>
        </button>
      </div>
    </div>
  );
}
