import { useEffect, useRef, useState } from 'react';
import LineIcon from '../icons/LineIcons.jsx';
import VehiclePlate from './VehiclePlate.jsx';
import CarDiagram from './CarDiagram.jsx';
import FuelGauge from './FuelGauge.jsx';
import SignaturePad from './SignaturePad.jsx';
import * as workshopApi from '../../api/enterprise.js';
import INTAKE from '../../../shared/vehicleIntake.json';
import { carColorHex, km, longDate } from '../../utils/vehicles.js';
import { photoToDataUrl, zoneOf } from '../../utils/vehicleZones.js';
import '../../styles/workshop.css';
import '../../styles/checkIn.css';

const MAX_COMPLAINT = 500;
const DAMAGE_ICON = { scratch: 'round', dent: 'square', break: 'diamond' };
const allPresent = () => Object.fromEntries(Object.values(INTAKE.checklist).flat().map((i) => [i.key, 'present']));
const group = (v) => (v === '' ? '' : Number(v).toLocaleString('en-US'));

function Stepper({ step }) {
  return (
    <ol className="ci-steps" aria-label="خطوات الاستلام">
      <li className={step === 'pick' ? 'is-now' : 'is-done'}><span>{step === 'pick' ? 1 : <LineIcon name="check" size={14} strokeWidth={3} />}</span>المركبة</li>
      <i className={step === 'pick' ? '' : 'is-done'} aria-hidden="true" />
      <li className={step === 'check' ? 'is-now' : ''}><span>2</span>الفحص والاستلام</li>
    </ol>
  );
}

function VehiclePicker({ onPick }) {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState([]);
  useEffect(() => {
    const t = setTimeout(() => { Promise.resolve(workshopApi.searchVehicles(q)).then((r) => setRows(r || [])).catch(() => setRows([])); }, 200);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div className="ci-pick">
      <label className="wk-search"><LineIcon name="search" size={18} /><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث برقم اللوحة أو اسم المالك" aria-label="بحث عن مركبة" autoFocus /></label>
      <ul>
        {rows.length === 0 && <li className="wk-empty">لا توجد مركبات مطابقة.</li>}
        {rows.map((v) => (
          <li key={v.id}><button type="button" onClick={() => onPick(v)}>
            <VehiclePlate plate={v.plate} city={v.plate_city} kind={v.plate_kind} />
            <span><b>{[v.make, v.model].filter(Boolean).join(' ') || 'مركبة'}</b><small>{v.customer_name}</small></span>
          </button></li>
        ))}
      </ul>
    </div>
  );
}

export default function CheckInDialog({ vehicle: initial, onClose, onDone }) {
  const [step, setStep] = useState(initial ? 'check' : 'pick');
  const [vehicle, setVehicle] = useState(initial || null);
  const [odometer, setOdometer] = useState(initial?.odometer ? String(initial.odometer) : '');
  const [fuel, setFuel] = useState(2);
  const [complaint, setComplaint] = useState('');
  const [damages, setDamages] = useState([]);
  const [damageType, setDamageType] = useState('scratch');
  const [selected, setSelected] = useState(null);
  const [checklist, setChecklist] = useState(allPresent);
  const [photos, setPhotos] = useState({});
  const [signature, setSignature] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);
  const [printing, setPrinting] = useState(false);
  const noteInputs = useRef([]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  useEffect(() => { if (selected !== null) noteInputs.current[selected]?.focus(); }, [selected]);

  const last = vehicle?.odometer || 0;
  const odo = odometer === '' ? null : Number(odometer);
  const odoOk = odo !== null && odo >= last;
  const missing = !vehicle ? '' : odo === null ? 'اكتب قراءة العدّاد' : !odoOk ? 'قراءة العدّاد أقل من آخر قراءة مسجلة'
    : !complaint.trim() ? 'اكتب شكوى العميلة' : !signature ? 'توقيع العميلة مطلوب' : '';

  function addDamage(x, y) {
    setDamages((list) => [...list, { type: damageType, x, y, zone: zoneOf(x, y), note: '' }]);
    setSelected(damages.length);
  }
  const setNote = (i, note) => setDamages((list) => list.map((d, j) => (j === i ? { ...d, note } : d)));
  const removeDamage = (i) => { setDamages((list) => list.filter((_, j) => j !== i)); setSelected(null); };
  const toggleChip = (label) => setComplaint((c) => (c.includes(label) ? c.split('،').map((s) => s.trim()).filter((s) => s && s !== label).join('، ') : `${c.trim() ? `${c.trim().replace(/[.،]$/, '')}، ` : ''}${label}`).slice(0, MAX_COMPLAINT));

  async function pickPhoto(key, file) {
    if (!file) return;
    try { setPhotos((p) => ({ ...p, [key]: undefined })); const url = await photoToDataUrl(file); setPhotos((p) => ({ ...p, [key]: url })); } catch { setError('تعذر قراءة الصورة'); }
  }

  async function confirm() {
    if (missing) return;
    setSaving(true);
    setError('');
    try {
      const result = await workshopApi.receiveVehicle({
        vehicle_id: vehicle.id, odometer_in: odo, fuel_level: fuel, complaint: complaint.trim(), damages,
        checklist, photos: Object.fromEntries(Object.entries(photos).filter(([, v]) => v)), signature,
      });
      setDone(result.order);
      onDone?.(result.order);
    } catch (err) {
      setError(err.message || 'تعذر تسجيل الاستلام');
    } finally {
      setSaving(false);
    }
  }
  async function print() {
    setPrinting(true);
    try { await workshopApi.printVehicleCheckIn(done.id); } catch (err) { setError(err.message || 'تعذرت الطباعة'); } finally { setPrinting(false); }
  }

  const v = vehicle;
  return (
    <div className="wk-overlay ci-overlay" onClick={onClose}>
      <div className="ci" role="dialog" aria-modal="true" aria-label="استلام مركبة" onClick={(e) => e.stopPropagation()}>
        <header className="ci-head">
          <span className="ci-head__tile"><LineIcon name="logIn" size={26} /></span>
          <div><h2>استلام مركبة</h2><p>سجّل حالة المركبة وقت دخولها الورشة.</p></div>
          <Stepper step={done ? 'check' : step} />
          <button type="button" className="ci-x" onClick={onClose} aria-label="إغلاق"><LineIcon name="x" size={20} /></button>
        </header>

        {done ? (
          <div className="ci-done">
            <span className="ci-done__tick"><LineIcon name="check" size={30} strokeWidth={3} /></span>
            <h3>تم استلام المركبة</h3>
            <p>أمر الشغل <b dir="ltr">#{done.order_number}</b> اتفتح، والعدّاد اتسجّل {km(odo)}.</p>
            {error && <p className="wk-error" role="alert">{error}</p>}
            <div className="ci-done__acts">
              <button type="button" className="wk-btn is-primary" onClick={print} disabled={printing}><LineIcon name="printer" size={16} /> {printing ? 'جاري الطباعة...' : 'طباعة إيصال الاستلام'}</button>
              <button type="button" className="wk-btn" onClick={onClose}>إغلاق</button>
            </div>
          </div>
        ) : step === 'pick' ? <VehiclePicker onPick={(x) => { setVehicle(x); setOdometer(x.odometer ? String(x.odometer) : ''); setStep('check'); }} /> : (<>
          <section className="ci-car">
            <VehiclePlate plate={v.plate} city={v.plate_city} kind={v.plate_kind} />
            <div className="ci-car__who"><b>{[v.make, v.model].filter(Boolean).join(' ')}</b><small>{v.year}{v.color && <><i style={{ background: carColorHex(v.color) }} aria-hidden="true" />{v.color}</>}</small></div>
            <div className="ci-car__owner"><b>{v.customer_name}</b><small dir="ltr">{v.customer_phone || '—'}</small></div>
            <div className="ci-car__vin">{v.vin && <small>الشاسيه <code dir="ltr">{v.vin}</code></small>}<small>{v.last_service_date ? `آخر صيانة ${longDate(v.last_service_date)}` : 'لا توجد صيانة سابقة'}</small></div>
            <button type="button" className="wk-btn ci-change" onClick={() => setStep('pick')}>تغيير المركبة <LineIcon name="refresh" size={16} /></button>
          </section>

          <div className="ci-grid">
            <div className="ci-col">
              <section className="ci-card ci-hull">
                <div className="ci-card__head">
                  <h3>حالة الهيكل</h3>
                  <div className="ci-types" role="radiogroup" aria-label="نوع الملاحظة">
                    {Object.entries(INTAKE.damageTypes).map(([key, label]) => (
                      <button key={key} type="button" role="radio" aria-checked={damageType === key} className={damageType === key ? 'is-on' : ''} onClick={() => setDamageType(key)}><i className={`ci-shape is-${DAMAGE_ICON[key]}`} aria-hidden="true" />{label}</button>
                    ))}
                  </div>
                </div>
                <p className="ci-help">اختر نوع العلامة ثم اضغط على موضعها في السيارة.</p>
                <div className="ci-hull__body">
                  <CarDiagram damages={damages} selected={selected} onAdd={addDamage} onSelect={setSelected} />
                  <div className="ci-notes">
                    {damages.map((d, i) => (
                      <div key={i} className={`ci-note${selected === i ? ' is-sel' : ''}`} onClick={() => setSelected(i)}>
                        <span className={`ci-badge is-${DAMAGE_ICON[d.type]}`}><b>{i + 1}</b></span>
                        <div><p><b>{INTAKE.damageTypes[d.type]}</b> {d.zone}</p>
                          <input ref={(el) => { noteInputs.current[i] = el; }} type="text" maxLength={200} value={d.note} onChange={(e) => setNote(i, e.target.value)} placeholder="اكتب الوصف" aria-label={`وصف الملاحظة ${i + 1}`} /></div>
                        <button type="button" onClick={(e) => { e.stopPropagation(); removeDamage(i); }} aria-label={`حذف الملاحظة ${i + 1}`}><LineIcon name="x" size={16} /></button>
                      </div>
                    ))}
                    <p className="ci-hint">لإضافة ملاحظة جديدة، اضغط على السيارة ثم اكتب الوصف هنا.</p>
                  </div>
                </div>
              </section>

              <section className="ci-card">
                <h3>قائمة الفحص</h3>
                <div className="ci-check">
                  {Object.entries(INTAKE.checklist).map(([group, rows]) => (
                    <div key={group}>
                      <h4>{group === 'exterior' ? 'الخارجي' : 'الداخلي'}</h4>
                      {rows.map((r) => {
                        const ok = checklist[r.key] === 'present';
                        return (
                          <div key={r.key} className="ci-check__row">
                            <span>{r.label}</span>
                            <button type="button" className={ok ? 'is-ok' : 'is-bad'} aria-pressed={ok} onClick={() => setChecklist((c) => ({ ...c, [r.key]: ok ? 'missing' : 'present' }))}>
                              {ok ? 'موجود' : 'ناقص'}<LineIcon name={ok ? 'check' : 'x'} size={14} strokeWidth={3} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </section>

              <div className="ci-pair">
                <section className="ci-card">
                  <div className="ci-card__head"><h3>الصور <small>اختياري</small></h3></div>
                  <div className="ci-photos">
                    {INTAKE.photoSlots.map((s) => (
                      <label key={s.key} className={`ci-photo${photos[s.key] ? ' has-img' : ''}${s.key === 'extra' ? ' is-extra' : ''}`} style={photos[s.key] ? { backgroundImage: `url(${photos[s.key]})` } : undefined}>
                        <input type="file" accept="image/*" capture="environment" onChange={(e) => { pickPhoto(s.key, e.target.files?.[0]); e.target.value = ''; }} />
                        {s.key === 'extra' ? <LineIcon name="plus" size={22} /> : <LineIcon name="camera" size={20} />}
                        <span>{s.key === 'extra' ? 'إضافة صورة' : s.label}</span>
                      </label>
                    ))}
                  </div>
                </section>
                <section className="ci-card">
                  <div className="ci-card__head"><h3>توقيع العميلة <i className="wk-req">*</i></h3></div>
                  <SignaturePad onChange={setSignature} />
                  <p className="ci-sign-note">أقرّ بأن بيانات الاستلام أعلاه صحيحة.</p>
                </section>
              </div>
            </div>

            <div className="ci-col">
              <section className="ci-card">
                <h3>قراءة العدّاد <i className="wk-req">*</i></h3>
                <div className={`ci-odo${odometer !== '' && !odoOk ? ' is-bad' : ''}`}>
                  <LineIcon name="stopwatch" size={22} />
                  <input type="text" inputMode="numeric" dir="ltr" value={group(odometer)} onChange={(e) => setOdometer(e.target.value.replace(/\D/g, ''))} aria-label="قراءة العدّاد" />
                  <em>كم</em>
                </div>
                {odo !== null && (odoOk
                  ? <p className="ci-ok"><LineIcon name="check" size={15} strokeWidth={3} />{odo === last ? `نفس آخر قراءة مسجلة (${km(last)}).` : `أعلى من آخر قراءة مسجلة (${km(last)}) بمقدار ${(odo - last).toLocaleString('en-US')} كم.`}</p>
                  : <p className="ci-bad"><LineIcon name="alert" size={15} />أقل من آخر قراءة مسجلة ({km(last)}). العدّاد لا يرجع للخلف.</p>)}
              </section>

              <section className="ci-card"><h3>مستوى الوقود</h3><FuelGauge level={fuel} onChange={setFuel} /></section>

              <section className="ci-card ci-complaint">
                <h3>شكوى العميلة <i className="wk-req">*</i></h3>
                <div className="ci-chips">
                  {INTAKE.complaintChips.map((c) => <button key={c} type="button" className={complaint.includes(c) ? 'is-on' : ''} aria-pressed={complaint.includes(c)} onClick={() => toggleChip(c)}>{c}</button>)}
                </div>
                <textarea value={complaint} maxLength={MAX_COMPLAINT} onChange={(e) => setComplaint(e.target.value)} placeholder="اكتب شكوى العميلة بكلماتها..." aria-label="شكوى العميلة" />
                <small className="ci-count">{MAX_COMPLAINT} / {complaint.length}</small>
              </section>
            </div>
          </div>

          <footer className="ci-foot">
            <button type="button" className="wk-btn is-primary" onClick={confirm} disabled={saving || Boolean(missing)}>{saving ? 'جاري الحفظ...' : 'تأكيد الاستلام'} <LineIcon name="check" size={16} /></button>
            <button type="button" className="wk-btn" onClick={onClose}>إلغاء</button>
            {(error || missing) && <span className="ci-foot__hint"><LineIcon name="alert" size={15} />{error || missing}</span>}
          </footer>
        </>)}
      </div>
    </div>
  );
}
