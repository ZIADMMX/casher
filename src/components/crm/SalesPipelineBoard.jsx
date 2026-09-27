import { useState, useEffect } from 'react';

const STAGES = [
  { id: 'lead', title: 'عملاء محتملون', badgeClass: 'badge-neutral', color: '#6b7280' },
  { id: 'qualified', title: 'مؤهلون للتعامل', badgeClass: 'badge-primary', color: '#3b82f6' },
  { id: 'proposal', title: 'عروض أسعار', badgeClass: 'badge-warning', color: '#f59e0b' },
  { id: 'won', title: 'صفقات ناجحة 🎉', badgeClass: 'badge-success', color: '#10b981' },
  { id: 'lost', title: 'صفقات خاسرة ❌', badgeClass: 'badge-danger', color: '#ef4444' }
];

function SalesPipelineBoard() {
  const [opportunities, setOpportunities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchOpportunities = async () => {
    setLoading(true);
    try {
      if (window.api?.crm?.getAllCRMOpportunities) {
        const list = await window.api.crm.getAllCRMOpportunities();
        setOpportunities(list || []);
      }
    } catch (err) {
      console.error('Failed to fetch opportunities:', err);
      setError('فشل تحميل قائمة صفقات المبيعات');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOpportunities();
  }, []);

  const handleStageChange = async (oppId, newStage) => {
    try {
      if (window.api?.crm?.updateCRMOpportunityStage) {
        await window.api.crm.updateCRMOpportunityStage(oppId, newStage);
        await fetchOpportunities();
      }
    } catch (err) {
      console.error('Failed to update stage:', err);
      alert('فشل تغيير مرحلة الصفقة: ' + err.message);
    }
  };

  const getOppValueForStage = (stageId) => {
    return opportunities
      .filter(o => o.stage === stageId)
      .reduce((sum, o) => sum + Number(o.expected_value || 0), 0);
  };

  return (
    <div style={{ marginTop: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.25rem' }}>💼 خط مبيعات العملاء (Sales Pipeline Kanban)</h2>
          <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: '0.9rem' }}>
            متابعة مراحل الفرص البيعية من بداية التعارف حتى إغلاق الصفقة
          </p>
        </div>
        <button className="secondary-btn" onClick={fetchOpportunities} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          🔄 تحديث Kanban
        </button>
      </div>

      {error && (
        <div style={{ padding: '10px', backgroundColor: '#fef2f2', color: '#991b1b', borderRadius: '6px', marginBottom: '15px' }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
          جاري تحميل لوحة الصفقات...
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '12px',
          alignItems: 'start'
        }}>
          {STAGES.map(stage => {
            const stageOpps = opportunities.filter(o => o.stage === stage.id);
            const totalValue = getOppValueForStage(stage.id);

            return (
              <div 
                key={stage.id} 
                style={{
                  backgroundColor: '#f9fafb',
                  border: '1px solid #e5e7eb',
                  borderRadius: '10px',
                  padding: '12px',
                  minHeight: '400px',
                  display: 'flex',
                  flexDirection: 'column'
                }}
              >
                {/* Column Header */}
                <div style={{ borderBottom: `3px solid ${stage.color}`, paddingBottom: '8px', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 'bold', fontSize: '0.95rem' }}>{stage.title}</span>
                    <span className={`badge ${stage.badgeClass}`}>{stageOpps.length}</span>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '4px' }}>
                    إجمالي: {totalValue.toLocaleString()} ج.م
                  </div>
                </div>

                {/* Column Opportunities */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {stageOpps.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '20px 10px', color: '#9ca3af', fontSize: '0.85rem' }}>
                      لا توجد صفقات
                    </div>
                  ) : (
                    stageOpps.map(opp => (
                      <div 
                        key={opp.id} 
                        style={{
                          backgroundColor: '#ffffff',
                          border: '1px solid #e5e7eb',
                          borderRadius: '8px',
                          padding: '10px',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                        }}
                      >
                        <div style={{ fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '4px' }}>
                          {opp.title}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#4b5563', marginBottom: '6px' }}>
                          👤 العميل: {opp.customer_name || 'غير مسمى'}
                        </div>
                        <div style={{ fontSize: '0.85rem', color: '#059669', fontWeight: 'bold', marginBottom: '8px' }}>
                          💰 {Number(opp.expected_value || 0).toLocaleString()} ج.م
                        </div>
                        {opp.expected_close_date && (
                          <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '8px' }}>
                            📅 الإغلاق المتوقع: {opp.expected_close_date}
                          </div>
                        )}
                        {opp.notes && (
                          <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '8px', fontStyle: 'italic' }}>
                            {`"${opp.notes}"`}
                          </div>
                        )}

                        {/* Quick stage selector */}
                        <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: '6px', marginTop: '4px' }}>
                          <select 
                            value={opp.stage}
                            onChange={(e) => handleStageChange(opp.id, e.target.value)}
                            style={{
                              width: '100%',
                              padding: '4px 6px',
                              fontSize: '0.75rem',
                              borderRadius: '4px',
                              border: '1px solid #d1d5db',
                              backgroundColor: '#f9fafb'
                            }}
                          >
                            {STAGES.map(s => (
                              <option key={s.id} value={s.id}>نقل إلى: {s.title}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default SalesPipelineBoard;
