import { useState, useEffect } from 'react';

export default function DailyDocketModal({ onClose }) {
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [docket, setDocket] = useState([]);
  const [loading, setLoading] = useState(true);

  async function loadDocket(date) {
    setLoading(true);
    try {
      if (window.electronAPI?.getDailyCourtDocket) {
        const data = await window.electronAPI.getDailyCourtDocket(date);
        setDocket(data || []);
      }
    } catch (err) {
      console.error('Failed to load docket:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDocket(selectedDate);
  }, [selectedDate]);

  function handlePrint() {
    window.print();
  }

  return (
    <div className="legal-modal-overlay" onClick={onClose}>
      <div className="legal-modal-container" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '1000px' }}>
        <div className="legal-modal-header no-print">
          <h2>⚖️ رول جلسات المحاكم اليومي (Court Docket)</h2>
          <button type="button" className="modal-close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="legal-modal-body docket-print-area">
          <div className="docket-header-print" style={{ marginBottom: '20px', borderBottom: '2px solid #0f172a', paddingBottom: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ margin: '0 0 4px 0', fontSize: '1.4rem' }}>رول جلسات اليوم للمكتب</h2>
                <p style={{ margin: 0, color: '#475569', fontSize: '0.9rem' }}>
                  تاريخ الجلسات: <strong>{selectedDate}</strong> | إجمالي القضايا المتداولة اليوم: <strong>{docket.length}</strong>
                </p>
              </div>
              <div className="no-print" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="filter-select"
                />
                <button type="button" className="btn-primary-legal" onClick={handlePrint}>
                  🖨️ طباعة الرول
                </button>
              </div>
            </div>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>جاري تحميل جدول الجلسات...</div>
          ) : docket.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '50px 20px', color: '#64748b' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '10px' }}>⚖️</div>
              <p style={{ fontSize: '1.1rem', margin: 0 }}>لا توجد جلسات محاكم مسجلة في هذا التاريخ ({selectedDate})</p>
            </div>
          ) : (
            <table className="cases-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ width: '60px' }}>#</th>
                  <th>المحكمة والدائرة</th>
                  <th>رقم القضية</th>
                  <th>القاعة / الرول</th>
                  <th>الموكّل</th>
                  <th>الخصم</th>
                  <th>المحامي المكلف</th>
                  <th>المطلوب بالجلسة</th>
                  <th>القرار / ما تم</th>
                </tr>
              </thead>
              <tbody>
                {docket.map((item, idx) => (
                  <tr key={item.id}>
                    <td style={{ fontWeight: 700 }}>{idx + 1}</td>
                    <td>
                      <div className="court-info">
                        <span className="court-name-bold">{item.court_name}</span>
                        {item.circuit_name && <span className="circuit-sub">{item.circuit_name}</span>}
                      </div>
                    </td>
                    <td><span className="case-num-badge">{item.case_number}</span></td>
                    <td style={{ fontWeight: 600, color: '#1e40af' }}>{item.court_room || 'غير محدد'}</td>
                    <td style={{ fontWeight: 600 }}>{item.client_name || '-'}</td>
                    <td style={{ color: '#dc2626' }}>{item.opponent_name || '-'}</td>
                    <td>{item.assigned_lawyer_name || 'غير محدد'}</td>
                    <td style={{ maxWidth: '200px' }}>{item.session_reason || 'حضور المرافعة'}</td>
                    <td style={{ maxWidth: '180px', color: '#047857', fontWeight: 600 }}>{item.decision || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="legal-modal-footer no-print">
          <button type="button" className="btn-secondary-legal" onClick={onClose}>إغلاق</button>
        </div>
      </div>
    </div>
  );
}
