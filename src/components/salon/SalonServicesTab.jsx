import { useCallback, useState } from 'react';
import * as salonApi from '../../api/salon.js';
import { money, num } from '../crm/crmFormat.js';
import { HrEmpty } from '../hr/HrLayout.jsx';
import { PencilIcon, PlusIcon, TagIcon, TrashIcon } from '../icons/PosIcons.jsx';
import { Field, SalonAlert, SalonFormModal } from './SalonParts.jsx';
import { commissionLabel } from './salonFormat.js';
import { useSalonLoad } from './useSalonLoad.js';

const EMPTY = { name: '', category: '', duration_minutes: 30, price: '', cost_price: '', commission_type: 'percentage', commission_value: '', description: '' };

export default function SalonServicesTab() {
  const { data, loading, busy, error, notice, setError, run } = useSalonLoad(useCallback(() => salonApi.getAllSalonServices(), []));
  const [form, setForm] = useState(null); // null = closed; { id? ...fields }
  const services = data || [];
  const set = (field) => (event) => setForm((f) => ({ ...f, [field]: event.target.value }));

  async function save() {
    if (!form.name.trim() || form.price === '' || Number(form.price) < 0) {
      setError('اكتب اسم الخدمة وسعر صحيح.');
      return;
    }
    if (form.commission_type === 'percentage' && Number(form.commission_value) > 100) {
      setError('نسبة العمولة لا تتجاوز 100%.');
      return;
    }
    const payload = {
      ...form,
      name: form.name.trim(),
      category: form.category.trim() || 'عام',
      price: Number(form.price),
      cost_price: Number(form.cost_price) || 0,
      duration_minutes: Number(form.duration_minutes) || 30,
      commission_value: Number(form.commission_value) || 0,
    };
    const ok = await run(
      () => (form.id ? salonApi.updateSalonService(form.id, payload) : salonApi.createSalonService(payload)),
      form.id ? 'تم تعديل الخدمة.' : 'تمت إضافة الخدمة.',
    );
    if (ok) setForm(null);
  }

  function remove(service) {
    if (!window.confirm(`إيقاف خدمة «${service.name}»؟ مش هتظهر تاني في الحجز ولا في الكاشير.`)) return;
    run(() => salonApi.deleteSalonService(service.id), 'تم إيقاف الخدمة.');
  }

  return (
    <>
      {!form && <SalonAlert error={error} notice={notice} />}
      <section className="hr-card">
        <header className="hr-card-head">
          <div>
            <h2>الخدمات وقائمة الأسعار</h2>
            <p>{num(services.length)} خدمة مفعّلة. السعر والمدة والعمولة هنا هي اللي بتتحسب في الحجز والكرسي.</p>
          </div>
          <button type="button" className="hr-btn is-primary" onClick={() => setForm({ ...EMPTY })}>
            <PlusIcon size={18} /> خدمة جديدة
          </button>
        </header>
        {loading ? <p className="hr-loading">جارٍ تحميل الخدمات...</p> : !services.length ? (
          <HrEmpty Icon={TagIcon} title="مفيش خدمات لحد دلوقتي" text="ضيف خدماتك (قص، ذقن، بشرة...) بأسعارها وعمولة الحلاق عليها." />
        ) : (
          <div className="hr-table-wrap">
            <table className="hr-table">
              <thead>
                <tr><th>الخدمة</th><th>القسم</th><th>المدة</th><th>السعر</th><th>عمولة الحلاق</th><th><span className="sr-only">إجراءات</span></th></tr>
              </thead>
              <tbody>
                {services.map((s) => (
                  <tr key={s.id}>
                    <td><div className="hr-stack"><strong>{s.name}</strong>{s.description && <small>{s.description}</small>}</div></td>
                    <td><span className="hr-pill">{s.category || 'عام'}</span></td>
                    <td>{num(s.duration_minutes)} دقيقة</td>
                    <td><strong>{money(s.price)}</strong></td>
                    <td>{commissionLabel(s)}</td>
                    <td>
                      <div className="hr-row-actions">
                        <button type="button" className="hr-btn is-sm is-icon" aria-label={`تعديل ${s.name}`} onClick={() => setForm({ ...EMPTY, ...s, category: s.category || '', cost_price: s.cost_price ?? '', description: s.description || '' })}><PencilIcon size={16} /></button>
                        <button type="button" className="hr-btn is-sm is-icon" aria-label={`إيقاف ${s.name}`} onClick={() => remove(s)} disabled={busy}><TrashIcon size={16} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {form && (
        <SalonFormModal
          isOpen
          onClose={() => setForm(null)}
          title={form.id ? 'تعديل خدمة' : 'خدمة جديدة'}
          subtitle="العمولة بتتحسب للحلاق تلقائيًا مع كل خدمة يخلّصها."
          onSubmit={save}
          busy={busy}
          error={error}
          submitLabel={form.id ? 'حفظ التعديل' : 'إضافة الخدمة'}
        >
          <Field label="اسم الخدمة *" wide><input className="hr-input" value={form.name} onChange={set('name')} maxLength={120} required /></Field>
          <Field label="القسم"><input className="hr-input" value={form.category} onChange={set('category')} placeholder="شعر، ذقن، بشرة..." maxLength={60} /></Field>
          <Field label="المدة (دقيقة)"><input className="hr-input" type="number" min="5" step="5" value={form.duration_minutes} onChange={set('duration_minutes')} /></Field>
          <Field label="السعر (ج.م) *"><input className="hr-input" type="number" min="0" step="0.5" value={form.price} onChange={set('price')} required /></Field>
          <Field label="تكلفة الخامات (ج.م)"><input className="hr-input" type="number" min="0" step="0.5" value={form.cost_price} onChange={set('cost_price')} /></Field>
          <Field label="نوع العمولة">
            <select className="hr-select" value={form.commission_type} onChange={set('commission_type')}>
              <option value="percentage">نسبة من السعر %</option>
              <option value="fixed">مبلغ ثابت ج.م</option>
            </select>
          </Field>
          <Field label="قيمة العمولة"><input className="hr-input" type="number" min="0" step="0.5" value={form.commission_value} onChange={set('commission_value')} /></Field>
          <Field label="وصف" wide><input className="hr-input" value={form.description} onChange={set('description')} maxLength={200} /></Field>
        </SalonFormModal>
      )}
    </>
  );
}
