import { useState, useEffect, useCallback, useRef } from 'react';
import foxLogo from '../assets/fox-logo.png';
import '../styles/cases.css';
import CaseDetailsModal from '../components/legal/CaseDetailsModal.jsx';
import DailyDocketModal from '../components/legal/DailyDocketModal.jsx';
import { useUser } from '../contexts/UserContext.jsx';
import * as customersApi from '../api/customers.js';
import * as legalApi from '../api/legal.js';

const CASE_TYPES = [
  { key: 'all', label: 'جميع الأنواع' },
  { key: 'civil', label: 'مدني وتعويضات' },
  { key: 'commercial', label: 'تجاري وشركات' },
  { key: 'criminal', label: 'جنائي وجنح' },
  { key: 'labor', label: 'عمالي ومنازعات عمل' },
  { key: 'family', label: 'أسرة وأحوال شخصية' },
  { key: 'contracts', label: 'استشارات وعقود' },
];

const STATUS_FILTERS = [
  { key: 'all', label: 'جميع الحالات' },
  { key: 'active', label: 'متداولة' },
  { key: 'adjourned', label: 'مؤجلة' },
  { key: 'judged', label: 'محكوم بها' },
  { key: 'appealed', label: 'مستأنفة' },
  { key: 'closed', label: 'منتهية ومحفوظة' },
];

const ICON_PATHS = {
  scale: <><path d="M12 3v18M5 7h14M5 7l-3 6h6L5 7Zm14 0-3 6h6l-3-6ZM8 21h8" /></>,
  folder: <><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" /><path d="M3 10h18" /></>,
  courthouse: <><path d="m3 9 9-6 9 6M5 10v8M9 10v8M15 10v8M19 10v8M3 21h18M2 18h20" /></>,
  wallet: <><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4H20v16H6.5A2.5 2.5 0 0 1 4 17.5v-11Z" /><path d="M4 7h13a3 3 0 0 1 3 3v1h-5a2 2 0 0 0 0 4h5v2M15 13h.01" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
  docket: <><rect x="4" y="4" width="16" height="17" rx="2" /><path d="M9 4V3h6v1M8 9h8M8 13h8M8 17h5" /></>,
  add: <><path d="M12 5v14M5 12h14" /></>,
  open: <><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5" /></>,
  edit: <><path d="m15 5 4 4M4 20l4-.8L19 8a2.1 2.1 0 0 0-3-3L5 16l-1 4Z" /></>,
  close: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
  empty: <><path d="M4 6h16M6 6l1 14h10l1-14M9 6V4h6v2M10 10v6M14 10v6" /></>,
  filter: <><path d="M4 6h16M7 12h10M10 18h4" /><circle cx="8" cy="6" r="1.5" /><circle cx="15" cy="12" r="1.5" /></>,
};

function LegalIcon({ name, size = 20 }) {
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
      {ICON_PATHS[name]}
    </svg>
  );
}

function getEmptyCaseForm(currentUserId = '') {
  return {
    case_number: '',
    court_name: '',
    court_id: '',
    circuit_name: '',
    client_id: '',
    client_role: 'plaintiff',
    opponent_name: '',
    opponent_lawyer: '',
    subject: '',
    case_type: 'civil',
    assigned_lawyer_id: currentUserId ? String(currentUserId) : '',
    billing_type: 'fixed',
    contract_amount: '',
    paid_amount: '',
    hourly_rate: '',
    power_of_attorney_num: '',
    status: 'active',
    notes: '',
  };
}

export default function CasesPage({
  initialCaseId = null,
  openCreateOnMount = false,
  onInitialActionHandled,
}) {
  const { currentUser } = useUser();
  const [cases, setCases] = useState([]);
  const [stats, setStats] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [lawyers, setLawyers] = useState([]);
  const [courts, setCourts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const casesRequestId = useRef(0);

  // Filters
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');

  // Modals
  const [selectedCaseId, setSelectedCaseId] = useState(null);
  const [selectedCaseTab, setSelectedCaseTab] = useState('details');
  const [showDocketModal, setShowDocketModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingCaseId, setEditingCaseId] = useState(null);

  const [createForm, setCreateForm] = useState(() => getEmptyCaseForm(currentUser?.id));

  const loadData = useCallback(async () => {
    const requestId = ++casesRequestId.current;
    setLoading(true);
    setLoadError('');
    try {
      if (legalApi.getAllCases.isAvailable()) {
        const data = await legalApi.getAllCases({
          search,
          status: statusFilter,
          case_type: typeFilter,
        });
        if (requestId !== casesRequestId.current) return;
        setCases(data || []);
      }
      if (legalApi.getCasesSummaryStats.isAvailable()) {
        const s = await legalApi.getCasesSummaryStats();
        if (requestId !== casesRequestId.current) return;
        setStats(s);
      }
      if (customersApi.getAllCustomersWithStats.isAvailable()) {
        const custs = await customersApi.getAllCustomersWithStats();
        if (requestId !== casesRequestId.current) return;
        setCustomers(custs || []);
      }
      if (legalApi.getCaseLawyers.isAvailable()) {
        const team = await legalApi.getCaseLawyers();
        if (requestId !== casesRequestId.current) return;
        setLawyers(team || []);
      }
      if (legalApi.getCourts.isAvailable()) {
        const directory = await legalApi.getCourts({ status: 'active', page: 1, pageSize: 100 });
        if (requestId !== casesRequestId.current) return;
        setCourts(directory.items || []);
      }
    } catch (err) {
      console.error('Failed to load cases data:', err);
      if (requestId === casesRequestId.current) {
        setLoadError(err instanceof Error ? err.message : 'حدث خطأ غير متوقع');
      }
    } finally {
      if (requestId === casesRequestId.current) setLoading(false);
    }
  }, [search, statusFilter, typeFilter]);

  useEffect(() => {
    loadData();
    return () => {
      casesRequestId.current += 1;
    };
  }, [loadData]);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (!initialCaseId && !openCreateOnMount) return;
    if (initialCaseId) setSelectedCaseId(initialCaseId);
    if (openCreateOnMount) setShowCreateModal(true);
    onInitialActionHandled?.();
  }, [initialCaseId, onInitialActionHandled, openCreateOnMount]);

  // Handle Create Case
  async function handleCreateCase(e) {
    e.preventDefault();
    if (!createForm.case_number?.trim()) return alert('رقم القضية مطلوب');
    if (!createForm.court_name?.trim()) return alert('اسم المحكمة مطلوب');
    if (!createForm.client_id) return alert('يرجى اختيار الموكّل');
    if (!createForm.opponent_name?.trim()) return alert('اسم الخصم مطلوب');
    if (!createForm.subject?.trim()) return alert('موضوع الدعوى مطلوب');

    try {
      const { paid_amount: initialPayment, ...caseData } = createForm;
      const payload = {
        ...caseData,
        ...(!editingCaseId ? { paid_amount: initialPayment } : {}),
        assigned_lawyer_id: createForm.assigned_lawyer_id || null,
      };
      if (editingCaseId) {
        await legalApi.updateCase(editingCaseId, payload);
      } else {
        await legalApi.createCase(payload);
      }
      setShowCreateModal(false);
      setEditingCaseId(null);
      setCreateForm(getEmptyCaseForm(currentUser?.id));
      await loadData();
    } catch (err) {
      alert(`خطأ أثناء ${editingCaseId ? 'تعديل' : 'حفظ'} القضية: ${err.message}`);
    }
  }

  async function handleEditCase(id) {
    try {
      const legalCase = await legalApi.getCaseById(id);
      if (!legalCase) throw new Error('ملف القضية غير موجود');
      setEditingCaseId(id);
      setCreateForm({
        ...getEmptyCaseForm(currentUser?.id),
        ...legalCase,
        court_id: legalCase.court_id || '',
        client_id: String(legalCase.client_id),
        assigned_lawyer_id: legalCase.assigned_lawyer_id ? String(legalCase.assigned_lawyer_id) : '',
        contract_amount: String(legalCase.contract_amount ?? ''),
        paid_amount: String(legalCase.paid_amount ?? ''),
        hourly_rate: String(legalCase.hourly_rate ?? ''),
      });
      setShowCreateModal(true);
    } catch (err) {
      alert('تعذر فتح بيانات القضية للتعديل: ' + err.message);
    }
  }

  async function handleCloseCase(id, caseNum) {
    if (!window.confirm(`هل تريد إغلاق القضية رقم (${caseNum})؟ سيبقى الملف وسجلاته محفوظة.`)) {
      return;
    }
    try {
      await legalApi.deleteCase(id);
      await loadData();
    } catch (err) {
      alert('تعذر إغلاق القضية: ' + err.message);
    }
  }

  const activeFiltersCount = Number(Boolean(searchInput.trim()))
    + Number(statusFilter !== 'all')
    + Number(typeFilter !== 'all');

  function clearFilters() {
    setSearchInput('');
    setSearch('');
    setStatusFilter('all');
    setTypeFilter('all');
  }

  return (
    <div className="cases-page-container">
      <div className="cases-header">
        <div className="cases-title-area">
          <div className="cases-brand-row">
            <img src={foxLogo} alt="FoxCloud" className="cases-brand-logo" />
            <span className="cases-brand-name">FOX CLOUD</span>
            <span className="cases-brand-divider" />
            <span className="cases-brand-sector"><LegalIcon name="scale" size={15} /> منظومة المحاماة</span>
          </div>
          <h1>إدارة ملفات القضايا</h1>
          <p>مركز موحّد لمتابعة الدعاوى والجلسات والمحاكم والأتعاب والأرشيف القضائي.</p>
        </div>
        <div className="cases-actions-area">
          <button
            type="button"
            className="btn-secondary-legal"
            onClick={() => setShowDocketModal(true)}
          >
            <LegalIcon name="docket" size={17} /> رول جلسات اليوم
          </button>
          <button
            type="button"
            className="btn-primary-legal"
            onClick={() => {
              setEditingCaseId(null);
              setCreateForm(getEmptyCaseForm(currentUser?.id));
              setShowCreateModal(true);
            }}
          >
            <LegalIcon name="add" size={18} /> قيد قضية جديدة
          </button>
        </div>
      </div>

      <div className="cases-stats-row">
        <button type="button" className="stat-card-legal stat-card-action" onClick={clearFilters}>
          <div className="stat-icon-wrapper blue"><LegalIcon name="folder" /></div>
          <div className="stat-content">
            <span className="stat-label">إجمالي ملفات القضايا</span>
            <span className="stat-number">{stats?.total_cases || 0}</span>
          </div>
          <span className="stat-card-hint">عرض الكل</span>
        </button>
        <button type="button" className="stat-card-legal stat-card-action" onClick={() => { setStatusFilter('active'); setTypeFilter('all'); }}>
          <div className="stat-icon-wrapper emerald"><LegalIcon name="scale" /></div>
          <div className="stat-content">
            <span className="stat-label">قضايا متداولة بالجلسات</span>
            <span className="stat-number">{stats?.active_cases || 0}</span>
          </div>
          <span className="stat-card-hint">القضايا النشطة</span>
        </button>
        <button type="button" className="stat-card-legal stat-card-action" onClick={() => setShowDocketModal(true)}>
          <div className="stat-icon-wrapper amber"><LegalIcon name="courthouse" /></div>
          <div className="stat-content">
            <span className="stat-label">جلسات قادمة مجدولة</span>
            <span className="stat-number">{stats?.next_hearings_count || 0}</span>
          </div>
          <span className="stat-card-hint">فتح الرول</span>
        </button>
        <div className="stat-card-legal">
          <div className="stat-icon-wrapper purple"><LegalIcon name="wallet" /></div>
          <div className="stat-content">
            <span className="stat-label">إجمالي الأتعاب المحصلة</span>
            <span className="stat-number">{(stats?.total_paid_fees || 0).toLocaleString('ar-EG')} <small>ج.م</small></span>
          </div>
        </div>
      </div>

      <div className="cases-filters-bar">
        <div className="search-input-wrapper">
          <span className="search-icon-inside"><LegalIcon name="search" size={18} /></span>
          <input
            type="search"
            placeholder="ابحث برقم القضية، اسم المحكمة، الموكّل، أو الخصم..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label="البحث في ملفات القضايا"
          />
        </div>

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="filter-select"
        >
          {CASE_TYPES.map((t) => (
            <option key={t.key} value={t.key}>{t.label}</option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="filter-select"
        >
          {STATUS_FILTERS.map((s) => (
            <option key={s.key} value={s.key}>{s.label}</option>
          ))}
        </select>
        {activeFiltersCount > 0 && (
          <button type="button" className="cases-clear-filters" onClick={clearFilters}>
            مسح الفلاتر <span>{activeFiltersCount}</span>
          </button>
        )}
        <div className="cases-results-count" aria-live="polite">
          {loading ? 'جارٍ تحديث النتائج...' : `${cases.length} ملف`}
        </div>
      </div>

      {loadError && (
        <div className="cases-load-error" role="alert">
          <span>تعذر تحميل بيانات القضايا: {loadError}</span>
          <button type="button" onClick={loadData}>إعادة المحاولة</button>
        </div>
      )}

      <div className="cases-table-wrapper">
        <table className="cases-table">
          <thead>
            <tr>
              <th>رقم القضية</th>
              <th>المحكمة والدائرة</th>
              <th>الموكّل (صفته)</th>
              <th>المحامي المسؤول</th>
              <th>الخصم</th>
              <th>موضوع الدعوى</th>
              <th>الأتعاب (المسدد / الإجمالي)</th>
              <th>الجلسة القادمة</th>
              <th>الحالة</th>
              <th style={{ textAlign: 'center' }}>الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="10" className="cases-loading-cell">
                  <span className="cases-loading-spinner" />
                  <span>{cases.length ? 'جارٍ تحديث ملفات القضايا...' : 'جارٍ تحميل ملفات القضايا...'}</span>
                </td>
              </tr>
            ) : cases.length === 0 ? (
              <tr>
                <td colSpan="10" className="cases-empty-cell">
                  <span className="cases-empty-icon"><LegalIcon name="empty" size={30} /></span>
                  <strong>{activeFiltersCount ? 'لا توجد ملفات مطابقة' : 'ابدأ أول ملف قضية في مكتبك'}</strong>
                  <p>{activeFiltersCount ? 'جرّب تغيير كلمات البحث أو إزالة بعض الفلاتر.' : 'سجّل بيانات القضية والمحكمة والموكّل لتبدأ متابعة الجلسات والمستندات.'}</p>
                  {activeFiltersCount ? (
                    <button type="button" className="cases-empty-action" onClick={clearFilters}>إزالة الفلاتر</button>
                  ) : (
                    <button type="button" className="cases-empty-action" onClick={() => {
                      setEditingCaseId(null);
                      setCreateForm(getEmptyCaseForm(currentUser?.id));
                      setShowCreateModal(true);
                    }}><LegalIcon name="add" size={16} /> قيد قضية جديدة</button>
                  )}
                </td>
              </tr>
            ) : (
              cases.map((c) => (
                <tr key={c.id}>
                  <td>
                    <span className="case-num-badge">{c.case_number}</span>
                  </td>
                  <td>
                    <div className="court-info">
                      <span className="court-name-bold">
                        {courts.find((court) => String(court.id) === String(c.court_id))?.name || c.court_name}
                      </span>
                      {c.circuit_name && <span className="circuit-sub">{c.circuit_name}</span>}
                    </div>
                  </td>
                  <td>
                    <div>
                      <strong style={{ color: '#0f172a' }}>{c.client_name || 'غير محدد'}</strong>
                      <div>
                        <span className={`party-tag ${c.client_role === 'plaintiff' ? 'plaintiff' : 'defendant'}`}>
                          {c.client_role === 'plaintiff' ? 'مدعي' : 'مدعى عليه'}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td>{c.assigned_lawyer_name || 'غير معين'}</td>
                  <td>
                    <span style={{ color: '#b91c1c', fontWeight: 600 }}>{c.opponent_name}</span>
                  </td>
                  <td style={{ maxWidth: '240px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {c.subject}
                  </td>
                  <td>
                    <div style={{ fontSize: '0.85rem' }}>
                      <strong style={{ color: '#059669' }}>{(c.paid_amount || 0).toLocaleString()}</strong> / {(c.contract_amount || 0).toLocaleString()} EGP
                    </div>
                  </td>
                  <td>
                    {c.next_session_date ? (
                      <span style={{ color: '#1d4ed8', fontWeight: 700 }}>
                        {new Date(c.next_session_date).toLocaleDateString('ar-EG')}
                      </span>
                    ) : (
                      <span style={{ color: '#94a3b8' }}>لا توجد</span>
                    )}
                  </td>
                  <td>
                    <span className={`status-badge ${c.status}`}>
                      {STATUS_FILTERS.find((status) => status.key === c.status)?.label || c.status}
                    </span>
                  </td>
                  <td>
                    <div className="table-actions" style={{ justifyContent: 'center' }}>
                      <button
                        type="button"
                        className="btn-icon-action primary-action"
                        onClick={() => {
                          setSelectedCaseTab('details');
                          setSelectedCaseId(c.id);
                        }}
                        title="فتح ملف القضية الكامل"
                      >
                        <LegalIcon name="open" size={15} /> فتح الملف
                      </button>
                      <button
                        type="button"
                        className="btn-icon-action"
                        onClick={() => {
                          setSelectedCaseTab('tasks');
                          setSelectedCaseId(c.id);
                        }}
                        title="فتح مهام ومتابعات القضية"
                      >
                        مهام المتابعة
                      </button>
                      <button
                        type="button"
                        className="btn-icon-action"
                        onClick={() => handleEditCase(c.id)}
                        title="تعديل بيانات القضية"
                      >
                        <LegalIcon name="edit" size={15} /> تعديل
                      </button>
                      <button
                        type="button"
                        className="btn-icon-action danger-action"
                        onClick={() => handleCloseCase(c.id, c.case_number)}
                        title="إغلاق القضية مع الاحتفاظ بسجلاتها"
                      >
                        <LegalIcon name="close" size={15} /> إغلاق
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* MODAL 1: Create Case Modal */}
      {showCreateModal && (
        <div className="legal-modal-overlay" onClick={() => {
          setShowCreateModal(false);
          setEditingCaseId(null);
        }}>
          <div className="legal-modal-container legal-case-create-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '850px' }}>
            <div className="legal-modal-header">
              <h2><LegalIcon name={editingCaseId ? 'edit' : 'scale'} size={21} /> {editingCaseId ? 'تعديل بيانات القضية' : 'قيد وتوثيق ملف قضية جديدة'}</h2>
              <button type="button" className="modal-close-btn" onClick={() => {
                setShowCreateModal(false);
                setEditingCaseId(null);
              }}>✕</button>
            </div>
            <form className="legal-case-create-form" onSubmit={handleCreateCase}>
              <div className="legal-modal-body">
                <div className="form-grid-2">
                  <div className="form-group">
                    <label>رقم القضية الرسمي *</label>
                    <input
                      type="text"
                      required
                      placeholder="مثال: 1250 لسنة 2026 مدني كلي"
                      value={createForm.case_number}
                      onChange={(e) => setCreateForm({ ...createForm, case_number: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="case-court">المحكمة *</label>
                    <select
                      id="case-court"
                      value={createForm.court_id || (createForm.court_name ? 'manual' : '')}
                      onChange={(e) => {
                        const selectedId = e.target.value;
                        if (selectedId === 'manual') {
                          setCreateForm({ ...createForm, court_id: '', court_name: '' });
                        } else if (!selectedId) {
                          setCreateForm({ ...createForm, court_id: '', court_name: '' });
                        } else {
                          const selectedCourt = courts.find((court) => String(court.id) === selectedId);
                          setCreateForm({
                            ...createForm,
                            court_id: selectedId,
                            court_name: selectedCourt?.name || createForm.court_name,
                          });
                        }
                      }}
                    >
                      <option value="">اختر المحكمة</option>
                      {courts.map((court) => (
                        <option key={court.id} value={court.id}>{court.name}</option>
                      ))}
                      {createForm.court_id && !courts.some((court) => String(court.id) === String(createForm.court_id)) && (
                        <option value={createForm.court_id}>{createForm.court_name} (المحكمة الحالية)</option>
                      )}
                      <option value="manual">إدخال اسم يدويًا</option>
                    </select>
                    {(!createForm.court_id || createForm.court_id === 'manual') && (
                      <input
                        type="text"
                        required
                        maxLength={180}
                        placeholder="اكتب اسم المحكمة"
                        aria-label="اسم المحكمة"
                        value={createForm.court_name}
                        onChange={(e) => setCreateForm({ ...createForm, court_id: '', court_name: e.target.value })}
                      />
                    )}
                  </div>

                  <div className="form-group">
                    <label>الدائرة المختصة</label>
                    <input
                      type="text"
                      placeholder="مثال: دائرة 3 تعويضات"
                      value={createForm.circuit_name}
                      onChange={(e) => setCreateForm({ ...createForm, circuit_name: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label>نوع القضية</label>
                    <select
                      value={createForm.case_type}
                      onChange={(e) => setCreateForm({ ...createForm, case_type: e.target.value })}
                    >
                      <option value="civil">مدني وتعويضات</option>
                      <option value="commercial">تجاري واقتصادي</option>
                      <option value="criminal">جنائي وجنح</option>
                      <option value="labor">عمالي ومنازعات عمل</option>
                      <option value="family">أسرة وأحوال شخصية</option>
                      <option value="contracts">عقود واستشارات</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label>المحامي المسؤول</label>
                    <select
                      value={createForm.assigned_lawyer_id}
                      onChange={(e) => setCreateForm({ ...createForm, assigned_lawyer_id: e.target.value })}
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
                    <label>الموكّل (العميل) *</label>
                    <select
                      required
                      value={createForm.client_id}
                      onChange={(e) => setCreateForm({ ...createForm, client_id: e.target.value })}
                    >
                      <option value="">-- اختر الموكّل من القائمة --</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>{c.name} {c.phone ? `(${c.phone})` : ''}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label>صفة الموكّل في الدعوى</label>
                    <select
                      value={createForm.client_role}
                      onChange={(e) => setCreateForm({ ...createForm, client_role: e.target.value })}
                    >
                      <option value="plaintiff">مدعي / طالب / مستأنف</option>
                      <option value="defendant">مدعى عليه / مطلوب ضده / مستأنف ضده</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label>اسم الخصم (الطرف الآخر) *</label>
                    <input
                      type="text"
                      required
                      placeholder="اسم الخصم أو اسم الشركة الخصم"
                      value={createForm.opponent_name}
                      onChange={(e) => setCreateForm({ ...createForm, opponent_name: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label>محامي الخصم</label>
                    <input
                      type="text"
                      placeholder="اسم محامي الخصم إن وجد"
                      value={createForm.opponent_lawyer}
                      onChange={(e) => setCreateForm({ ...createForm, opponent_lawyer: e.target.value })}
                    />
                  </div>

                  <div className="form-group full-width">
                    <label>موضوع الدعوى والطلبات *</label>
                    <textarea
                      rows="2"
                      required
                      placeholder="ملخص موضوع الدعوى والطلبات الختامية..."
                      value={createForm.subject}
                      onChange={(e) => setCreateForm({ ...createForm, subject: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label>إجمالي أتعاب العقد (EGP)</label>
                    <input
                      type="number"
                      min="0"
                      placeholder="0.00"
                      value={createForm.contract_amount}
                      onChange={(e) => setCreateForm({ ...createForm, contract_amount: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label>نظام الأتعاب</label>
                    <select
                      value={createForm.billing_type}
                      onChange={(e) => setCreateForm({ ...createForm, billing_type: e.target.value })}
                    >
                      <option value="fixed">مقطوعة</option>
                      <option value="hourly">بالساعة</option>
                      <option value="contingency">نسبة من المحكوم به</option>
                    </select>
                  </div>

                  {createForm.billing_type === 'hourly' && (
                    <div className="form-group">
                      <label>سعر الساعة (EGP)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={createForm.hourly_rate}
                        onChange={(e) => setCreateForm({ ...createForm, hourly_rate: e.target.value })}
                      />
                    </div>
                  )}

                  {editingCaseId && (
                    <div className="form-group">
                      <label>حالة القضية</label>
                      <select
                        value={createForm.status}
                        onChange={(e) => setCreateForm({ ...createForm, status: e.target.value })}
                      >
                        {STATUS_FILTERS.filter((status) => status.key !== 'all').map((status) => (
                          <option key={status.key} value={status.key}>{status.label}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {!editingCaseId ? (
                    <div className="form-group">
                      <label>دفعة الأتعاب عند فتح الملف (EGP)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        value={createForm.paid_amount}
                        onChange={(e) => setCreateForm({ ...createForm, paid_amount: e.target.value })}
                      />
                      <small>سيتم تسجيلها تلقائيًا كحركة مالية وإيصال في سجل القضية.</small>
                    </div>
                  ) : (
                    <div className="form-group">
                      <label>المسدد من الأتعاب</label>
                      <div className="case-paid-amount-note">
                        {(Number(createForm.paid_amount) || 0).toLocaleString('ar-EG')} EGP
                        <small>لتعديل المبلغ، أضف أو عدّل حركة «سداد أتعاب» من الملف المالي للقضية.</small>
                      </div>
                    </div>
                  )}

                  <div className="form-group full-width">
                    <label>رقم التوكيل ومكتب التوثيق</label>
                    <input
                      type="text"
                      placeholder="مثال: توكيل رسمي عام قضايا رقم 1452 ب لسنة 2026 توثيق الأهرام"
                      value={createForm.power_of_attorney_num}
                      onChange={(e) => setCreateForm({ ...createForm, power_of_attorney_num: e.target.value })}
                    />
                  </div>

                  <div className="form-group full-width">
                    <label>ملاحظات القضية</label>
                    <textarea
                      rows="2"
                      value={createForm.notes || ''}
                      onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
                    />
                  </div>
                </div>
              </div>
              <div className="legal-modal-footer">
                <button type="button" className="btn-secondary-legal" onClick={() => {
                  setShowCreateModal(false);
                  setEditingCaseId(null);
                }}>إلغاء</button>
                <button type="submit" className="btn-primary-legal">{editingCaseId ? 'حفظ التعديلات' : 'حفظ وقيد القضية'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Full Case Details & Tabs Modal */}
      {selectedCaseId && (
        <CaseDetailsModal
          key={`${selectedCaseId}-${selectedCaseTab}`}
          caseId={selectedCaseId}
          initialTab={selectedCaseTab}
          onClose={() => setSelectedCaseId(null)}
          onRefreshList={loadData}
          lawyers={lawyers}
          courts={courts}
          currentUser={currentUser}
        />
      )}

      {/* MODAL 3: Daily Court Docket Modal */}
      {showDocketModal && (
        <DailyDocketModal
          onClose={() => setShowDocketModal(false)}
        />
      )}
    </div>
  );
}
