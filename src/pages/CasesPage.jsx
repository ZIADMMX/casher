import { useState, useEffect, useCallback } from 'react';
import '../styles/cases.css';
import CaseDetailsModal from '../components/legal/CaseDetailsModal.jsx';
import DailyDocketModal from '../components/legal/DailyDocketModal.jsx';

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

export default function CasesPage() {
  const [cases, setCases] = useState([]);
  const [stats, setStats] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');

  // Modals
  const [selectedCaseId, setSelectedCaseId] = useState(null);
  const [showDocketModal, setShowDocketModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Create Case Form State
  const [createForm, setCreateForm] = useState({
    case_number: '',
    court_name: '',
    circuit_name: '',
    client_id: '',
    client_role: 'plaintiff',
    opponent_name: '',
    opponent_lawyer: '',
    subject: '',
    case_type: 'civil',
    billing_type: 'fixed',
    contract_amount: '',
    paid_amount: '',
    hourly_rate: '',
    power_of_attorney_num: '',
    notes: '',
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (window.electronAPI?.getAllCases) {
        const data = await window.electronAPI.getAllCases({
          search,
          status: statusFilter,
          case_type: typeFilter,
        });
        setCases(data || []);
      }
      if (window.electronAPI?.getCasesSummaryStats) {
        const s = await window.electronAPI.getCasesSummaryStats();
        setStats(s);
      }
      if (window.electronAPI?.getAllCustomers) {
        const custs = await window.electronAPI.getAllCustomers();
        setCustomers(custs || []);
      }
    } catch (err) {
      console.error('Failed to load cases data:', err);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, typeFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle Create Case
  async function handleCreateCase(e) {
    e.preventDefault();
    if (!createForm.case_number?.trim()) return alert('رقم القضية مطلوب');
    if (!createForm.court_name?.trim()) return alert('اسم المحكمة مطلوب');
    if (!createForm.client_id) return alert('يرجى اختيار الموكّل');
    if (!createForm.opponent_name?.trim()) return alert('اسم الخصم مطلوب');
    if (!createForm.subject?.trim()) return alert('موضوع الدعوى مطلوب');

    try {
      await window.electronAPI.createCase(createForm);
      setShowCreateModal(false);
      setCreateForm({
        case_number: '',
        court_name: '',
        circuit_name: '',
        client_id: '',
        client_role: 'plaintiff',
        opponent_name: '',
        opponent_lawyer: '',
        subject: '',
        case_type: 'civil',
        billing_type: 'fixed',
        contract_amount: '',
        paid_amount: '',
        hourly_rate: '',
        power_of_attorney_num: '',
        notes: '',
      });
      await loadData();
    } catch (err) {
      alert('خطأ أثناء حفظ القضية: ' + err.message);
    }
  }

  // Handle Delete Case
  async function handleDeleteCase(id, caseNum) {
    if (!window.confirm(`هل أنت متأكد من حذف ملف القضية رقم (${caseNum})؟ سيتم حذف كافة جلساتها ومستنداتها المرتبطة.`)) {
      return;
    }
    try {
      await window.electronAPI.deleteCase(id);
      await loadData();
    } catch (err) {
      alert('تعذر حذف القضية: ' + err.message);
    }
  }

  return (
    <div className="cases-page-container">
      {/* Top Header */}
      <div className="cases-header">
        <div className="cases-title-area">
          <h1>⚖️ مركز إدارة القضايا والمحاكم</h1>
          <p>إدارة ملفات الدعاوى، جلسات المحاكم والرول اليومي، أمانات الموكلين والأرشيف القضائي</p>
        </div>
        <div className="cases-actions-area">
          <button
            type="button"
            className="btn-secondary-legal"
            onClick={() => setShowDocketModal(true)}
          >
            📋 رول جلسات اليوم
          </button>
          <button
            type="button"
            className="btn-primary-legal"
            onClick={() => setShowCreateModal(true)}
          >
            + قيد قضية جديدة
          </button>
        </div>
      </div>

      {/* KPI Stats Row */}
      <div className="cases-stats-row">
        <div className="stat-card-legal">
          <div className="stat-icon-wrapper blue">📁</div>
          <div className="stat-content">
            <span className="stat-label">إجمالي ملفات القضايا</span>
            <span className="stat-number">{stats?.total_cases || 0}</span>
          </div>
        </div>
        <div className="stat-card-legal">
          <div className="stat-icon-wrapper emerald">⚖️</div>
          <div className="stat-content">
            <span className="stat-label">قضايا متداولة بالجلسات</span>
            <span className="stat-number">{stats?.active_cases || 0}</span>
          </div>
        </div>
        <div className="stat-card-legal">
          <div className="stat-icon-wrapper amber">🏛️</div>
          <div className="stat-content">
            <span className="stat-label">جلسات قادمة مجدولة</span>
            <span className="stat-number">{stats?.next_hearings_count || 0}</span>
          </div>
        </div>
        <div className="stat-card-legal">
          <div className="stat-icon-wrapper purple">💰</div>
          <div className="stat-content">
            <span className="stat-label">إجمالي الأتعاب المحصلة</span>
            <span className="stat-number">{(stats?.total_paid_fees || 0).toLocaleString()} EGP</span>
          </div>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="cases-filters-bar">
        <div className="search-input-wrapper">
          <span className="search-icon-inside">🔍</span>
          <input
            type="text"
            placeholder="ابحث برقم القضية، اسم المحكمة، الموكّل، أو الخصم..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
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
      </div>

      {/* Main Table */}
      <div className="cases-table-wrapper">
        <table className="cases-table">
          <thead>
            <tr>
              <th>رقم القضية</th>
              <th>المحكمة والدائرة</th>
              <th>الموكّل (صفته)</th>
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
                <td colSpan="9" style={{ textAlign: 'center', padding: '36px', color: '#64748b' }}>
                  جاري تحميل القضايا...
                </td>
              </tr>
            ) : cases.length === 0 ? (
              <tr>
                <td colSpan="9" style={{ textAlign: 'center', padding: '48px 20px', color: '#64748b' }}>
                  <div style={{ fontSize: '2rem', marginBottom: '8px' }}>⚖️</div>
                  <p style={{ margin: 0, fontSize: '1rem' }}>لا توجد قضايا مطابقة للبحث أو الفلترة المحددة</p>
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
                      <span className="court-name-bold">{c.court_name}</span>
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
                      {c.status === 'active' ? 'متداولة' :
                       c.status === 'adjourned' ? 'مؤجلة' :
                       c.status === 'judged' ? 'محكوم بها' :
                       c.status === 'appealed' ? 'مستأنفة' : 'منتهية'}
                    </span>
                  </td>
                  <td>
                    <div className="table-actions" style={{ justifyContent: 'center' }}>
                      <button
                        type="button"
                        className="btn-icon-action primary-action"
                        onClick={() => setSelectedCaseId(c.id)}
                        title="فتح ملف القضية الكامل"
                      >
                        📂 فتح الملف
                      </button>
                      <button
                        type="button"
                        className="btn-icon-action danger-action"
                        onClick={() => handleDeleteCase(c.id, c.case_number)}
                        title="حذف القضية"
                      >
                        🗑️
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
        <div className="legal-modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="legal-modal-container" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '850px' }}>
            <div className="legal-modal-header">
              <h2>⚖️ قيد وتوثيق ملف قضية جديدة</h2>
              <button type="button" className="modal-close-btn" onClick={() => setShowCreateModal(false)}>✕</button>
            </div>
            <form onSubmit={handleCreateCase}>
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
                    <label>اسم المحكمة *</label>
                    <input
                      type="text"
                      required
                      placeholder="مثال: محكمة جنوب القاهرة الابتدائية"
                      value={createForm.court_name}
                      onChange={(e) => setCreateForm({ ...createForm, court_name: e.target.value })}
                    />
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
                    <label>المسدد مقدماً من الأتعاب (EGP)</label>
                    <input
                      type="number"
                      min="0"
                      placeholder="0.00"
                      value={createForm.paid_amount}
                      onChange={(e) => setCreateForm({ ...createForm, paid_amount: e.target.value })}
                    />
                  </div>

                  <div className="form-group full-width">
                    <label>رقم التوكيل ومكتب التوثيق</label>
                    <input
                      type="text"
                      placeholder="مثال: توكيل رسمي عام قضايا رقم 1452 ب لسنة 2026 توثيق الأهرام"
                      value={createForm.power_of_attorney_num}
                      onChange={(e) => setCreateForm({ ...createForm, power_of_attorney_num: e.target.value })}
                    />
                  </div>
                </div>
              </div>
              <div className="legal-modal-footer">
                <button type="button" className="btn-secondary-legal" onClick={() => setShowCreateModal(false)}>إلغاء</button>
                <button type="submit" className="btn-primary-legal">حفظ وقيد القضية</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Full Case Details & Tabs Modal */}
      {selectedCaseId && (
        <CaseDetailsModal
          caseId={selectedCaseId}
          onClose={() => setSelectedCaseId(null)}
          onRefreshList={loadData}
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
