import { useState } from 'react';
import LineIcon from '../icons/LineIcons.jsx';
import MacSheet from './MacSheet.jsx';
import VehiclePlate from './VehiclePlate.jsx';
import * as workshopApi from '../../api/enterprise.js';
import { km } from '../../utils/vehicles.js';

const digitsOnly = (v) => String(v).replace(/[^\d]/g, '');
const group = (v) => (v === '' ? '' : Number(v).toLocaleString('en-US'));

function SheetFooter({ onClose, saving, label, disabled }) {
  return (
    <footer>
      <button type="button" className="wk-btn" onClick={onClose}>إلغاء</button>
      <button type="submit" className="wk-btn is-primary" disabled={saving || disabled}>{saving ? 'جاري الحفظ...' : label}</button>
    </footer>
  );
}

/** Schedules the next service: by date, by odometer, or both. */
export function ReminderSheet({ vehicle, onClose, onSaved }) {
  const [kind, setKind] = useState('تغيير زيت وفلاتر');
  const [dueDate, setDueDate] = useState('');
  const [dueKm, setDueKm] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function save(event) {
    event.preventDefault();
    if (!dueDate && dueKm === '') { setError('حدد تاريخًا أو عدّاد كيلومترات للتذكير'); return; }
    setSaving(true);
    setError('');
    try {
      await workshopApi.addServiceReminder(vehicle.id, { kind, due_date: dueDate || null, due_odometer: dueKm === '' ? null : Number(dueKm) });
      onSaved();
    } catch (err) {
      setError(err.message || 'تعذر حفظ الصيانة القادمة');
      setSaving(false);
    }
  }

  return (
    <MacSheet title="جدولة الصيانة القادمة" subtitle={`آخر عدّاد: ${km(vehicle.odometer)}`} onClose={onClose}>
      <form className="wk-form" onSubmit={save}>
        <label className="wk-field"><span>نوع الصيانة</span><input type="text" maxLength={80} value={kind} onChange={(e) => setKind(e.target.value)} autoFocus /></label>
        <div className="wk-formgrid">
          <label className="wk-field"><span>بتاريخ</span><input type="date" dir="ltr" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></label>
          <label className="wk-field"><span>أو عند عدّاد (كم)</span>
            <input type="text" inputMode="numeric" dir="ltr" value={group(dueKm)} onChange={(e) => setDueKm(digitsOnly(e.target.value.replace(/,/g, '')))} placeholder={group(String((vehicle.odometer || 0) + 5000))} />
          </label>
        </div>
        {error && <p className="wk-error" role="alert">{error}</p>}
        <SheetFooter onClose={onClose} saving={saving} label="حفظ الموعد" />
      </form>
    </MacSheet>
  );
}

export function DeleteVehicleSheet({ vehicle, onClose, onDeleted }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function remove() {
    setBusy(true);
    try { await workshopApi.deactivateVehicle(vehicle.id); onDeleted(); } catch (err) { setError(err.message || 'تعذر حذف المركبة'); setBusy(false); }
  }
  return (
    <MacSheet title="حذف المركبة؟" subtitle="سجل صيانتها يفضل محفوظ" onClose={onClose}>
      <div className="wk-done">
        <VehiclePlate plate={vehicle.plate} city={vehicle.plate_city} kind={vehicle.plate_kind} />
        <p>المركبة هتختفي من القائمة والبحث.</p>
        {error && <p className="wk-error" role="alert">{error}</p>}
      </div>
      <footer>
        <button type="button" className="wk-btn" onClick={onClose}>إلغاء</button>
        <button type="button" className="wk-btn veh-danger" disabled={busy} onClick={remove}><LineIcon name="trash" size={16} /> حذف</button>
      </footer>
    </MacSheet>
  );
}
