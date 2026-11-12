import { useCallback, useState } from 'react';
import * as salonApi from '../../api/salon.js';
import { money, num } from '../crm/crmFormat.js';
import { HrEmpty } from '../hr/HrLayout.jsx';
import { PlusIcon, TagIcon, TrashIcon } from '../icons/PosIcons.jsx';
import { Field, SalonAlert, SalonFormModal } from './SalonParts.jsx';
import { useSalonLoad } from './useSalonLoad.js';

const EMPTY = { code: '', title: '', discount_type: 'percentage', discount_value: '', min_spend: '', start_date: '', end_date: '' };

function discountLabel(c) {
  return c.discount_type === 'fixed' ? money(c.discount_value) : `${num(c.discount_value)}%`;
}

export default function SalonCouponsTab() {
  const { data, loading, busy, error, notice, setError, run } = useSalonLoad(useCallback(() => salonApi.getAllSalonCoupons(), []));
  const [form, setForm] = useState(null);
  const coupons = data || [];
  const set = (field) => (event) => setForm((f) => ({ ...f, [field]: event.target.value }));

  async function save() {
    if (form.end_date && form.start_date && form.end_date < form.start_date) {
      setError('تاريخ النهاية لازم يكون بعد البداية.');
      return;
    }
    const ok = await run(() => salonApi.createSalonCoupon({
      ...form,
      discount_value: Number(form.discount_value),
      min_spend: Number(form.min_spend) || 0,
    }), 'تم إنشاء الكوبون.');
    if (ok) setForm(null);
  }

  function remove(coupon) {
    if (!window.confirm(`حذف كوبون ${coupon.code}؟ مش هينفع يتستخدم تاني.`)) return;
    run(() => salonApi.deleteSalonCoupon(coupon.id), 'تم حذف الكوبون.');
  }

  return (
    <>
      {!form && <SalonAlert error={error} notice={notice} />}
      <section className="hr-card">
        <header className="hr-card-head">
          <div>
            <h2>الكوبونات والعروض</h2>
            <p>الكاشير بيكتب الكود في الفاتورة والخصم بيتحسب بعد التأكد من الشروط.</p>
          </div>
          <button type="button" className="hr-btn is-primary" onClick={() => setForm({ ...EMPTY })}>
            <PlusIcon size={18} /> كوبون جديد
          </button>
        </header>
        {loading ? <p className="hr-loading">جارٍ تحميل الكوبونات...</p> : !coupons.length ? (
          <HrEmpty Icon={TagIcon} title="مفيش كوبونات" text="اعمل كود خصم للمواسم أو للعملاء الجداد (مثلًا EID10)." />
        ) : (
          <div className="hr-table-wrap">
            <table className="hr-table">
              <thead><tr><th>الكود</th><th>العرض</th><th>الخصم</th><th>أقل فاتورة</th><th>الفترة</th><th>استُخدم</th><th><span className="sr-only">إجراءات</span></th></tr></thead>
              <tbody>
                {coupons.map((c) => (
                  <tr key={c.id} className={c.is_active ? undefined : 'is-muted'}>
                    <td><strong dir="ltr">{c.code}</strong></td>
                    <td>{c.title}</td>
                    <td><span className="hr-pill is-brand">{discountLabel(c)}</span></td>
                    <td>{c.min_spend > 0 ? money(c.min_spend) : '—'}</td>
                    <td>{c.start_date || c.end_date ? `${c.start_date || '…'} ← ${c.end_date || '…'}` : 'مفتوح'}</td>
                    <td>{num(c.usage_count)} مرة</td>
                    <td>
                      <div className="hr-row-actions">
                        <button type="button" className="hr-btn is-sm is-icon" aria-label={`حذف ${c.code}`} onClick={() => remove(c)} disabled={busy}><TrashIcon size={16} /></button>
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
        <SalonFormModal isOpen onClose={() => setForm(null)} title="كوبون جديد" subtitle="الكود بيتحفظ بحروف كابيتال." onSubmit={save} busy={busy} error={error} submitLabel="إنشاء الكوبون">
          <Field label="الكود *"><input className="hr-input" dir="ltr" value={form.code} onChange={set('code')} maxLength={30} required /></Field>
          <Field label="اسم العرض *"><input className="hr-input" value={form.title} onChange={set('title')} maxLength={80} required /></Field>
          <Field label="نوع الخصم">
            <select className="hr-select" value={form.discount_type} onChange={set('discount_type')}>
              <option value="percentage">نسبة %</option>
              <option value="fixed">مبلغ ثابت ج.م</option>
            </select>
          </Field>
          <Field label="قيمة الخصم *"><input className="hr-input" type="number" min="0.5" step="0.5" max={form.discount_type === 'fixed' ? undefined : 100} value={form.discount_value} onChange={set('discount_value')} required /></Field>
          <Field label="أقل قيمة فاتورة (ج.م)"><input className="hr-input" type="number" min="0" step="1" value={form.min_spend} onChange={set('min_spend')} /></Field>
          <span />
          <Field label="يبدأ من"><input className="hr-input" type="date" value={form.start_date} onChange={set('start_date')} /></Field>
          <Field label="ينتهي في"><input className="hr-input" type="date" value={form.end_date} min={form.start_date || undefined} onChange={set('end_date')} /></Field>
        </SalonFormModal>
      )}
    </>
  );
}
