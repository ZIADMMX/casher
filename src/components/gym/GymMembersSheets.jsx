import { useEffect, useState } from 'react';
import LineIcon from '../icons/LineIcons.jsx';
import * as customersApi from '../../api/customers.js';
import * as subscriptionsApi from '../../api/subscriptions.js';

const money = (v) => (Number(v) || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });

/** A frosted, macOS-style sheet: close dot on the title bar, Escape and an outside click close it. */
export function MacSheet({ title, subtitle, label, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="gco-overlay gmp-overlay" onClick={onClose}>
      <div className="gmp-mac" role="dialog" aria-modal="true" aria-label={label || title} onClick={(e) => e.stopPropagation()}>
        <header className="gmp-mac__bar">
          <button type="button" className="gmp-mac__dot" onClick={onClose} aria-label="إغلاق"><LineIcon name="x" size={9} strokeWidth={3.5} /></button>
          <div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
        </header>
        {children}
      </div>
    </div>
  );
}

const EMPTY = { name: '', phone: '', email: '', emergency_name: '', emergency_phone: '', health_notes: '', trainer_id: '' };

/** Registers a member: the customer record first, then the gym profile (emergency contact, health notes, trainer). */
export function AddMemberSheet({ onClose, onCreated, onSubscribe }) {
  const [form, setForm] = useState(EMPTY);
  const [trainers, setTrainers] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState(null); // { id, name, warning }
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  useEffect(() => {
    let alive = true;
    Promise.resolve(subscriptionsApi.getGymTrainers?.({}))
      .then((list) => { if (alive) setTrainers((list || []).filter((t) => t.is_active !== 0)); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  async function save(event) {
    event.preventDefault();
    const name = form.name.trim();
    if (!name) { setError('اسم العضو مطلوب'); return; }
    setSaving(true);
    setError('');
    let id;
    try {
      ({ id } = await customersApi.addCustomer({ name, phone: form.phone.trim() || null, email: form.email.trim() || null }));
    } catch (err) {
      setError(`تعذر تسجيل العضو: ${err.message}`);
      setSaving(false);
      return;
    }
    let warning = '';
    if (form.emergency_name || form.emergency_phone || form.health_notes || form.trainer_id) {
      try {
        await subscriptionsApi.saveGymMemberProfile(id, {
          emergency_name: form.emergency_name,
          emergency_phone: form.emergency_phone,
          health_notes: form.health_notes,
          trainer_id: form.trainer_id ? Number(form.trainer_id) : null,
        });
      } catch (err) {
        warning = `تم تسجيل العضو لكن تعذر حفظ بياناته الإضافية: ${err.message}`;
      }
    }
    setCreated({ id, name, warning });
    onCreated();
  }

  if (created) {
    return (
      <MacSheet title="تم تسجيل العضو" subtitle={created.name} onClose={onClose}>
        <div className="gmp-done">
          <span className="gmp-done__tick" aria-hidden="true"><LineIcon name="check" size={26} strokeWidth={3} /></span>
          <p>كود العضو للبوابة: <b dir="ltr">GM-{created.id}</b></p>
          {created.warning && <p className="gms-error" role="alert">{created.warning}</p>}
        </div>
        <footer>
          <button type="button" className="gms-btn" onClick={onClose}>تم</button>
          <button type="button" className="gms-btn is-primary" onClick={() => onSubscribe(created.id)}><LineIcon name="bolt" size={16} /> اشتراك الآن</button>
        </footer>
      </MacSheet>
    );
  }

  return (
    <MacSheet title="إضافة عضو جديد" subtitle="بيانات التسجيل وجهة الطوارئ" onClose={onClose}>
      <form className="gmp-form" onSubmit={save}>
        <div className="gms-formgrid">
          <label className="gms-field"><span>الاسم <i className="gmp-req">*</i></span><input type="text" maxLength={120} value={form.name} onChange={set('name')} placeholder="اسم العضو" autoFocus /></label>
          <label className="gms-field"><span>الهاتف</span><input type="tel" dir="ltr" maxLength={30} value={form.phone} onChange={set('phone')} placeholder="0100 000 0000" /></label>
        </div>
        <label className="gms-field"><span>البريد الإلكتروني</span><input type="email" dir="ltr" maxLength={120} value={form.email} onChange={set('email')} placeholder="اختياري" /></label>
        <div className="gms-formgrid">
          <label className="gms-field"><span>جهة اتصال الطوارئ</span><input type="text" maxLength={80} value={form.emergency_name} onChange={set('emergency_name')} placeholder="الاسم والصلة" /></label>
          <label className="gms-field"><span>هاتف الطوارئ</span><input type="tel" dir="ltr" maxLength={30} value={form.emergency_phone} onChange={set('emergency_phone')} placeholder="0100 000 0000" /></label>
        </div>
        <label className="gms-field">
          <span>المدرب</span>
          <select value={form.trainer_id} onChange={set('trainer_id')}>
            <option value="">بدون مدرب</option>
            {trainers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <label className="gms-field"><span>ملاحظات صحية</span><textarea rows={3} maxLength={1000} value={form.health_notes} onChange={set('health_notes')} placeholder="إصابات سابقة، حساسية، تعليمات للمدرب" /></label>
        {error && <p className="gms-error" role="alert">{error}</p>}
        <footer>
          <button type="button" className="gms-btn" onClick={onClose}>إلغاء</button>
          <button type="submit" className="gms-btn is-primary" disabled={saving}><LineIcon name="userPlus" size={16} /> حفظ العضو</button>
        </footer>
      </form>
    </MacSheet>
  );
}

/** Collects (part of) what the member owes from instalments or credit sales. */
export function PaySheet({ member, onClose, onDone }) {
  const [amount, setAmount] = useState(String(member.debt));
  const [method, setMethod] = useState('cash');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function save(event) {
    event.preventDefault();
    const value = Number(amount);
    if (!(value > 0) || value > member.debt) { setError(`المبلغ يجب أن يكون بين 0.01 و${money(member.debt)}`); return; }
    setSaving(true);
    setError('');
    try {
      await customersApi.recordCustomerPayment({ customerId: member.id, amount: value, paymentMethod: method, notes });
      onDone(`تم تسجيل سداد ${money(value)} ج.م من ${member.name}.`);
    } catch (err) {
      setError(err.message || 'تعذر تسجيل السداد');
      setSaving(false);
    }
  }

  return (
    <MacSheet title="تسجيل سداد" subtitle={member.name} onClose={onClose}>
      <form className="gmp-form" onSubmit={save}>
        <dl className="gms-quote">
          <div><dt>المستحق الحالي</dt><dd>{money(member.debt)} ج.م</dd></div>
        </dl>
        <label className="gms-field"><span>مبلغ السداد (ج.م)</span><input type="number" min="0.01" step="0.01" max={member.debt} value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus /></label>
        <label className="gms-field">
          <span>طريقة السداد</span>
          <select value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="cash">نقدي</option>
            <option value="card">بطاقة</option>
            <option value="bank_transfer">تحويل بنكي</option>
          </select>
        </label>
        <label className="gms-field"><span>ملاحظات</span><input type="text" maxLength={200} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="اختياري" /></label>
        {error && <p className="gms-error" role="alert">{error}</p>}
        <footer>
          <button type="button" className="gms-btn" onClick={onClose}>إلغاء</button>
          <button type="submit" className="gms-btn is-primary" disabled={saving}><LineIcon name="banknote" size={16} /> حفظ السداد</button>
        </footer>
      </form>
    </MacSheet>
  );
}
