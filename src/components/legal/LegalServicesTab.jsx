import { useState } from 'react';
import * as inventoryApi from '../../api/inventory.js';
import LegalIcon from './LegalIcon.jsx';

const DURATION_PRESETS = [30, 45, 60, 90];

const blankForm = () => ({
  id: null,
  name: '',
  durationMinutes: 45,
  bufferMinutes: 15,
  price: 150,
  resourceType: 'employee',
  description: '',
  isActive: true,
});

const money = (value) => Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });

export default function LegalServicesTab({ services, busy, runAction, resourceTypes, resourceLabel }) {
  const [form, setForm] = useState(blankForm);
  const [activeOnly, setActiveOnly] = useState(false);

  const duration = Number(form.durationMinutes) || 0;
  const buffer = Number(form.bufferMinutes) || 0;
  const visible = activeOnly ? services.filter((service) => service.is_active) : services;
  const update = (patch) => setForm((prev) => ({ ...prev, ...patch }));
  const providerLabel = (type) => (type ? resourceLabel(type) : 'أي محامٍ أو قاعة');

  function edit(service) {
    setForm({
      id: service.id,
      name: service.name,
      durationMinutes: service.duration_minutes,
      bufferMinutes: service.buffer_minutes || 0,
      price: service.price,
      resourceType: service.resource_type || '',
      description: service.description || '',
      isActive: Boolean(service.is_active),
    });
  }

  async function submit(event) {
    event.preventDefault();
    const saved = await runAction(
      () => inventoryApi.saveAppointmentService(form),
      form.id ? 'تم تحديث نوع الجلسة' : 'تمت إضافة نوع الجلسة',
    );
    if (saved) setForm(blankForm());
  }

  async function remove(service) {
    if (!window.confirm(`حذف «${service.name}»؟ لو عليه حجوزات سيتم إيقافه بدل الحذف للحفاظ على السجل.`)) return;
    let result;
    const done = await runAction(async () => {
      result = await inventoryApi.removeAppointmentService(service.id);
    }, () => (result?.deactivated ? `«${service.name}» عليه حجوزات، فتم إيقافه بدل حذفه` : `تم حذف «${service.name}»`));
    if (done && form.id === service.id) setForm(blankForm());
  }

  return (
    <div className="legal-resources-layout">
      <form className="appointment-card legal-resource-form" onSubmit={submit}>
        <h2>{form.id ? 'تعديل نوع الجلسة' : 'إضافة نوع جلسة أو خدمة'}</h2>

        <label><span>اسم الجلسة أو الخدمة <span className="legal-required">*</span></span>
          <input required value={form.name} onChange={(event) => update({ name: event.target.value })} placeholder="مثال: استشارة قانونية / جلسة محكمة" />
        </label>

        <div className="legal-field">
          <span className="legal-field-label">مدة الموعد <span className="legal-required">*</span></span>
          <div className="legal-duration-picker">
            {DURATION_PRESETS.map((minutes) => (
              <button
                key={minutes}
                type="button"
                className={duration === minutes ? 'active' : ''}
                aria-pressed={duration === minutes}
                onClick={() => update({ durationMinutes: minutes })}
              >
                {minutes}
              </button>
            ))}
            <span className="legal-input-suffix">
              <input
                type="number"
                min="1"
                max="1440"
                required
                aria-label="مدة الموعد بالدقائق"
                value={form.durationMinutes}
                onChange={(event) => update({ durationMinutes: event.target.value })}
              />
              <span>دقيقة</span>
            </span>
          </div>
        </div>

        <div className="legal-form-row">
          <label>وقت فاصل بعد الموعد
            <span className="legal-input-suffix">
              <input type="number" min="0" max="1440" value={form.bufferMinutes} onChange={(event) => update({ bufferMinutes: event.target.value })} />
              <span>دقيقة</span>
            </span>
          </label>
          <label><span>الأتعاب التقديرية <span className="legal-required">*</span></span>
            <span className="legal-input-suffix">
              <input type="number" min="0" step="0.01" required value={form.price} onChange={(event) => update({ price: event.target.value })} />
              <span>ج.م</span>
            </span>
          </label>
        </div>

        <p className="legal-note">
          <LegalIcon name="clock" size={16} />
          <span>كل حجز يأخذ <strong>{duration + buffer} دقيقة</strong> من الجدول ({duration} موعد + {buffer} فاصل)</span>
        </p>

        <label>من يقدّم الخدمة
          <select value={form.resourceType} onChange={(event) => update({ resourceType: event.target.value })}>
            <option value="">أي محامٍ أو قاعة</option>
            {resourceTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>

        <label>الوصف
          <textarea rows="3" value={form.description} onChange={(event) => update({ description: event.target.value })} placeholder="تفاصيل الخدمة القانونية..." />
        </label>

        <label className="legal-check-row legal-check-box">
          <input type="checkbox" checked={form.isActive} onChange={(event) => update({ isActive: event.target.checked })} />
          خدمة نشطة ومتاحة للحجز
        </label>

        <div className="legal-form-actions">
          <button className="appointment-button primary" type="submit" disabled={busy}>
            {busy ? 'جاري الحفظ...' : form.id ? 'حفظ التعديلات' : 'إضافة الخدمة'}
          </button>
          {form.id && <button className="appointment-button secondary" type="button" onClick={() => setForm(blankForm())}>إلغاء التعديل</button>}
        </div>
      </form>

      <div className="appointment-card legal-resource-panel">
        <div className="legal-schedule-heading">
          <h2>الجلسات والخدمات <small>({services.length})</small></h2>
          <label className="legal-check-row">
            <input type="checkbox" checked={activeOnly} onChange={(event) => setActiveOnly(event.target.checked)} />
            النشطة فقط
          </label>
        </div>

        {!visible.length ? (
          <div className="appointment-empty">{services.length ? 'لا توجد خدمات نشطة.' : 'لا توجد أنواع جلسات مسجلة بعد.'}</div>
        ) : (
          <div className="legal-table-wrap">
            <table className="legal-table">
              <thead>
                <tr>
                  <th>الخدمة</th>
                  <th>المدة</th>
                  <th>الفاصل</th>
                  <th>الأتعاب</th>
                  <th>الحالة</th>
                  <th><span className="legal-sr">الإجراءات</span></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((service) => (
                  <tr key={service.id} className={form.id === service.id ? 'editing' : ''}>
                    <td>
                      <strong>{service.name}</strong>
                      <span className="legal-table-sub">{providerLabel(service.resource_type)}</span>
                    </td>
                    <td>{service.duration_minutes} دقيقة</td>
                    <td className="muted">{service.buffer_minutes || 0} دقيقة</td>
                    <td><strong>{money(service.price)} ج.م</strong></td>
                    <td>
                      <span className={`legal-badge ${service.is_active ? 'confirmed' : 'muted'}`}>{service.is_active ? 'نشطة' : 'متوقفة'}</span>
                    </td>
                    <td>
                      <div className="legal-session-actions">
                        <button type="button" aria-label={`تعديل ${service.name}`} title="تعديل" onClick={() => edit(service)}>
                          <LegalIcon name="pencil" />
                        </button>
                        <button type="button" className="danger" aria-label={`حذف ${service.name}`} title="حذف" disabled={busy} onClick={() => remove(service)}>
                          <LegalIcon name="trash" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
