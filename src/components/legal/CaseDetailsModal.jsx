import { useState, useEffect, useCallback } from 'react';

const STATUS_LABELS = {
  active: 'متداولة بالجلسات',
  adjourned: 'مؤجلة',
  judged: 'محكوم بها',
  appealed: 'مستأنفة',
  closed: 'منتهية ومحفوظة',
};

export default function CaseDetailsModal({ caseId, onClose, onRefreshList }) {
  const [activeTab, setActiveTab] = useState('details'); // details | sessions | documents | financials | time_logs
  const [caseData, setCaseData] = useState(null);
  const [financialBreakdown, setFinancialBreakdown] = useState(null);
  const [loading, setLoading] = useState(true);

  // Forms states for sub-items
  const [showAddSession, setShowAddSession] = useState(false);
  const [sessionForm, setSessionForm] = useState({
    session_date: '',
    court_room: '',
    session_reason: '',
    decision: '',
    next_session_date: '',
    status: 'scheduled',
    notes: ''
  });

  const [showAddDoc, setShowAddDoc] = useState(false);
  const [docForm, setDocForm] = useState({
    title: '',
    doc_type: 'pleading',
    file_path: '',
    notes: ''
  });

  const [showAddFin, setShowAddFin] = useState(false);
  const [finForm, setFinForm] = useState({
    type: 'court_fee',
    amount: '',
    description: '',
    paid_by_client: true,
    receipt_number: ''
  });

  const [showAddTime, setShowAddTime] = useState(false);
  const [timeForm, setTimeForm] = useState({
    lawyer_id: 1,
    hours: '1',
    hourly_rate: '0',
    activity_description: ''
  });

  const loadCaseDetails = useCallback(async () => {
    if (!caseId) return;
    setLoading(true);
    try {
      if (window.electronAPI?.getCaseById) {
        const data = await window.electronAPI.getCaseById(caseId);
        setCaseData(data);
        if (data?.hourly_rate) {
          setTimeForm((prev) => ({ ...prev, hourly_rate: data.hourly_rate }));
        }
      }
      if (window.electronAPI?.getCaseFinancialBreakdown) {
        const breakdown = await window.electronAPI.getCaseFinancialBreakdown(caseId);
        setFinancialBreakdown(breakdown);
      }
    } catch (err) {
      console.error('Failed to load case details:', err);
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    loadCaseDetails();
  }, [loadCaseDetails]);

  // Handlers for adding sub-records
  async function handleAddSession(e) {
    e.preventDefault();
    if (!sessionForm.session_date) return alert('يرجى تحديد تاريخ الجلسة');
    try {
      await window.electronAPI.createCourtSession({
        ...sessionForm,
        case_id: caseId
      });
      setShowAddSession(false);
      setSessionForm({
        session_date: '',
        court_room: '',
        session_reason: '',
        decision: '',
        next_session_date: '',
        status: 'scheduled',
        notes: ''
      });
      await loadCaseDetails();
      if (onRefreshList) onRefreshList();
    } catch (err) {
      alert('خطأ أثناء حفظ الجلسة: ' + err.message);
    }
  }

  async function handleAddDoc(e) {
    e.preventDefault();
    if (!docForm.title || !docForm.file_path) return alert('يرجى إدخال اسم ومسار المستند');
    try {
      await window.electronAPI.createCaseDocument({
        ...docForm,
        case_id: caseId
      });
      setShowAddDoc(false);
      setDocForm({ title: '', doc_type: 'pleading', file_path: '', notes: '' });
      await loadCaseDetails();
      if (onRefreshList) onRefreshList();
    } catch (err) {
      alert('خطأ أثناء إضافة المستند: ' + err.message);
    }
  }

  async function handleAddFin(e) {
    e.preventDefault();
    if (!finForm.amount || Number(finForm.amount) <= 0) return alert('يرجى إدخال مبلغ صحيح');
    try {
      await window.electronAPI.createCaseFinancial({
        ...finForm,
        case_id: caseId
      });
      setShowAddFin(false);
      setFinForm({ type: 'court_fee', amount: '', description: '', paid_by_client: true, receipt_number: '' });
      await loadCaseDetails();
      if (onRefreshList) onRefreshList();
    } catch (err) {
      alert('خطأ أثناء حفظ الحركة المالية: ' + err.message);
    }
  }

  async function handleAddTime(e) {
    e.preventDefault();
    if (!timeForm.activity_description) return alert('يرجى وصف النشاط المنجز');
    try {
      await window.electronAPI.createCaseTimeLog({
        ...timeForm,
        case_id: caseId
      });
      setShowAddTime(false);
      setTimeForm((prev) => ({ ...prev, hours: '1', activity_description: '' }));
      await loadCaseDetails();
      if (onRefreshList) onRefreshList();
    } catch (err) {
      alert('خطأ أثناء تسجيل ساعات العمل: ' + err.message);
    }
  }

  if (loading || !caseData) {
    return (
      <div className="legal-modal-overlay">
        <div className="legal-modal-container" style={{ padding: '40px', textAlign: 'center' }}>
          جاري فتح ملف القضية...
        </div>
      </div>
    );
  }

  return (
    <div className="legal-modal-overlay" onClick={onClose}>
      <div className="legal-modal-container" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="legal-modal-header">
          <div>
            <h2>
              <span>⚖️ قضية رقم: {caseData.case_number}</span>
              <span className={`status-badge ${caseData.status}`}>
                {STATUS_LABELS[caseData.status] || caseData.status}
              </span>
            </h2>
            <div style={{ fontSize: '0.88rem', color: '#64748b', marginTop: '4px' }}>
              {caseData.court_name} {caseData.circuit_name ? `(${caseData.circuit_name})` : ''} — الموكّل: <strong>{caseData.client_name}</strong>
            </div>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose}>✕</button>
        </div>

        {/* Tabs */}
        <div className="legal-modal-tabs">
          <button
            type="button"
            className={`modal-tab-btn ${activeTab === 'details' ? 'active' : ''}`}
            onClick={() => setActiveTab('details')}
          >
            📋 بيانات الدعوى والأطراف
          </button>
          <button
            type="button"
            className={`modal-tab-btn ${activeTab === 'sessions' ? 'active' : ''}`}
            onClick={() => setActiveTab('sessions')}
          >
            🏛️ سجل الجلسات ({caseData.sessions?.length || 0})
          </button>
          <button
            type="button"
            className={`modal-tab-btn ${activeTab === 'documents' ? 'active' : ''}`}
            onClick={() => setActiveTab('documents')}
          >
            📁 أرشيف المستندات ({caseData.documents?.length || 0})
          </button>
          <button
            type="button"
            className={`modal-tab-btn ${activeTab === 'financials' ? 'active' : ''}`}
            onClick={() => setActiveTab('financials')}
          >
            💰 الأمانات والماليات
          </button>
          <button
            type="button"
            className={`modal-tab-btn ${activeTab === 'time_logs' ? 'active' : ''}`}
            onClick={() => setActiveTab('time_logs')}
          >
            ⏱️ ساعات العمل ({caseData.time_logs?.length || 0})
          </button>
        </div>

        {/* Body Content */}
        <div className="legal-modal-body">
          {/* TAB 1: DETAILS */}
          {activeTab === 'details' && (
            <div>
              <div className="form-grid-2">
                <div className="form-group">
                  <label>موضوع الدعوى والطلبات:</label>
                  <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    {caseData.subject}
                  </div>
                </div>
                <div className="form-group">
                  <label>المحامي المسؤول بالمكتب:</label>
                  <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    {caseData.assigned_lawyer_name || 'غير محدد'}
                  </div>
                </div>

                <div className="form-group">
                  <label>الموكّل وصفته:</label>
                  <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <strong>{caseData.client_name}</strong> ({caseData.client_role === 'plaintiff' ? 'مدعي / طالب' : 'مدعى عليه / مطلوب ضده'})
                    <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '4px' }}>هاتف: {caseData.client_phone || 'لا يوجد'}</div>
                  </div>
                </div>

                <div className="form-group">
                  <label>الخصم ومحاميه:</label>
                  <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <strong style={{ color: '#dc2626' }}>{caseData.opponent_name}</strong>
                    <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '4px' }}>محامي الخصم: {caseData.opponent_lawyer || 'غير مسجل'}</div>
                  </div>
                </div>

                <div className="form-group">
                  <label>بيانات التوكيل والتوثيق:</label>
                  <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    {caseData.power_of_attorney_num || 'لم يسجل توكيل بعد'}
                  </div>
                </div>

                <div className="form-group">
                  <label>نظام الفوترة والأتعاب:</label>
                  <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    {caseData.billing_type === 'fixed' ? 'أتعاب مقطوعة بالعقد' : 'فوترة بالساعة'} — 
                    قيمة العقد: <strong>{caseData.contract_amount?.toLocaleString()} EGP</strong> | 
                    المسدد: <strong style={{ color: '#059669' }}>{caseData.paid_amount?.toLocaleString()} EGP</strong>
                  </div>
                </div>

                {caseData.notes && (
                  <div className="form-group full-width">
                    <label>ملاحظات إضافية:</label>
                    <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', whiteSpace: 'pre-wrap' }}>
                      {caseData.notes}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: SESSIONS */}
          {activeTab === 'sessions' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ margin: 0, fontSize: '1.1rem' }}>جلسات المحكمة وقرارات الرول</h3>
                <button
                  type="button"
                  className="btn-primary-legal"
                  style={{ fontSize: '0.85rem', padding: '8px 14px' }}
                  onClick={() => setShowAddSession(!showAddSession)}
                >
                  {showAddSession ? 'إلغاء' : '+ إضافة جلسة جديدة'}
                </button>
              </div>

              {showAddSession && (
                <form onSubmit={handleAddSession} style={{ background: '#f8fafc', padding: '16px', borderRadius: '10px', marginBottom: '20px', border: '1px solid #cbd5e1' }}>
                  <h4 style={{ margin: '0 0 12px 0' }}>تسجيل جلسة محكمة جديدة</h4>
                  <div className="form-grid-2">
                    <div className="form-group">
                      <label>تاريخ ووقت الجلسة *</label>
                      <input
                        type="datetime-local"
                        required
                        value={sessionForm.session_date}
                        onChange={(e) => setSessionForm({ ...sessionForm, session_date: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label>القاعة / رقم الرول</label>
                      <input
                        type="text"
                        placeholder="مثال: قاعة 4 رول 12"
                        value={sessionForm.court_room}
                        onChange={(e) => setSessionForm({ ...sessionForm, court_room: e.target.value })}
                      />
                    </div>
                    <div className="form-group full-width">
                      <label>المطلوب بالجلسة / سبب التأجيل</label>
                      <input
                        type="text"
                        placeholder="مثال: سماع شهود الإثبات، ورود تقرير الخبير، مذكرات الدفاع..."
                        value={sessionForm.session_reason}
                        onChange={(e) => setSessionForm({ ...sessionForm, session_reason: e.target.value })}
                      />
                    </div>
                    <div className="form-group full-width">
                      <label>قرار المحكمة (إن كان قد صدر)</label>
                      <input
                        type="text"
                        placeholder="قرار القاضي في الجلسة..."
                        value={sessionForm.decision}
                        onChange={(e) => setSessionForm({ ...sessionForm, decision: e.target.value })}
                      />
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    <button type="submit" className="btn-primary-legal">حفظ الجلسة</button>
                  </div>
                </form>
              )}

              <div className="sessions-list-container">
                {caseData.sessions?.length === 0 ? (
                  <p style={{ color: '#64748b', textAlign: 'center', padding: '24px' }}>لا توجد جلسات مسجلة بعد في هذه القضية.</p>
                ) : (
                  caseData.sessions.map((sess) => (
                    <div key={sess.id} className="session-item-card">
                      <div className="session-card-main">
                        <h4>جلسة بتاريخ: {new Date(sess.session_date).toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</h4>
                        <div className="session-meta">
                          <span>🏛️ القاعة: <strong>{sess.court_room || 'غير محدد'}</strong></span>
                          <span>⚖️ المحامي الحاضر: <strong>{sess.assigned_lawyer_name || 'غير محدد'}</strong></span>
                          <span>🔔 التنبيه: <strong>{sess.reminder_sent ? 'تم الإرسال ✓' : 'مجدول'}</strong></span>
                        </div>
                        {sess.session_reason && (
                          <div className="session-reason-box">
                            <strong>المطلوب بالجلسة:</strong> {sess.session_reason}
                          </div>
                        )}
                        {sess.decision && (
                          <div style={{ marginTop: '8px', color: '#047857', fontWeight: 600 }}>
                            قرار المحكمة: {sess.decision}
                          </div>
                        )}
                      </div>
                      <span className={`status-badge ${sess.status}`}>{sess.status}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 3: DOCUMENTS */}
          {activeTab === 'documents' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ margin: 0, fontSize: '1.1rem' }}>أرشيف الوثائق والمستندات بنسخها</h3>
                <button
                  type="button"
                  className="btn-primary-legal"
                  style={{ fontSize: '0.85rem', padding: '8px 14px' }}
                  onClick={() => setShowAddDoc(!showAddDoc)}
                >
                  {showAddDoc ? 'إلغاء' : '+ أرشفة مستند جديد'}
                </button>
              </div>

              {showAddDoc && (
                <form onSubmit={handleAddDoc} style={{ background: '#f8fafc', padding: '16px', borderRadius: '10px', marginBottom: '20px', border: '1px solid #cbd5e1' }}>
                  <div className="form-grid-2">
                    <div className="form-group">
                      <label>عنوان المستند *</label>
                      <input
                        type="text"
                        required
                        placeholder="مثال: عريضة افتتاح الدعوى، تقرير الخبير..."
                        value={docForm.title}
                        onChange={(e) => setDocForm({ ...docForm, title: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label>نوع المستند</label>
                      <select
                        value={docForm.doc_type}
                        onChange={(e) => setDocForm({ ...docForm, doc_type: e.target.value })}
                      >
                        <option value="pleading">مذكرة دفاع / عريضة</option>
                        <option value="power_of_attorney">توكيل رسمي</option>
                        <option value="judgment">حكم قضائي</option>
                        <option value="evidence">مستند إثبات / حوافظ</option>
                        <option value="contract">عقد / اتفاق</option>
                        <option value="other">أخرى</option>
                      </select>
                    </div>
                    <div className="form-group full-width">
                      <label>مسار أو رابط الملف الرقمي (Path / Link) *</label>
                      <input
                        type="text"
                        required
                        placeholder="D:/Cases/2026/evidence1.pdf"
                        value={docForm.file_path}
                        onChange={(e) => setDocForm({ ...docForm, file_path: e.target.value })}
                      />
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    <button type="submit" className="btn-primary-legal">حفظ بالأرشيف</button>
                  </div>
                </form>
              )}

              <table className="cases-table">
                <thead>
                  <tr>
                    <th>اسم المستند</th>
                    <th>النوع</th>
                    <th>المسار / الملف</th>
                    <th>تاريخ الإضافة</th>
                    <th>بواسطة</th>
                  </tr>
                </thead>
                <tbody>
                  {caseData.documents?.length === 0 ? (
                    <tr>
                      <td colSpan="5" style={{ textAlign: 'center', color: '#64748b', padding: '24px' }}>
                        لا توجد مستندات مؤرشفة بعد.
                      </td>
                    </tr>
                  ) : (
                    caseData.documents.map((doc) => (
                      <tr key={doc.id}>
                        <td style={{ fontWeight: 600 }}>📄 {doc.title}</td>
                        <td><span className="party-tag plaintiff">{doc.doc_type}</span></td>
                        <td style={{ color: '#2563eb', fontSize: '0.85rem' }}>{doc.file_path}</td>
                        <td>{new Date(doc.created_at).toLocaleDateString('ar-EG')}</td>
                        <td>{doc.uploaded_by_name || 'مسؤول النظام'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB 4: FINANCIALS */}
          {activeTab === 'financials' && (
            <div>
              {/* Summary Cards */}
              <div className="financial-summary-grid">
                <div className="fin-mini-card">
                  <span className="fin-mini-label">إجمالي أتعاب العقد</span>
                  <span className="fin-mini-val">{(financialBreakdown?.contract_amount || 0).toLocaleString()} EGP</span>
                </div>
                <div className="fin-mini-card">
                  <span className="fin-mini-label">المسدد من الأتعاب</span>
                  <span className="fin-mini-val positive">{(financialBreakdown?.paid_amount || 0).toLocaleString()} EGP</span>
                </div>
                <div className="fin-mini-card">
                  <span className="fin-mini-label">متبقي الأتعاب</span>
                  <span className="fin-mini-val negative">{(financialBreakdown?.remaining_fees || 0).toLocaleString()} EGP</span>
                </div>
                <div className="fin-mini-card">
                  <span className="fin-mini-label">إجمالي أمانات الموكل</span>
                  <span className="fin-mini-val">{(financialBreakdown?.total_retainers || 0).toLocaleString()} EGP</span>
                </div>
                <div className="fin-mini-card">
                  <span className="fin-mini-label">المصاريف القضائية المنصرفة</span>
                  <span className="fin-mini-val negative">{(financialBreakdown?.total_court_expenses || 0).toLocaleString()} EGP</span>
                </div>
                <div className="fin-mini-card" style={{ background: '#f0fdf4', borderColor: '#bbf7d0' }}>
                  <span className="fin-mini-label">صافي رصيد الأمانة المتاح</span>
                  <span className="fin-mini-val positive">{(financialBreakdown?.retainer_balance || 0).toLocaleString()} EGP</span>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ margin: 0, fontSize: '1.1rem' }}>سجل حركات الأمانات والمصاريف</h3>
                <button
                  type="button"
                  className="btn-primary-legal"
                  style={{ fontSize: '0.85rem', padding: '8px 14px' }}
                  onClick={() => setShowAddFin(!showAddFin)}
                >
                  {showAddFin ? 'إلغاء' : '+ حركة مالية / سداد أمانة'}
                </button>
              </div>

              {showAddFin && (
                <form onSubmit={handleAddFin} style={{ background: '#f8fafc', padding: '16px', borderRadius: '10px', marginBottom: '20px', border: '1px solid #cbd5e1' }}>
                  <div className="form-grid-2">
                    <div className="form-group">
                      <label>نوع الحركة المالية *</label>
                      <select
                        value={finForm.type}
                        onChange={(e) => setFinForm({ ...finForm, type: e.target.value })}
                      >
                        <option value="retainer_deposit">إيداع أمانة من الموكل (+)</option>
                        <option value="court_fee">رسوم قضائية ومحكمة (-)</option>
                        <option value="expert_fee">أمانة خبير قضائي (-)</option>
                        <option value="announcement_fee">رسوم إعلان محضرين (-)</option>
                        <option value="fee_payment">سداد دفعة أتعاب محاماة</option>
                        <option value="other_expense">مصروفات قضائية أخرى (-)</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>المبلغ (EGP) *</label>
                      <input
                        type="number"
                        min="1"
                        step="any"
                        required
                        placeholder="0.00"
                        value={finForm.amount}
                        onChange={(e) => setFinForm({ ...finForm, amount: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label>رقم الإيصال / القسيمة</label>
                      <input
                        type="text"
                        placeholder="مثال: REC-5421"
                        value={finForm.receipt_number}
                        onChange={(e) => setFinForm({ ...finForm, receipt_number: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label>البيان / الوصف</label>
                      <input
                        type="text"
                        placeholder="توضيح تفاصيل المصروف أو الإيداع..."
                        value={finForm.description}
                        onChange={(e) => setFinForm({ ...finForm, description: e.target.value })}
                      />
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    <button type="submit" className="btn-primary-legal">حفظ الحركة المالية</button>
                  </div>
                </form>
              )}

              <table className="cases-table">
                <thead>
                  <tr>
                    <th>التاريخ</th>
                    <th>نوع الحركة</th>
                    <th>المبلغ</th>
                    <th>البيان</th>
                    <th>رقم الإيصال</th>
                  </tr>
                </thead>
                <tbody>
                  {caseData.financials?.length === 0 ? (
                    <tr>
                      <td colSpan="5" style={{ textAlign: 'center', color: '#64748b', padding: '24px' }}>
                        لا توجد حركات أمانات أو مصروفات مسجلة بعد.
                      </td>
                    </tr>
                  ) : (
                    caseData.financials.map((f) => (
                      <tr key={f.id}>
                        <td>{new Date(f.date).toLocaleDateString('ar-EG')}</td>
                        <td>
                          <span className={`party-tag ${f.type === 'retainer_deposit' || f.type === 'fee_payment' ? 'plaintiff' : 'defendant'}`}>
                            {f.type === 'retainer_deposit' ? 'إيداع أمانة' :
                             f.type === 'fee_payment' ? 'سداد أتعاب' :
                             f.type === 'court_fee' ? 'رسوم محكمة' :
                             f.type === 'expert_fee' ? 'أمانة خبير' : 'مصروف'}
                          </span>
                        </td>
                        <td style={{ fontWeight: 700, color: f.type === 'retainer_deposit' || f.type === 'fee_payment' ? '#059669' : '#dc2626' }}>
                          {f.amount?.toLocaleString()} EGP
                        </td>
                        <td>{f.description || '-'}</td>
                        <td style={{ color: '#64748b' }}>{f.receipt_number || '-'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB 5: TIME LOGS */}
          {activeTab === 'time_logs' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ margin: 0, fontSize: '1.1rem' }}>سجل ساعات عمل المحامين (Billable Hours)</h3>
                <button
                  type="button"
                  className="btn-primary-legal"
                  style={{ fontSize: '0.85rem', padding: '8px 14px' }}
                  onClick={() => setShowAddTime(!showAddTime)}
                >
                  {showAddTime ? 'إلغاء' : '+ تسجيل ساعات عمل'}
                </button>
              </div>

              {showAddTime && (
                <form onSubmit={handleAddTime} style={{ background: '#f8fafc', padding: '16px', borderRadius: '10px', marginBottom: '20px', border: '1px solid #cbd5e1' }}>
                  <div className="form-grid-2">
                    <div className="form-group">
                      <label>عدد الساعات *</label>
                      <input
                        type="number"
                        min="0.25"
                        step="0.25"
                        required
                        value={timeForm.hours}
                        onChange={(e) => setTimeForm({ ...timeForm, hours: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label>سعر الساعة (EGP)</label>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={timeForm.hourly_rate}
                        onChange={(e) => setTimeForm({ ...timeForm, hourly_rate: e.target.value })}
                      />
                    </div>
                    <div className="form-group full-width">
                      <label>وصف النشاط القانوني المنجز *</label>
                      <input
                        type="text"
                        required
                        placeholder="مثال: دراسة ملف القضية وصياغة مذكرة الدفاع، حضور تحقيق نيابة..."
                        value={timeForm.activity_description}
                        onChange={(e) => setTimeForm({ ...timeForm, activity_description: e.target.value })}
                      />
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    <button type="submit" className="btn-primary-legal">تسجيل الساعات</button>
                  </div>
                </form>
              )}

              <table className="cases-table">
                <thead>
                  <tr>
                    <th>التاريخ</th>
                    <th>المحامي</th>
                    <th>الساعات</th>
                    <th>المعدل / ساعة</th>
                    <th>الإجمالي</th>
                    <th>النشاط المنجز</th>
                  </tr>
                </thead>
                <tbody>
                  {caseData.time_logs?.length === 0 ? (
                    <tr>
                      <td colSpan="6" style={{ textAlign: 'center', color: '#64748b', padding: '24px' }}>
                        لا توجد ساعات مسجلة بعد.
                      </td>
                    </tr>
                  ) : (
                    caseData.time_logs.map((t) => (
                      <tr key={t.id}>
                        <td>{t.date}</td>
                        <td style={{ fontWeight: 600 }}>{t.lawyer_name || 'محامي المكتب'}</td>
                        <td style={{ fontWeight: 700, color: '#2563eb' }}>{t.hours} ساعة</td>
                        <td>{t.hourly_rate?.toLocaleString()} EGP</td>
                        <td style={{ fontWeight: 700 }}>{t.total_amount?.toLocaleString()} EGP</td>
                        <td>{t.activity_description}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="legal-modal-footer">
          <button type="button" className="btn-secondary-legal" onClick={onClose}>إغلاق</button>
        </div>
      </div>
    </div>
  );
}
