import { useCallback, useEffect, useState } from 'react';
import { formatProductImageUrl } from '../utils/media.js';
import '../styles/leaves.css';

const EMPTY_FORM = {
  userId: '',
  startDate: '',
  endDate: '',
  reason: '',
  autoApprove: false,
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

function isCurrentlyOnLeave(request, today) {
  return request.status === 'approved'
    && request.start_date <= today
    && request.end_date >= today;
}

function getTodayDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function LeaveStat({ label, value, tone }) {
  return (
    <article className={`leaves-stat-card is-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

export default function LeavesPage() {
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState({
    pending: 0,
    approved: 0,
    currentlyOnLeave: 0,
    rejected: 0,
  });
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [processingId, setProcessingId] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const today = getTodayDate();

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [leaveData, userData] = await Promise.all([
        window.electronAPI.getLeaveRequests(),
        window.electronAPI.getAllUsers(),
      ]);
      if (!leaveData || !Array.isArray(leaveData.items) || !leaveData.stats || !Array.isArray(userData)) {
        throw new Error('استجابة بيانات الإجازات غير مكتملة.');
      }
      setItems(leaveData.items);
      setStats(leaveData.stats);
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
      await window.electronAPI.createLeaveRequest({
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
      await window.electronAPI.decideLeaveRequest({ requestId, decision });
      setNotice(decision === 'approved' ? 'تم قبول طلب الإجازة.' : 'تم رفض طلب الإجازة.');
      await loadData();
    } catch (requestError) {
      setError(requestError.message || 'تعذر تحديث طلب الإجازة.');
    } finally {
      setProcessingId(null);
    }
  }

  return (
    <div className="leaves-page">
      <header className="leaves-heading">
        <div>
          <span className="leaves-eyebrow">فريق العمل</span>
          <h1>إدارة الإجازات</h1>
          <p>تابع طلبات الإجازة وراجع الموافقات وحالة الموظفين.</p>
        </div>
        <button type="button" className="leaves-add-button" onClick={() => { setShowForm(true); setError(''); }}>
          <span aria-hidden="true">+</span>
          طلب إجازة جديدة
        </button>
      </header>

      <section className="leaves-stats" aria-label="إحصائيات الإجازات">
        <LeaveStat label="الطلبات المعلقة" value={stats.pending} tone="pending" />
        <LeaveStat label="الطلبات المقبولة" value={stats.approved} tone="approved" />
        <LeaveStat label="في إجازة حاليًا" value={stats.currentlyOnLeave} tone="current" />
        <LeaveStat label="الطلبات المرفوضة" value={stats.rejected} tone="rejected" />
      </section>

      {(error || notice) && (
        <p className={`leaves-alert ${error ? 'is-error' : 'is-success'}`} role={error ? 'alert' : 'status'}>
          {error || notice}
        </p>
      )}

      <section className="leaves-list-panel">
        <header className="leaves-list-heading">
          <div>
            <h2>طلبات الإجازات</h2>
            <p>{items.length} طلب{items.length === 1 ? '' : 'ات'} مسجل</p>
          </div>
          <button type="button" className="leaves-refresh-button" onClick={loadData} disabled={loading}>
            {loading ? 'جارٍ التحديث...' : 'تحديث'}
          </button>
        </header>

        <div className="leaves-table-wrap">
          <table className="leaves-table">
            <thead>
              <tr>
                <th>الموظف</th>
                <th>نطاق الإجازة</th>
                <th>السبب</th>
                <th>تاريخ الطلب</th>
                <th>الحالة</th>
                <th>الإجراء</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="6" className="leaves-empty">جارٍ تحميل طلبات الإجازات...</td></tr>
              ) : items.length ? items.map((request) => {
                const employeeName = getEmployeeName(request);
                const currentLeave = isCurrentlyOnLeave(request, today);
                const statusLabel = {
                  pending: 'معلق',
                  approved: 'مقبول',
                  rejected: 'مرفوض',
                }[request.status] || 'غير معروف';
                return (
                  <tr key={request.id}>
                    <td>
                      <div className="leaves-employee-cell">
                        {request.profile_image ? (
                          <img src={formatProductImageUrl(request.profile_image)} alt="" />
                        ) : (
                          <span className="leaves-avatar" aria-hidden="true">{employeeName.charAt(0)}</span>
                        )}
                        <span>
                          <strong>{employeeName}</strong>
                          <small>{request.job_title || request.username}</small>
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="leaves-date-range">
                        <strong>{formatDate(request.start_date)}</strong>
                        <span>إلى</span>
                        <strong>{formatDate(request.end_date)}</strong>
                      </div>
                    </td>
                    <td><span className="leaves-reason" title={request.reason}>{request.reason}</span></td>
                    <td>{formatDate(request.created_at?.slice(0, 10))}</td>
                    <td>
                      <div className="leaves-status-cell">
                        <span className={`leaves-status is-${request.status}`}>{statusLabel}</span>
                        {currentLeave && <small className="leaves-current-label">في إجازة الآن</small>}
                      </div>
                    </td>
                    <td>
                      {request.status === 'pending' ? (
                        <div className="leaves-row-actions">
                          <button
                            type="button"
                            className="is-approve"
                            onClick={() => handleDecision(request.id, 'approved')}
                            disabled={processingId === request.id}
                          >
                            {processingId === request.id ? '...' : 'قبول'}
                          </button>
                          <button
                            type="button"
                            className="is-reject"
                            onClick={() => handleDecision(request.id, 'rejected')}
                            disabled={processingId === request.id}
                          >
                            رفض
                          </button>
                        </div>
                      ) : (
                        <span className="leaves-review-meta">
                          {request.reviewed_by_username ? `بواسطة ${request.reviewed_by_username}` : '—'}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              }) : (
                <tr><td colSpan="6" className="leaves-empty">لا توجد طلبات إجازات حتى الآن.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

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
                <span className="leaves-eyebrow">فريق العمل</span>
                <h2 id="leave-request-title">طلب إجازة جديدة</h2>
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
