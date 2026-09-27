import React from 'react';

/**
 * ShiftStatus component
 * Displays the barcode ready indicator and shift status pill with actions.
 * Props:
 *  - activeShift: current shift object or null
 *  - posSessionUser: user info for the POS session
 *  - onOpenShiftModal: callback to open the Shift Open modal
 *  - onOpenExpenseModal: callback to open the Shift Expense modal
 *  - onShowXReport: callback to trigger X‑Report
 *  - onCloseShiftModal: callback to open the Shift Close modal
 *  - onOpenStartShiftModal: callback to open start‑shift flow (used when shift is closed)
 *  - playSuccessBeep: function to play success beep (used for barcode ready click)
 *  - setMessage: function to display temporary UI messages
 */
export default function ShiftStatus({
  activeShift,
  onOpenExpenseModal,
  onShowXReport,
  onCloseShiftModal,
  onOpenStartShiftModal,
  playSuccessBeep,
  setMessage,
}) {
  return (
    <div className="pos-status-pills">
      <div
        className="shift-pos-pill"
        style={{
          background: '#0F172A',
          borderColor: '#10B981',
          color: '#10B981',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '4px 10px',
        }}
        title="قارئ الباركود متصل وجاهز للاستخدام - اضغط للتأكيد"
        onClick={() => {
          playSuccessBeep();
          setMessage({
            type: 'success',
            text: 'قارئ الباركود متصل وجاهز! وجّه القارئ لأي باركود لمسحه فوراً إلى السلة.',
          });
        }}
      >
        <span
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: '#10B981',
            boxShadow: '0 0 8px #10B981',
          }}
        ></span>
        <span style={{ fontSize: '11px', fontWeight: 'bold' }}>الباركود: جاهز للطلب</span>
      </div>
      {activeShift ? (
        <div className="shift-pos-pill active" title="الوردية الحالية نشطة ومفتوحة">
          <span className="shift-live-dot"></span>
          <span className="shift-pill-title">
            وردية #{activeShift.id} ({activeShift.cashier_username || activeShift.opened_by_name})
          </span>
          <div className="shift-pill-actions">
            <button
              type="button"
              className="shift-action-btn btn-warn"
              onClick={onOpenExpenseModal}
              title="تسجيل مصروف من الدرج"
            >
              💸 مصروف
            </button>
            <button
              type="button"
              className="shift-action-btn btn-info"
              onClick={onShowXReport}
              title="تقرير استطلاعي X-Report"
            >
              📊 X
            </button>
            <button
              type="button"
              className="shift-action-btn btn-close-shift"
              onClick={onCloseShiftModal}
              title="إغلاق الوردية وإصدار Z-Report"
            >
              🔒 إغلاق Z
            </button>
          </div>
        </div>
      ) : (
        <div className="shift-pos-pill closed">
          <span className="shift-closed-dot"></span>
          <span className="shift-pill-title">الوردية مغلقة</span>
          <button
            type="button"
            className="shift-action-btn btn-start-shift"
            onClick={onOpenStartShiftModal}
          >
            🟢 فتح وردية
          </button>
        </div>
      )}
    </div>
  );
}
