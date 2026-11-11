import { useState, useEffect } from 'react';
import * as crmApi from '../../api/crm.js';
import * as customersApi from '../../api/customers.js';
import CRMHeader from './CRMHeader.jsx';
import { ClockIcon, KanbanIcon, PlusIcon, SlidersIcon } from '../icons/PosIcons.jsx';
import { agoText, daysBetween, initials, money, num, parseDbDate, shortDate } from './crmFormat.js';
import '../../styles/crm-overview.css';

const DEFAULT_STALE_DAYS = 7;
const EMPTY_DEAL = { title: '', customer_id: '', expected_value: '', owner_user_id: '', expected_close_date: '', notes: '', pipeline_stage_id: '' };

function daysInStage(opp) {
  const changedAt = parseDbDate(opp.last_stage_changed_at || opp.updated_at || opp.created_at);
  return changedAt ? daysBetween(changedAt) : 0;
}

function SalesPipelineBoard({ crmTabs = null }) {
  const [opportunities, setOpportunities] = useState([]);
  const [stages, setStages] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [assignees, setAssignees] = useState([]);
  const [newStageLabel, setNewStageLabel] = useState('');
  const [newStageProbability, setNewStageProbability] = useState(30);
  const [newStageOutcome, setNewStageOutcome] = useState('open');
  const [stageDrafts, setStageDrafts] = useState({});
  const [deal, setDeal] = useState(EMPTY_DEAL);
  const [staleDays, setStaleDays] = useState(DEFAULT_STALE_DAYS);
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
        crmApi.getAllCRMOpportunities(),
        crmApi.getCRMPipelineStages(),
        crmApi.getCRMAssignees(),
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
    customersApi.getAllCustomersWithStats()
      .then((list) => setCustomers(list || []))
      .catch((err) => setError(err.message || 'تعذر تحميل قائمة العملاء'));
    // Optional: only sets the "stale deal" threshold, so a failure keeps the default.
    crmApi.getCRMAutomationRules()
      .then((rules) => {
        const days = Number((rules || []).find((rule) => rule.trigger_type === 'opportunity_stale')?.config?.days);
        if (days > 0) setStaleDays(days);
      })
      .catch(() => {});
  }, []);

  const openDealModal = (stageId = '') => {
    setDeal({ ...EMPTY_DEAL, pipeline_stage_id: stageId });
    setShowDealModal(true);
  };

  const handleStageChange = async (oppId, stageId) => {
    try {
      await crmApi.moveCRMOpportunity(Number(oppId), Number(stageId));
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
      await crmApi.assignCRMOpportunity(oppId, ownerUserId);
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
      await crmApi.createCRMPipelineStage({
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
      await crmApi.updateCRMPipelineStage({
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
    const targetStage = stages.find((stage) => stage.is_active && stage.outcome === 'open'
      && (!deal.pipeline_stage_id || stage.id === deal.pipeline_stage_id));
    if (!targetStage) {
      setError('يرجى التأكد من وجود مرحلة بيع مفتوحة أولاً.');
      return;
    }
    try {
      await crmApi.createCRMAdvancedOpportunity({
        ...deal,
        customer_id: Number(deal.customer_id),
        expected_value: Number(deal.expected_value || 0),
        pipeline_stage_id: targetStage.id,
      });
      setDeal(EMPTY_DEAL);
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

  const activeStages = stages.filter((stage) => stage.is_active);
  const openDeals = opportunities.filter((opp) => !['won', 'lost'].includes(opp.stage));
  const staleCount = openDeals.filter((opp) => daysInStage(opp) > staleDays).length;
  const openStageIndex = new Map(activeStages.filter((stage) => stage.outcome === 'open').map((stage, index) => [stage.id, index]));

  return (
    <div className="crm-ds crm-pl">
      <CRMHeader icon={KanbanIcon} title="خط الصفقات" subtitle="اسحب الصفقة من مرحلة للي بعدها عشان تتابع تقدم التفاوض.">
        <button type="button" className="crm-ov-btn" onClick={() => setShowStageModal(true)}>
          <SlidersIcon size={18} />
          إدارة مراحل البيع
        </button>
        <button type="button" className="crm-ov-btn crm-ov-btn--primary" onClick={() => openDealModal()}>
          <PlusIcon size={18} />
          صفقة جديدة
        </button>
      </CRMHeader>
      {crmTabs}

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

      {!loading && activeStages.length > 0 && (
        <div className="crm-ov-card crm-pl-summary">
          <span className="crm-pl-summary-label">إجمالي الصفقات المفتوحة</span>
          <strong>{num(openDeals.length)} صفقة · {money(openDeals.reduce((sum, opp) => sum + Number(opp.expected_value || 0), 0))}</strong>
          {staleCount > 0 && (
            <span className="crm-pl-summary-stale">
              <ClockIcon size={16} />
              {num(staleCount)} صفقات واقفة أكثر من {num(staleDays)} أيام
            </span>
          )}
        </div>
      )}

      {loading ? (
        <div className="crm-ov-card crm-pl-note">جارٍ تحميل لوحة المبيعات...</div>
      ) : activeStages.length === 0 ? (
        <div className="crm-ov-card crm-pl-note">
          <div className="crm-ov-empty">
            <span className="crm-ov-chip crm-ov-chip--lg"><KanbanIcon size={22} /></span>
            <strong>لا توجد مراحل مسجلة لخط المبيعات</strong>
            <p>أضف مراحل البيع الخاصة بك (تواصل، تأهيل، عرض سعر، صفقة رابحة).</p>
            <button type="button" className="crm-ov-btn crm-ov-btn--primary" onClick={() => setShowStageModal(true)}>
              <PlusIcon size={18} />
              إعداد مراحل البيع
            </button>
          </div>
        </div>
      ) : (
        <div className="crm-pl-board">
          {activeStages.map((stage) => {
            const stageOpps = getStageOpportunities(stage);
            const outcome = stage.outcome || 'open';
            // Open stages darken in order (like the overview bars); won is green, lost is grey.
            const tone = outcome === 'open' ? 45 + Math.min(openStageIndex.get(stage.id) ?? 0, 3) * 18 : 100;

            return (
              <section
                key={stage.id}
                className={`crm-ov-card crm-pl-col crm-pl-col--${outcome} ${dragOverStageId === stage.id ? 'is-drop' : ''}`}
                style={{ '--stage-tone': `${tone}%` }}
                aria-label={stage.label}
                onDragOver={(e) => handleDragOver(e, stage.id)}
                onDragLeave={(e) => handleDragLeave(e, stage.id)}
                onDrop={(e) => handleDrop(e, stage.id)}
              >
                <header className="crm-pl-col-head">
                  <div className="crm-pl-col-title">
                    <h2>{stage.label}</h2>
                    <span className="crm-pl-count">{num(stageOpps.length)}</span>
                  </div>
                  <div className="crm-pl-col-stats">
                    <span>نسبة الإغلاق {num(stage.probability)}٪</span>
                    <strong>{money(getOppValueForStage(stage))}</strong>
                  </div>
                </header>

                <div className="crm-pl-cards">
                  {stageOpps.length === 0 && <p className="crm-pl-drop-hint">اسحب صفقة وضعها هنا</p>}
                  {stageOpps.map((opp) => {
                    const days = daysInStage(opp);
                    const stale = outcome === 'open' && days > staleDays;
                    const closedAt = parseDbDate(opp.closed_at);
                    return (
                      <article
                        key={opp.id}
                        className="crm-pl-card"
                        draggable
                        onDragStart={(e) => handleDragStart(e, opp.id)}
                      >
                        <div className="crm-pl-card-head">
                          <h3 title={opp.customer_name}>{opp.title}</h3>
                          <details className="crm-pl-menu">
                            <summary aria-label={`خيارات ${opp.title}`} title="نقل الصفقة أو تغيير المسؤول">⋯</summary>
                            <div className="crm-pl-menu-body">
                              <label>
                                نقل إلى
                                <select
                                  value={opp.pipeline_stage_id || ''}
                                  onChange={(e) => handleStageChange(opp.id, e.target.value)}
                                >
                                  <option value="" disabled>اختر المرحلة</option>
                                  {activeStages.map((nextStage) => (
                                    <option key={nextStage.id} value={nextStage.id}>{nextStage.label}</option>
                                  ))}
                                </select>
                              </label>
                              <label>
                                المسؤول
                                <select
                                  value={opp.user_id || ''}
                                  onChange={(e) => e.target.value && handleOwnerChange(opp.id, Number(e.target.value))}
                                >
                                  {!opp.user_id && <option value="">غير معيّن</option>}
                                  {assignees.map((user) => (
                                    <option key={user.id} value={user.id}>
                                      {[user.first_name, user.last_name].filter(Boolean).join(' ') || user.username}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            </div>
                          </details>
                        </div>
                        <strong className="crm-pl-value">{money(opp.expected_value)}</strong>
                        <div className="crm-pl-card-foot">
                          <span className="crm-ov-avatar crm-pl-avatar" title={opp.assigned_username || 'غير معيّن'}>
                            {opp.assigned_username ? initials(opp.assigned_username) : '—'}
                          </span>
                          {outcome !== 'open' && closedAt ? (
                            <span className="crm-pl-age">أُغلقت {shortDate(closedAt)}</span>
                          ) : (
                            <span className={stale ? 'crm-pl-age is-stale' : 'crm-pl-age'} title="المدة في المرحلة الحالية">
                              {agoText(days)}
                            </span>
                          )}
                        </div>
                      </article>
                    );
                  })}
                  {/* New deals start in an open stage; won/lost are reached by moving a deal (that sets the close date). */}
                  {outcome === 'open' && (
                    <button type="button" className="crm-pl-add" onClick={() => openDealModal(stage.id)}>
                      + أضف صفقة
                    </button>
                  )}
                </div>
              </section>
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
