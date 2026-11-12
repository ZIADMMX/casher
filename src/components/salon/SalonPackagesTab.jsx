import { useCallback, useState } from 'react';
import * as salonApi from '../../api/salon.js';
import { money, num } from '../crm/crmFormat.js';
import { HrEmpty } from '../hr/HrLayout.jsx';
import { GiftIcon, PlusIcon } from '../icons/PosIcons.jsx';
import { Field, SalonAlert, SalonFormModal } from './SalonParts.jsx';
import { useSalonLoad } from './useSalonLoad.js';

const EMPTY = { name: '', price: '', total_visits: 4, validity_days: 90, description: '', serviceIds: [] };

function includedNames(pkg, services) {
  try {
    const ids = JSON.parse(pkg.included_services_json || '[]');
    return services.filter((s) => ids.includes(s.id)).map((s) => s.name);
  } catch {
    return [];
  }
}

// Selling a package to a customer is not here on purpose: the subscribe call takes no payment,
// so it belongs to the POS checkout, not a back-office button.
export default function SalonPackagesTab() {
  const { data, loading, busy, error, notice, setError, run } = useSalonLoad(useCallback(async () => {
    const [packages, services] = await Promise.all([salonApi.getAllSalonPackages(), salonApi.getAllSalonServices()]);
    return { packages: packages || [], services: services || [] };
  }, []));
  const [form, setForm] = useState(null);
  const packages = data?.packages || [];
  const services = data?.services || [];
  const set = (field) => (event) => setForm((f) => ({ ...f, [field]: event.target.value }));

  function toggleService(id) {
    setForm((f) => ({ ...f, serviceIds: f.serviceIds.includes(id) ? f.serviceIds.filter((x) => x !== id) : [...f.serviceIds, id] }));
  }

  async function save() {
    if (!form.name.trim() || !(Number(form.price) > 0) || !(Number(form.total_visits) > 0)) {
      setError('اكتب اسم الباقة وسعرها وعدد الزيارات.');
      return;
    }
    const ok = await run(() => salonApi.createSalonPackage({
      name: form.name.trim(),
      price: Number(form.price),
      total_visits: Number(form.total_visits),
      validity_days: Number(form.validity_days) || 90,
      description: form.description.trim(),
      included_services_json: JSON.stringify(form.serviceIds),
    }), 'تمت إضافة الباقة.');
    if (ok) setForm(null);
  }

  return (
    <>
      {!form && <SalonAlert error={error} notice={notice} />}
      <section className="hr-card">
        <header className="hr-card-head">
          <div>
            <h2>الباقات وكروت الزيارات</h2>
            <p>كروت بعدد زيارات وسعر توفيري، صالحة لمدة محددة من يوم الشراء.</p>
          </div>
          <button type="button" className="hr-btn is-primary" onClick={() => setForm({ ...EMPTY })}>
            <PlusIcon size={18} /> باقة جديدة
          </button>
        </header>
        {loading ? <p className="hr-loading">جارٍ تحميل الباقات...</p> : !packages.length ? (
          <HrEmpty Icon={GiftIcon} title="مفيش باقات لحد دلوقتي" text="اعمل كارت زيارات (مثلًا ٦ قصات بسعر ٤) علشان العميل يرجعلك." />
        ) : (
          <div className="hr-table-wrap">
            <table className="hr-table">
              <thead><tr><th>الباقة</th><th>السعر</th><th>الزيارات</th><th>الصلاحية</th><th>سعر الزيارة</th><th>الخدمات المشمولة</th></tr></thead>
              <tbody>
                {packages.map((p) => {
                  const names = includedNames(p, services);
                  return (
                    <tr key={p.id}>
                      <td><div className="hr-stack"><strong>{p.name}</strong>{p.description && <small>{p.description}</small>}</div></td>
                      <td><strong>{money(p.price)}</strong></td>
                      <td>{num(p.total_visits)} زيارة</td>
                      <td>{num(p.validity_days)} يوم</td>
                      <td>{money(Math.round((p.price / p.total_visits) * 100) / 100)}</td>
                      <td>{names.length ? <div className="salon-chip-row">{names.map((n) => <span key={n} className="hr-pill">{n}</span>)}</div> : <span className="hr-dash">كل الخدمات</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {form && (
        <SalonFormModal isOpen onClose={() => setForm(null)} title="باقة جديدة" subtitle="الصلاحية بتبدأ من يوم ما العميل يشتري الكارت." onSubmit={save} busy={busy} error={error} submitLabel="إضافة الباقة">
          <Field label="اسم الباقة *" wide><input className="hr-input" value={form.name} onChange={set('name')} maxLength={120} required /></Field>
          <Field label="السعر (ج.م) *"><input className="hr-input" type="number" min="1" step="0.5" value={form.price} onChange={set('price')} required /></Field>
          <Field label="عدد الزيارات *"><input className="hr-input" type="number" min="1" step="1" value={form.total_visits} onChange={set('total_visits')} required /></Field>
          <Field label="الصلاحية (يوم)"><input className="hr-input" type="number" min="1" step="1" value={form.validity_days} onChange={set('validity_days')} /></Field>
          <Field label="وصف"><input className="hr-input" value={form.description} onChange={set('description')} maxLength={200} /></Field>
          {services.length > 0 && (
            <fieldset className="hr-field is-wide salon-fieldset">
              <legend>الخدمات المشمولة (سيبها فاضية = كل الخدمات)</legend>
              <div className="salon-chip-row">
                {services.map((s) => (
                  <button key={s.id} type="button" className={`hr-filter${form.serviceIds.includes(s.id) ? ' is-active' : ''}`} aria-pressed={form.serviceIds.includes(s.id)} onClick={() => toggleService(s.id)}>{s.name}</button>
                ))}
              </div>
            </fieldset>
          )}
        </SalonFormModal>
      )}
    </>
  );
}
