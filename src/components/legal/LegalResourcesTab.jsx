import { useState } from 'react';
import * as inventoryApi from '../../api/inventory.js';
import LegalIcon from './LegalIcon.jsx';
import { DAY_NAMES, WEEK_ORDER, nameInitial, summarizeHours } from '../../utils/legalSchedule.js';

// The three everyday kinds; older types (car, device, other) still show and stay editable.
const KINDS = [
  ['employee', 'محام', 'محامون'],
  ['chair', 'موظف', 'موظفون'],
  ['room', 'قاعة', 'قاعات'],
];

const defaultHours = () => WEEK_ORDER.map((weekday) => ({
  weekday,
  enabled: weekday !== 5, // Friday off
  startTime: '09:00',
  endTime: '17:00',
}));

const blankForm = () => ({
  id: null, name: '', resourceType: 'employee', description: '', isActive: true, workingHours: defaultHours(),
});

export default function LegalResourcesTab({ resources, busy, runAction, resourceLabel }) {
  const [form, setForm] = useState(blankForm);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('all');

  const kindLabel = (type) => KINDS.find(([value]) => value === type)?.[1] || resourceLabel(type);
  const kinds = KINDS.some(([value]) => value === form.resourceType)
    ? KINDS
    : [...KINDS, [form.resourceType, resourceLabel(form.resourceType)]];
  const visible = resources.filter((resource) => (
    (kind === 'all' || resource.resource_type === kind)
    && resource.name.toLowerCase().includes(query.trim().toLowerCase())
  ));

  const setHours = (weekday, patch) => setForm((prev) => ({
    ...prev,
    workingHours: prev.workingHours.map((row) => (row.weekday === weekday ? { ...row, ...patch } : row)),
  }));

  function edit(resource) {
    const byDay = new Map((resource.workingHours || []).map((row) => [Number(row.weekday), row]));
    setForm({
      id: resource.id,
      name: resource.name,
      resourceType: resource.resource_type,
      description: resource.description || '',
      isActive: Boolean(resource.is_active),
      workingHours: WEEK_ORDER.map((weekday) => ({
        weekday,
        enabled: byDay.has(weekday),
        startTime: byDay.get(weekday)?.start_time || '09:00',
        endTime: byDay.get(weekday)?.end_time || '17:00',
      })),
    });
  }

  async function submit(event) {
    event.preventDefault();
    const saved = await runAction(() => inventoryApi.saveAppointmentResource({
      ...form,
      workingHours: form.workingHours
        .filter((row) => row.enabled)
        .map(({ weekday, startTime, endTime }) => ({ weekday, startTime, endTime })),
    }), form.id ? 'تم تحديث البيانات وأوقات العمل' : 'تمت الإضافة بنجاح');
    if (saved) setForm(blankForm());
  }

  async function remove(resource) {
    if (!window.confirm(`حذف ${resource.name}؟ لو له جلسات مسجلة سيتم إيقافه بدل الحذف للحفاظ على السجل.`)) return;
    let result;
    const done = await runAction(async () => {
      result = await inventoryApi.removeAppointmentResource(resource.id);
    }, () => (result?.deactivated ? `${resource.name} له جلسات مسجلة، فتم إيقافه بدل حذفه` : `تم حذف ${resource.name}`));
    if (done && form.id === resource.id) setForm(blankForm());
  }

  return (
    <div className="legal-resources-layout">
      <form className="appointment-card legal-resource-form" onSubmit={submit}>
        <h2>{form.id ? 'تعديل بيانات المحامي أو القاعة' : 'إضافة محامٍ أو موظف أو قاعة'}</h2>

        <div className="legal-field">
          <span className="legal-field-label">النوع <span className="legal-required">*</span></span>
          <div className="legal-kind-picker" role="radiogroup" aria-label="النوع">
            {kinds.map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={form.resourceType === value}
                className={form.resourceType === value ? 'active' : ''}
                onClick={() => setForm({ ...form, resourceType: value })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <label><span>الاسم <span className="legal-required">*</span></span>
          <input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="مثال: الأستاذ محمد علي / قاعة الاجتماعات" />
        </label>
        <label>التخصص أو الوصف
          <input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="مثال: محامٍ مدني / قاعة اجتماعات الموكلين" />
        </label>
        <label className="legal-check-row">
          <input type="checkbox" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} />
          متاح لحجز المواعيد
        </label>

        <div className="legal-hours-heading">
          <h3>أوقات العمل الأسبوعية</h3>
          <button
            type="button"
            className="appointment-button secondary"
            onClick={() => setForm({ ...form, workingHours: form.workingHours.map((row) => ({ ...row, enabled: true })) })}
          >
            تفعيل كل الأيام
          </button>
        </div>
        <div className="legal-hours-list">
          {form.workingHours.map((row) => (
            <div className={`legal-hours-row${row.enabled ? '' : ' off'}`} key={row.weekday}>
              <label className="legal-check-row">
                <input type="checkbox" checked={row.enabled} onChange={(event) => setHours(row.weekday, { enabled: event.target.checked })} />
                {DAY_NAMES[row.weekday]}
              </label>
              <input type="time" aria-label={`بداية ${DAY_NAMES[row.weekday]}`} disabled={!row.enabled} value={row.startTime} onChange={(event) => setHours(row.weekday, { startTime: event.target.value })} />
              <span>إلى</span>
              <input type="time" aria-label={`نهاية ${DAY_NAMES[row.weekday]}`} disabled={!row.enabled} value={row.endTime} onChange={(event) => setHours(row.weekday, { endTime: event.target.value })} />
            </div>
          ))}
        </div>

        <div className="legal-form-actions">
          <button className="appointment-button primary" type="submit" disabled={busy}>{busy ? 'جاري الحفظ...' : 'حفظ'}</button>
          {form.id && <button className="appointment-button secondary" type="button" onClick={() => setForm(blankForm())}>إلغاء التعديل</button>}
        </div>
      </form>

      <div className="appointment-card legal-resource-panel">
        <div className="legal-schedule-heading">
          <h2>المحامون والموظفون والقاعات <small>({resources.length})</small></h2>
          <input type="search" className="legal-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="بحث بالاسم..." aria-label="بحث بالاسم" />
        </div>
        <div className="legal-chips" role="group" aria-label="تصفية حسب النوع">
          {[['all', 'الكل'], ...KINDS.map(([value, , plural]) => [value, plural])].map(([value, label]) => (
            <button key={value} type="button" className={kind === value ? 'active' : ''} aria-pressed={kind === value} onClick={() => setKind(value)}>
              {label}
            </button>
          ))}
        </div>

        {!visible.length ? (
          <div className="appointment-empty">{resources.length ? 'لا توجد نتائج مطابقة.' : 'لا يوجد محامون أو قاعات مسجلة بعد.'}</div>
        ) : (
          <div className="legal-resource-grid">
            {visible.map((resource) => (
              <article className={`legal-resource-card${form.id === resource.id ? ' editing' : ''}`} key={resource.id}>
                <div className="legal-resource-head">
                  <span className={`legal-avatar ${resource.resource_type}`} aria-hidden="true">{nameInitial(resource.name)}</span>
                  <div>
                    <strong>{resource.name}</strong>
                    <p>{kindLabel(resource.resource_type)}{resource.description ? ` · ${resource.description}` : ''}</p>
                  </div>
                  <span className={`legal-badge ${resource.is_active ? 'confirmed' : 'muted'}`}>
                    {resource.is_active ? 'متاح للحجز' : 'غير متاح'}
                  </span>
                </div>
                <p className="legal-resource-hours"><LegalIcon name="clock" size={15} />{summarizeHours(resource.workingHours)}</p>
                <div className="legal-resource-actions">
                  <button type="button" className="appointment-button secondary" onClick={() => edit(resource)}>تعديل</button>
                  <button type="button" className="appointment-button secondary danger" aria-label={`حذف ${resource.name}`} disabled={busy} onClick={() => remove(resource)}>
                    <LegalIcon name="trash" />
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
