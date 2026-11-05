import { useCallback, useEffect, useMemo, useState } from 'react';
import * as legalApi from '../api/legal.js';
import '../styles/courts.css';

const COURT_TYPES = [
  { value: 'first_instance', label: 'أول درجة', mark: '١' },
  { value: 'cassation', label: 'النقض', mark: '٢' },
  { value: 'appeals', label: 'الاستئناف', mark: '٣' },
  { value: 'family', label: 'الأسرة', mark: '٤' },
  { value: 'criminal', label: 'الجنائية', mark: '٥' },
  { value: 'commercial', label: 'التجارية', mark: '٦' },
  { value: 'labor', label: 'العمالية', mark: '٧' },
  { value: 'administrative', label: 'الإدارية', mark: '٨' },
];

const EMPTY_FORM = {
  name: '',
  court_type: '',
  specialization: '',
  notes: '',
  phone: '',
  city: '',
  address: '',
};

function CourtTypeLabel({ value }) {
  return COURT_TYPES.find((type) => type.value === value)?.label || value || '—';
}

function getErrorMessage(error) {
  return error instanceof Error ? error.message : 'حدث خطأ غير متوقع';
}

export default function CourtsPage() {
  const [courts, setCourts] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('active');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showWizard, setShowWizard] = useState(false);
  const [editingCourt, setEditingCourt] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const visibleRange = useMemo(() => ({
    start: total ? (page - 1) * pageSize + 1 : 0,
    end: Math.min(page * pageSize, total),
  }), [page, pageSize, total]);

  const loadCourts = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await legalApi.getCourts({ search, status, page, pageSize });
      setCourts(result.items || []);
      setTotal(Number(result.total) || 0);
      const lastPage = Math.max(1, Math.ceil((Number(result.total) || 0) / pageSize));
      if (page > lastPage) setPage(lastPage);
    } catch (loadError) {
      setError(`تعذر تحميل دليل المحاكم: ${getErrorMessage(loadError)}`);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, status]);

  useEffect(() => {
    loadCourts();
  }, [loadCourts]);

  function openCreateWizard() {
    setEditingCourt(null);
    setForm(EMPTY_FORM);
    setStep(0);
    setFormError('');
    setShowWizard(true);
  }

  function openEditWizard(court) {
    setEditingCourt(court);
    setForm({
      name: court.name || '',
      court_type: court.court_type || '',
      specialization: court.specialization || '',
      notes: court.notes || '',
      phone: court.phone || '',
      city: court.city || '',
      address: court.address || '',
    });
    setStep(0);
    setFormError('');
    setShowWizard(true);
  }

  function closeWizard() {
    if (saving) return;
    setShowWizard(false);
    setEditingCourt(null);
    setFormError('');
  }

  function handleNextStep() {
    if (step === 0) {
      if (form.name.trim().length < 2) {
        setFormError('اكتب اسم المحكمة (حرفان على الأقل).');
        return;
      }
      if (!form.court_type) {
        setFormError('اختر نوع المحكمة للمتابعة.');
        return;
      }
    }
    setFormError('');
    setStep((current) => Math.min(current + 1, 2));
  }

  async function handleSave(event) {
    event.preventDefault();
    if (step < 2) {
      handleNextStep();
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      if (editingCourt) {
        await legalApi.updateCourt(editingCourt.id, form);
      } else {
        await legalApi.createCourt(form);
      }
      setShowWizard(false);
      setEditingCourt(null);
      setPage(1);
      if (page === 1) await loadCourts();
    } catch (saveError) {
      setFormError(`تعذر حفظ المحكمة: ${getErrorMessage(saveError)}`);
    } finally {
      setSaving(false);
    }
  }

  async function toggleCourt(court) {
    const action = court.is_active ? 'تعطيل' : 'تفعيل';
    if (court.is_active && !window.confirm(`هل تريد تعطيل "${court.name}"؟ ستظل المحكمة مرتبطة بملفاتها السابقة.`)) {
      return;
    }
    try {
      if (court.is_active) {
        await legalApi.deactivateCourt(court.id);
      } else {
        await legalApi.updateCourt(court.id, { is_active: true });
      }
      await loadCourts();
    } catch (toggleError) {
      setError(`تعذر ${action} المحكمة: ${getErrorMessage(toggleError)}`);
    }
  }

  function changePageSize(event) {
    setPageSize(Number(event.target.value));
    setPage(1);
  }

  return (
    <main className="courts-page" dir="rtl">
      <header className="courts-header">
        <div>
          <div className="courts-eyebrow"><span aria-hidden="true">⚖</span> إدارة المحاكم</div>
          <h1>دليل المحاكم</h1>
          <p>نظّم بيانات المحاكم واربطها بملفات القضايا وجلساتها.</p>
        </div>
        <button type="button" className="courts-primary-button" onClick={openCreateWizard}>
          <span aria-hidden="true">＋</span>
          إضافة محكمة
        </button>
      </header>

      <section className="courts-summary" aria-label="ملخص دليل المحاكم">
        <div className="courts-summary-icon" aria-hidden="true">⚖</div>
        <div>
          <span>المحاكم المطابقة</span>
          <strong>{loading ? '—' : total.toLocaleString('ar-EG')}</strong>
        </div>
        <span className="courts-summary-caption">إدارة موحدة لجهات التقاضي</span>
      </section>

      <section className="courts-panel">
        <div className="courts-panel-heading">
          <div>
            <h2>قائمة المحاكم</h2>
            <p>ابحث عن محكمة أو راجع بيانات الاتصال والموقع.</p>
          </div>
          <label className="courts-filter-select">
            <span className="courts-sr-only">تصفية حسب الحالة</span>
            <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
              <option value="active">المحاكم النشطة</option>
              <option value="inactive">المحاكم المعطلة</option>
              <option value="all">كل المحاكم</option>
            </select>
          </label>
        </div>

        <div className="courts-toolbar">
          <label className="courts-search">
            <span aria-hidden="true">⌕</span>
            <input
              type="search"
              value={search}
              onChange={(event) => { setSearch(event.target.value); setPage(1); }}
              placeholder="ابحث باسم المحكمة أو المدينة أو الاختصاص..."
              aria-label="البحث في المحاكم"
            />
          </label>
          <button type="button" className="courts-refresh-button" onClick={loadCourts} disabled={loading}>
            <span aria-hidden="true">↻</span>
            تحديث
          </button>
        </div>

        {error && <div className="courts-error" role="alert">{error}</div>}

        <div className="courts-table-scroll">
          <table className="courts-table">
            <thead>
              <tr>
                <th scope="col">المحكمة</th>
                <th scope="col">نوع المحكمة</th>
                <th scope="col">الموقع</th>
                <th scope="col">التواصل</th>
                <th scope="col">الحالة</th>
                <th scope="col" className="courts-actions-heading">الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="6" className="courts-table-message">جارٍ تحميل المحاكم...</td></tr>
              ) : courts.length === 0 ? (
                <tr>
                  <td colSpan="6" className="courts-table-message">
                    <span className="courts-empty-icon" aria-hidden="true">⌕</span>
                    <strong>{error ? 'تعذر عرض النتائج' : 'لا توجد محاكم مطابقة'}</strong>
                    <span>{error ? 'راجع الاتصال ثم أعد المحاولة.' : 'أضف محكمة جديدة أو غيّر كلمات البحث.'}</span>
                  </td>
                </tr>
              ) : courts.map((court) => (
                <tr key={court.id}>
                  <td>
                    <div className="courts-name-cell">
                      <span className="courts-name-mark" aria-hidden="true">⚖</span>
                      <span>
                        <strong>{court.name}</strong>
                        {court.specialization && <small>{court.specialization}</small>}
                      </span>
                    </div>
                  </td>
                  <td><span className="courts-type-chip"><CourtTypeLabel value={court.court_type} /></span></td>
                  <td>
                    <span className="courts-location">
                      <strong>{court.city || 'غير محدد'}</strong>
                      {court.address && <small>{court.address}</small>}
                    </span>
                  </td>
                  <td>{court.phone || <span className="courts-muted">غير مسجل</span>}</td>
                  <td>
                    <span className={`courts-status ${court.is_active ? 'is-active' : 'is-inactive'}`}>
                      <i aria-hidden="true" />
                      {court.is_active ? 'نشطة' : 'معطلة'}
                    </span>
                  </td>
                  <td>
                    <div className="courts-row-actions">
                      <button type="button" onClick={() => openEditWizard(court)} aria-label={`تعديل ${court.name}`} title="تعديل">
                        تعديل
                      </button>
                      <button
                        type="button"
                        className={court.is_active ? 'courts-deactivate-action' : 'courts-activate-action'}
                        onClick={() => toggleCourt(court)}
                        aria-label={`${court.is_active ? 'تعطيل' : 'تفعيل'} ${court.name}`}
                        title={court.is_active ? 'تعطيل المحكمة' : 'تفعيل المحكمة'}
                      >
                        {court.is_active ? 'تعطيل' : 'تفعيل'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <footer className="courts-pagination">
          <span>عرض {visibleRange.start}–{visibleRange.end} من {total.toLocaleString('ar-EG')}</span>
          <div className="courts-pagination-controls">
            <label>
              <span>لكل صفحة</span>
              <select value={pageSize} onChange={changePageSize} aria-label="عدد المحاكم في الصفحة">
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </label>
            <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1 || loading} aria-label="الصفحة السابقة">→</button>
            <span className="courts-page-number">{page} / {pageCount}</span>
            <button type="button" onClick={() => setPage((current) => Math.min(pageCount, current + 1))} disabled={page >= pageCount || loading} aria-label="الصفحة التالية">←</button>
          </div>
        </footer>
      </section>

      {showWizard && (
        <div className="courts-modal-overlay" onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeWizard();
        }}>
          <section className="courts-wizard" role="dialog" aria-modal="true" aria-labelledby="courts-wizard-title" dir="rtl">
            <header className="courts-wizard-header">
              <div>
                <span className="courts-wizard-kicker">{editingCourt ? 'تحديث بيانات الدليل' : 'دليل المحاكم'}</span>
                <h2 id="courts-wizard-title">{editingCourt ? 'تعديل بيانات المحكمة' : 'إضافة محكمة جديدة'}</h2>
              </div>
              <button type="button" className="courts-wizard-close" onClick={closeWizard} aria-label="إغلاق" disabled={saving}>×</button>
            </header>

            <div className="courts-steps" aria-label={`الخطوة ${step + 1} من 3`}>
              {['معلومات المحكمة', 'الموقع والتواصل', 'مراجعة البيانات'].map((label, index) => (
                <div className={`courts-step ${index <= step ? 'is-current' : ''}`} key={label}>
                  <span>{index < step ? '✓' : index + 1}</span>
                  <small>{label}</small>
                </div>
              ))}
            </div>

            <form onSubmit={handleSave}>
              <div className="courts-wizard-body">
                {step === 0 && (
                  <>
                    <div className="courts-form-field">
                      <label htmlFor="court-name">اسم المحكمة <b>*</b></label>
                      <input
                        id="court-name"
                        autoFocus
                        maxLength={180}
                        value={form.name}
                        onChange={(event) => setForm({ ...form, name: event.target.value })}
                        placeholder="مثال: محكمة شمال القاهرة الابتدائية"
                        required
                      />
                    </div>
                    <fieldset className="courts-type-fieldset">
                      <legend>نوع المحكمة <b>*</b></legend>
                      <div className="courts-type-grid">
                        {COURT_TYPES.map((type) => (
                          <button
                            type="button"
                            key={type.value}
                            className={`courts-type-option ${form.court_type === type.value ? 'is-selected' : ''}`}
                            onClick={() => setForm({ ...form, court_type: type.value })}
                            aria-pressed={form.court_type === type.value}
                          >
                            <span>{type.mark}</span>
                            {type.label}
                          </button>
                        ))}
                      </div>
                    </fieldset>
                    <div className="courts-form-field">
                      <label htmlFor="court-specialization">الاختصاص القضائي</label>
                      <input
                        id="court-specialization"
                        maxLength={180}
                        value={form.specialization}
                        onChange={(event) => setForm({ ...form, specialization: event.target.value })}
                        placeholder="مثال: مدني كلي، تجاري، تعويضات"
                      />
                    </div>
                    <div className="courts-form-field">
                      <label htmlFor="court-notes">ملاحظات</label>
                      <textarea
                        id="court-notes"
                        rows="3"
                        maxLength={2000}
                        value={form.notes}
                        onChange={(event) => setForm({ ...form, notes: event.target.value })}
                        placeholder="أضف أي تفاصيل مفيدة لفريق العمل..."
                      />
                    </div>
                  </>
                )}

                {step === 1 && (
                  <>
                    <div className="courts-form-grid">
                      <div className="courts-form-field">
                        <label htmlFor="court-phone">رقم الهاتف</label>
                        <input
                          id="court-phone"
                          type="tel"
                          dir="ltr"
                          maxLength={40}
                          value={form.phone}
                          onChange={(event) => setForm({ ...form, phone: event.target.value })}
                          placeholder="+20 2 0000 0000"
                        />
                      </div>
                      <div className="courts-form-field">
                        <label htmlFor="court-city">المدينة</label>
                        <input
                          id="court-city"
                          maxLength={100}
                          value={form.city}
                          onChange={(event) => setForm({ ...form, city: event.target.value })}
                          placeholder="مثال: القاهرة"
                        />
                      </div>
                    </div>
                    <div className="courts-form-field">
                      <label htmlFor="court-address">العنوان</label>
                      <textarea
                        id="court-address"
                        rows="4"
                        maxLength={300}
                        value={form.address}
                        onChange={(event) => setForm({ ...form, address: event.target.value })}
                        placeholder="الشارع، المنطقة، وأقرب علامة مميزة"
                      />
                    </div>
                    <div className="courts-info-note">
                      <span aria-hidden="true">ⓘ</span>
                      يمكنك ترك بيانات التواصل فارغة وإضافتها لاحقًا من شاشة التعديل.
                    </div>
                  </>
                )}

                {step === 2 && (
                  <div className="courts-review-card">
                    <div className="courts-review-heading">
                      <span className="courts-name-mark" aria-hidden="true">⚖</span>
                      <div><small>اسم المحكمة</small><strong>{form.name}</strong></div>
                    </div>
                    <dl>
                      <div><dt>النوع</dt><dd><CourtTypeLabel value={form.court_type} /></dd></div>
                      <div><dt>الاختصاص</dt><dd>{form.specialization || 'غير محدد'}</dd></div>
                      <div><dt>الهاتف</dt><dd dir="auto">{form.phone || 'غير مسجل'}</dd></div>
                      <div><dt>المدينة</dt><dd>{form.city || 'غير محددة'}</dd></div>
                      <div><dt>العنوان</dt><dd>{form.address || 'غير مسجل'}</dd></div>
                      {form.notes && <div><dt>ملاحظات</dt><dd>{form.notes}</dd></div>}
                    </dl>
                    <p>بالحفظ، ستصبح المحكمة متاحة للاختيار عند إنشاء القضايا.</p>
                  </div>
                )}
                {formError && <p className="courts-form-error" role="alert">{formError}</p>}
              </div>

              <footer className="courts-wizard-footer">
                <button
                  type="button"
                  className="courts-wizard-back"
                  onClick={() => { setFormError(''); setStep((current) => Math.max(current - 1, 0)); }}
                  disabled={saving || step === 0}
                >
                  السابق
                </button>
                <span>الخطوة {step + 1} من 3</span>
                {step < 2 ? (
                  <button type="button" className="courts-primary-button" onClick={handleNextStep}>التالي <span aria-hidden="true">←</span></button>
                ) : (
                  <button type="submit" className="courts-primary-button" disabled={saving}>
                    {saving ? 'جارٍ الحفظ...' : editingCourt ? 'حفظ التعديلات' : 'حفظ المحكمة'}
                  </button>
                )}
              </footer>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
