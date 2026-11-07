import { getSectorSvgIcon } from '../icons/SectorIcons.jsx';
import {
  ChartIcon,
  DrawerIcon,
  LockIcon,
  MonitorIcon,
  TableIcon,
  ReceiptIcon,
} from '../icons/PosIcons.jsx';

function formatShiftStart(startTime) {
  if (!startTime) return '';
  const date = new Date(startTime);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit' });
}

function initials(name = '') {
  const clean = String(name).trim();
  if (!clean) return '؟';
  const parts = clean.split(/[\s._-]+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : clean.slice(0, 2)).toUpperCase();
}

/**
 * PosTopBar — the POS header row: store + sector identity on the start side; shift status
 * and actions, attendance, cash drawer, sector shortcuts and the cashier on the end side.
 *
 * When the shift is closed, the attendance and open-shift actions live in ShiftGateBanner
 * (in the cart), so this bar only shows the closed state and never repeats those buttons.
 */
export default function PosTopBar({
  storeName,
  sectorConfig,
  activeShift,
  shiftLoaded = true,
  posSessionUser,
  attendance,
  onOpenExpenseModal,
  onShowXReport,
  onCloseShiftModal,
  onOpenCashDrawer,
  onOpenKitchen,
  onOpenTables,
}) {
  const features = sectorConfig?.features || {};
  const showAttendance = Boolean(attendance?.canManage) && (Boolean(activeShift) || attendance.isCheckedIn);
  const shiftStart = formatShiftStart(activeShift?.start_time);
  const cashierName = posSessionUser?.username || activeShift?.cashier_username || '';
  const roleLabel = posSessionUser?.role === 'admin' ? 'مدير' : 'كاشير';

  return (
    <header className="pos-topbar">
      <div className="pos-topbar-brand">
        <span className="pos-brand-logo" aria-hidden="true">
          {getSectorSvgIcon(sectorConfig?.key, { size: 22 })}
        </span>
        <div className="pos-brand-text">
          <h2 className="pos-brand-name">{storeName || 'نقطة البيع'}</h2>
          <span className="pos-brand-sub">{sectorConfig?.name}</span>
        </div>
        {sectorConfig?.badge && (
          <span className="pos-sector-pill">
            <span className="pos-sector-dot" aria-hidden="true" />
            {sectorConfig.badge}
          </span>
        )}
      </div>

      <div className="pos-topbar-actions">
        {activeShift ? (
          <div className="pos-shift-group">
            <span className="shift-pos-pill active" title="الوردية الحالية نشطة ومفتوحة">
              <span className="pos-status-dot is-live" aria-hidden="true" />
              {`الوردية مفتوحة${shiftStart ? ` · ${shiftStart}` : ''}`}
            </span>
            <button type="button" className="pos-topbar-btn is-compact" onClick={onOpenExpenseModal} title="تسجيل مصروف من الدرج" aria-label="تسجيل مصروف من الدرج">
              <ReceiptIcon size={18} />
            </button>
            {posSessionUser?.role === 'admin' && (
              <button type="button" className="pos-topbar-btn is-compact" onClick={onShowXReport} title="تقرير استطلاعي X-Report" aria-label="تقرير X">
                <ChartIcon size={18} />
              </button>
            )}
            <button type="button" className="pos-topbar-btn is-compact is-danger" onClick={onCloseShiftModal} title="إغلاق الوردية وإصدار Z-Report" aria-label="إغلاق الوردية Z">
              <LockIcon size={18} />
              <span>Z</span>
            </button>
          </div>
        ) : (
          <span className="shift-pos-pill closed" role="status">
            <span className="pos-status-dot is-off" aria-hidden="true" />
            {shiftLoaded ? 'الوردية مغلقة' : 'جارٍ التحقق من الوردية...'}
          </span>
        )}

        {showAttendance && (
          <div className={`attendance-clock-pill${attendance.isPresent ? ' is-present' : ''}`}>
            {!attendance.isCheckedIn && <span>لم تسجّل حضورك</span>}
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

        <button type="button" className="pos-topbar-btn" onClick={onOpenCashDrawer} title="فتح درج النقود (اختصار F7)">
          <DrawerIcon size={18} />
          <span>فتح الدرج</span>
          <kbd>F7</kbd>
        </button>

        {features.tableService && (
          <button type="button" className="pos-topbar-btn" onClick={onOpenTables}>
            <TableIcon size={18} />
            <span>الطاولات</span>
          </button>
        )}

        {features.tableService && (
          <button type="button" className="pos-topbar-btn" onClick={onOpenKitchen}>
            <MonitorIcon size={18} />
            <span>شاشة المطبخ</span>
          </button>
        )}

        {cashierName && (
          <div className="pos-cashier">
            <div className="pos-cashier-text">
              <strong>{`${cashierName} · ${roleLabel}`}</strong>
              <span>{activeShift ? `وردية #${activeShift.id}` : 'بدون وردية'}</span>
            </div>
            <span className="pos-cashier-avatar" aria-hidden="true">{initials(cashierName)}</span>
          </div>
        )}
      </div>
    </header>
  );
}
