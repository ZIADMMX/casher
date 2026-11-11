import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatProductImageUrl } from '../utils/media.js';
import * as attendanceApi from '../api/attendance.js';
import * as usersApi from '../api/users.js';
import { HrEmpty, HrHeader, HrStat } from '../components/hr/HrLayout.jsx';
import { CalendarIcon, CheckIcon, ClockIcon, CloseIcon, PlusIcon } from '../components/icons/PosIcons.jsx';
import { LEAVE_FILTERS, filterLeaves, leaveDays, localDateString, summarizeLeaves } from '../utils/hrStats.js';
import '../styles/leaves.css';

const EMPTY_FORM = {
  userId: '',
  startDate: '',
  endDate: '',
  reason: '',
  autoApprove: false,
};

const STATUS_META = {
  pending: { label: 'بانتظار الرد', tone: 'warning' },
  approved: { label: 'مقبولة', tone: 'success' },
  rejected: { label: 'مرفوضة', tone: 'danger' },
};

function getEmployeeName(request) {
  return request.full_name
    || [request.first_name, request.last_name].filter(Boolean).join(' ')
    || request.username;
}

function formatDate(value) {
  if (!value) return '—';
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('ar-EG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatDays(days) {
  if (days === 1) return 'يوم واحد';
  if (days === 2) return 'يومين';
  return `${days.toLocaleString('ar-EG')} ${days <= 10 ? 'أيام' : 'يوم'}`;
}

export default function LeavesPage({ onNavigate }) {
  const [items, setItems] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [processingId, setProcessingId] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const today = localDateString();
  const stats = useMemo(() => summarizeLeaves(items, today), [items, today]);
  const visibleItems = useMemo(() => filterLeaves(items, statusFilter), [items, statusFilter]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [leaveData, userData] = await Promise.all([
        attendanceApi.getLeaveRequests(),
        usersApi.getAllUsers(),
      ]);
      if (!leaveData || !Array.isArray(leaveData.items) || !Array.isArray(userData)) {
        throw new Error('استجابة بيانات الإجازات غير مكتملة.');
      }
      setItems(leaveData.items);
      setEmployees(userData.filter((user) => user.is_active));
    } catch (requestError) {
      setError(requestError.message || 'تعذر تحميل بيانات الإجازات.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function openForm() {
    setShowForm(true);
    setError('');
  }

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setError('');
  }

  function closeForm() {
    if (saving) return;
    setShowForm(false);
    setForm(EMPTY_FORM);
  }

  async function handleCreateRequest(event) {
    event.preventDefault();
    if (!form.userId || !form.startDate || !form.endDate || !form.reason.trim()) {
      setError('أكمل الموظف والتواريخ وسبب الإجازة.');
      return;
    }
    if (form.endDate < form.startDate) {
      setError('تاريخ نهاية الإجازة يجب أن يكون في نفس يوم البداية أو بعده.');
      return;
    }

    setSaving(true);
    setError('');
    setNotice('');
    try {
      await attendanceApi.createLeaveRequest({
        ...form,
        userId: Number(form.userId),
        reason: form.reason.trim(),
      });
      setNotice(form.autoApprove ? 'تم إنشاء الإجازة واعتمادها تلقائيًا.' : 'تم إرسال طلب الإجازة للمراجعة.');
      setShowForm(false);
      setForm(EMPTY_FORM);
      await loadData();
    } catch (requestError) {
      setError(requestError.message || 'تعذر إنشاء طلب الإجازة.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDecision(requestId, decision) {
    setProcessingId(requestId);
    setError('');
    setNotice('');
    try {
      await attendanceApi.decideLeaveRequest({ requestId, decision });
      setNotice(decision === 'approved' ? 'تم قبول طلب الإجازة.' : 'تم رفض طلب الإجازة.');
      await loadData();
    } catch (requestError) {
      setError(requestError.message || 'تعذر تحديث طلب الإجازة.');
    } finally {
      setProcessingId(null);
    }
  }

  return (
    <div className="hr-page">
      <HrHeader
        active="leaves"
        onNavigate={onNavigate}
        title="إدارة الإجازات"
        subtitle="تابع طلبات الإجازة، وافق أو ارفض، واعرف مين مش موجود النهارده."
        actions={(
          <button type="button" className="hr-btn is-primary" onClick={openForm}>
            <PlusIcon size={18} /> طلب إجازة جديد
          </button>
        )}
      />

      <div className="hr-body">
        <section className="hr-stats" aria-label="إحصائيات الإجازات">
          <HrStat Icon={ClockIcon} tone="warning" label="طلبات بانتظار الرد" value={stats.pending} note={stats.pending ? 'محتاجة موافقتك' : 'مفيش طلبات معلّقة'} />
          <HrStat Icon={CheckIcon} tone="success" label="الطلبات المقبولة" value={stats.approved} note="خلال آخر ٣٠ يومًا" />
          <HrStat Icon={CalendarIcon} tone="info" label="في إجازة حاليًا" value={stats.onLeaveNow} note={stats.onLeaveNow ? 'غايبين النهارده بإجازة' : 'كل الفريق على رأس العمل'} />
          <HrStat Icon={CloseIcon} tone="danger" label="الطلبات المرفوضة" value={stats.rejected} note="خلال آخر ٣٠ يومًا" />
        </section>

        {!showForm && (error || notice) && (
          <p className={`hr-alert ${error ? 'is-error' : 'is-success'}`} role={error ? 'alert' : 'status'}>
            {error || notice}
          </p>
        )}

        <section className="hr-card">
          <header className="hr-card-head">
            <div>
              <h2>طلبات الإجازات</h2>
              <p>{items.length.toLocaleString('ar-EG')} طلبات مسجّلة</p>
            </div>
            <div className="hr-filters" role="group" aria-label="تصفية حسب الحالة">
              {LEAVE_FILTERS.map((filter) => (
                <button
                  key={filter.key}
                  type="button"
                  className={`hr-filter${statusFilter === filter.key ? ' is-active' : ''}`}
                  aria-pressed={statusFilter === filter.key}
                  onClick={() => setStatusFilter(filter.key)}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </header>

          <div className="hr-table-wrap">
            <table className="hr-table">
              <thead>
                <tr>
                  <th>الموظف</th>
                  <th>نطاق الإجازة</th>
                  <th>المدة</th>
                  <th>السبب</th>
                  <th>تاريخ الطلب</th>
                  <th>الحالة</th>
                </tr>
              </thead>
              {!loading && visibleItems.length > 0 && (
                <tbody>
                  {visibleItems.map((request) => {
                    const employeeName = getEmployeeName(request);
                    const status = STATUS_META[request.status] || { label: 'غير معروف', tone: 'muted' };
                    const onLeaveNow = request.status === 'approved' && request.start_date <= today && request.end_date >= today;
                    return (
                      <tr key={request.id}>
                        <td>
                          <div className="hr-person">
                            {request.profile_image
                              ? <img className="hr-avatar" src={formatProductImageUrl(request.profile_image)} alt="" />
                              : <span className="hr-avatar" aria-hidden="true">{employeeName.charAt(0).toUpperCase()}</span>}
                            <span>
                              <strong>{employeeName}</strong>
                              <small>{request.job_title || request.username}</small>
                            </span>
                          </div>
                        </td>
                        <td>
                          <div className="hr-stack">
                            <strong>{formatDate(request.start_date)}</strong>
                            <small>إلى {formatDate(request.end_date)}</small>
                          </div>
                        </td>
                        <td>{formatDays(leaveDays(request.start_date, request.end_date))}</td>
                        <td><span title={request.reason}>{request.reason}</span></td>
                        <td>{formatDate(request.created_at?.slice(0, 10))}</td>
                        <td>
                          {request.status === 'pending' ? (
                            <div className="hr-row-actions is-start">
                              <button
                                type="button"
                                className="hr-btn is-success is-sm"
                                onClick={() => handleDecision(request.id, 'approved')}
                                disabled={processingId === request.id}
                              >
                                {processingId === request.id ? '...' : 'قبول'}
                              </button>
                              <button
                                type="button"
                                className="hr-btn is-sm"
                                onClick={() => handleDecision(request.id, 'rejected')}
                                disabled={processingId === request.id}
                              >
                                رفض
                              </button>
                            </div>
                          ) : (
                            <div className="hr-pills">
                              <span className={`hr-pill is-${status.tone}`}>{status.label}</span>
                              {onLeaveNow && <span className="hr-pill is-info">في إجازة الآن</span>}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              )}
            </table>
          </div>

          {loading ? (
            <p className="hr-loading">جارٍ تحميل طلبات الإجازات...</p>
          ) : !items.length ? (
            <HrEmpty
              Icon={CalendarIcon}
              title="مفيش طلبات إجازة لحد دلوقتي"
              text="أي طلب إجازة — سواء سجّلته أنت للموظف أو طلبه هو — هيظهر هنا، ولما توافق عليه هيتخصم تلقائيًا من سجل الحضور."
            >
              <button type="button" className="hr-btn is-primary" onClick={openForm}>تسجيل إجازة لموظف</button>
              <button type="button" className="hr-btn" onClick={() => onNavigate?.('attendance')}>عرض سجل الحضور</button>
            </HrEmpty>
          ) : !visibleItems.length && (
            <p className="hr-loading">مفيش طلبات بالحالة دي.</p>
          )}
        </section>
      </div>

      {showForm && (
        <div className="modal-overlay leaves-modal-overlay" onClick={closeForm}>
          <form
            className="leaves-request-modal"
            onSubmit={handleCreateRequest}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="leave-request-title"
          >
            <header className="leaves-modal-heading">
              <div>
                <span className="leaves-eyebrow">شؤون الموظفين</span>
                <h2 id="leave-request-title">طلب إجازة جديد</h2>
                <p>حدد الموظف والفترة، ثم اختر طريقة التعامل مع الطلب.</p>
              </div>
              <button type="button" onClick={closeForm} aria-label="إغلاق" disabled={saving}>×</button>
            </header>

            <div className="leaves-modal-fields">
              <label className="leaves-form-field leaves-field-wide">
                <span>الموظف <b>*</b></span>
                <select
                  value={form.userId}
                  onChange={(event) => updateForm('userId', event.target.value)}
                  required
                  disabled={!employees.length}
                >
                  <option value="">اختر الموظف</option>
                  {employees.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.full_name || employee.username} {employee.job_title ? `- ${employee.job_title}` : ''}
                    </option>
                  ))}
                </select>
                {!employees.length && <small>لا يوجد موظفون نشطون للاختيار.</small>}
              </label>
              <label className="leaves-form-field">
                <span>من تاريخ <b>*</b></span>
                <input
                  type="date"
                  value={form.startDate}
                  onChange={(event) => updateForm('startDate', event.target.value)}
                  required
                />
              </label>
              <label className="leaves-form-field">
                <span>إلى تاريخ <b>*</b></span>
                <input
                  type="date"
                  min={form.startDate || undefined}
                  value={form.endDate}
                  onChange={(event) => updateForm('endDate', event.target.value)}
                  required
                />
              </label>
              <label className="leaves-form-field leaves-field-wide">
                <span>سبب الإجازة <b>*</b></span>
                <textarea
                  value={form.reason}
                  onChange={(event) => updateForm('reason', event.target.value)}
                  placeholder="اكتب سبب الإجازة"
                  maxLength={500}
                  rows={4}
                  required
                />
              </label>
              <label className="leaves-auto-approve">
                <input
                  type="checkbox"
                  checked={form.autoApprove}
                  onChange={(event) => updateForm('autoApprove', event.target.checked)}
                />
                <span>
                  <strong>الموافقة التلقائية</strong>
                  <small>اعتماد الإجازة مباشرة بدل إضافتها إلى الطلبات المعلقة.</small>
                </span>
              </label>
            </div>

            {error && <p className="leaves-alert is-error leaves-modal-error" role="alert">{error}</p>}

            <footer className="leaves-modal-footer">
              <button type="button" className="leaves-cancel-button" onClick={closeForm} disabled={saving}>إلغاء</button>
              <button type="submit" className="leaves-submit-button" disabled={saving || !employees.length}>
                {saving ? 'جارٍ الحفظ...' : form.autoApprove ? 'إنشاء واعتماد الإجازة' : 'إرسال الطلب'}
              </button>
            </footer>
          </form>
        </div>
      )}
    </div>
  );
}
