import { useState, useEffect, useCallback } from 'react';
import { useUser } from '../contexts/UserContext.jsx';
import * as enterpriseApi from '../api/enterprise.js';
import '../styles/workflows.css';

const ENTITIES_MAP = [
  { key: 'all', label: 'الكل' },
  { key: 'maintenance_ticket', label: '🛠️ تذكرة صيانة' },
  { key: 'delivery_request', label: '🚚 طلب توصيل' },
  { key: 'subscription', label: '🏋️ اشتراك' },
  { key: 'purchase_order', label: '📦 أمر شراء' },
  { key: 'return_order', label: '🔄 مرتجع' },
];

const ROLES_LIST = [
  { key: 'admin', label: 'مدير النظام' },
  { key: 'manager', label: 'مدير الفرع' },
  { key: 'cashier', label: 'الكاشير' },
  { key: 'technician', label: 'فني الصيانة' },
  { key: 'delivery_agent', label: 'مندوب التوصيل' }
];

const AUTO_ACTIONS = [
  { key: 'none', label: 'لا يوجد إجراء تلقائي' },
  { key: 'stock_deduct', label: '⚡ خصم المخزون تلقائياً' },
  { key: 'print_receipt', label: '🖨️ طباعة إيصال / تذكرة' },
  { key: 'send_notification', label: '🔔 إرسال إشعار للنظام' }
];

function parseAllowedRoles(value) {
  if (Array.isArray(value)) return { roles: value, error: null };
  if (typeof value !== 'string' || !value) return { roles: [], error: null };

  try {
    const roles = JSON.parse(value);
    if (Array.isArray(roles)) return { roles, error: null };
    return { roles: [], error: 'بيانات الأدوار ليست قائمة صالحة' };
  } catch {
    return { roles: [], error: 'تعذر قراءة بيانات الأدوار' };
  }
}

function canExecuteTransition(transition, role) {
  const { roles, error } = parseAllowedRoles(transition.allowed_roles_json);
  if (error) return false;
  return role === 'admin' || roles.length === 0 || roles.includes(role);
}

function WorkflowsPage() {
  const { currentUser } = useUser();
  const userRole = currentUser?.role || 'admin';

  const [workflows, setWorkflows] = useState([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState(null);
  const [selectedEntityFilter, setSelectedEntityFilter] = useState('all');
  const [viewMode, setViewMode] = useState('kanban'); // 'kanban', 'editor', 'list'
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toastMessage, setToastMessage] = useState(null);

  // Modals
  const [showNewTicketModal, setShowNewTicketModal] = useState(false);
  const [showNewWorkflowModal, setShowNewWorkflowModal] = useState(false);
  const [showNewStatusModal, setShowNewStatusModal] = useState(false);
  const [showTransitionModal, setShowTransitionModal] = useState(false);
  const [transitionValidationError, setTransitionValidationError] = useState('');
  const [selectedTicketForMove, setSelectedTicketForMove] = useState(null);

  // Form States
  const [newTicketForm, setNewTicketForm] = useState({
    title: '',
    customer_name: '',
    customer_phone: '',
    assigned_role: 'admin',
    notes: ''
  });

  const [newWorkflowForm, setNewWorkflowForm] = useState({
    name: '',
    entity_type: 'maintenance_ticket',
    module_key: 'general',
    description: ''
  });

  const [newStatusForm, setNewStatusForm] = useState({
    status_key: '',
    status_label: '',
    badge_color: '#3b82f6',
    step_order: 1,
    sla_hours: 24,
    is_initial: false,
    is_final: false
  });

  const [newTransitionForm, setNewTransitionForm] = useState({
    from_status_key: '',
    to_status_key: '',
    allowed_roles: ['admin', 'manager', 'cashier'],
    auto_action_type: 'none',
    sla_limit_hours: 72,
    sla_alert_message: 'تنبيه SLA: التذكرة توقفت أكثر من المدة المحددة'
  });

  useEffect(() => {
    if (selectedWorkflowId) {
      loadTickets(selectedWorkflowId);
    }
  }, [selectedWorkflowId]);

  const loadWorkflows = useCallback(async () => {
    setLoading(true);
    try {
      if (enterpriseApi.getWorkflows.isAvailable()) {
        const list = await enterpriseApi.getWorkflows();
        const safeList = list || [];
        setWorkflows(safeList);

        if (!safeList.length) {
          setSelectedWorkflowId(null);
          setTickets([]);
          return;
        }

        setSelectedWorkflowId((currentId) => {
          const selectedExists = safeList.some((workflow) => workflow.id === currentId);
          return selectedExists ? currentId : safeList[0].id;
        });
      }
    } catch (err) {
      showToast('تعذر تحميل بيانات سير العمل: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWorkflows();
  }, [loadWorkflows]);

  async function loadTickets(wfId) {
    try {
      if (enterpriseApi.getWorkflowTickets.isAvailable()) {
        const res = await enterpriseApi.getWorkflowTickets(wfId);
        setTickets(res || []);
      }
    } catch (err) {
      console.error('فشل تحميل التذاكر:', err);
    }
  }

  function showToast(msg, type = 'info') {
    setToastMessage({ text: msg, type });
    setTimeout(() => setToastMessage(null), 4000);
  }

  const activeWorkflow = workflows.find(w => w.id === selectedWorkflowId) || workflows[0] || null;

  const filteredWorkflows = workflows.filter(w => {
    if (selectedEntityFilter === 'all') return true;
    return w.entity_type === selectedEntityFilter;
  });

  const ticketMoveOptions = (() => {
    if (!selectedTicketForMove || !activeWorkflow || selectedTicketForMove.workflow_id !== activeWorkflow.id) return [];

    const otherStatuses = (activeWorkflow.statuses || []).filter(
      (status) => status.status_key !== selectedTicketForMove.current_status_key
    );
    const transitions = activeWorkflow.transitions || [];
    if (transitions.length === 0) return otherStatuses;

    const allowedTargets = transitions
      .filter((transition) => transition.from_status_key === selectedTicketForMove.current_status_key)
      .filter((transition) => canExecuteTransition(transition, userRole))
      .map((transition) => transition.to_status_key);

    return otherStatuses.filter((status) => allowedTargets.includes(status.status_key));
  })();

  async function handleResetPresets() {
    if (!window.confirm('هل أنت تأكد من إعادة ضبط سير العمل والقوالب الجاهزة إلى حالتها الافتراضية؟')) return;
    try {
      if (enterpriseApi.resetPresetWorkflows.isAvailable()) {
        const list = await enterpriseApi.resetPresetWorkflows();
        setWorkflows(list || []);
        if (list?.length) setSelectedWorkflowId(list[0].id);
        showToast('تمت إعادة ضبط القوالب الجاهزة بنجاح 🚀', 'success');
      }
    } catch (err) {
      showToast('فشلت إعادة الضبط: ' + err.message, 'error');
    }
  }

  async function handleCreateTicket(e) {
    e.preventDefault();
    if (!activeWorkflow || !newTicketForm.title) return;

    const initialStatus = activeWorkflow.statuses?.find(s => s.is_initial) || activeWorkflow.statuses?.[0];
    if (!initialStatus) {
      showToast('خطأ: لا يوجد حالات معرفة في سير العمل هذا', 'error');
      return;
    }

    try {
      if (enterpriseApi.createWorkflowTicket.isAvailable()) {
        await enterpriseApi.createWorkflowTicket({
          workflow_id: activeWorkflow.id,
          entity_type: activeWorkflow.entity_type,
          title: newTicketForm.title,
          customer_name: newTicketForm.customer_name,
          customer_phone: newTicketForm.customer_phone,
          current_status_key: initialStatus.status_key,
          assigned_role: newTicketForm.assigned_role,
          notes: newTicketForm.notes
        });
        showToast('تمت إضافة التذكرة بنجاح 📋', 'success');
        setShowNewTicketModal(false);
        setNewTicketForm({ title: '', customer_name: '', customer_phone: '', assigned_role: 'admin', notes: '' });
        loadTickets(activeWorkflow.id);
        loadWorkflows();
      }
    } catch (err) {
      showToast('تعذر إضافة التذكرة: ' + err.message, 'error');
    }
  }

  async function handleMoveTicket(ticketId, targetStatusKey) {
    try {
      if (enterpriseApi.updateTicketStatus.isAvailable()) {
        await enterpriseApi.updateTicketStatus(ticketId, activeWorkflow.id, targetStatusKey, userRole);
        showToast(`تم تغيير حالة التذكرة بنجاح إلى (${targetStatusKey})`, 'success');
        setSelectedTicketForMove(null);
        loadTickets(activeWorkflow.id);
      }
    } catch (err) {
      showToast('تعذر تغيير الحالة: ' + err.message, 'error');
    }
  }

  async function handleCreateWorkflow(e) {
    e.preventDefault();
    if (!newWorkflowForm.name) return;
    try {
      if (enterpriseApi.createWorkflow.isAvailable()) {
        const created = await enterpriseApi.createWorkflow(newWorkflowForm);
        showToast('تم إنشاء مسار سير العمل الجديد بنجاح', 'success');
        setShowNewWorkflowModal(false);
        setNewWorkflowForm({ name: '', entity_type: 'maintenance_ticket', module_key: 'general', description: '' });
        await loadWorkflows();
        if (created?.id) setSelectedWorkflowId(created.id);
      }
    } catch (err) {
      showToast('فشل إنشاء سير العمل: ' + err.message, 'error');
    }
  }

  async function handleAddStatus(e) {
    e.preventDefault();
    if (!activeWorkflow || !newStatusForm.status_key || !newStatusForm.status_label) return;
    try {
      if (enterpriseApi.addWorkflowStatus.isAvailable()) {
        await enterpriseApi.addWorkflowStatus(activeWorkflow.id, newStatusForm);
        showToast('تمت إضافة الحالة بنجاح', 'success');
        setShowNewStatusModal(false);
        setNewStatusForm({ status_key: '', status_label: '', badge_color: '#3b82f6', step_order: 1, sla_hours: 24, is_initial: false, is_final: false });
        loadWorkflows();
      }
    } catch (err) {
      showToast('فشل إضافة الحالة: ' + err.message, 'error');
    }
  }

  async function handleAddTransition(e) {
    e.preventDefault();
    if (!activeWorkflow) return;

    const statuses = activeWorkflow.statuses || [];
    const fromStatus = statuses.find((status) => status.status_key === newTransitionForm.from_status_key);
    const toStatus = statuses.find((status) => status.status_key === newTransitionForm.to_status_key);
    if (!fromStatus || !toStatus) {
      setTransitionValidationError('اختر حالة بداية وحالة هدف موجودتين في هذا المسار.');
      return;
    }
    if (fromStatus.status_key === toStatus.status_key) {
      setTransitionValidationError('لا يمكن أن تكون حالة البداية هي نفسها الحالة الهدف.');
      return;
    }
    if (!newTransitionForm.allowed_roles.length) {
      setTransitionValidationError('حدد دوراً واحداً على الأقل لتنفيذ هذا الانتقال.');
      return;
    }

    const slaLimitHours = Number(newTransitionForm.sla_limit_hours);
    if (!Number.isFinite(slaLimitHours) || slaLimitHours < 0) {
      setTransitionValidationError('أدخل مدة SLA صحيحة تساوي صفراً أو أكثر.');
      return;
    }

    const currentTransitions = activeWorkflow.transitions || [];
    if (currentTransitions.some((transition) => (
      transition.from_status_key === fromStatus.status_key
      && transition.to_status_key === toStatus.status_key
    ))) {
      setTransitionValidationError('هذا الانتقال موجود بالفعل في المسار.');
      return;
    }

    setTransitionValidationError('');
    const updatedTransitions = [
      ...currentTransitions,
      {
        from_status_key: fromStatus.status_key,
        to_status_key: toStatus.status_key,
        allowed_roles_json: newTransitionForm.allowed_roles,
        auto_action_type: newTransitionForm.auto_action_type,
        sla_limit_hours: slaLimitHours,
        sla_alert_message: newTransitionForm.sla_alert_message
      }
    ];

    try {
      if (enterpriseApi.saveWorkflowTransitions.isAvailable()) {
        await enterpriseApi.saveWorkflowTransitions(activeWorkflow.id, updatedTransitions);
        showToast('تم تحديث وانتقالات سير العمل والأتمتة بنجاح ⚡', 'success');
        setShowTransitionModal(false);
        loadWorkflows();
      }
    } catch (err) {
      showToast('تعذر حفظ الانتقال: ' + err.message, 'error');
    }
  }

  function calculateSLAStatus(enteredAt, slaHours) {
    if (!slaHours || slaHours <= 0) return { isOverdue: false, text: 'بدون SLA' };

    const enteredTime = new Date(enteredAt || Date.now()).getTime();
    const now = Date.now();
    const diffHours = (now - enteredTime) / (1000 * 60 * 60);

    if (diffHours >= slaHours) {
      const daysOverdue = Math.floor(diffHours / 24);
      return {
        isOverdue: true,
        text: `⚠️ متأخر! (مضى ${daysOverdue >= 1 ? `${daysOverdue} يوم` : `${Math.floor(diffHours)} ساعة`})`
      };
    } else {
      const remainingHours = Math.ceil(slaHours - diffHours);
      const remainingDays = Math.ceil(remainingHours / 24);
      return {
        isOverdue: false,
        text: `🟢 ضمن الوقت (باقي ${remainingDays > 1 ? `${remainingDays} يوم` : `${remainingHours} ساعة`})`
      };
    }
  }

  if (loading) {
    return (
      <div className="workflows-page" style={{ textAlign: 'center', paddingTop: '60px' }}>
        <h2>🔄 جاري تحميل محرك سير العمل واللوحات...</h2>
      </div>
    );
  }

  return (
    <div className="workflows-page">
      {toastMessage && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          left: '24px',
          backgroundColor: toastMessage.type === 'error' ? '#ef4444' : '#10b981',
          color: '#ffffff',
          padding: '12px 20px',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          zIndex: 9999,
          fontWeight: 'bold'
        }}>
          {toastMessage.text}
        </div>
      )}
      {!workflows.length ? (
        <div style={{ padding: '32px 24px' }}>
          <div style={{ backgroundColor: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '14px', padding: '28px', textAlign: 'center' }}>
            <h2 style={{ marginBottom: '10px' }}>📋 لا توجد مسارات عمل مفعلة</h2>
            <p style={{ color: '#6b7280', marginBottom: '18px' }}>
              ابدأ بإنشاء مسار عمل واحد ثم أضف حالات وتذاكر للوصول إلى لوحة Kanban.
            </p>
            <button type="button" className="primary-btn" onClick={() => setShowNewWorkflowModal(true)}>
              ➕ إنشاء مسار عمل جديد
            </button>
          </div>
        </div>
      ) : (
      <>
      {/* Header Bar */}
      <div className="workflows-header">
        <div className="workflows-title-section">
          <h2>🔄 إدارة سير العمل والتذاكر (Dynamic Workflows & Kanban)</h2>
          <p>متابعة وتتبع دورة حياة الصيانة، الطلبات، الاشتراكات والخدمات مع مؤشرات SLA وإجراءات تلقائية</p>
        </div>

        <div className="workflows-actions-bar">
          <button
            type="button"
            className="secondary-btn"
            style={{ backgroundColor: '#fef3c7', color: '#92400e', borderColor: '#fde68a', fontWeight: 'bold' }}
            onClick={handleResetPresets}
          >
            ⚡ إعادة تحميل القوالب الجاهزة
          </button>

          <button
            type="button"
            className="primary-btn"
            onClick={() => setShowNewTicketModal(true)}
            disabled={!activeWorkflow}
          >
            ➕ إضافة تذكرة / طلب جديد
          </button>
        </div>
      </div>

      {/* Entity Filters & Selector */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
        <div className="entity-filter-tabs">
          {ENTITIES_MAP.map(ent => (
            <button
              key={ent.key}
              type="button"
              className={`entity-filter-btn ${selectedEntityFilter === ent.key ? 'active' : ''}`}
              onClick={() => setSelectedEntityFilter(ent.key)}
            >
              {ent.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <label style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#4b5563' }}>اختر مسار سير العمل:</label>
          <select
            value={selectedWorkflowId || ''}
            onChange={(e) => setSelectedWorkflowId(Number(e.target.value))}
            style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #d1d5db', background: '#fff', fontSize: '0.9rem', fontWeight: 'bold' }}
          >
            {filteredWorkflows.map(wf => (
              <option key={wf.id} value={wf.id}>
                {wf.name} ({wf.entity_type})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* View Mode Navigation Tabs */}
      <div className="view-mode-tabs">
        <button
          type="button"
          className={`view-tab-btn ${viewMode === 'kanban' ? 'active' : ''}`}
          onClick={() => setViewMode('kanban')}
        >
          📊 لوحة كأنبان التفاعلية (Kanban Board)
        </button>

        <button
          type="button"
          className={`view-tab-btn ${viewMode === 'editor' ? 'active' : ''}`}
          onClick={() => setViewMode('editor')}
        >
          ⚙️ محرر الحالات والانتقالات وSLA (Editor)
        </button>

        <button
          type="button"
          className={`view-tab-btn ${viewMode === 'list' ? 'active' : ''}`}
          onClick={() => setViewMode('list')}
        >
          📂 قائمة وقوالب المسارات (Workflows List)
        </button>
      </div>

      {/* VIEW 1: KANBAN BOARD */}
      {viewMode === 'kanban' && activeWorkflow && (
        <div>
          <div style={{ backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', padding: '12px 16px', borderRadius: '10px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ fontWeight: 'bold', color: '#1e40af' }}>📌 المسار النشط: {activeWorkflow.name}</span>
              <span style={{ margin: '0 10px', color: '#60a5fa' }}>|</span>
              <span style={{ fontSize: '0.85rem', color: '#1e3a8a' }}>الكيان: {activeWorkflow.entity_type}</span>
            </div>
            <div style={{ fontSize: '0.85rem', color: '#1e40af', fontWeight: 'bold' }}>
              إجمالي التذاكر: {tickets.length}
            </div>
          </div>

          {!activeWorkflow.statuses?.length ? (
            <div style={{ backgroundColor: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '28px', textAlign: 'center' }}>
              <h3 style={{ margin: '0 0 8px' }}>أضف حالة أولاً</h3>
              <p style={{ color: '#6b7280', margin: '0 0 16px' }}>لا يمكن إنشاء التذاكر أو عرضها قبل إعداد مراحل هذا المسار.</p>
              <button type="button" className="primary-btn" onClick={() => setShowNewStatusModal(true)}>
                ➕ إضافة حالة
              </button>
            </div>
          ) : tickets.length === 0 ? (
            <div style={{ backgroundColor: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '28px', textAlign: 'center' }}>
              <h3 style={{ margin: '0 0 8px' }}>لا توجد تذاكر</h3>
              <p style={{ color: '#6b7280', margin: '0 0 16px' }}>أضف أول تذكرة لهذا المسار لبدء المتابعة.</p>
              <button type="button" className="primary-btn" onClick={() => setShowNewTicketModal(true)}>
                ➕ إضافة تذكرة
              </button>
            </div>
          ) : (
          <div className="kanban-board-container">
            {activeWorkflow.statuses.map(status => {
              const statusTickets = tickets.filter(t => t.current_status_key === status.status_key);

              return (
                <div key={status.id} className="kanban-column">
                  <div className="kanban-column-header" style={{ borderTopColor: status.badge_color || '#3b82f6' }}>
                    <div className="column-title">
                      <span className="column-badge" style={{ backgroundColor: status.badge_color || '#3b82f6' }}>
                        {status.status_label}
                      </span>
                    </div>
                    <span className="column-tickets-count">{statusTickets.length}</span>
                  </div>

                  <div className="kanban-tickets-list">
                    {statusTickets.map(t => {
                      const slaInfo = calculateSLAStatus(t.entered_current_status_at, status.sla_hours);

                      return (
                        <div key={t.id} className="ticket-card" onClick={() => setSelectedTicketForMove(t)}>
                          <div className="ticket-card-header">
                            <span className="ticket-number">{t.ticket_number}</span>
                            <span className="ticket-entity-tag">{t.entity_type}</span>
                          </div>

                          <h4 className="ticket-title">{t.title}</h4>

                          <div className="ticket-meta-info">
                            {t.customer_name && (
                              <div className="ticket-meta-item">
                                👤 <strong>العميل:</strong> {t.customer_name} {t.customer_phone ? `(${t.customer_phone})` : ''}
                              </div>
                            )}
                            {t.notes && (
                              <div className="ticket-meta-item" style={{ color: '#4b5563', fontStyle: 'italic' }}>
                                💬 {t.notes}
                              </div>
                            )}
                          </div>

                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span className={`sla-badge ${slaInfo.isOverdue ? 'overdue' : 'ok'}`}>
                              {slaInfo.text}
                            </span>

                            <button
                              type="button"
                              className="move-status-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedTicketForMove(t);
                              }}
                            >
                              نقل المرحلة ➔
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    {statusTickets.length === 0 && (
                      <div style={{ textAlign: 'center', padding: '24px 12px', color: '#9ca3af', fontSize: '0.85rem' }}>
                        لا يوجد تذاكر حالياً
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          )}
        </div>
      )}

      {/* VIEW 2: VISUAL WORKFLOW & TRANSITIONS EDITOR */}
      {viewMode === 'editor' && activeWorkflow && (
        <div>
          <div className="workflow-editor-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h3 style={{ margin: '0 0 4px' }}>📌 مراحل سير العمل الحالية ({activeWorkflow.name})</h3>
                <p style={{ margin: 0, color: '#6b7280', fontSize: '0.85rem' }}>
                  يمكنك إضافة أو تعديل حالات الانتقال وزمن SLA المسموح لكل مرحلة
                </p>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="button" className="secondary-btn" onClick={() => setShowNewStatusModal(true)}>
                  ➕ إضافة حالة جديدة
                </button>

                <button
                  type="button"
                  className="primary-btn"
                  onClick={() => {
                    setTransitionValidationError('');
                    setNewTransitionForm((current) => ({
                      ...current,
                      from_status_key: activeWorkflow.statuses?.[0]?.status_key || '',
                      to_status_key: activeWorkflow.statuses?.[1]?.status_key || ''
                    }));
                    setShowTransitionModal(true);
                  }}
                  disabled={(activeWorkflow.statuses || []).length < 2}
                >
                  ⚡ إضافة شرط انتقال وأتمتة
                </button>
              </div>
            </div>

            {/* Visual Steps Timeline */}
            <div className="status-flow-timeline">
              {!activeWorkflow.statuses?.length ? (
                <div style={{ padding: '20px', textAlign: 'center', color: '#6b7280' }}>
                  <p style={{ margin: '0 0 12px' }}>أضف حالة أولاً لتهيئة مراحل هذا المسار.</p>
                  <button type="button" className="primary-btn" onClick={() => setShowNewStatusModal(true)}>
                    ➕ إضافة حالة
                  </button>
                </div>
              ) : activeWorkflow.statuses.map((st, idx) => (
                <div key={st.id} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div className="status-step-node" style={{ borderColor: st.badge_color || '#3b82f6' }}>
                    <span style={{
                      backgroundColor: st.badge_color || '#3b82f6',
                      color: '#ffffff',
                      padding: '4px 10px',
                      borderRadius: '12px',
                      fontSize: '0.8rem',
                      fontWeight: 'bold',
                      display: 'inline-block',
                      marginBottom: '6px'
                    }}>
                      مرحلة {st.step_order || idx + 1}
                    </span>

                    <h4 style={{ margin: '4px 0', fontSize: '0.95rem' }}>{st.status_label}</h4>
                    <p style={{ margin: 0, fontSize: '0.75rem', color: '#6b7280' }}>({st.status_key})</p>

                    {st.sla_hours > 0 && (
                      <span style={{ fontSize: '0.75rem', color: '#d97706', fontWeight: 'bold', display: 'block', marginTop: '6px' }}>
                        ⏱️ SLA: {st.sla_hours} ساعة
                      </span>
                    )}
                  </div>

                  {idx < activeWorkflow.statuses.length - 1 && (
                    <span className="status-step-arrow">➔</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Transitions & Rules Matrix */}
          <div className="workflow-editor-card">
            <h4 style={{ margin: '0 0 12px' }}>⚡ قواعد الانتقالات والإجراءات التلقائية (Transition Rules & Automations)</h4>
            <table className="transitions-table">
              <thead>
                <tr>
                  <th>من حالة</th>
                  <th>إلى حالة</th>
                  <th>الأدوار المصرح لها (Who Can Execute)</th>
                  <th>الإجراء التلقائي (Auto Action)</th>
                  <th>مؤقت SLA والتنبيه</th>
                </tr>
              </thead>
              <tbody>
                {activeWorkflow.transitions?.map(t => (
                  <tr key={t.id}>
                    <td><strong>{t.from_status_key}</strong></td>
                    <td><strong>➔ {t.to_status_key}</strong></td>
                    <td>
                      {(() => {
                        const { roles, error } = parseAllowedRoles(t.allowed_roles_json);
                        return error
                          ? <span role="alert" className="role-tag">{error}</span>
                          : roles.map(r => <span key={r} className="role-tag">{r}</span>);
                      })()}
                    </td>
                    <td>
                      <span className="auto-action-badge">
                        {AUTO_ACTIONS.find(a => a.key === t.auto_action_type)?.label || t.auto_action_type}
                      </span>
                    </td>
                    <td>
                      {t.sla_limit_hours > 0 ? (
                        <span style={{ color: '#d97706', fontWeight: 'bold' }}>
                          ⏱️ {t.sla_limit_hours} ساعة ({t.sla_alert_message || 'تنبيه SLA'})
                        </span>
                      ) : (
                        <span style={{ color: '#9ca3af' }}>غير محدد</span>
                      )}
                    </td>
                  </tr>
                ))}

                {(!activeWorkflow.transitions || activeWorkflow.transitions.length === 0) && (
                  <tr>
                    <td colSpan="5" style={{ textAlign: 'center', color: '#9ca3af' }}>
                      لم يتم تعيين أي قواعد انتقال ديناميكية مخصصة حتى الآن
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW 3: WORKFLOWS LIST */}
      {viewMode === 'list' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0 }}>📂 دليل سير العمل المعرّف في النظام</h3>
            <button type="button" className="primary-btn" onClick={() => setShowNewWorkflowModal(true)}>
              ➕ إنشاء مسار عمل جديد
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
            {workflows.map(wf => (
              <div
                key={wf.id}
                style={{
                  backgroundColor: '#ffffff',
                  border: wf.id === selectedWorkflowId ? '2px solid #2563eb' : '1px solid #e5e7eb',
                  borderRadius: '12px',
                  padding: '16px',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <h4 style={{ margin: 0, fontSize: '1.05rem', color: '#111827' }}>📌 {wf.name}</h4>
                  <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '10px', backgroundColor: '#eff6ff', color: '#D35400', fontWeight: 'bold' }}>
                    {wf.entity_type}
                  </span>
                </div>

                <p style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '14px' }}>{wf.description}</p>

                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '16px' }}>
                  {wf.statuses?.map(st => (
                    <span
                      key={st.id}
                      style={{
                        backgroundColor: st.badge_color || '#3b82f6',
                        color: '#ffffff',
                        padding: '2px 8px',
                        borderRadius: '12px',
                        fontSize: '0.75rem',
                        fontWeight: 'bold'
                      }}
                    >
                      {st.status_label}
                    </span>
                  ))}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #f3f4f6', paddingTop: '10px' }}>
                  <span style={{ fontSize: '0.8rem', color: '#4b5563' }}>
                    عدد التذاكر النشطة: <strong>{wf.ticketsCount || 0}</strong>
                  </span>

                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={() => {
                      setSelectedWorkflowId(wf.id);
                      setViewMode('kanban');
                    }}
                  >
                    فتح في لوحة Kanban ➔
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      </>
      )}

      {/* MODAL 1: ADD NEW TICKET */}
      {showNewTicketModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
          <div style={{ backgroundColor: '#ffffff', padding: '24px', borderRadius: '12px', width: '90%', maxWidth: '500px' }}>
            <h3 style={{ margin: '0 0 16px' }}>📋 إضافة تذكرة / طلب جديد ({activeWorkflow?.name})</h3>

            <form onSubmit={handleCreateTicket} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '4px' }}>عنوان التذكرة / الطلب:</label>
                <input
                  type="text"
                  placeholder="مثال: تغيير شاشة آيفون / طلب توصيل عاجل"
                  value={newTicketForm.title}
                  onChange={(e) => setNewTicketForm({ ...newTicketForm, title: e.target.value })}
                  required
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ccc' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '4px' }}>اسم العميل / المستفيد:</label>
                <input
                  type="text"
                  placeholder="اسم العميل"
                  value={newTicketForm.customer_name}
                  onChange={(e) => setNewTicketForm({ ...newTicketForm, customer_name: e.target.value })}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ccc' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '4px' }}>رقم الهاتف:</label>
                <input
                  type="text"
                  placeholder="01xxxxxxxxx"
                  value={newTicketForm.customer_phone}
                  onChange={(e) => setNewTicketForm({ ...newTicketForm, customer_phone: e.target.value })}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ccc' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '4px' }}>الدور المسؤول (Assigned Role):</label>
                <select
                  value={newTicketForm.assigned_role}
                  onChange={(e) => setNewTicketForm({ ...newTicketForm, assigned_role: e.target.value })}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ccc' }}
                >
                  {ROLES_LIST.map(r => (
                    <option key={r.key} value={r.key}>{r.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '4px' }}>ملاحظات / وصف العطل أو الطلب:</label>
                <textarea
                  rows="3"
                  placeholder="ملاحظات توضيحية..."
                  value={newTicketForm.notes}
                  onChange={(e) => setNewTicketForm({ ...newTicketForm, notes: e.target.value })}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ccc' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
                <button type="button" className="secondary-btn" onClick={() => setShowNewTicketModal(false)}>إلغاء</button>
                <button type="submit" className="primary-btn">حفظ وإضافة</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: MOVE TICKET TO NEXT STATUS */}
      {selectedTicketForMove && activeWorkflow && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
          <div style={{ backgroundColor: '#ffffff', padding: '24px', borderRadius: '12px', width: '90%', maxWidth: '450px' }}>
            <h3 style={{ margin: '0 0 8px' }}>🔄 نقل مرحلة التذكرة #{selectedTicketForMove.ticket_number}</h3>
            <p style={{ margin: '0 0 16px', color: '#6b7280', fontSize: '0.9rem' }}>{selectedTicketForMove.title}</p>

            <p style={{ fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '8px' }}>اختر المرحلة التالية للنقل:</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
              {ticketMoveOptions.map(st => (
                  <button
                    key={st.id}
                    type="button"
                    style={{
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: '1px solid #e5e7eb',
                      background: '#f9fafb',
                      display: 'flex',
                      justify: 'space-between',
                      alignItems: 'center',
                      cursor: 'pointer',
                      fontWeight: 'bold'
                    }}
                    onClick={() => handleMoveTicket(selectedTicketForMove.id, st.status_key)}
                  >
                    <span>➔ {st.status_label}</span>
                    <span style={{ fontSize: '0.75rem', backgroundColor: st.badge_color || '#3b82f6', color: '#fff', padding: '2px 8px', borderRadius: '10px' }}>
                      {st.status_key}
                    </span>
                  </button>
                ))}
              {ticketMoveOptions.length === 0 && (
                <p role="status" style={{ margin: 0, padding: '12px', color: '#6b7280', textAlign: 'center' }}>
                  لا توجد انتقالات متاحة لدورك من هذه المرحلة.
                </p>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" className="secondary-btn" onClick={() => setSelectedTicketForMove(null)}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: ADD NEW WORKFLOW */}
      {showNewWorkflowModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
          <div style={{ backgroundColor: '#ffffff', padding: '24px', borderRadius: '12px', width: '90%', maxWidth: '450px' }}>
            <h3 style={{ margin: '0 0 16px' }}>➕ إضافة مسار سير عمل جديد</h3>

            <form onSubmit={handleCreateWorkflow} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '4px' }}>اسم المسار:</label>
                <input
                  type="text"
                  placeholder="مثال: سير عمل صيانة أجهزة الألعاب"
                  value={newWorkflowForm.name}
                  onChange={(e) => setNewWorkflowForm({ ...newWorkflowForm, name: e.target.value })}
                  required
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ccc' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '4px' }}>نوع الكيان (Entity Type):</label>
                <select
                  value={newWorkflowForm.entity_type}
                  onChange={(e) => setNewWorkflowForm({ ...newWorkflowForm, entity_type: e.target.value })}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ccc' }}
                >
                  <option value="maintenance_ticket">تذكرة صيانة (maintenance_ticket)</option>
                  <option value="delivery_request">طلب توصيل (delivery_request)</option>
                  <option value="subscription">اشتراك (subscription)</option>
                  <option value="purchase_order">أمر شراء (purchase_order)</option>
                  <option value="return_order">مرتجع (return_order)</option>
                  <option value="custom">كيان مخصص (custom)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '4px' }}>الوصف:</label>
                <textarea
                  rows="2"
                  value={newWorkflowForm.description}
                  onChange={(e) => setNewWorkflowForm({ ...newWorkflowForm, description: e.target.value })}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ccc' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
                <button type="button" className="secondary-btn" onClick={() => setShowNewWorkflowModal(false)}>إلغاء</button>
                <button type="submit" className="primary-btn">إنشاء</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: ADD STATUS */}
      {showNewStatusModal && activeWorkflow && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
          <div style={{ backgroundColor: '#ffffff', padding: '24px', borderRadius: '12px', width: '90%', maxWidth: '450px' }}>
            <h3 style={{ margin: '0 0 16px' }}>➕ إضافة حالة جديدة في {activeWorkflow.name}</h3>

            <form onSubmit={handleAddStatus} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '4px' }}>مفتاح الحالة (Status Key):</label>
                <input
                  type="text"
                  placeholder="مثال: ready_for_test"
                  value={newStatusForm.status_key}
                  onChange={(e) => setNewStatusForm({ ...newStatusForm, status_key: e.target.value })}
                  required
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ccc' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '4px' }}>عنوان الحالة بالعربية:</label>
                <input
                  type="text"
                  placeholder="مثال: جاهز للتجربة"
                  value={newStatusForm.status_label}
                  onChange={(e) => setNewStatusForm({ ...newStatusForm, status_label: e.target.value })}
                  required
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ccc' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '4px' }}>لون الشارة:</label>
                  <input
                    type="color"
                    value={newStatusForm.badge_color}
                    onChange={(e) => setNewStatusForm({ ...newStatusForm, badge_color: e.target.value })}
                    style={{ width: '100%', height: '38px', borderRadius: '6px', border: '1px solid #ccc', cursor: 'pointer' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '4px' }}>حد SLA (بالساعات):</label>
                  <input
                    type="number"
                    value={newStatusForm.sla_hours}
                    onChange={(e) => setNewStatusForm({ ...newStatusForm, sla_hours: Number(e.target.value) })}
                    style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ccc' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
                <button type="button" className="secondary-btn" onClick={() => setShowNewStatusModal(false)}>إلغاء</button>
                <button type="submit" className="primary-btn">حفظ</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 5: ADD TRANSITION & AUTO ACTION */}
      {showTransitionModal && activeWorkflow && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
          <div style={{ backgroundColor: '#ffffff', padding: '24px', borderRadius: '12px', width: '90%', maxWidth: '500px' }}>
            <h3 style={{ margin: '0 0 16px' }}>⚡ إضافة شرط انتقال وأتمتة وSLA</h3>

            <form onSubmit={handleAddTransition} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '4px' }}>من حالة:</label>
                  <select
                    value={newTransitionForm.from_status_key}
                    onChange={(e) => {
                      const fromStatusKey = e.target.value;
                      setTransitionValidationError('');
                      setNewTransitionForm((current) => ({
                        ...current,
                        from_status_key: fromStatusKey,
                        to_status_key: current.to_status_key === fromStatusKey ? '' : current.to_status_key
                      }));
                    }}
                    required
                    style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ccc' }}
                  >
                    <option value="">اختر...</option>
                    {activeWorkflow.statuses?.map(s => (
                      <option key={s.id} value={s.status_key}>{s.status_label} ({s.status_key})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '4px' }}>إلى حالة:</label>
                  <select
                    value={newTransitionForm.to_status_key}
                    onChange={(e) => {
                      setTransitionValidationError('');
                      setNewTransitionForm((current) => ({ ...current, to_status_key: e.target.value }));
                    }}
                    required
                    style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ccc' }}
                  >
                    <option value="">اختر...</option>
                    {activeWorkflow.statuses?.map(s => (
                      <option key={s.id} value={s.status_key} disabled={s.status_key === newTransitionForm.from_status_key}>
                        {s.status_label} ({s.status_key})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <fieldset style={{ border: '1px solid #d1d5db', borderRadius: '8px', padding: '12px' }}>
                <legend style={{ padding: '0 6px', fontSize: '0.85rem', fontWeight: 'bold' }}>الأدوار المسموح لها</legend>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px' }}>
                  {ROLES_LIST.map((role) => (
                    <label key={role.key} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
                      <input
                        type="checkbox"
                        checked={newTransitionForm.allowed_roles.includes(role.key)}
                        onChange={(e) => {
                          setTransitionValidationError('');
                          setNewTransitionForm((current) => ({
                            ...current,
                            allowed_roles: e.target.checked
                              ? [...current.allowed_roles, role.key]
                              : current.allowed_roles.filter((key) => key !== role.key)
                          }));
                        }}
                      />
                      {role.label}
                    </label>
                  ))}
                </div>
              </fieldset>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '4px' }}>الإجراء التلقائي (Auto Action):</label>
                <select
                  value={newTransitionForm.auto_action_type}
                  onChange={(e) => setNewTransitionForm({ ...newTransitionForm, auto_action_type: e.target.value })}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ccc' }}
                >
                  {AUTO_ACTIONS.map(a => (
                    <option key={a.key} value={a.key}>{a.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '4px' }}>مؤقت SLA المسموح لهذا الانتقال (بالساعات):</label>
                <input
                  type="number"
                  min="0"
                  placeholder="مثال: 72 ساعة (3 أيام)"
                  value={newTransitionForm.sla_limit_hours}
                  onChange={(e) => {
                    setTransitionValidationError('');
                    setNewTransitionForm({ ...newTransitionForm, sla_limit_hours: e.target.value });
                  }}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ccc' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '4px' }}>رسالة تنبيه تجاوز SLA:</label>
                <input
                  type="text"
                  value={newTransitionForm.sla_alert_message}
                  onChange={(e) => setNewTransitionForm({ ...newTransitionForm, sla_alert_message: e.target.value })}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ccc' }}
                />
              </div>

              <div style={{ backgroundColor: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '12px' }}>
                <h4 style={{ margin: '0 0 8px', fontSize: '0.9rem' }}>معاينة الانتقال</h4>
                <p style={{ margin: '0 0 6px' }}>
                  {activeWorkflow.statuses?.find((status) => status.status_key === newTransitionForm.from_status_key)?.status_label || 'حالة البداية'}
                  {' ➔ '}
                  {activeWorkflow.statuses?.find((status) => status.status_key === newTransitionForm.to_status_key)?.status_label || 'الحالة الهدف'}
                </p>
                <p style={{ margin: '0 0 6px', color: '#4b5563' }}>
                  الأدوار: {ROLES_LIST.filter((role) => newTransitionForm.allowed_roles.includes(role.key)).map((role) => role.label).join('، ') || 'لم يتم اختيار دور'}
                </p>
                <p style={{ margin: '0 0 6px', color: '#4b5563' }}>
                  الإجراء: {AUTO_ACTIONS.find((action) => action.key === newTransitionForm.auto_action_type)?.label || 'غير محدد'}
                  {' | '}SLA: {newTransitionForm.sla_limit_hours || 0} ساعة
                </p>
                {newTransitionForm.sla_alert_message && (
                  <p style={{ margin: 0, color: '#4b5563' }}>رسالة التنبيه: {newTransitionForm.sla_alert_message}</p>
                )}
              </div>

              {transitionValidationError && (
                <p role="alert" style={{ margin: 0, color: '#b91c1c', fontSize: '0.85rem' }}>
                  {transitionValidationError}
                </p>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
                <button type="button" className="secondary-btn" onClick={() => { setShowTransitionModal(false); setTransitionValidationError(''); }}>إلغاء</button>
                <button type="submit" className="primary-btn">حفظ الانتقال</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default WorkflowsPage;
