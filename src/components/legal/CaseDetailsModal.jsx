import { Fragment, useState, useEffect, useCallback } from 'react';
import * as legalApi from '../../api/legal.js';

const LEGAL_ICON_PATHS = {
  scale: <><path d="M12 3v18M5 7h14M5 7l-3 6h6L5 7Zm14 0-3 6h6l-3-6ZM8 21h8" /></>,
  details: <><rect x="4" y="4" width="16" height="17" rx="2" /><path d="M8 9h8M8 13h8M8 17h5" /></>,
  court: <><path d="m3 9 9-6 9 6M5 10v8M9 10v8M15 10v8M19 10v8M3 21h18M2 18h20" /></>,
  file: <><path d="M4 6a2 2 0 0 1 2-2h5l2 2h5a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6Z" /><path d="M4 10h16" /></>,
  wallet: <><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4H20v16H6.5A2.5 2.5 0 0 1 4 17.5v-11Z" /><path d="M4 7h13a3 3 0 0 1 3 3v1h-5a2 2 0 0 0 0 4h5v2" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
};

function LegalIcon({ name, size = 17 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {LEGAL_ICON_PATHS[name]}
    </svg>
  );
}

const STATUS_LABELS = {
  active: 'متداولة بالجلسات',
  adjourned: 'مؤجلة',
  judged: 'محكوم بها',
  appealed: 'مستأنفة',
  closed: 'منتهية ومحفوظة',
};

const SESSION_STATUS_LABELS = {
  scheduled: 'مجدولة',
  attended: 'تم الحضور',
  postponed: 'مؤجلة',
  judged: 'صدر الحكم',
};

const TASK_STATUS_LABELS = {
  pending: 'مفتوحة',
  in_progress: 'قيد التنفيذ',
  completed: 'منجزة',
  cancelled: 'ملغاة',
};

const TASK_PRIORITY_LABELS = {
  low: 'منخفضة',
  normal: 'عادية',
  high: 'عاجلة',
};

const FINANCIAL_TYPE_LABELS = {
  retainer_deposit: 'إيداع أمانة',
  court_fee: 'رسوم محكمة',
  expert_fee: 'أمانة خبير',
  announcement_fee: 'رسوم إعلان',
  fee_payment: 'سداد أتعاب',
  other_expense: 'مصروفات أخرى',
};

function csvCell(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

function toLocalDateTimeInput(value) {
  return value ? String(value).replace(' ', 'T').slice(0, 16) : '';
}

function formatLocalDateTimeInput(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function defaultTaskReminder(dueAt) {
  if (!dueAt) return '';
  const reminder = new Date(dueAt);
  if (Number.isNaN(reminder.getTime())) return '';
  reminder.setDate(reminder.getDate() - 1);
  return formatLocalDateTimeInput(reminder);
}

export default function CaseDetailsModal({ caseId, initialTab = 'details', onClose, onRefreshList, lawyers = [], courts = [], currentUser }) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [caseData, setCaseData] = useState(null);
  const [financialBreakdown, setFinancialBreakdown] = useState(null);
  const [loading, setLoading] = useState(true);
  const caseCourtName = courts.find((court) => String(court.id) === String(caseData?.court_id))?.name
    || caseData?.court_name;

  // Forms states for sub-items
  const [showAddSession, setShowAddSession] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState(null);
  const [sessionForm, setSessionForm] = useState({
    session_date: '',
    court_room: '',
    assigned_lawyer_id: currentUser?.id ? String(currentUser.id) : '',
    session_reason: '',
    decision: '',
    next_session_date: '',
    status: 'scheduled',
    notes: ''
  });

  const [showAddDoc, setShowAddDoc] = useState(false);
  const [editingDocId, setEditingDocId] = useState(null);
  const [selectedDocumentId, setSelectedDocumentId] = useState(null);
  const [documentVersions, setDocumentVersions] = useState([]);
  const [documentActionError, setDocumentActionError] = useState('');
  const [docForm, setDocForm] = useState({
    title: '',
    doc_type: 'pleading',
    source_path: '',
    file_name: '',
    notes: ''
  });

  const [showAddFin, setShowAddFin] = useState(false);
  const [editingFinId, setEditingFinId] = useState(null);
  const [finForm, setFinForm] = useState({
    type: 'court_fee',
    amount: '',
    date: new Date().toISOString().slice(0, 10),
    description: '',
    paid_by_client: true,
    receipt_number: ''
  });

  const [showAddTime, setShowAddTime] = useState(false);
  const [editingTimeId, setEditingTimeId] = useState(null);
  const [timeForm, setTimeForm] = useState({
    lawyer_id: currentUser?.id ? String(currentUser.id) : '',
    hours: '1',
    hourly_rate: '0',
    date: new Date().toISOString().slice(0, 10),
    is_billed: false,
    activity_description: ''
  });
  const [showAddTask, setShowAddTask] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [taskActionError, setTaskActionError] = useState('');
  const [taskForm, setTaskForm] = useState({
    session_id: '',
    title: '',
    description: '',
    due_at: '',
    reminder_at: '',
    assigned_lawyer_id: currentUser?.id ? String(currentUser.id) : '',
    priority: 'normal',
  });

  const loadCaseDetails = useCallback(async () => {
    if (!caseId) return;
    setLoading(true);
    try {
      if (legalApi.getCaseById.isAvailable()) {
        const data = await legalApi.getCaseById(caseId);
        setCaseData(data);
        if (data?.hourly_rate) {
          setTimeForm((prev) => ({ ...prev, hourly_rate: data.hourly_rate }));
        }
      }
      if (legalApi.getCaseFinancialBreakdown.isAvailable()) {
        const breakdown = await legalApi.getCaseFinancialBreakdown(caseId);
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
      const payload = {
        ...sessionForm,
        assigned_lawyer_id: sessionForm.assigned_lawyer_id || null,
        next_session_date: sessionForm.next_session_date || null,
      };
      if (editingSessionId) {
        await legalApi.updateCourtSession(editingSessionId, payload);
      } else {
        await legalApi.createCourtSession({ ...payload, case_id: caseId });
      }
      setShowAddSession(false);
      setEditingSessionId(null);
      setSessionForm({
        session_date: '',
        court_room: '',
        assigned_lawyer_id: currentUser?.id ? String(currentUser.id) : '',
        session_reason: '',
        decision: '',
        next_session_date: '',
        status: 'scheduled',
        notes: ''
      });
      await loadCaseDetails();
      if (onRefreshList) onRefreshList();
    } catch (err) {
      alert(`خطأ أثناء ${editingSessionId ? 'تعديل' : 'حفظ'} الجلسة: ` + err.message);
    }
  }

  function editSession(session) {
    setEditingSessionId(session.id);
    setSessionForm({
      session_date: toLocalDateTimeInput(session.session_date),
      court_room: session.court_room || '',
      assigned_lawyer_id: session.assigned_lawyer_id ? String(session.assigned_lawyer_id) : '',
      session_reason: session.session_reason || '',
      decision: session.decision || '',
      next_session_date: toLocalDateTimeInput(session.next_session_date),
      status: session.status,
      notes: session.notes || '',
    });
    setShowAddSession(true);
  }

  async function handleDeleteSession(session) {
    if (!window.confirm('هل تريد حذف سجل هذه الجلسة؟')) return;
    try {
      await legalApi.deleteCourtSession(session.id);
      await loadCaseDetails();
      if (onRefreshList) onRefreshList();
    } catch (err) {
      alert('تعذر حذف الجلسة: ' + err.message);
    }
  }

  async function handleAddDoc(e) {
    e.preventDefault();
    if (!docForm.title.trim()) return alert('يرجى إدخال اسم المستند');
    if (!editingDocId && !docForm.source_path) return alert('يرجى اختيار ملف المستند');
    try {
      if (editingDocId) {
        await legalApi.updateCaseDocument(editingDocId, docForm);
      } else {
        await legalApi.createCaseDocument({ ...docForm, case_id: caseId });
      }
      setShowAddDoc(false);
      setEditingDocId(null);
      setDocForm({ title: '', doc_type: 'pleading', source_path: '', file_name: '', notes: '' });
      await loadCaseDetails();
      if (onRefreshList) onRefreshList();
    } catch (err) {
      alert(`خطأ أثناء ${editingDocId ? 'تعديل' : 'إضافة'} المستند: ` + err.message);
    }
  }

  async function selectDocumentFile() {
    try {
      const selected = await legalApi.selectCaseDocumentFile();
      if (!selected.canceled) {
        setDocForm({ ...docForm, source_path: selected.source_path, file_name: selected.file_name });
      }
    } catch (err) {
      setDocumentActionError(`تعذر اختيار الملف: ${err.message}`);
    }
  }

  async function toggleDocumentVersions(documentId) {
    if (selectedDocumentId === documentId) {
      setSelectedDocumentId(null);
      setDocumentVersions([]);
      return;
    }
    try {
      setDocumentActionError('');
      const versions = await legalApi.getCaseDocumentVersions(documentId);
      setDocumentVersions(versions || []);
      setSelectedDocumentId(documentId);
    } catch (err) {
      setDocumentActionError(`تعذر تحميل سجل النسخ: ${err.message}`);
    }
  }

  async function openDocument(documentId, version = undefined) {
    try {
      setDocumentActionError('');
      await legalApi.openCaseDocument(documentId, version);
    } catch (err) {
      setDocumentActionError(`تعذر فتح المستند: ${err.message}`);
    }
  }

  async function downloadDocument(document, version = undefined) {
    try {
      setDocumentActionError('');
      const fileName = document.file_path.split(/[\\/]/).pop() || `${document.title}.pdf`;
      await legalApi.downloadCaseDocument(document.id, fileName, version);
    } catch (err) {
      setDocumentActionError(`تعذر تنزيل المستند: ${err.message}`);
    }
  }

  async function restoreDocumentVersion(document, version) {
    if (!window.confirm(`استعادة النسخة ${version.version} كنسخة حالية جديدة؟`)) return;
    try {
      setDocumentActionError('');
      await legalApi.restoreCaseDocumentVersion(document.id, version.version);
      await toggleDocumentVersions(document.id);
      await loadCaseDetails();
    } catch (err) {
      setDocumentActionError(`تعذر استعادة النسخة: ${err.message}`);
    }
  }

  async function handleDeleteDoc(doc) {
    if (!window.confirm(`هل تريد حذف المستند "${doc.title}" من سجل القضية؟`)) return;
    try {
      await legalApi.deleteCaseDocument(doc.id);
      await loadCaseDetails();
    } catch (err) {
      alert('تعذر حذف المستند: ' + err.message);
    }
  }

  async function handleAddFin(e) {
    e.preventDefault();
    if (!finForm.amount || Number(finForm.amount) <= 0) return alert('يرجى إدخال مبلغ صحيح');
    try {
      if (editingFinId) {
        await legalApi.updateCaseFinancial(editingFinId, finForm);
      } else {
        await legalApi.createCaseFinancial({ ...finForm, case_id: caseId });
      }
      setShowAddFin(false);
      setEditingFinId(null);
      setFinForm({ type: 'court_fee', amount: '', date: new Date().toISOString().slice(0, 10), description: '', paid_by_client: true, receipt_number: '' });
      await loadCaseDetails();
      if (onRefreshList) onRefreshList();
    } catch (err) {
      alert(`خطأ أثناء ${editingFinId ? 'تعديل' : 'حفظ'} الحركة المالية: ` + err.message);
    }
  }

  async function handleDeleteFinancial(financial) {
    if (!window.confirm('هل تريد حذف هذه الحركة المالية؟ سيتم تحديث إجمالي الأتعاب تلقائيًا إذا كانت دفعة أتعاب.')) return;
    try {
      await legalApi.deleteCaseFinancial(financial.id);
      await loadCaseDetails();
      if (onRefreshList) onRefreshList();
    } catch (err) {
      alert('تعذر حذف الحركة المالية: ' + err.message);
    }
  }

  function exportFinancialReport() {
    const rows = [
      ['كشف مالي للقضية', caseData.case_number],
      ['الموكل', caseData.client_name || ''],
      ['إجمالي الأتعاب', financialBreakdown?.contract_amount || 0],
      ['المسدد من الأتعاب', financialBreakdown?.paid_amount || 0],
      ['المتبقي من الأتعاب', financialBreakdown?.remaining_fees || 0],
      ['إجمالي الأمانات', financialBreakdown?.total_retainers || 0],
      ['المصروفات القضائية', financialBreakdown?.total_court_expenses || 0],
      ['رصيد الأمانة', financialBreakdown?.retainer_balance || 0],
      [],
      ['التاريخ', 'نوع الحركة', 'المبلغ', 'البيان', 'رقم الإيصال', 'السداد من الأمانة', 'المسجل بواسطة'],
      ...(caseData.financials || []).map((financial) => [
        financial.date,
        FINANCIAL_TYPE_LABELS[financial.type] || financial.type,
        financial.amount,
        financial.description,
        financial.receipt_number,
        financial.paid_by_client ? 'نعم' : 'لا',
        financial.recorded_by_name,
      ]),
    ];
    const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = `كشف-مالي-${String(caseData.case_number || caseId).replace(/[\\/:*?"<>|]/g, '-')}.csv`;
    link.click();
    URL.revokeObjectURL(downloadUrl);
  }

  async function printFinancialReceipt(financialId) {
    try {
      await legalApi.printCaseFinancialReceipt(financialId);
    } catch (error) {
      alert(`تعذرت طباعة الإيصال: ${error.message}`);
    }
  }

  async function handleAddTime(e) {
    e.preventDefault();
    if (!timeForm.activity_description) return alert('يرجى وصف النشاط المنجز');
    if (!timeForm.lawyer_id) return alert('يرجى اختيار المحامي');
    try {
      if (editingTimeId) {
        await legalApi.updateCaseTimeLog(editingTimeId, timeForm);
      } else {
        await legalApi.createCaseTimeLog({ ...timeForm, case_id: caseId });
      }
      setShowAddTime(false);
      setEditingTimeId(null);
      setTimeForm((prev) => ({ ...prev, hours: '1', activity_description: '', date: new Date().toISOString().slice(0, 10), is_billed: false }));
      await loadCaseDetails();
      if (onRefreshList) onRefreshList();
    } catch (err) {
      alert(`خطأ أثناء ${editingTimeId ? 'تعديل' : 'تسجيل'} ساعات العمل: ` + err.message);
    }
  }

  async function handleDeleteTimeLog(timeLog) {
    if (!window.confirm('هل تريد حذف سجل ساعات العمل هذا؟')) return;
    try {
      await legalApi.deleteCaseTimeLog(timeLog.id);
      await loadCaseDetails();
    } catch (err) {
      alert('تعذر حذف سجل الوقت: ' + err.message);
    }
  }

  function openTaskForm(task = null, session = null) {
    setTaskActionError('');
    setEditingTaskId(task?.id || null);
    if (task) {
      setTaskForm({
        session_id: task.session_id ? String(task.session_id) : '',
        title: task.title || '',
        description: task.description || '',
        due_at: toLocalDateTimeInput(task.due_at),
        reminder_at: toLocalDateTimeInput(task.reminder_at),
        assigned_lawyer_id: task.assigned_lawyer_id ? String(task.assigned_lawyer_id) : '',
        priority: task.priority || 'normal',
      });
    } else {
      let dueAt = '';
      if (session?.next_session_date) {
        const dueDate = new Date(session.next_session_date);
        dueDate.setDate(dueDate.getDate() - 1);
        dueAt = formatLocalDateTimeInput(dueDate);
      }
      const sessionDate = session?.session_date
        ? new Date(session.session_date).toLocaleDateString('ar-EG')
        : '';
      setTaskForm({
        session_id: session ? String(session.id) : '',
        title: session
          ? `متابعة قرار جلسة ${sessionDate}`
          : '',
        description: session?.decision
          ? `قرار المحكمة: ${session.decision}${session.session_reason ? `\nالمطلوب بالجلسة: ${session.session_reason}` : ''}`
          : session?.session_reason || '',
        due_at: dueAt,
        reminder_at: defaultTaskReminder(dueAt),
        assigned_lawyer_id: session?.assigned_lawyer_id
          ? String(session.assigned_lawyer_id)
          : currentUser?.id ? String(currentUser.id) : '',
        priority: 'normal',
      });
    }
    setShowAddTask(true);
    setActiveTab('tasks');
  }

  async function handleSaveTask(event) {
    event.preventDefault();
    if (!taskForm.title.trim()) return setTaskActionError('عنوان المهمة مطلوب');
    if (!taskForm.due_at) return setTaskActionError('يرجى تحديد موعد استحقاق المهمة');
    try {
      const payload = {
        ...taskForm,
        case_id: caseId,
        session_id: taskForm.session_id || null,
        assigned_lawyer_id: taskForm.assigned_lawyer_id || null,
        reminder_at: taskForm.reminder_at || null,
      };
      if (editingTaskId) {
        await legalApi.updateCaseTask(editingTaskId, payload);
      } else {
        await legalApi.createCaseTask(payload);
      }
      setShowAddTask(false);
      setEditingTaskId(null);
      setTaskForm({
        session_id: '',
        title: '',
        description: '',
        due_at: '',
        reminder_at: '',
        assigned_lawyer_id: currentUser?.id ? String(currentUser.id) : '',
        priority: 'normal',
      });
      setTaskActionError('');
      await loadCaseDetails();
      if (onRefreshList) onRefreshList();
    } catch (error) {
      setTaskActionError(`تعذر ${editingTaskId ? 'تعديل' : 'حفظ'} المهمة: ${error.message}`);
    }
  }

  async function updateTaskStatus(task, status) {
    try {
      await legalApi.updateCaseTask(task.id, { status });
      setTaskActionError('');
      await loadCaseDetails();
      if (onRefreshList) onRefreshList();
    } catch (error) {
      setTaskActionError(`تعذر تحديث حالة المهمة: ${error.message}`);
    }
  }

  async function handleDeleteTask(task) {
    if (!window.confirm(`هل تريد حذف المهمة "${task.title}"؟`)) return;
    try {
      await legalApi.deleteCaseTask(task.id);
      setTaskActionError('');
      await loadCaseDetails();
      if (onRefreshList) onRefreshList();
    } catch (error) {
      setTaskActionError(`تعذر حذف المهمة: ${error.message}`);
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
              <span><LegalIcon name="scale" /> قضية رقم: {caseData.case_number}</span>
              <span className={`status-badge ${caseData.status}`}>
                {STATUS_LABELS[caseData.status] || caseData.status}
              </span>
            </h2>
            <div style={{ fontSize: '0.88rem', color: '#64748b', marginTop: '4px' }}>
              {caseCourtName} {caseData.circuit_name ? `(${caseData.circuit_name})` : ''} — الموكّل: <strong>{caseData.client_name}</strong>
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
            <LegalIcon name="details" /> بيانات الدعوى والأطراف
          </button>
          <button
            type="button"
            className={`modal-tab-btn ${activeTab === 'sessions' ? 'active' : ''}`}
            onClick={() => setActiveTab('sessions')}
          >
            <LegalIcon name="court" /> سجل الجلسات ({caseData.sessions?.length || 0})
          </button>
          <button
            type="button"
            className={`modal-tab-btn ${activeTab === 'tasks' ? 'active' : ''}`}
            onClick={() => setActiveTab('tasks')}
          >
            <LegalIcon name="details" /> مهام المتابعة ({caseData.tasks?.filter((task) => ['pending', 'in_progress'].includes(task.status)).length || 0})
          </button>
          <button
            type="button"
            className={`modal-tab-btn ${activeTab === 'documents' ? 'active' : ''}`}
            onClick={() => setActiveTab('documents')}
          >
            <LegalIcon name="file" /> أرشيف المستندات ({caseData.documents?.length || 0})
          </button>
          <button
            type="button"
            className={`modal-tab-btn ${activeTab === 'financials' ? 'active' : ''}`}
            onClick={() => setActiveTab('financials')}
          >
            <LegalIcon name="wallet" /> الأمانات والماليات
          </button>
          <button
            type="button"
            className={`modal-tab-btn ${activeTab === 'time_logs' ? 'active' : ''}`}
            onClick={() => setActiveTab('time_logs')}
          >
            <LegalIcon name="clock" /> ساعات العمل ({caseData.time_logs?.length || 0})
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
                    {caseData.billing_type === 'fixed' ? 'أتعاب مقطوعة بالعقد' :
                      caseData.billing_type === 'contingency' ? 'أتعاب بنسبة من المحكوم به' : 'فوترة بالساعة'} —
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
                  onClick={() => {
                    setEditingSessionId(null);
                    setSessionForm({
                      session_date: '',
                      court_room: '',
                      assigned_lawyer_id: currentUser?.id ? String(currentUser.id) : '',
                      session_reason: '',
                      decision: '',
                      next_session_date: '',
                      status: 'scheduled',
                      notes: '',
                    });
                    setShowAddSession(!showAddSession);
                  }}
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
                    <div className="form-group">
                      <label>المحامي المكلف</label>
                      <select
                        value={sessionForm.assigned_lawyer_id}
                        onChange={(e) => setSessionForm({ ...sessionForm, assigned_lawyer_id: e.target.value })}
                      >
                        <option value="">غير معين</option>
                        {lawyers.map((lawyer) => (
                          <option key={lawyer.id} value={lawyer.id}>
                            {lawyer.full_name || [lawyer.first_name, lawyer.last_name].filter(Boolean).join(' ') || lawyer.username}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>حالة الجلسة</label>
                      <select
                        value={sessionForm.status}
                        onChange={(e) => setSessionForm({ ...sessionForm, status: e.target.value })}
                      >
                        <option value="scheduled">مجدولة</option>
                        <option value="attended">تم الحضور</option>
                        <option value="postponed">مؤجلة</option>
                        <option value="judged">صدر الحكم</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>موعد الجلسة القادمة</label>
                      <input
                        type="datetime-local"
                        value={sessionForm.next_session_date}
                        onChange={(e) => setSessionForm({ ...sessionForm, next_session_date: e.target.value })}
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
                    <button type="submit" className="btn-primary-legal">{editingSessionId ? 'حفظ تعديل الجلسة' : 'حفظ الجلسة'}</button>
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
                          <span><LegalIcon name="court" /> القاعة: <strong>{sess.court_room || 'غير محدد'}</strong></span>
                          <span><LegalIcon name="scale" /> المحامي الحاضر: <strong>{sess.assigned_lawyer_name || 'غير محدد'}</strong></span>
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
                        <button
                          type="button"
                          className="btn-icon-action"
                          style={{ marginTop: '10px' }}
                          onClick={() => openTaskForm(null, sess)}
                        >
                          {sess.decision ? 'تحويل القرار لمهمة متابعة' : 'إنشاء مهمة متابعة للجلسة'}
                        </button>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className={`status-badge ${sess.status}`}>{SESSION_STATUS_LABELS[sess.status] || sess.status}</span>
                        <button type="button" className="btn-icon-action" onClick={() => editSession(sess)}>تعديل</button>
                        <button type="button" className="btn-icon-action danger-action" onClick={() => handleDeleteSession(sess)}>حذف</button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 3: CASE TASKS */}
          {activeTab === 'tasks' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.1rem' }}>مهام وخطوات متابعة القضية</h3>
                  <small style={{ color: '#64748b' }}>تظهر التنبيهات للمحامي المسؤول عند موعد التذكير المحدد.</small>
                </div>
                <button type="button" className="btn-primary-legal" onClick={() => openTaskForm()}>
                  {showAddTask ? 'إضافة مهمة أخرى' : '+ إضافة مهمة'}
                </button>
              </div>

              {taskActionError && <p role="alert" style={{ color: '#b91c1c', marginBottom: 12 }}>{taskActionError}</p>}

              {showAddTask && (
                <form onSubmit={handleSaveTask} style={{ background: '#f8fafc', padding: 16, borderRadius: 10, marginBottom: 20, border: '1px solid #cbd5e1' }}>
                  <h4 style={{ margin: '0 0 12px' }}>{editingTaskId ? 'تعديل مهمة المتابعة' : 'مهمة متابعة جديدة'}</h4>
                  <div className="form-grid-2">
                    <div className="form-group full-width">
                      <label>عنوان المهمة *</label>
                      <input
                        required
                        maxLength={180}
                        value={taskForm.title}
                        onChange={(event) => setTaskForm({ ...taskForm, title: event.target.value })}
                      />
                    </div>
                    <div className="form-group full-width">
                      <label>التفاصيل أو الإجراء المطلوب</label>
                      <textarea
                        rows="2"
                        value={taskForm.description}
                        onChange={(event) => setTaskForm({ ...taskForm, description: event.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label>موعد الاستحقاق *</label>
                      <input
                        type="datetime-local"
                        required
                        value={taskForm.due_at}
                        onChange={(event) => setTaskForm({
                          ...taskForm,
                          due_at: event.target.value,
                          reminder_at: taskForm.reminder_at ? taskForm.reminder_at : defaultTaskReminder(event.target.value),
                        })}
                      />
                    </div>
                    <div className="form-group">
                      <label>موعد التذكير</label>
                      <input
                        type="datetime-local"
                        value={taskForm.reminder_at}
                        onChange={(event) => setTaskForm({ ...taskForm, reminder_at: event.target.value })}
                      />
                      <small>افتراضيًا قبل الاستحقاق بيوم، ويمكن تغييره أو تركه فارغًا.</small>
                    </div>
                    <div className="form-group">
                      <label>المحامي المسؤول</label>
                      <select
                        value={taskForm.assigned_lawyer_id}
                        onChange={(event) => setTaskForm({ ...taskForm, assigned_lawyer_id: event.target.value })}
                      >
                        <option value="">غير معين</option>
                        {lawyers.map((lawyer) => (
                          <option key={lawyer.id} value={lawyer.id}>
                            {lawyer.full_name || [lawyer.first_name, lawyer.last_name].filter(Boolean).join(' ') || lawyer.username}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>الأولوية</label>
                      <select
                        value={taskForm.priority}
                        onChange={(event) => setTaskForm({ ...taskForm, priority: event.target.value })}
                      >
                        <option value="low">منخفضة</option>
                        <option value="normal">عادية</option>
                        <option value="high">عاجلة</option>
                      </select>
                    </div>
                    <div className="form-group full-width">
                      <label>الجلسة أو القرار المرتبط</label>
                      <select
                        value={taskForm.session_id}
                        onChange={(event) => setTaskForm({ ...taskForm, session_id: event.target.value })}
                      >
                        <option value="">بدون جلسة مرتبطة</option>
                        {(caseData.sessions || []).map((session) => (
                          <option key={session.id} value={session.id}>
                            {new Date(session.session_date).toLocaleString('ar-EG')} {session.decision ? `— ${session.decision}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                    <button type="button" className="btn-secondary-legal" onClick={() => {
                      setShowAddTask(false);
                      setEditingTaskId(null);
                    }}>إلغاء</button>
                    <button type="submit" className="btn-primary-legal">{editingTaskId ? 'حفظ التعديل' : 'حفظ المهمة'}</button>
                  </div>
                </form>
              )}

              <div className="sessions-list-container">
                {(caseData.tasks || []).length === 0 ? (
                  <p style={{ color: '#64748b', textAlign: 'center', padding: 24 }}>لا توجد مهام متابعة مسجلة لهذه القضية.</p>
                ) : (
                  caseData.tasks.map((task) => {
                    const isOpen = ['pending', 'in_progress'].includes(task.status);
                    const isOverdue = isOpen && new Date(task.due_at) < new Date();
                    return (
                      <div key={task.id} className="session-item-card">
                        <div className="session-card-main">
                          <h4 style={{ color: isOverdue ? '#b91c1c' : undefined }}>{task.title}</h4>
                          <div className="session-meta">
                            <span>الاستحقاق: <strong>{new Date(task.due_at).toLocaleString('ar-EG')}</strong></span>
                            <span>المسؤول: <strong>{task.assigned_lawyer_name || 'غير معين'}</strong></span>
                            <span>الأولوية: <strong>{TASK_PRIORITY_LABELS[task.priority] || task.priority}</strong></span>
                            {task.session_date && <span>الجلسة المرتبطة: <strong>{new Date(task.session_date).toLocaleDateString('ar-EG')}</strong></span>}
                            {isOverdue && <strong style={{ color: '#b91c1c' }}>متأخرة</strong>}
                          </div>
                          {task.description && <div className="session-reason-box">{task.description}</div>}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span className={`status-badge ${task.status}`}>{TASK_STATUS_LABELS[task.status] || task.status}</span>
                          {isOpen && (
                            <button type="button" className="btn-icon-action" onClick={() => updateTaskStatus(task, 'completed')}>
                              إنهاء المهمة
                            </button>
                          )}
                          <button type="button" className="btn-icon-action" onClick={() => openTaskForm(task)}>تعديل</button>
                          <button type="button" className="btn-icon-action danger-action" onClick={() => handleDeleteTask(task)}>حذف</button>
                        </div>
                      </div>
                    );
                  })
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
                  onClick={() => {
                    setEditingDocId(null);
                    setDocForm({ title: '', doc_type: 'pleading', source_path: '', file_name: '', notes: '' });
                    setShowAddDoc(!showAddDoc);
                  }}
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
                      <label>{editingDocId ? 'استبدال الملف (اختياري لإنشاء نسخة جديدة)' : 'ملف المستند *'}</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        <button type="button" className="btn-secondary-legal" onClick={selectDocumentFile}>
                          اختيار ملف من الجهاز
                        </button>
                        <span style={{ color: docForm.file_name ? '#334155' : '#64748b', fontSize: '0.85rem' }}>
                          {docForm.file_name || (editingDocId ? 'لن يتم تغيير الملف الحالي' : 'لم يتم اختيار ملف')}
                        </span>
                      </div>
                      <small style={{ color: '#64748b' }}>الحد الأقصى 25 ميجابايت. يُحفظ الملف داخل أرشيف التطبيق مع الاحتفاظ بالنسخ السابقة.</small>
                    </div>
                    <div className="form-group full-width">
                      <label>ملاحظات</label>
                      <textarea
                        rows="2"
                        value={docForm.notes}
                        onChange={(e) => setDocForm({ ...docForm, notes: e.target.value })}
                      />
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    <button type="submit" className="btn-primary-legal">{editingDocId ? 'حفظ تعديل المستند' : 'حفظ بالأرشيف'}</button>
                  </div>
                </form>
              )}

              {documentActionError && <p role="alert" style={{ color: '#9b4e4d', marginBottom: 12 }}>{documentActionError}</p>}

              <table className="cases-table">
                <thead>
                  <tr>
                    <th>اسم المستند</th>
                    <th>النوع</th>
                    <th>الملف / النسخة</th>
                    <th>تاريخ الإضافة</th>
                    <th>بواسطة</th>
                    <th>الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {caseData.documents?.length === 0 ? (
                    <tr>
                      <td colSpan="6" style={{ textAlign: 'center', color: '#64748b', padding: '24px' }}>
                        لا توجد مستندات مؤرشفة بعد.
                      </td>
                    </tr>
                  ) : (
                    caseData.documents.map((doc) => (
                      <Fragment key={doc.id}>
                      <tr>
                        <td style={{ fontWeight: 600 }}>📄 {doc.title}</td>
                        <td><span className="party-tag plaintiff">{doc.doc_type}</span></td>
                        <td style={{ color: '#475569', fontSize: '0.85rem' }}>
                          {doc.file_path.split(/[\\/]/).pop()}
                          <small style={{ display: 'block', color: '#64748b' }}>
                            النسخة {doc.version || 1} · {doc.file_size ? `${(doc.file_size / 1024).toFixed(0)} KB` : ''}
                          </small>
                        </td>
                        <td>{new Date(doc.created_at).toLocaleDateString('ar-EG')}</td>
                        <td>{doc.uploaded_by_name || 'مسؤول النظام'}</td>
                        <td>
                          <button type="button" className="btn-icon-action" onClick={() => openDocument(doc.id)}>فتح / معاينة</button>
                          <button type="button" className="btn-icon-action" onClick={() => downloadDocument(doc)}>تنزيل</button>
                          <button type="button" className="btn-icon-action" onClick={() => toggleDocumentVersions(doc.id)}>النسخ</button>
                          <button
                            type="button"
                            className="btn-icon-action"
                            onClick={() => {
                              setEditingDocId(doc.id);
                              setDocForm({
                                title: doc.title,
                                doc_type: doc.doc_type,
                                source_path: '',
                                file_name: '',
                                notes: doc.notes || '',
                              });
                              setShowAddDoc(true);
                            }}
                          >تعديل</button>
                          <button type="button" className="btn-icon-action danger-action" onClick={() => handleDeleteDoc(doc)}>حذف</button>
                        </td>
                      </tr>
                      {selectedDocumentId === doc.id && (
                        <tr key={`${doc.id}-versions`}>
                          <td colSpan="6" style={{ background: '#f8fafc', padding: 14 }}>
                            <strong>سجل النسخ</strong>
                            {documentVersions.length === 0 ? (
                              <p style={{ color: '#64748b', marginTop: 8 }}>لا توجد نسخ محفوظة.</p>
                            ) : (
                              <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
                                {documentVersions.map((version) => (
                                  <div key={version.id} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                    <span>النسخة {version.version} — {new Date(version.created_at).toLocaleString('ar-EG')}</span>
                                    {Number(version.version) === Number(doc.version) && <strong style={{ color: '#397354' }}>الحالية</strong>}
                                    <button type="button" className="btn-icon-action" onClick={() => openDocument(doc.id, version.version)}>فتح</button>
                                    <button type="button" className="btn-icon-action" onClick={() => downloadDocument(doc, version.version)}>تنزيل</button>
                                    {Number(version.version) !== Number(doc.version) && (
                                      <button type="button" className="btn-icon-action" onClick={() => restoreDocumentVersion(doc, version)}>استعادة كنسخة جديدة</button>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                      </Fragment>
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
                <div className="fin-mini-card">
                  <span className="fin-mini-label">مصروفات مدفوعة من المكتب</span>
                  <span className="fin-mini-val negative">{(financialBreakdown?.expenses_paid_by_office || 0).toLocaleString()} EGP</span>
                </div>
                <div className="fin-mini-card" style={{ background: '#f0fdf4', borderColor: '#bbf7d0' }}>
                  <span className="fin-mini-label">صافي رصيد الأمانة المتاح</span>
                  <span className="fin-mini-val positive">{(financialBreakdown?.retainer_balance || 0).toLocaleString()} EGP</span>
                </div>
              </div>
              {financialBreakdown && Math.abs(financialBreakdown.fee_payment_discrepancy) > 0.009 && (
                <p role="alert" style={{ color: '#9a3412', background: '#fff7ed', padding: '10px 12px', borderRadius: 8 }}>
                  تنبيه: مجموع دفعات سجل الحركات ({financialBreakdown.paid_amount.toLocaleString()} EGP)
                  يختلف عن القيمة المسجلة للقضية ({financialBreakdown.recorded_paid_amount.toLocaleString()} EGP).
                  تم اعتماد سجل الحركات في احتساب المسدد والمتبقي.
                </p>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: '16px', flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0, fontSize: '1.1rem' }}>سجل حركات الأمانات والمصاريف</h3>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" className="btn-secondary-legal" onClick={exportFinancialReport}>تصدير كشف مالي CSV</button>
                  <button
                    type="button"
                    className="btn-primary-legal"
                    style={{ fontSize: '0.85rem', padding: '8px 14px' }}
                    onClick={() => {
                      setEditingFinId(null);
                      setFinForm({
                        type: 'court_fee',
                        amount: '',
                        date: new Date().toISOString().slice(0, 10),
                        description: '',
                        paid_by_client: true,
                        receipt_number: '',
                      });
                      setShowAddFin(!showAddFin);
                    }}
                  >
                    {showAddFin ? 'إلغاء' : '+ حركة مالية / سداد أمانة'}
                  </button>
                </div>
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
                      <label>تاريخ الحركة</label>
                      <input
                        type="date"
                        value={finForm.date}
                        onChange={(e) => setFinForm({ ...finForm, date: e.target.value })}
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
                    <div className="form-group">
                      <label>تم السداد من أمانة الموكل؟</label>
                      <select
                        value={finForm.paid_by_client ? 'yes' : 'no'}
                        onChange={(e) => setFinForm({ ...finForm, paid_by_client: e.target.value === 'yes' })}
                      >
                        <option value="yes">نعم</option>
                        <option value="no">لا</option>
                      </select>
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    <button type="submit" className="btn-primary-legal">{editingFinId ? 'حفظ تعديل الحركة' : 'حفظ الحركة المالية'}</button>
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
                    <th>الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {caseData.financials?.length === 0 ? (
                    <tr>
                      <td colSpan="6" style={{ textAlign: 'center', color: '#64748b', padding: '24px' }}>
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
                        <td>
                          <button type="button" className="btn-icon-action" onClick={() => printFinancialReceipt(f.id)}>طباعة إيصال</button>
                          <button
                            type="button"
                            className="btn-icon-action"
                            onClick={() => {
                              setEditingFinId(f.id);
                              setFinForm({
                                type: f.type,
                                amount: String(f.amount),
                                date: String(f.date || '').slice(0, 10),
                                description: f.description || '',
                                paid_by_client: Boolean(f.paid_by_client),
                                receipt_number: f.receipt_number || '',
                              });
                              setShowAddFin(true);
                            }}
                          >تعديل</button>
                          <button type="button" className="btn-icon-action danger-action" onClick={() => handleDeleteFinancial(f)}>حذف</button>
                        </td>
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
                  onClick={() => {
                    setEditingTimeId(null);
                    setTimeForm({
                      lawyer_id: currentUser?.id ? String(currentUser.id) : '',
                      hours: '1',
                      hourly_rate: String(caseData.hourly_rate || 0),
                      date: new Date().toISOString().slice(0, 10),
                      is_billed: false,
                      activity_description: '',
                    });
                    setShowAddTime(!showAddTime);
                  }}
                >
                  {showAddTime ? 'إلغاء' : '+ تسجيل ساعات عمل'}
                </button>
              </div>

              {showAddTime && (
                <form onSubmit={handleAddTime} style={{ background: '#f8fafc', padding: '16px', borderRadius: '10px', marginBottom: '20px', border: '1px solid #cbd5e1' }}>
                  <div className="form-grid-2">
                    <div className="form-group">
                      <label>المحامي *</label>
                      <select
                        required
                        value={timeForm.lawyer_id}
                        onChange={(e) => setTimeForm({ ...timeForm, lawyer_id: e.target.value })}
                      >
                        <option value="">اختر المحامي</option>
                        {lawyers.map((lawyer) => (
                          <option key={lawyer.id} value={lawyer.id}>
                            {lawyer.full_name || [lawyer.first_name, lawyer.last_name].filter(Boolean).join(' ') || lawyer.username}
                          </option>
                        ))}
                      </select>
                    </div>
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
                      <label>تاريخ النشاط</label>
                      <input
                        type="date"
                        value={timeForm.date}
                        onChange={(e) => setTimeForm({ ...timeForm, date: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label>حالة الفوترة</label>
                      <select
                        value={timeForm.is_billed ? 'yes' : 'no'}
                        onChange={(e) => setTimeForm({ ...timeForm, is_billed: e.target.value === 'yes' })}
                      >
                        <option value="no">غير مفوتر</option>
                        <option value="yes">تمت فوترته</option>
                      </select>
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
                    <button type="submit" className="btn-primary-legal">{editingTimeId ? 'حفظ تعديل الساعات' : 'تسجيل الساعات'}</button>
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
                    <th>الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {caseData.time_logs?.length === 0 ? (
                    <tr>
                      <td colSpan="7" style={{ textAlign: 'center', color: '#64748b', padding: '24px' }}>
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
                        <td>
                          <button
                            type="button"
                            className="btn-icon-action"
                            onClick={() => {
                              setEditingTimeId(t.id);
                              setTimeForm({
                                lawyer_id: String(t.lawyer_id),
                                hours: String(t.hours),
                                hourly_rate: String(t.hourly_rate),
                                date: String(t.date).slice(0, 10),
                                is_billed: Boolean(t.is_billed),
                                activity_description: t.activity_description,
                              });
                              setShowAddTime(true);
                            }}
                          >تعديل</button>
                          <button type="button" className="btn-icon-action danger-action" onClick={() => handleDeleteTimeLog(t)}>حذف</button>
                        </td>
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
