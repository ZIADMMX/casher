import { useEffect, useMemo, useRef, useState } from 'react';
import LineIcon from '../icons/LineIcons.jsx';
import MacSheet from './MacSheet.jsx';
import VehiclePlate from './VehiclePlate.jsx';
import * as customersApi from '../../api/customers.js';
import * as workshopApi from '../../api/enterprise.js';
import { CAR_CATALOG, CAR_COLOR_NAMES, CAR_MAKES, OTHER } from '../../utils/carCatalog.js';
import { GOVERNORATES, PLATE_KINDS, carColorHex } from '../../utils/vehicles.js';

const AR = '٠١٢٣٤٥٦٧٨٩';
const latinDigits = (s) => String(s).replace(/[٠-٩]/g, (d) => AR.indexOf(d));
const cleanLetters = (s) => latinDigits(s).replace(/[^A-Za-zء-ي ]/g, '').replace(/\s+/g, ' ').toUpperCase().slice(0, 7);
const cleanDigits = (s) => latinDigits(s).replace(/\D/g, '').slice(0, 4);
const group = (v) => (v === '' ? '' : Number(v).toLocaleString('en-US'));
const splitPlateParts = (plate) => ({ letters: String(plate || '').replace(/[0-9٠-٩\s-]/g, '').split('').join(' '), digits: cleanDigits(plate || '') });

const thisYear = new Date().getFullYear();
const YEARS = Array.from({ length: thisYear + 1 - 1989 }, (_, i) => thisYear + 1 - i);

/** A select with an "other" escape hatch that swaps to a text input. */
function CatalogSelect({ value, onChange, options, placeholder, label, disabled }) {
  const known = options.includes(value);
  const [custom, setCustom] = useState(Boolean(value) && !known);
  if (custom) {
    return (
      <div className="vf-select is-custom">
        <input type="text" value={value} maxLength={60} placeholder={`اكتب ${label}`} aria-label={label} onChange={(e) => onChange(e.target.value)} autoFocus />
        <button type="button" className="vf-select__back" onClick={() => { setCustom(false); onChange(''); }} aria-label="الرجوع للقائمة"><LineIcon name="chevronDown" size={16} /></button>
      </div>
    );
  }
  return (
    <label className="vf-select">
      <select value={value} disabled={disabled} aria-label={label} onChange={(e) => (e.target.value === OTHER ? (setCustom(true), onChange('')) : onChange(e.target.value))}>
        <option value="">{placeholder}</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
        <option value={OTHER}>أخرى…</option>
      </select>
      <LineIcon name="chevronDown" size={16} />
    </label>
  );
}

function OwnerField({ owner, onChange }) {
  const [customers, setCustomers] = useState([]);
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [fresh, setFresh] = useState({ name: '', phone: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.resolve(customersApi.getAllCustomersWithStats()).then((list) => { if (alive) setCustomers(list || []); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const term = text.trim();
  const matches = useMemo(() => (term ? customers.filter((c) => `${c.name} ${c.phone || ''}`.includes(term)) : customers).slice(0, 5), [customers, term]);

  async function create(e) {
    e.preventDefault();
    if (!fresh.name.trim()) { setError('اسم العميل مطلوب'); return; }
    setBusy(true);
    setError('');
    try {
      const { id } = await customersApi.addCustomer({ name: fresh.name.trim(), phone: fresh.phone.trim() || null, email: null });
      const created = { id, name: fresh.name.trim(), phone: fresh.phone.trim() };
      setCustomers((l) => [created, ...l]);
      onChange(created);
      setAdding(false);
      setFresh({ name: '', phone: '' });
    } catch (err) {
      setError(err.message || 'تعذر إضافة العميل');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="vf-owner">
      <div className="vf-owner__row">
        {owner ? (
          <div className="vf-chip">
            <LineIcon name="search" size={18} />
            <b>{owner.name}</b>
            <span dir="ltr">{owner.phone || '—'}</span>
            <button type="button" onClick={() => { onChange(null); setText(''); }} aria-label="تغيير المالك"><LineIcon name="x" size={16} /></button>
          </div>
        ) : (
          <label className="wk-search vf-owner__search">
            <LineIcon name="search" size={18} />
            <input type="text" value={text} maxLength={120} placeholder="ابحث باسم المالك أو هاتفه" aria-label="المالك" onFocus={() => setOpen(true)} onChange={(e) => { setText(e.target.value); setOpen(true); }} />
          </label>
        )}
        <button type="button" className="wk-btn" onClick={() => { setAdding((v) => !v); setOpen(false); }} aria-expanded={adding}>عميل جديد <LineIcon name="userPlus" size={16} /></button>
      </div>
      {open && !owner && !adding && (
        <div className="vf-pop" role="listbox" aria-label="نتائج المالك">
          {matches.length === 0 && <p className="wk-empty">لا يوجد عميل بهذا الاسم. استخدم «عميل جديد».</p>}
          {matches.map((c) => (
            <button key={c.id} type="button" role="option" aria-selected={false} onClick={() => { onChange(c); setOpen(false); }}>
              <span className="wk-avatar" aria-hidden="true">{(c.name || '؟').trim().charAt(0)}</span>
              <span><b>{c.name}</b><small dir="ltr">{c.phone || '—'}</small></span>
            </button>
          ))}
        </div>
      )}
      {adding && (
        <form className="vf-quick" onSubmit={create}>
          <label className="wk-field"><span>اسم العميل</span><input type="text" maxLength={120} value={fresh.name} onChange={(e) => setFresh({ ...fresh, name: e.target.value })} autoFocus /></label>
          <label className="wk-field"><span>الهاتف</span><input type="tel" dir="ltr" maxLength={30} value={fresh.phone} onChange={(e) => setFresh({ ...fresh, phone: e.target.value })} placeholder="0100 000 0000" /></label>
          <button type="submit" className="wk-btn is-primary" disabled={busy}>{busy ? '...' : 'إضافة'}</button>
          {error && <p className="wk-error" role="alert">{error}</p>}
        </form>
      )}
    </div>
  );
}

/** Add or edit a vehicle. `vehicle` set = edit. */
export default function VehicleFormSheet({ vehicle, presetPlate = '', onClose, onSaved, onOpenExisting }) {
  const editing = Boolean(vehicle);
  const initial = splitPlateParts(vehicle?.plate || presetPlate);
  const [letters, setLetters] = useState(initial.letters);
  const [digits, setDigits] = useState(initial.digits);
  const [kind, setKind] = useState(vehicle?.plate_kind || 'private');
  const [city, setCity] = useState(vehicle?.plate_city || 'القاهرة');
  const [make, setMake] = useState(vehicle?.make || '');
  const [model, setModel] = useState(vehicle?.model || '');
  const [year, setYear] = useState(vehicle?.year ? String(vehicle.year) : '');
  const [vin, setVin] = useState(vehicle?.vin || '');
  const [color, setColor] = useState(vehicle?.color || '');
  const [owner, setOwner] = useState(vehicle ? { id: vehicle.customer_id, name: vehicle.customer_name, phone: vehicle.customer_phone } : null);
  const [odometer, setOdometer] = useState(vehicle ? String(vehicle.odometer) : '');
  const [notes, setNotes] = useState(vehicle?.notes || '');
  const [dup, setDup] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const seq = useRef(0);

  const plate = `${letters.replace(/\s/g, '')}${digits}`;
  const plateReady = letters.replace(/\s/g, '').length >= 2 && digits.length >= 1;

  useEffect(() => {
    setDup(null);
    if (!plateReady) return undefined;
    const mine = ++seq.current;
    const t = setTimeout(() => {
      Promise.resolve(workshopApi.findVehicleByPlate(plate)).then((found) => { if (mine === seq.current && found && found.id !== vehicle?.id) setDup(found); }).catch(() => {});
    }, 350);
    return () => clearTimeout(t);
  }, [plate, plateReady, vehicle?.id]);

  const models = CAR_CATALOG[make] || [];
  const colorOptions = color && !CAR_COLOR_NAMES.includes(color) ? [color, ...CAR_COLOR_NAMES] : CAR_COLOR_NAMES;
  const makeOptions = make && !CAR_MAKES.includes(make) ? [make, ...CAR_MAKES] : CAR_MAKES;
  const modelOptions = model && !models.includes(model) ? [model, ...models] : models;

  const missing = !plateReady ? 'اكتب حروف وأرقام اللوحة' : dup ? 'غيّر رقم اللوحة لتتمكن من الحفظ'
    : !make ? 'اختر الماركة' : !model ? 'اختر الموديل' : !owner ? 'اختر المالك'
    : !editing && odometer === '' ? 'اكتب العدّاد الحالي' : '';

  async function save(event) {
    event.preventDefault();
    if (missing) return;
    setSaving(true);
    setError('');
    const data = {
      customer_id: owner.id, plate, plate_kind: kind, plate_city: PLATE_KINDS[kind].city || city,
      make, model, year: year === '' ? null : Number(year), color, vin, notes, odometer: odometer === '' ? 0 : Number(odometer),
    };
    try {
      const saved = editing ? await workshopApi.updateVehicle(vehicle.id, data) : await workshopApi.createVehicle(data);
      onSaved(saved, editing);
    } catch (err) {
      setError(err.message || 'تعذر حفظ المركبة');
      setSaving(false);
    }
  }

  const label = editing ? 'تعديل بيانات المركبة' : 'مركبة جديدة';
  return (
    <MacSheet icon="car" title={label} subtitle="سجّل المركبة ليظهر موعد صيانتها القادمة تلقائيًا في الجدول." onClose={onClose}>
      <form className="vf" onSubmit={save} noValidate>
        <section className={`vf-plate${dup ? ' is-dup' : ''}`} aria-label="اللوحة">
          <h3>رقم اللوحة <i className="wk-req">*</i></h3>
          <div className="vf-plate__grid">
            <VehiclePlate plate={plate || '١٢٣٤'} city={PLATE_KINDS[kind].city || city} kind={kind} />
            <div className="vf-plate__fields">
              <label className="vf-in"><span>الحروف</span><input type="text" value={letters} onChange={(e) => setLetters(cleanLetters(e.target.value))} placeholder="ق ن ر" aria-label="حروف اللوحة" autoFocus={!editing} /></label>
              <label className="vf-in"><span>الأرقام</span><input type="text" inputMode="numeric" dir="ltr" value={digits} onChange={(e) => setDigits(cleanDigits(e.target.value))} placeholder="3481" aria-label="أرقام اللوحة" /></label>
              <div className="vf-plate__row">
                <label className="vf-select"><select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="نوع اللوحة">{Object.entries(PLATE_KINDS).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}</select><LineIcon name="chevronDown" size={16} /></label>
                {kind === 'private' && <label className="vf-select"><select value={city} onChange={(e) => setCity(e.target.value)} aria-label="المحافظة">{GOVERNORATES.map((g) => <option key={g}>{g}</option>)}</select><LineIcon name="chevronDown" size={16} /></label>}
              </div>
            </div>
          </div>
          {dup && (
            <div className="vf-dup" role="alert">
              <LineIcon name="alert" size={18} />
              <p><b>{dup.is_active ? 'هذه اللوحة مسجّلة بالفعل.' : 'هذه اللوحة كانت مسجّلة ومحذوفة.'}</b> تخص {[dup.make, dup.model, dup.year].filter(Boolean).join(' ')} للعميل {dup.customer_name}. غيّر الحروف أو الأرقام{dup.is_active ? '، أو افتح المركبة الموجودة' : ''}.</p>
              {dup.is_active && onOpenExisting && <button type="button" className="wk-btn wk-btn--sm" onClick={() => onOpenExisting(dup)}>فتح المركبة الحالية</button>}
            </div>
          )}
        </section>

        <div className="vf-grid3">
          <div className="vf-f"><span>الماركة <i className="wk-req">*</i></span><CatalogSelect label="الماركة" placeholder="اختر الماركة" options={makeOptions} value={make} onChange={(v) => { setMake(v); setModel(''); }} /></div>
          <div className="vf-f"><span>الموديل <i className="wk-req">*</i></span><CatalogSelect key={make} label="الموديل" placeholder={make ? 'اختر الموديل' : 'اختر الماركة أولًا'} options={modelOptions} value={model} onChange={setModel} disabled={!make} /></div>
          <div className="vf-f"><span>سنة الصنع</span>
            <label className="vf-select"><select value={year} onChange={(e) => setYear(e.target.value)} aria-label="سنة الصنع"><option value="">السنة</option>{YEARS.map((y) => <option key={y} value={y}>{y}</option>)}</select><LineIcon name="chevronDown" size={16} /></label>
          </div>
        </div>

        <div className="vf-grid2">
          <label className="vf-f"><span>رقم الشاسيه (VIN)</span>
            <div className="vf-vin"><input type="text" dir="ltr" maxLength={17} value={vin} onChange={(e) => setVin(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} placeholder="اختياري، 17 حرفًا" /><em className={vin.length === 17 ? 'is-full' : ''}>{vin.length}/17</em></div>
          </label>
          <div className="vf-f"><span>اللون</span>
            <label className="vf-select has-dot">
              {color && <i className="vf-swatch" style={{ background: carColorHex(color) }} aria-hidden="true" />}
              <select value={color} onChange={(e) => setColor(e.target.value)} aria-label="اللون"><option value="">اختر اللون</option>{colorOptions.map((c) => <option key={c} value={c}>{c}</option>)}</select>
              <LineIcon name="chevronDown" size={16} />
            </label>
          </div>
        </div>

        <div className="vf-f"><span>المالك <i className="wk-req">*</i></span><OwnerField owner={owner} onChange={setOwner} /></div>

        <div className="vf-grid2 is-notes">
          <label className="vf-f"><span>{editing ? 'آخر عدّاد' : 'العدّاد الحالي'} {!editing && <i className="wk-req">*</i>}</span>
            <div className="vf-vin"><input type="text" inputMode="numeric" dir="ltr" disabled={editing} title={editing ? 'العدّاد بيتحدّث من أمر الشغل' : undefined} value={group(odometer)} onChange={(e) => setOdometer(e.target.value.replace(/[^\d]/g, ''))} placeholder="84,210" /><em>كم</em></div>
          </label>
          <label className="vf-f"><span>ملاحظات</span><textarea rows={3} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="مثال: العميل يفضّل زيت 5W-30" /></label>
        </div>

        {error && <p className="wk-error vf-err" role="alert">{error}</p>}
        <footer className="vf-foot">
          <button type="submit" className="wk-btn is-primary" disabled={saving || Boolean(missing)}>{saving ? 'جاري الحفظ...' : (editing ? 'حفظ التعديلات' : 'حفظ المركبة')} <LineIcon name="check" size={16} /></button>
          <button type="button" className="wk-btn" onClick={onClose}>إلغاء</button>
          {missing && <span className="vf-hint"><LineIcon name="alert" size={15} />{missing}</span>}
        </footer>
      </form>
    </MacSheet>
  );
}
