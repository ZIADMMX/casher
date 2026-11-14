import { useEffect, useMemo, useState } from 'react';
import LineIcon from '../icons/LineIcons.jsx';
import SubscriptionCheckout from './SubscriptionCheckout.jsx';
import * as subscriptionsApi from '../../api/subscriptions.js';

const money = (v) => (Number(v) || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });

function Sheet({ title, subtitle, label, onClose, children }) {
  return (
    <div className="gco-overlay" onClick={onClose}>
      <div className="gms-sheet gms-sheet--wide" role="dialog" aria-modal="true" aria-label={label || title} onClick={(e) => e.stopPropagation()}>
        <header>
          <div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
          <button type="button" className="gms-iconbtn" onClick={onClose} aria-label="إغلاق"><LineIcon name="x" size={17} /></button>
        </header>
        {children}
      </div>
    </div>
  );
}

/** Upgrade a running subscription to a pricier package; the price is the new one minus what is left of the old one. */
export function UpgradeSheet({ sub, packages, onClose, onDone }) {
  const options = useMemo(() => packages.filter((p) => p.is_active !== 0 && p.id !== sub.package_id && Number(p.price) > Number(sub.package_price)), [packages, sub]);
  const [pkgId, setPkgId] = useState(null);
  const [quote, setQuote] = useState(null);
  const [error, setError] = useState('');
  const [paying, setPaying] = useState(false);
  const pkg = options.find((p) => p.id === pkgId) || null;

  useEffect(() => {
    setQuote(null);
    setError('');
    if (!pkgId) return undefined;
    let alive = true;
    Promise.resolve(subscriptionsApi.getUpgradeQuote(sub.id, pkgId))
      .then((q) => { if (alive) setQuote(q); })
      .catch((err) => { if (alive) setError(err.message || 'تعذر حساب سعر الترقية'); });
    return () => { alive = false; };
  }, [pkgId, sub.id]);

  async function finish(payments) {
    await subscriptionsApi.upgradeSubscription(sub.id, pkg.id, payments ? { payments } : {});
    onDone(`تمت ترقية ${sub.customer_name} إلى ${pkg.name}`);
  }
  async function finishFree() {
    setError('');
    try { await finish(null); } catch (err) { setError(err.message || 'تعذرت الترقية'); }
  }

  if (paying && quote && pkg) {
    return (
      <SubscriptionCheckout
        mode="upgrade"
        customerName={sub.customer_name}
        customerPhone={sub.customer_phone}
        packageName={pkg.name}
        price={quote.amount_due}
        onConfirm={finish}
        onClose={() => setPaying(false)}
      />
    );
  }

  return (
    <Sheet title="ترقية الباقة" subtitle={`${sub.customer_name} · الباقة الحالية ${sub.package_name}`} label="ترقية اشتراك" onClose={onClose}>
      {options.length === 0 ? <p className="gms-empty">لا توجد باقة أعلى سعرًا من الباقة الحالية.</p> : (
        <div className="gms-picks" role="group" aria-label="الباقات الأعلى">
          {options.map((p) => (
            <button key={p.id} type="button" className={p.id === pkgId ? 'is-on' : ''} aria-pressed={p.id === pkgId} onClick={() => setPkgId(p.id)}>
              <b>{p.name}</b><span>{money(p.price)} ج.م</span><small>{p.duration_days} يوم</small>
            </button>
          ))}
        </div>
      )}
      {error && <p className="gms-error" role="alert">{error}</p>}
      {quote && (
        <dl className="gms-quote" aria-label="تفاصيل سعر الترقية">
          <div><dt>سعر {pkg.name}</dt><dd>{money(quote.new_price)} ج.م</dd></div>
          <div><dt>رصيد الباقة الحالية المتبقي</dt><dd>− {money(quote.credit)} ج.م</dd></div>
          <div className="is-total"><dt>المطلوب دفعه</dt><dd>{money(quote.amount_due)} ج.م</dd></div>
        </dl>
      )}
      <p className="gms-sheet__rule">تبدأ الباقة الجديدة من اليوم، ويُنهى الاشتراك الحالي. رصيد الباقة الحالية = ما تبقى من مدتها (أو جلساتها) من سعرها.</p>
      <footer>
        <button type="button" className="gms-btn" onClick={onClose}>إلغاء</button>
        {quote && quote.amount_due > 0 && <button type="button" className="gms-btn is-primary" onClick={() => setPaying(true)}><LineIcon name="creditCard" size={16} /> متابعة للتحصيل</button>}
        {quote && quote.amount_due <= 0 && <button type="button" className="gms-btn is-primary" onClick={finishFree}>تأكيد الترقية (بدون تحصيل)</button>}
      </footer>
    </Sheet>
  );
}

/** Move a running subscription to another member who has no running one. */
export function TransferSheet({ sub, customers, busyIds, onClose, onDone }) {
  const [query, setQuery] = useState('');
  const [target, setTarget] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const q = query.trim().toLowerCase();
  const candidates = customers
    .filter((c) => c.id !== sub.customer_id && !busyIds.has(c.id) && (!q || (c.name || '').toLowerCase().includes(q) || (c.phone || '').includes(q)))
    .slice(0, 6);

  async function confirm() {
    setSaving(true);
    setError('');
    try {
      await subscriptionsApi.transferSubscription(sub.id, target.id);
      onDone(`تم نقل اشتراك ${sub.package_name} من ${sub.customer_name} إلى ${target.name}`);
    } catch (err) {
      setError(err.message || 'تعذر نقل الاشتراك');
      setSaving(false);
    }
  }

  return (
    <Sheet title="نقل الاشتراك" subtitle={`${sub.package_name} · الحالي باسم ${sub.customer_name}`} label="نقل اشتراك" onClose={onClose}>
      <label className="gms-search">
        <LineIcon name="search" size={17} />
        <input type="search" placeholder="ابحث عن العضو المنقول إليه" aria-label="بحث عن عضو للنقل" value={query} onChange={(e) => { setQuery(e.target.value); setTarget(null); }} autoFocus />
      </label>
      {candidates.length === 0 ? <p className="gms-empty">لا يوجد أعضاء متاحون للنقل (الأعضاء أصحاب الاشتراكات الفعّالة غير ظاهرين).</p> : (
        <ul className="gms-pickrows">
          {candidates.map((c) => (
            <li key={c.id}>
              <button type="button" className={target?.id === c.id ? 'is-on' : ''} aria-pressed={target?.id === c.id} onClick={() => setTarget(c)}>
                <span className="gms-avatar" aria-hidden="true">{(c.name || '؟').trim().charAt(0).toUpperCase()}</span>
                <b>{c.name}</b><small>{c.phone || 'بدون هاتف'}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="gms-error" role="alert">{error}</p>}
      <p className="gms-sheet__rule">يبقى تاريخ الانتهاء والرصيد كما هما، وينتقل الاشتراك بالكامل إلى العضو الجديد. تظل زيارات العضو الأول وفواتيره باسمه.</p>
      <footer>
        <button type="button" className="gms-btn" onClick={onClose}>إلغاء</button>
        <button type="button" className="gms-btn is-primary" disabled={!target || saving} onClick={confirm}>نقل الاشتراك</button>
      </footer>
    </Sheet>
  );
}

/** Emergency contact, health notes and the member's trainer. */
export function ProfileSheet({ member, profile, onClose, onSaved }) {
  const [form, setForm] = useState({
    emergency_name: profile?.emergency_name || '',
    emergency_phone: profile?.emergency_phone || '',
    health_notes: profile?.health_notes || '',
    trainer_id: profile?.trainer_id || '',
  });
  const [trainers, setTrainers] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  useEffect(() => {
    let alive = true;
    Promise.resolve(subscriptionsApi.getGymTrainers?.({})).then((list) => { if (alive) setTrainers((list || []).filter((t) => t.is_active !== 0)); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      onSaved(await subscriptionsApi.saveGymMemberProfile(member.id, { ...form, trainer_id: form.trainer_id ? Number(form.trainer_id) : null }));
    } catch (err) {
      setError(err.message || 'تعذر حفظ بيانات العضو');
      setSaving(false);
    }
  }

  return (
    <div className="gco-overlay" onClick={onClose}>
      <form className="gms-sheet gms-sheet--wide" role="dialog" aria-modal="true" aria-label="بيانات العضو" onClick={(e) => e.stopPropagation()} onSubmit={save}>
        <header>
          <div><h2>بيانات العضو</h2><p>{member.name}</p></div>
          <button type="button" className="gms-iconbtn" onClick={onClose} aria-label="إغلاق"><LineIcon name="x" size={17} /></button>
        </header>
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
          <button type="submit" className="gms-btn is-primary" disabled={saving}><LineIcon name="check" size={16} /> حفظ</button>
        </footer>
      </form>
    </div>
  );
}
