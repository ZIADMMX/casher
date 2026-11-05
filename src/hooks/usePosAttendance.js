import { useCallback, useEffect, useState } from 'react';
import * as attendanceApi from '../api/attendance.js';

function todayKey() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

/**
 * Attendance state of the signed-in cashier on the POS screen.
 * Shared by the status strip and the closed-shift banner so both show the same state.
 */
export default function usePosAttendance({ sessionUser, activeShift, setMessage }) {
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const canManage = Boolean(sessionUser);
  const ownsOpenShift = Boolean(activeShift && Number(activeShift.user_id) === Number(sessionUser?.id));

  useEffect(() => {
    if (!canManage || !attendanceApi.getMyAttendanceStatus.isAvailable()) return undefined;
    let mounted = true;
    setLoading(true);
    attendanceApi.getMyAttendanceStatus()
      .then((next) => { if (mounted) setRecord(next); })
      .catch((error) => { if (mounted) setMessage?.({ type: 'error', text: error.message || 'تعذر تحميل حالة الحضور' }); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [canManage, sessionUser?.id, activeShift?.id, setMessage]);

  const isCheckedIn = Boolean(record?.check_in);
  const isCheckedOut = Boolean(record?.check_out);
  const isPresent = isCheckedIn && !isCheckedOut;

  const toggle = useCallback(async () => {
    if (!canManage || saving) return;
    if (isCheckedIn && ownsOpenShift) {
      setMessage?.({ type: 'warning', text: 'أغلق الوردية أولاً قبل تسجيل الانصراف.' });
      return;
    }
    setSaving(true);
    try {
      const date = todayKey();
      if (isCheckedIn) {
        await attendanceApi.checkOutEmployee({ date });
        setRecord(await attendanceApi.getMyAttendanceStatus());
        setMessage?.({ type: 'success', text: 'تم تسجيل الانصراف.' });
      } else {
        await attendanceApi.checkInEmployee({ date });
        setRecord(await attendanceApi.getMyAttendanceStatus());
        setMessage?.({ type: 'success', text: 'تم تسجيل حضورك. يمكنك الآن فتح الوردية.' });
      }
    } catch (error) {
      setMessage?.({ type: 'error', text: error.message || 'تعذر تسجيل الحضور.' });
    } finally {
      setSaving(false);
    }
  }, [canManage, saving, isCheckedIn, ownsOpenShift, setMessage]);

  const busy = loading || saving;
  const buttonText = busy
    ? 'جارٍ التسجيل...'
    : isCheckedOut
      ? 'اكتمل حضور اليوم'
      : isCheckedIn
        ? ownsOpenShift ? 'أغلق الوردية للانصراف' : 'تسجيل الانصراف'
        : 'تسجيل الحضور';
  const buttonDisabled = busy || isCheckedOut || (ownsOpenShift && isCheckedIn);

  return {
    record,
    loading,
    saving,
    canManage,
    ownsOpenShift,
    isCheckedIn,
    isCheckedOut,
    isPresent,
    buttonText,
    buttonDisabled,
    toggle,
  };
}
