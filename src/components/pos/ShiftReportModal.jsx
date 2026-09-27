import ShiftReportPrint from '../ShiftReportPrint.jsx';

function ShiftReportModal({
  previewReport,
  onClose,
  onPrint,
}) {
  if (!previewReport) return null;

  const { shift, reportType } = previewReport;
  const isZReport = reportType === 'Z' || shift?.status === 'closed';

  function handlePrint() {
    if (onPrint) {
      onPrint();
    } else {
      setTimeout(() => {
        window.print();
      }, 150);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: '540px', borderRadius: '16px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header" style={{ padding: '16px 20px' }}>
          <h3 style={{ fontSize: '17px', fontWeight: '800', margin: 0 }}>
            {isZReport
              ? '🧾 تقرير التقفيل النهائي (Z-Report)'
              : '📊 تقرير استطلاعي للوردية (X-Report)'}
          </h3>
          <button type="button" className="modal-close-btn" onClick={onClose}>×</button>
        </div>

        <div style={{
          maxHeight: '72vh',
          overflowY: 'auto',
          padding: '18px 20px',
          background: '#F1F5F9'
        }}>
          <div style={{
            background: '#FFFFFF',
            borderRadius: '14px',
            padding: '18px 20px',
            boxShadow: '0 4px 14px rgba(0,0,0,0.06)',
            border: '1px solid #E2E8F0'
          }}>
            <ShiftReportPrint shift={shift} reportType={reportType} />
          </div>
        </div>

        <div className="modal-footer" style={{ padding: '14px 20px' }}>
          <button type="button" className="secondary-btn" onClick={onClose}>
            إغلاق
          </button>
          <button
            type="button"
            className="primary-btn"
            style={{ padding: '10px 22px', fontSize: '14px', fontWeight: '700' }}
            onClick={handlePrint}
          >
            <span>🖨️</span> طباعة التقرير الحراري
          </button>
        </div>
      </div>
    </div>
  );
}

export default ShiftReportModal;
