import { useState, useEffect, useCallback, useRef } from 'react';
import '../styles/cases.css';
import CaseDetailsModal from '../components/legal/CaseDetailsModal.jsx';
import DailyDocketModal from '../components/legal/DailyDocketModal.jsx';
import LegalHero from '../components/legal/LegalHero.jsx';
import CaseFormModal from '../components/legal/CaseFormModal.jsx';
import { useUser } from '../contexts/UserContext.jsx';
import * as customersApi from '../api/customers.js';
import * as legalApi from '../api/legal.js';
import {
  CASE_STATUSES, CASE_TYPES, CLIENT_ROLE_LABELS, feeProgress, formatMoney, nextSessionInfo,
} from '../utils/legalCases.js';

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
  eye: <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
  calendarPlus: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18M12 13v5M9.5 15.5h5" /></>,
  cash: <><rect x="3" y="6" width="18" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M6 9v.01M18 15v.01" /></>,
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
  onNavigate,
  initialCaseId = null,
  openCreateOnMount = false,
  onInitialActionHandled,
}) {
  const { currentUser } = useUser();
  const [cases, setCases] = useState([]);
  const [stats, setStats] = useState(null);
  const [statusCounts, setStatusCounts] = useState(null);
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
  const [caseFormError, setCaseFormError] = useState('');
  const [savingCase, setSavingCase] = useState(false);

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
      if (legalApi.getCaseStatusCounts.isAvailable()) {
        const counts = await legalApi.getCaseStatusCounts({ search, case_type: typeFilter });
        if (requestId !== casesRequestId.current) return;
        setStatusCounts(counts);
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
  function closeCaseForm() {
    setShowCreateModal(false);
    setEditingCaseId(null);
    setCaseFormError('');
  }

  async function handleCreateCase(e) {
    e.preventDefault();
    const contract = Number(createForm.contract_amount || 0);
    const paid = Number(createForm.paid_amount || 0);
    const problem = (!createForm.case_number?.trim() && 'رقم القضية مطلوب')
      || (!createForm.court_name?.trim() && 'اسم المحكمة مطلوب')
      || (!createForm.client_id && 'يرجى اختيار الموكّل')
      || (!createForm.assigned_lawyer_id && 'يرجى اختيار المحامي المسؤول عن الملف')
      || (!createForm.opponent_name?.trim() && 'اسم الخصم مطلوب')
      || (!createForm.subject?.trim() && 'موضوع الدعوى مطلوب')
      || ((contract < 0 || paid < 0) && 'المبالغ لا يمكن أن تكون بالسالب')
      || (!editingCaseId && contract > 0 && paid > contract && 'الدفعة المقدمة أكبر من إجمالي أتعاب العقد');
    if (problem) return setCaseFormError(problem);

    setSavingCase(true);
    setCaseFormError('');
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
      closeCaseForm();
      setCreateForm(getEmptyCaseForm(currentUser?.id));
      await loadData();
    } catch (err) {
      setCaseFormError(`خطأ أثناء ${editingCaseId ? 'تعديل' : 'حفظ'} القضية: ${err.message}`);
    } finally {
      setSavingCase(false);
    }
  }

  async function handleEditCase(id) {
    try {
      const legalCase = await legalApi.getCaseById(id);
      if (!legalCase) throw new Error('ملف القضية غير موجود');
      setEditingCaseId(id);
      setCaseFormError('');
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

  const activeFiltersCount = Number(Boolean(searchInput.trim()))
    + Number(statusFilter !== 'all')
    + Number(typeFilter !== 'all');

  function clearFilters() {
    setSearchInput('');
    setSearch('');
    setStatusFilter('all');
    setTypeFilter('all');
  }

  const openCreate = () => {
    setEditingCaseId(null);
    setCaseFormError('');
    setCreateForm(getEmptyCaseForm(currentUser?.id));
    setShowCreateModal(true);
  };
  const openCase = (id, tab) => {
    setSelectedCaseTab(tab);
    setSelectedCaseId(id);
  };

  return (
    <div className="cases-page-container legal-cases-page">
      <LegalHero
        title="إدارة ملفات القضايا"
        subtitle="الدعاوى والجلسات والمحاكم والأتعاب والأرشيف القضائي"
        active="cases"
        onSelect={(key) => onNavigate?.('appointments', { tab: key })}
        actions={(
          <>
            <button type="button" className="legal-hero-button" onClick={() => setShowDocketModal(true)}>
              <LegalIcon name="docket" size={17} /> رول جلسات اليوم
            </button>
            <button type="button" className="legal-hero-button primary" onClick={openCreate}>
              <LegalIcon name="add" size={18} /> قيد قضية جديدة
            </button>
          </>
        )}
      />

      <div className="legal-cases-stats">
        <button type="button" className="legal-cases-stat" onClick={clearFilters}>
          <span className="legal-cases-stat-icon orange"><LegalIcon name="folder" /></span>
          <span className="legal-cases-stat-body">
            <span className="legal-cases-stat-label">إجمالي ملفات القضايا</span>
            <strong>{stats?.total_cases || 0} <small>ملف</small></strong>
            <span className="legal-cases-stat-note">منها {stats?.closed_cases || 0} منتهية</span>
          </span>
        </button>
        <button type="button" className="legal-cases-stat" onClick={() => { setStatusFilter('active'); setTypeFilter('all'); }}>
          <span className="legal-cases-stat-icon green"><LegalIcon name="scale" /></span>
          <span className="legal-cases-stat-body">
            <span className="legal-cases-stat-label">قضايا متداولة</span>
            <strong>{stats?.active_cases || 0} <small>ملف</small></strong>
            <span className="legal-cases-stat-note">قيد التداول أمام المحاكم</span>
          </span>
        </button>
        <button type="button" className="legal-cases-stat" onClick={() => setShowDocketModal(true)}>
          <span className="legal-cases-stat-icon blue"><LegalIcon name="calendar" /></span>
          <span className="legal-cases-stat-body">
            <span className="legal-cases-stat-label">جلسات قادمة</span>
            <strong>{stats?.next_hearings_count || 0} <small>جلسة</small></strong>
            <span className="legal-cases-stat-note">خلال 30 يومًا</span>
          </span>
        </button>
        <div className="legal-cases-stat">
          <span className="legal-cases-stat-icon yellow"><LegalIcon name="cash" /></span>
          <span className="legal-cases-stat-body">
            <span className="legal-cases-stat-label">الأتعاب المحصّلة</span>
            <strong>{formatMoney(stats?.total_paid_fees)} <small>ج.م</small></strong>
            <span className="legal-cases-stat-note">من إجمالي {formatMoney(stats?.total_contracts_value)} ج.م</span>
          </span>
        </div>
      </div>

      <section className="legal-cases-panel">
        <div className="legal-cases-panel-head">
          <h2>ملفات القضايا <small>({cases.length} ملف)</small></h2>
          <div className="legal-cases-filters">
            <label className="legal-cases-search">
              <LegalIcon name="search" size={18} />
              <input
                type="search"
                placeholder="ابحث برقم القضية أو الموكّل أو الخصم..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                aria-label="البحث في ملفات القضايا"
              />
            </label>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} aria-label="نوع القضية">
              {CASE_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </div>
        </div>

        <div className="legal-cases-chips" role="group" aria-label="تصفية حسب الحالة">
          {[['all', 'الكل'], ...CASE_STATUSES].map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={statusFilter === key ? 'active' : ''}
              aria-pressed={statusFilter === key}
              onClick={() => setStatusFilter(key)}
            >
              {label} <span>{statusCounts?.[key] ?? 0}</span>
            </button>
          ))}
        </div>

        {loadError && (
          <div className="cases-load-error" role="alert">
            <span>تعذر تحميل بيانات القضايا: {loadError}</span>
            <button type="button" onClick={loadData}>إعادة المحاولة</button>
          </div>
        )}

        <div className="legal-cases-table-wrap">
          <table className="legal-cases-table">
            <thead>
              <tr>
                <th>القضية</th>
                <th>المحكمة والدائرة</th>
                <th>الأطراف</th>
                <th>المحامي المسؤول</th>
                <th>الجلسة القادمة</th>
                <th>الأتعاب</th>
                <th>الحالة</th>
                <th><span className="legal-cases-sr">الإجراءات</span></th>
              </tr>
            </thead>
            <tbody>
              {loading && !cases.length ? (
                <tr>
                  <td colSpan="8" className="cases-loading-cell">
                    <span className="cases-loading-spinner" />
                    <span>جارٍ تحميل ملفات القضايا...</span>
                  </td>
                </tr>
              ) : cases.length === 0 ? (
                <tr>
                  <td colSpan="8" className="cases-empty-cell">
                    <span className="cases-empty-icon"><LegalIcon name="empty" size={30} /></span>
                    <strong>{activeFiltersCount ? 'لا توجد ملفات مطابقة' : 'ابدأ أول ملف قضية في مكتبك'}</strong>
                    <p>{activeFiltersCount ? 'جرّب تغيير كلمات البحث أو إزالة بعض الفلاتر.' : 'سجّل بيانات القضية والمحكمة والموكّل لتبدأ متابعة الجلسات والمستندات.'}</p>
                    {activeFiltersCount ? (
                      <button type="button" className="cases-empty-action" onClick={clearFilters}>إزالة الفلاتر</button>
                    ) : (
                      <button type="button" className="cases-empty-action" onClick={openCreate}><LegalIcon name="add" size={16} /> قيد قضية جديدة</button>
                    )}
                  </td>
                </tr>
              ) : (
                cases.map((c) => {
                  const fee = feeProgress(c);
                  const next = nextSessionInfo(c);
                  const statusLabel = CASE_STATUSES.find(([key]) => key === c.status)?.[1] || c.status;
                  return (
                    <tr key={c.id}>
                      <td>
                        <strong className="legal-cases-number">{c.case_number}</strong>
                        <span className="legal-cases-sub">{CASE_TYPES.find((t) => t.key === c.case_type)?.label || c.case_type}</span>
                      </td>
                      <td>
                        <span className="legal-cases-strong">{courts.find((court) => String(court.id) === String(c.court_id))?.name || c.court_name}</span>
                        {c.circuit_name && <span className="legal-cases-sub">{c.circuit_name}</span>}
                      </td>
                      <td>
                        <span className="legal-cases-party client">
                          {c.client_name || 'غير محدد'} <small>({CLIENT_ROLE_LABELS[c.client_role] || c.client_role})</small>
                        </span>
                        <span className="legal-cases-party opponent">ضد {c.opponent_name}</span>
                      </td>
                      <td><span className="legal-cases-strong">{c.assigned_lawyer_name || 'غير معيّن'}</span></td>
                      <td>
                        {next.label
                          ? <span className="legal-cases-date">{next.label}</span>
                          : <span className="legal-cases-date none">—</span>}
                        <span className="legal-cases-sub">{next.note}</span>
                      </td>
                      <td className="legal-cases-fees">
                        {fee.total > 0 ? (
                          <>
                            <span><strong>{formatMoney(fee.paid)}</strong> / {formatMoney(fee.total)} ج.م</span>
                            <span className={`legal-cases-bar${fee.settled ? ' settled' : ''}`} role="img" aria-label={`مسدد ${fee.percent}%`}>
                              <span style={{ inlineSize: `${fee.percent}%` }} />
                            </span>
                            <span className="legal-cases-sub">{fee.settled ? 'مسدد بالكامل' : `متبقٍ ${formatMoney(fee.remaining)} ج.م`}</span>
                          </>
                        ) : (
                          <>
                            <span><strong>{formatMoney(fee.paid)}</strong> ج.م</span>
                            <span className="legal-cases-sub">{c.billing_type === 'hourly' ? 'أتعاب بالساعة' : 'بدون أتعاب متفق عليها'}</span>
                          </>
                        )}
                      </td>
                      <td><span className={`legal-cases-status ${c.status}`}>{statusLabel}</span></td>
                      <td>
                        <div className="legal-cases-actions">
                          <button type="button" title="فتح ملف القضية" aria-label={`فتح ملف القضية ${c.case_number}`} onClick={() => openCase(c.id, 'details')}>
                            <LegalIcon name="eye" size={18} />
                          </button>
                          <button type="button" title="جلسات القضية" aria-label={`جلسات القضية ${c.case_number}`} onClick={() => openCase(c.id, 'sessions')}>
                            <LegalIcon name="calendarPlus" size={18} />
                          </button>
                          <button type="button" title="تعديل بيانات القضية" aria-label={`تعديل القضية ${c.case_number}`} onClick={() => handleEditCase(c.id)}>
                            <LegalIcon name="edit" size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {showCreateModal && (
        <CaseFormModal
          form={createForm}
          setForm={setCreateForm}
          editing={Boolean(editingCaseId)}
          courts={courts}
          customers={customers}
          lawyers={lawyers}
          saving={savingCase}
          error={caseFormError}
          onSubmit={handleCreateCase}
          onClose={closeCaseForm}
        />
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
