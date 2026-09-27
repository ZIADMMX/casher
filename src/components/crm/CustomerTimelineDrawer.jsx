import { useState, useEffect } from 'react';

const INTERACTION_TYPES = [
  { value: 'call', label: '📞 مكالمة هاتفية' },
  { value: 'note', label: '📝 ملاحظة داخلية' },
  { value: 'message', label: '💬 رسالة واتساب / نصية' },
  { value: 'complaint', label: '⚠️ شكوى / بلاغ' },
  { value: 'offer', label: '🏷️ عرض مخصص' }
];

const STAGES = [
  { value: 'lead', label: 'عميل محتمل (Lead)' },
  { value: 'qualified', label: 'مؤهل (Qualified)' },
  { value: 'proposal', label: 'عرض سعر (Proposal)' },
  { value: 'won', label: 'صفقة ناجحة (Won)' },
  { value: 'lost', label: 'صفقة خاسرة (Lost)' }
];

const TIERS = [
  { value: 'Regular', label: 'عادي (Regular)' },
  { value: 'Silver', label: 'فضي (Silver)' },
  { value: 'Gold', label: 'ذهبي (Gold)' },
  { value: 'VIP', label: 'كبار الشخصيات (VIP)' }
];

function CustomerTimelineDrawer({ customer, onClose, onCustomerUpdated }) {
  const [timeline, setTimeline] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('timeline'); // 'timeline', 'add_interaction', 'add_opportunity', 'edit_rating'

  // Interaction Form state
  const [interactionForm, setInteractionForm] = useState({
    type: 'call',
    subject: '',
    description: '',
    follow_up_date: ''
  });

  // Opportunity Form state
  const [oppForm, setOppForm] = useState({
    title: '',
    stage: 'lead',
    expected_value: '',
    expected_close_date: '',
    notes: ''
  });

  // Rating & Tier state
  const [rating, setRating] = useState(customer?.rating || 5);
  const [tier, setTier] = useState(customer?.tier || 'Regular');

  const fetchTimeline = async () => {
    if (!customer?.id) return;
    setLoading(true);
    try {
      if (window.api?.crm?.getUnifiedTimeline) {
        const data = await window.api.crm.getUnifiedTimeline(customer.id);
        setTimeline(data || []);
      }
    } catch (err) {
      console.error('Failed to fetch timeline:', err);
      setError('فشل تحميل السجل الموحد للعميل');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!customer?.id) return;
    setLoading(true);
    window.api?.crm?.getUnifiedTimeline?.(customer.id)
      .then(data => setTimeline(data || []))
      .catch(err => {
        console.error('Failed to fetch timeline:', err);
        setError('فشل تحميل السجل الموحد للعميل');
      })
      .finally(() => setLoading(false));

    setRating(customer?.rating || 5);
    setTier(customer?.tier || 'Regular');
  }, [customer?.id, customer?.rating, customer?.tier]);

  const handleAddInteraction = async (e) => {
    e.preventDefault();
    if (!interactionForm.subject.trim()) return;
    try {
      if (window.api?.crm?.addCRMInteraction) {
        await window.api.crm.addCRMInteraction({
          customer_id: customer.id,
          type: interactionForm.type,
          subject: interactionForm.subject,
          description: interactionForm.description,
          follow_up_date: interactionForm.follow_up_date || null
        });
        setInteractionForm({ type: 'call', subject: '', description: '', follow_up_date: '' });
        setActiveTab('timeline');
        await fetchTimeline();
      }
    } catch (err) {
      console.error('Failed to add interaction:', err);
      setError(err.message || 'خطأ أثناء تسجيل التواصل');
    }
  };

  const handleCreateOpportunity = async (e) => {
    e.preventDefault();
    if (!oppForm.title.trim()) return;
    try {
      if (window.api?.crm?.createCRMOpportunity) {
        await window.api.crm.createCRMOpportunity({
          customer_id: customer.id,
          title: oppForm.title,
          stage: oppForm.stage,
          expected_value: Number(oppForm.expected_value) || 0,
          expected_close_date: oppForm.expected_close_date || null,
          notes: oppForm.notes
        });
        setOppForm({ title: '', stage: 'lead', expected_value: '', expected_close_date: '', notes: '' });
        setActiveTab('timeline');
        await fetchTimeline();
      }
    } catch (err) {
      console.error('Failed to create opportunity:', err);
      setError(err.message || 'خطأ أثناء تسجيل فرصة البيع');
    }
  };

  const handleUpdateRatingAndTier = async (e) => {
    e.preventDefault();
    try {
      if (window.api?.crm?.updateCustomerRatingAndTier) {
        await window.api.crm.updateCustomerRatingAndTier(customer.id, rating, tier);
        if (onCustomerUpdated) onCustomerUpdated();
        setActiveTab('timeline');
      }
    } catch (err) {
      console.error('Failed to update rating:', err);
      setError(err.message || 'خطأ أثناء تحديث التقييم');
    }
  };

  const getItemIcon = (type) => {
    switch (type) {
      case 'sale': return '🛒';
      case 'return': return '🔄';
      case 'payment': return '💳';
      case 'debt': return '📌';
      case 'call': return '📞';
      case 'note': return '📝';
      case 'message': return '💬';
      case 'complaint': return '⚠️';
      case 'offer': return '🏷️';
      case 'opportunity': return '💼';
      default: return '📄';
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1100 }}>
      <div 
        className="modal-box crm-drawer-box" 
        onClick={(e) => e.stopPropagation()}
        style={{ width: '700px', maxWidth: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
      >
        {/* Header */}
        <div className="modal-header" style={{ borderBottom: '1px solid #e5e7eb', paddingBottom: '12px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.25rem' }}>
              👤 سجل التفاعل الموحد: {customer?.name}
            </h3>
            <div style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '4px', display: 'flex', gap: '12px', alignItems: 'center' }}>
              <span>📞 {customer?.phone || 'بدون هاتف'}</span>
              <span>⭐ التقييم: {customer?.rating || 5}/5</span>
              <span className="badge badge-primary">{customer?.tier || 'Regular'}</span>
            </div>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose}>✕</button>
        </div>

        {/* Tab Buttons */}
        <div style={{ display: 'flex', gap: '8px', padding: '12px 0', borderBottom: '1px solid #f3f4f6' }}>
          <button 
            type="button" 
            className={`secondary-btn ${activeTab === 'timeline' ? 'active-tab-btn' : ''}`}
            onClick={() => setActiveTab('timeline')}
            style={{ fontWeight: activeTab === 'timeline' ? 'bold' : 'normal' }}
          >
            🕒 السجل الموحد (Timeline)
          </button>
          <button 
            type="button" 
            className={`secondary-btn ${activeTab === 'add_interaction' ? 'active-tab-btn' : ''}`}
            onClick={() => setActiveTab('add_interaction')}
          >
            ➕ تسجيل تواصل/ملاحظة
          </button>
          <button 
            type="button" 
            className={`secondary-btn ${activeTab === 'add_opportunity' ? 'active-tab-btn' : ''}`}
            onClick={() => setActiveTab('add_opportunity')}
          >
            💼 فرصة بيع جديدة
          </button>
          <button 
            type="button" 
            className={`secondary-btn ${activeTab === 'edit_rating' ? 'active-tab-btn' : ''}`}
            onClick={() => setActiveTab('edit_rating')}
          >
            ⭐ التقييم والتصنيف
          </button>
        </div>

        {error && (
          <div style={{ backgroundColor: '#fef2f2', color: '#991b1b', padding: '10px', borderRadius: '6px', margin: '10px 0' }}>
            {error}
          </div>
        )}

        {/* Body Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 0' }}>

          {/* TAB 1: UNIFIED TIMELINE */}
          {activeTab === 'timeline' && (
            <div>
              {loading ? (
                <div style={{ textAlign: 'center', padding: '30px', color: '#6b7280' }}>
                  جاري تحميل السجل الزمني الموحد...
                </div>
              ) : timeline.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>
                  لا توجد تفاعلات أو سجلات سابقة لهذا العميل.
                </div>
              ) : (
                <div className="timeline-container" style={{ position: 'relative', paddingRight: '20px' }}>
                  <div style={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    right: '8px',
                    width: '2px',
                    backgroundColor: '#e5e7eb'
                  }} />

                  {timeline.map((item, idx) => (
                    <div key={`${item.kind}-${item.id}-${idx}`} style={{ position: 'relative', marginBottom: '16px', paddingRight: '24px' }}>
                      <span style={{
                        position: 'absolute',
                        right: '-3px',
                        top: '4px',
                        width: '22px',
                        height: '22px',
                        borderRadius: '50%',
                        backgroundColor: '#fff',
                        border: '2px solid #3b82f6',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.75rem'
                      }}>
                        {getItemIcon(item.type)}
                      </span>

                      <div style={{
                        backgroundColor: '#f9fafb',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        padding: '12px'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                          <span style={{ fontWeight: 'bold', fontSize: '0.95rem' }}>
                            {item.title}
                          </span>
                          <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                            {new Date(item.created_at).toLocaleString('ar-EG')}
                          </span>
                        </div>

                        {item.details && (
                          <p style={{ margin: '4px 0', fontSize: '0.9rem', color: '#374151' }}>
                            {item.details}
                          </p>
                        )}

                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '6px', fontSize: '0.8rem' }}>
                          {item.amount != null && item.amount > 0 && (
                            <span style={{ color: '#059669', fontWeight: 'bold' }}>
                              {Number(item.amount).toLocaleString()} ج.م
                            </span>
                          )}
                          {item.follow_up_date && (
                            <span style={{ backgroundColor: '#fef3c7', color: '#92400e', padding: '2px 6px', borderRadius: '4px' }}>
                              ⏰ تذكير متابعة: {new Date(item.follow_up_date).toLocaleDateString('ar-EG')}
                            </span>
                          )}
                          {item.creator_name && (
                            <span style={{ color: '#6b7280' }}>
                              بواسطة: {item.creator_name}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: ADD INTERACTION */}
          {activeTab === 'add_interaction' && (
            <form onSubmit={handleAddInteraction} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '4px' }}>نوع التفاعل:</label>
                <select 
                  value={interactionForm.type} 
                  onChange={(e) => setInteractionForm({ ...interactionForm, type: e.target.value })}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ccc' }}
                >
                  {INTERACTION_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '4px' }}>الموضوع / العنوان الرئيسي <span style={{ color: 'red' }}>*</span>:</label>
                <input 
                  type="text" 
                  placeholder="مثال: مكالمة استفسار عن منتج جديد، أو متابعة تحصيل"
                  value={interactionForm.subject}
                  onChange={(e) => setInteractionForm({ ...interactionForm, subject: e.target.value })}
                  required
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ccc' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '4px' }}>التفاصيل والملاحظات:</label>
                <textarea 
                  rows="4" 
                  placeholder="اكتب ملخص ما تم مناقشته مع العميل..."
                  value={interactionForm.description}
                  onChange={(e) => setInteractionForm({ ...interactionForm, description: e.target.value })}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ccc' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '4px' }}>تاريخ تذكير المتابعة القادمة (اختياري):</label>
                <input 
                  type="date" 
                  value={interactionForm.follow_up_date}
                  onChange={(e) => setInteractionForm({ ...interactionForm, follow_up_date: e.target.value })}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ccc' }}
                />
              </div>

              <div style={{ marginTop: '12px', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button type="button" className="secondary-btn" onClick={() => setActiveTab('timeline')}>إلغاء</button>
                <button type="submit" className="primary-btn">حفظ التفاعل</button>
              </div>
            </form>
          )}

          {/* TAB 3: ADD OPPORTUNITY */}
          {activeTab === 'add_opportunity' && (
            <form onSubmit={handleCreateOpportunity} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '4px' }}>عنوان صفقة البيع <span style={{ color: 'red' }}>*</span>:</label>
                <input 
                  type="text" 
                  placeholder="مثال: توريد كمية أجهزة للمكتب، أو اتفاقية سنوية"
                  value={oppForm.title}
                  onChange={(e) => setOppForm({ ...oppForm, title: e.target.value })}
                  required
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ccc' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '4px' }}>مرحلة الصفقة:</label>
                  <select 
                    value={oppForm.stage} 
                    onChange={(e) => setOppForm({ ...oppForm, stage: e.target.value })}
                    style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ccc' }}
                  >
                    {STAGES.map(s => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '4px' }}>القيمة المتوقعة (ج.م):</label>
                  <input 
                    type="number" 
                    min="0" 
                    step="0.01"
                    placeholder="0.00"
                    value={oppForm.expected_value}
                    onChange={(e) => setOppForm({ ...oppForm, expected_value: e.target.value })}
                    style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ccc' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '4px' }}>تاريخ الإغلاق المتوقع:</label>
                <input 
                  type="date" 
                  value={oppForm.expected_close_date}
                  onChange={(e) => setOppForm({ ...oppForm, expected_close_date: e.target.value })}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ccc' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '4px' }}>ملاحظات ومستجدات الصفقة:</label>
                <textarea 
                  rows="3" 
                  placeholder="ملاحظات حول العرض المقدم أو الشروط..."
                  value={oppForm.notes}
                  onChange={(e) => setOppForm({ ...oppForm, notes: e.target.value })}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ccc' }}
                />
              </div>

              <div style={{ marginTop: '12px', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button type="button" className="secondary-btn" onClick={() => setActiveTab('timeline')}>إلغاء</button>
                <button type="submit" className="primary-btn">إنشاء فرصة البيع</button>
              </div>
            </form>
          )}

          {/* TAB 4: RATING AND TIER */}
          {activeTab === 'edit_rating' && (
            <form onSubmit={handleUpdateRatingAndTier} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '6px' }}>تصنيف العميل (Customer Tier):</label>
                <select 
                  value={tier}
                  onChange={(e) => setTier(e.target.value)}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ccc' }}
                >
                  {TIERS.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '6px' }}>تقييم العميل (من 1 إلى 5 نجوم):</label>
                <div style={{ display: 'flex', gap: '8px', fontSize: '1.5rem', cursor: 'pointer' }}>
                  {[1, 2, 3, 4, 5].map(star => (
                    <span 
                      key={star} 
                      onClick={() => setRating(star)}
                      style={{ color: star <= rating ? '#f59e0b' : '#d1d5db' }}
                    >
                      ★
                    </span>
                  ))}
                  <span style={{ fontSize: '1rem', color: '#6b7280', alignSelf: 'center', marginRight: '10px' }}>
                    ({rating} نجوم)
                  </span>
                </div>
              </div>

              <div style={{ marginTop: '12px', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button type="button" className="secondary-btn" onClick={() => setActiveTab('timeline')}>إلغاء</button>
                <button type="submit" className="primary-btn">حفظ التعديلات</button>
              </div>
            </form>
          )}

        </div>

        {/* Footer */}
        <div className="modal-footer" style={{ borderTop: '1px solid #e5e7eb', paddingTop: '12px', textAlign: 'left' }}>
          <button type="button" className="secondary-btn" onClick={onClose}>إغلاق</button>
        </div>
      </div>
    </div>
  );
}

export default CustomerTimelineDrawer;
