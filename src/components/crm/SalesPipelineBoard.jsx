import { useState, useEffect } from 'react';

function formatCurrency(val) {
  return `${Number(val || 0).toLocaleString('ar-EG')} ج.م`;
}

function SalesPipelineBoard() {
  const [opportunities, setOpportunities] = useState([]);
  const [stages, setStages] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [assignees, setAssignees] = useState([]);
  const [newStageLabel, setNewStageLabel] = useState('');
  const [newStageProbability, setNewStageProbability] = useState(30);
  const [newStageOutcome, setNewStageOutcome] = useState('open');
  const [stageDrafts, setStageDrafts] = useState({});
  const [deal, setDeal] = useState({ title: '', customer_id: '', expected_value: '', owner_user_id: '', expected_close_date: '', notes: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [dragOverStageId, setDragOverStageId] = useState(null);

  // Modals state
  const [showDealModal, setShowDealModal] = useState(false);
  const [showStageModal, setShowStageModal] = useState(false);

  const fetchOpportunities = async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, stageList, users] = await Promise.all([
        window.electronAPI.getAllCRMOpportunities(),
        window.electronAPI.getCRMPipelineStages(),
        window.electronAPI.getCRMAssignees(),
      ]);
      setOpportunities(list || []);
      setStages(stageList || []);
      setAssignees(users || []);
      setStageDrafts(Object.fromEntries((stageList || []).map((stage) => [
        stage.id,
        { label: stage.label, probability: stage.probability, is_active: stage.is_active },
      ])));
    } catch (err) {
      console.error('Failed to fetch opportunities:', err);
      setError('فشل تحميل قائمة صفقات المبيعات ومراحلها');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOpportunities();
    window.electronAPI.getAllCustomersWithStats()
      .then((list) => setCustomers(list || []))
      .catch((err) => setError(err.message || 'تعذر تحميل قائمة العملاء'));
  }, []);

  const handleStageChange = async (oppId, stageId) => {
    try {
      await window.electronAPI.moveCRMOpportunity(Number(oppId), Number(stageId));
      await fetchOpportunities();
      setMessage('تم تحديث مرحلة الصفقة بنجاح.');
      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      console.error('Failed to update stage:', err);
      setError('فشل نقل الصفقة: ' + err.message);
    }
  };

  const handleOwnerChange = async (oppId, ownerUserId) => {
    try {
      await window.electronAPI.assignCRMOpportunity(oppId, ownerUserId);
      await fetchOpportunities();
      setMessage('تم تعيين المسؤول عن الصفقة.');
      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      console.error('Failed to assign opportunity:', err);
      setError('فشل تغيير مسؤول الصفقة: ' + err.message);
    }
  };

  const getStageOpportunities = (stage) => opportunities.filter((opportunity) => (
    Number(opportunity.pipeline_stage_id) === Number(stage.id)
    || (!opportunity.pipeline_stage_id && opportunity.stage === stage.stage_key)
  ));

  const getOppValueForStage = (stage) => {
    return opportunities
      .filter((opportunity) => getStageOpportunities(stage).includes(opportunity))
      .reduce((sum, o) => sum + Number(o.expected_value || 0), 0);
  };

  const createStage = async (event) => {
    event.preventDefault();
    try {
      await window.electronAPI.createCRMPipelineStage({
        label: newStageLabel,
        probability: Number(newStageProbability),
        outcome: newStageOutcome,
        display_order: stages.length,
      });
      setNewStageLabel('');
      await fetchOpportunities();
      setMessage('تمت إضافة مرحلة المبيعات بنجاح.');
    } catch (err) {
      setError(err.message || 'تعذر إضافة المرحلة');
    }
  };

  const saveStage = async (stage) => {
    try {
      const draft = stageDrafts[stage.id] || stage;
      await window.electronAPI.updateCRMPipelineStage({
        id: stage.id,
        label: draft.label,
        probability: Number(draft.probability),
        outcome: stage.outcome,
        display_order: stage.display_order,
        is_active: Boolean(draft.is_active !== undefined ? draft.is_active : stage.is_active),
      });
      await fetchOpportunities();
      setMessage('تم تحديث بيانات المرحلة بنجاح.');
    } catch (err) {
      setError(err.message || 'تعذر حفظ المرحلة');
    }
  };

  const createOpportunity = async (event) => {
    event.preventDefault();
    const firstOpenStage = stages.find((stage) => stage.is_active && stage.outcome === 'open');
    if (!firstOpenStage) {
      setError('يرجى التأكد من وجود مرحلة بيع مفتوحة أولاً.');
      return;
    }
    try {
      await window.electronAPI.createCRMAdvancedOpportunity({
        ...deal,
        customer_id: Number(deal.customer_id),
        expected_value: Number(deal.expected_value || 0),
        pipeline_stage_id: firstOpenStage.id,
      });
      setDeal({ title: '', customer_id: '', expected_value: '', owner_user_id: '', expected_close_date: '', notes: '' });
      setShowDealModal(false);
      await fetchOpportunities();
      setMessage('تم إنشاء الصفقة وإضافتها للوحة بنجاح.');
    } catch (err) {
      setError(err.message || 'تعذر إنشاء الصفقة');
    }
  };

  // Drag and drop handlers
  const handleDragStart = (e, oppId) => {
    e.dataTransfer.setData('text/plain', oppId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, stageId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverStageId !== stageId) {
      setDragOverStageId(stageId);
    }
  };

  const handleDragLeave = (e, stageId) => {
    if (dragOverStageId === stageId) {
      setDragOverStageId(null);
    }
  };

  const handleDrop = async (e, stageId) => {
    e.preventDefault();
    setDragOverStageId(null);
    const oppId = e.dataTransfer.getData('text/plain');
    if (oppId) {
      await handleStageChange(oppId, stageId);
    }
  };

  return (
    <div className="crm-kanban-container">
      {/* Header Toolbar */}
      <div className="crm-toolbar">
        <div className="crm-toolbar-left">
          <div>
            <h2 className="crm-pipeline-heading">
              لوحة مسار الصفقات (Sales Pipeline)
            </h2>
            <p className="crm-pipeline-description">
              اسحب الصفقات وأفلتها بين المراحل لمتابعة تقدم المفاوضات والإغلاق.
            </p>
          </div>
        </div>

        <div className="crm-toolbar-right">
          <button
            type="button"
            className="secondary-btn"
            onClick={fetchOpportunities}
            disabled={loading}
          >
            {loading ? 'جارٍ التحديث...' : 'تحديث اللوحة'}
          </button>
          <button
            type="button"
            className="secondary-btn"
            onClick={() => setShowStageModal(true)}
          >
            إدارة مراحل البيع
          </button>
          <button
            type="button"
            className="primary-btn"
            onClick={() => setShowDealModal(true)}
          >
            + إضافة صفقة جديدة
          </button>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="crm-error-banner" role="alert">
          <span>{error}</span>
          <button type="button" className="secondary-btn" onClick={() => setError(null)}>إغلاق</button>
        </div>
      )}
      {message && (
        <div className="crm-success-banner" role="status">
          {message}
        </div>
      )}

      {/* Kanban Board Grid */}
      {loading ? (
        <div className="crm-empty-state">
          <p>جارٍ تحميل لوحة المبيعات...</p>
        </div>
      ) : stages.length === 0 ? (
        <div className="crm-empty-state">
          <strong>لا توجد مراحل مسجلة لخط المبيعات</strong>
          <p>أضف مراحل البيع الخاصة بك (تواصل، تأهيل، عرض سعر، صفقة رابحة).</p>
          <button type="button" className="primary-btn" onClick={() => setShowStageModal(true)}>
            + إعداد مراحل البيع
          </button>
        </div>
      ) : (
        <div className="crm-kanban-board">
          {stages.filter((s) => s.is_active).map((stage) => {
            const stageOpps = getStageOpportunities(stage);
            const totalValue = getOppValueForStage(stage);
            const isDragOver = dragOverStageId === stage.id;

            return (
              <div
                key={stage.id}
                className={`crm-kanban-column ${isDragOver ? 'drag-over' : ''}`}
                onDragOver={(e) => handleDragOver(e, stage.id)}
                onDragLeave={(e) => handleDragLeave(e, stage.id)}
                onDrop={(e) => handleDrop(e, stage.id)}
              >
                {/* Column Header */}
                <div className={`crm-column-header ${stage.outcome || 'open'}`}>
                  <div className="crm-column-title-row">
                    <span className="crm-column-title">{stage.label}</span>
                    <span className={`crm-badge ${stage.outcome === 'won' ? 'converted' : stage.outcome === 'lost' ? 'lost' : 'open'}`}>
                      {stageOpps.length} صفقة
                    </span>
                  </div>

                  <div className="crm-column-stats">
                    <span>نسبة الإغلاق: <strong>{stage.probability}%</strong></span>
                    <span>الإجمالي: <strong>{formatCurrency(totalValue)}</strong></span>
                  </div>
                </div>

                {/* Cards Container */}
                <div className="crm-column-cards">
                  {stageOpps.length === 0 ? (
                    <div className="crm-pipeline-empty">
                      اسحب صفقة وضعها هنا
                    </div>
                  ) : (
                    stageOpps.map((opp) => (
                      <div
                        key={opp.id}
                        className="crm-kanban-card"
                        draggable
                        onDragStart={(e) => handleDragStart(e, opp.id)}
                      >
                        <div className="crm-card-title">{opp.title}</div>

                        <div className="crm-card-customer">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                            <circle cx="12" cy="7" r="4" />
                          </svg>
                          <span>{opp.customer_name || 'عميل غير محدد'}</span>
                        </div>

                        <div className="crm-card-value">
                          <span>{formatCurrency(opp.expected_value)}</span>
                          <span className="crm-card-probability">{opp.probability || stage.probability}%</span>
                        </div>

                        {opp.expected_close_date && (
                          <div className="crm-card-date">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                              <line x1="16" y1="2" x2="16" y2="6" />
                              <line x1="8" y1="2" x2="8" y2="6" />
                              <line x1="3" y1="10" x2="21" y2="10" />
                            </svg>
                            <span>الإغلاق: {opp.expected_close_date}</span>
                          </div>
                        )}

                        <div className="crm-card-footer">
                          <div className="crm-card-owner">
                            <span className="crm-card-owner-label">المسؤول:</span>
                            <span>{opp.assigned_username || 'غير معيّن'}</span>
                          </div>

                          {/* Quick stage selector (accessible fallback) */}
                          <select
                            className="crm-select-filter crm-card-stage-select"
                            value={opp.pipeline_stage_id || ''}
                            onChange={(e) => handleStageChange(opp.id, e.target.value)}
                            title="نقل سريع لمرحلة أخرى"
                          >
                            <option value="" disabled>نقل إلى...</option>
                            {stages.filter((item) => item.is_active).map((nextStage) => (
                              <option key={nextStage.id} value={nextStage.id}>{nextStage.label}</option>
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

      {/* =========================================================================
          MODALS
         ========================================================================= */}

      {/* Create Opportunity Deal Modal */}
      {showDealModal && (
        <div className="crm-modal-backdrop" onClick={() => setShowDealModal(false)}>
          <div className="crm-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="crm-modal-header">
              <h3>إضافة فرصة بيع جديدة (New Deal)</h3>
              <button type="button" className="crm-modal-close" onClick={() => setShowDealModal(false)}>✕</button>
            </div>
            <form onSubmit={createOpportunity}>
              <div className="crm-modal-body">
                <div className="crm-form-grid">
                  <div className="crm-form-group full-width">
                    <label className="crm-form-label">عنوان الصفقة <span className="required">*</span></label>
                    <input
                      className="crm-form-input"
                      value={deal.title}
                      onChange={(e) => setDeal({ ...deal, title: e.target.value })}
                      required
                      placeholder="مثال: توريد 50 وحدة أجهزة لنقطة بيع"
                    />
                  </div>

                  <div className="crm-form-group">
                    <label className="crm-form-label">العميل المرتبط <span className="required">*</span></label>
                    <select
                      className="crm-form-select"
                      value={deal.customer_id}
                      onChange={(e) => setDeal({ ...deal, customer_id: e.target.value })}
                      required
                    >
                      <option value="">اختر العميل</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="crm-form-group">
                    <label className="crm-form-label">القيمة المتوقعة (ج.م)</label>
                    <input
                      className="crm-form-input"
                      type="number"
                      min="0"
                      step="0.01"
                      value={deal.expected_value}
                      onChange={(e) => setDeal({ ...deal, expected_value: e.target.value })}
                      placeholder="0.00"
                    />
                  </div>

                  <div className="crm-form-group">
                    <label className="crm-form-label">المسؤول عن الصفقة</label>
                    <select
                      className="crm-form-select"
                      value={deal.owner_user_id}
                      onChange={(e) => setDeal({ ...deal, owner_user_id: e.target.value })}
                    >
                      <option value="">المستخدم الحالي تلقائيًا</option>
                      {assignees.map((user) => (
                        <option key={user.id} value={user.id}>
                          {[user.first_name, user.last_name].filter(Boolean).join(' ') || user.username}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="crm-form-group">
                    <label className="crm-form-label">تاريخ الإغلاق المتوقع</label>
                    <input
                      className="crm-form-input"
                      type="date"
                      value={deal.expected_close_date}
                      onChange={(e) => setDeal({ ...deal, expected_close_date: e.target.value })}
                    />
                  </div>

                  <div className="crm-form-group full-width">
                    <label className="crm-form-label">ملاحظات الصفقة</label>
                    <textarea
                      className="crm-form-textarea"
                      rows="3"
                      value={deal.notes}
                      onChange={(e) => setDeal({ ...deal, notes: e.target.value })}
                      placeholder="أية تفاصيل إضافية عن شروط الدفع أو التسليم..."
                    />
                  </div>
                </div>
              </div>
              <div className="crm-modal-footer">
                <button type="button" className="secondary-btn" onClick={() => setShowDealModal(false)}>إلغاء</button>
                <button type="submit" className="primary-btn">إنشاء الصفقة</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manage Stages Modal */}
      {showStageModal && (
        <div className="crm-modal-backdrop" onClick={() => setShowStageModal(false)}>
          <div className="crm-modal-box crm-stages-modal" onClick={(e) => e.stopPropagation()}>
            <div className="crm-modal-header">
              <h3>إدارة مراحل خط المبيعات (Pipeline Stages)</h3>
              <button type="button" className="crm-modal-close" onClick={() => setShowStageModal(false)}>✕</button>
            </div>
            <div className="crm-modal-body">
              {/* Add Stage Form */}
              <form onSubmit={createStage} className="crm-add-stage-form">
                <h4 className="crm-form-section-heading">+ إضافة مرحلة جديدة</h4>
                <div className="crm-form-grid">
                  <div className="crm-form-group">
                    <label className="crm-form-label">اسم المرحلة <span className="required">*</span></label>
                    <input
                      className="crm-form-input"
                      value={newStageLabel}
                      onChange={(e) => setNewStageLabel(e.target.value)}
                      required
                      maxLength={80}
                      placeholder="مثال: تقديم العرض الفني"
                    />
                  </div>
                  <div className="crm-form-group">
                    <label className="crm-form-label">احتمالية الإغلاق (%)</label>
                    <input
                      className="crm-form-input"
                      type="number"
                      min="0"
                      max="100"
                      value={newStageProbability}
                      onChange={(e) => setNewStageProbability(e.target.value)}
                      required
                    />
                  </div>
                  <div className="crm-form-group">
                    <label className="crm-form-label">نوع النتيجة</label>
                    <select
                      className="crm-form-select"
                      value={newStageOutcome}
                      onChange={(e) => setNewStageOutcome(e.target.value)}
                    >
                      <option value="open">مرحلة تفاوض مفتوحة</option>
                      <option value="won">صفقة رابحة (Won)</option>
                      <option value="lost">صفقة خاسرة (Lost)</option>
                    </select>
                  </div>
                  <div className="crm-form-group crm-form-submit">
                    <button type="submit" className="primary-btn">
                      إضافة المرحلة
                    </button>
                  </div>
                </div>
              </form>

              {/* Stages List */}
              <h4 className="crm-form-section-heading">المراحل الحالية</h4>
              <div className="crm-table-card">
                <table className="crm-table">
                  <thead>
                    <tr>
                      <th>اسم المرحلة</th>
                      <th>الاحتمالية %</th>
                      <th>نوع المرحلة</th>
                      <th>الحالة</th>
                      <th>الإجراء</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stages.map((stage) => {
                      const draft = stageDrafts[stage.id] || stage;
                      return (
                        <tr key={stage.id}>
                          <td>
                            <input
                              value={draft.label}
                              onChange={(e) => setStageDrafts({
                                ...stageDrafts,
                                [stage.id]: { ...draft, label: e.target.value },
                              })}
                            />
                          </td>
                          <td className="crm-probability-cell">
                            <input
                              type="number"
                              max="100"
                              className="crm-form-input crm-compact-input"
                              value={draft.probability}
                              onChange={(e) => setStageDrafts({
                                ...stageDrafts,
                                [stage.id]: { ...draft, probability: e.target.value },
                              })}
                            />
                          </td>
                          <td>
                            <span className={`crm-badge ${stage.outcome === 'won' ? 'converted' : stage.outcome === 'lost' ? 'lost' : 'open'}`}>
                              {stage.outcome === 'won' ? 'رابحة' : stage.outcome === 'lost' ? 'خاسرة' : 'مفتوحة'}
                            </span>
                          </td>
                          <td>
                            <label className="crm-form-checkbox-label">
                              <input
                                type="checkbox"
                                checked={draft.is_active !== undefined ? draft.is_active : stage.is_active}
                                onChange={(e) => setStageDrafts({
                                  ...stageDrafts,
                                  [stage.id]: { ...draft, is_active: e.target.checked },
                                })}
                              />
                              مفعلة
                            </label>
                          </td>
                          <td>
                            <button
                              type="button"
                              className="secondary-btn crm-compact-button"
                              onClick={() => saveStage(stage)}
                            >
                              حفظ
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="crm-modal-footer">
              <button type="button" className="secondary-btn" onClick={() => setShowStageModal(false)}>
                تم
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SalesPipelineBoard;
