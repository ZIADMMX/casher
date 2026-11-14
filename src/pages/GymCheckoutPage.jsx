import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isBridgeAvailable } from '../api/bridge.js';
import * as customersApi from '../api/customers.js';
import * as inventoryApi from '../api/inventory.js';
import * as productsApi from '../api/products.js';
import * as subscriptionsApi from '../api/subscriptions.js';
import LineIcon from '../components/icons/LineIcons.jsx';
import SubscriptionCheckout from '../components/gym/SubscriptionCheckout.jsx';
import GymSubscriptionsPanel from '../components/gym/GymSubscriptionsPanel.jsx';
import GymPackagesPanel from '../components/gym/GymPackagesPanel.jsx';
import '../styles/gymCheckout.css';

const MODES = [
  { key: 'new', label: 'اشتراك جديد', hint: 'عضو يشترك في باقة' },
  { key: 'renew', label: 'تجديد اشتراك', hint: 'نفس الباقة ونفس المدة' },
];
const STATUS = { active: 'نشط', frozen: 'مجمد', expired: 'منتهي', depleted: 'نفد الرصيد' };
const money = (v) => (Number(v) || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
const day = (v) => (v ? new Date(v).toLocaleDateString('ar-EG') : '—');
const optional = (isAvailable, call) => (isAvailable ? call() : []);

/**
 * The gym's subscriptions hub: members' subscriptions (freeze, deduct a session), the package
 * catalog, and the activation / renewal flow that ends in the collection screen.
 */
export default function GymCheckoutPage() {
  const [tab, setTab] = useState('subs');
  const [mode, setMode] = useState('new');
  const [customers, setCustomers] = useState([]);
  const [allPackages, setAllPackages] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [stats, setStats] = useState(null);
  const [products, setProducts] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [customerId, setCustomerId] = useState(null);
  const [packageId, setPackageId] = useState(null);
  const [subId, setSubId] = useState(null);
  const [done, setDone] = useState('');
  const [freeError, setFreeError] = useState('');
  const [addPackageRequest, setAddPackageRequest] = useState(0);
  const [newCustomer, setNewCustomer] = useState(null); // null = closed, { name, phone } = form
  const searchRef = useRef(null);

  const load = useCallback(async () => {
    if (!isBridgeAvailable()) { setLoading(false); return; }
    setLoading(true);
    setLoadError('');
    try {
      const [custs, pkgs, subs, subStats, prods, brs] = await Promise.all([
        optional(customersApi.getAllCustomersWithStats.isAvailable(), customersApi.getAllCustomersWithStats),
        subscriptionsApi.getAllPackages(),
        subscriptionsApi.getAllSubscriptions(),
        subscriptionsApi.getSubscriptionStats(),
        optional(productsApi.getAllProductsWithVariants.isAvailable(), productsApi.getAllProductsWithVariants),
        optional(inventoryApi.getInventoryBranches.isAvailable(), inventoryApi.getInventoryBranches),
      ]);
      setCustomers(custs || []);
      setAllPackages(pkgs || []);
      setSubscriptions(subs || []);
      setStats(subStats || null);
      setProducts(prods || []);
      setBranches(brs || []);
    } catch (err) {
      setLoadError(err.message || 'تعذر تحميل البيانات');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const packages = useMemo(() => allPackages.filter((p) => p.is_active !== 0), [allPackages]);
  const memberSubs = useMemo(() => subscriptions.filter((s) => s.customer_id === customerId), [subscriptions, customerId]);
  const pkg = packages.find((p) => p.id === packageId) || null;
  const sub = memberSubs.find((s) => s.id === subId) || null;
  // Renewing from the subscriptions list may start from a member the customers list did not return.
  const customer = useMemo(() => customers.find((c) => c.id === customerId)
    || (memberSubs[0] ? { id: customerId, name: memberSubs[0].customer_name, phone: memberSubs[0].customer_phone } : null),
  [customers, customerId, memberSubs]);

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? customers.filter((c) => (c.name || '').toLowerCase().includes(q) || (c.phone || '').includes(q))
      : customers;
    return list.slice(0, 8);
  }, [customers, search]);

  // "/" jumps to the member search while choosing a member, like the search hint says.
  useEffect(() => {
    if (tab !== 'collect' || customer) return undefined;
    const onKey = (e) => {
      const typing = /^(input|textarea|select)$/i.test(e.target?.tagName || '');
      if (e.key === '/' && !typing) { e.preventDefault(); searchRef.current?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tab, customer]);

  function reset(message = '') {
    setCustomerId(null); setPackageId(null); setSubId(null); setSearch(''); setFreeError(''); setNewCustomer(null); setDone(message);
  }
  function changeMode(next) {
    setMode(next); setPackageId(null); setSubId(null); setFreeError(''); setDone('');
  }
  function pickCustomer(id) {
    setCustomerId(id); setPackageId(null); setSubId(null); setFreeError(''); setDone(''); setNewCustomer(null);
  }
  function showError(message) { setDone(''); setError(message); }
  function changeTab(next) { setTab(next); setError(''); setDone(''); }

  function startActivation() {
    reset();
    setMode('new');
    changeTab('collect');
  }
  function startPackage() {
    changeTab('packages');
    setAddPackageRequest((n) => n + 1);
  }
  // "تجديد" in the subscriptions list jumps to collection with that subscription preselected.
  function startRenewal(s) {
    setError(''); setDone(''); setFreeError('');
    setMode('renew'); setCustomerId(s.customer_id); setSubId(s.id); setPackageId(null); setSearch('');
    setTab('collect');
  }

  async function createCustomer(event) {
    event.preventDefault();
    const name = newCustomer.name.trim();
    if (!name) { setError('اسم العميل مطلوب'); return; }
    setError('');
    try {
      const created = await customersApi.addCustomer({ name, phone: newCustomer.phone.trim() || null });
      await load();
      pickCustomer(created.id);
    } catch (err) {
      setError(`تعذر إضافة العميل: ${err.message}`);
    }
  }

  // What is being bought, in the shape the checkout screen needs.
  const target = mode === 'new'
    ? (customer && pkg ? { name: pkg.name, price: pkg.price } : null)
    : (customer && sub ? { name: sub.package_name, price: sub.package_price } : null);
  const isFree = target && !(Number(target.price) > 0);

  async function collect(payments) {
    if (mode === 'new') {
      await subscriptionsApi.subscribeCustomer({ customer_id: customer.id, package_id: pkg.id, auto_renew: false, notes: '', payments });
    } else {
      await subscriptionsApi.renewSubscription(sub.id, { payments });
    }
    const label = mode === 'new' ? 'تم تفعيل' : 'تم تجديد';
    reset(`${label} ${target.name} للعضو ${customer.name} وتسجيل التحصيل على الوردية.`);
    load();
  }

  async function activateFree() {
    setFreeError('');
    try {
      if (mode === 'new') await subscriptionsApi.subscribeCustomer({ customer_id: customer.id, package_id: pkg.id, auto_renew: false, notes: '' });
      else await subscriptionsApi.renewSubscription(sub.id, {});
      reset(`تم ${mode === 'new' ? 'تفعيل' : 'تجديد'} ${target.name} للعضو ${customer.name} (بدون تحصيل).`);
      load();
    } catch (err) {
      setFreeError(err.message || 'تعذر إتمام العملية');
    }
  }

  const tabs = [
    { key: 'subs', label: `اشتراكات العملاء (${subscriptions.length})` },
    { key: 'packages', label: `دليل الباقات والأنواع (${allPackages.length})` },
    { key: 'collect', label: 'تفعيل وتحصيل' },
  ];

  return (
    <div className="gco" dir="rtl">
      <header className="gco-card gco-head">
        <div className="gco-head__title">
          <span className="gco-tile is-dark"><LineIcon name="shield" size={30} /></span>
          <div>
            <h1>إدارة الاشتراكات والباقات</h1>
            <p>اشتراكات الجلسات، العضويات الزمنية، وتجميد وتجديد باقات العملاء</p>
          </div>
        </div>
        <div className="gco-head__actions">
          <button type="button" className="gco-btn" onClick={startPackage}><LineIcon name="cardPlus" size={18} /> إضافة باقة جديدة</button>
          <button type="button" className="gco-btn is-primary" onClick={startActivation}><LineIcon name="bolt" size={18} /> اشتراك عميل جديد</button>
        </div>
      </header>

      <nav className="gco-tabs" aria-label="أقسام الصفحة">
        {tabs.map((t) => (
          <button key={t.key} type="button" className={tab === t.key ? 'is-on' : ''} aria-pressed={tab === t.key} onClick={() => changeTab(t.key)}>{t.label}</button>
        ))}
      </nav>

      {done && <div className="gco-notice is-ok" role="status"><LineIcon name="checkCircle" size={20} /> {done}</div>}
      {error && <div className="gco-notice is-bad" role="alert">{error}</div>}
      {loadError && <div className="gco-notice is-bad" role="alert">{loadError} <button type="button" onClick={load}>إعادة المحاولة</button></div>}

      {tab === 'subs' && (
        <GymSubscriptionsPanel
          subscriptions={subscriptions}
          stats={stats}
          loading={loading}
          onChanged={load}
          onRenew={startRenewal}
          onError={showError}
        />
      )}

      {tab === 'packages' && (
        <GymPackagesPanel
          packages={allPackages}
          loading={loading}
          products={products}
          branches={branches}
          onChanged={load}
          onError={showError}
          addRequest={addPackageRequest}
        />
      )}

      {tab === 'collect' && (
        <>
          <section className="gco-card gco-flow" aria-label="تفعيل اشتراك">
            <div className="gco-step"><span>١</span><div><h2>نوع العملية</h2><small>اشتراك جديد أو تجديد لاشتراك سابق</small></div></div>
            <div className="gco-seg" role="group" aria-label="نوع العملية">
              {MODES.map((m) => (
                <button key={m.key} type="button" className={mode === m.key ? 'is-on' : ''} aria-pressed={mode === m.key} onClick={() => changeMode(m.key)}>
                  <b>{m.label}</b><small>{m.hint}</small>
                </button>
              ))}
            </div>

            <div className="gco-step">
              <span>٢</span>
              <div><h2>اختر العضو</h2><small>ابحث بالاسم أو رقم التليفون</small></div>
              {!customer && <kbd className="gco-kbd">اضغط <b>/</b> للبحث السريع</kbd>}
            </div>
            {customer ? (
              <div className="gco-picked">
                <span className="gco-avatar" aria-hidden="true">{(customer.name || '؟').trim().charAt(0).toUpperCase()}</span>
                <div><b>{customer.name}</b><small><LineIcon name="phone" size={12} /> {customer.phone || 'بدون هاتف'}</small></div>
                <span className="gco-check" aria-hidden="true"><LineIcon name="check" size={16} strokeWidth={3} /></span>
                <button type="button" className="gco-btn gco-btn--sm" onClick={() => pickCustomer(null)}>تغيير العضو</button>
              </div>
            ) : (
              <>
                <div className="gco-searchrow">
                  <label className="gco-search">
                    <LineIcon name="search" size={18} />
                    <input
                      ref={searchRef}
                      placeholder="اكتب اسم العميل أو رقم تليفونه..."
                      aria-label="بحث عن عضو"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </label>
                  <button type="button" className="gco-btn gco-btn--ghost" onClick={() => setNewCustomer(newCustomer ? null : { name: search.trim(), phone: '' })}>
                    <LineIcon name="userPlus" size={18} /> عميل جديد
                  </button>
                </div>

                {newCustomer && (
                  <form className="gco-newcust" onSubmit={createCustomer}>
                    <input aria-label="اسم العميل الجديد" placeholder="اسم العميل" value={newCustomer.name} onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })} autoFocus />
                    <input aria-label="هاتف العميل الجديد" placeholder="رقم التليفون (اختياري)" inputMode="tel" dir="ltr" value={newCustomer.phone} onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })} />
                    <button type="submit" className="gco-btn is-primary gco-btn--sm"><LineIcon name="check" size={16} /> حفظ واختيار</button>
                  </form>
                )}

                {loading ? <p className="gco-state">جاري التحميل...</p> : matches.length === 0 ? (
                  <p className="gco-state">{customers.length === 0 ? 'لا يوجد أعضاء مسجلون بعد. استخدم «عميل جديد» لإضافة أول عضو.' : 'لا توجد نتائج مطابقة'}</p>
                ) : (
                  <ul className="gco-list">
                    {matches.map((c) => (
                      <li key={c.id}>
                        <button type="button" onClick={() => pickCustomer(c.id)}>
                          <span className="gco-avatar" aria-hidden="true">{(c.name || '؟').trim().charAt(0).toUpperCase()}</span>
                          <span><b>{c.name}</b><small>{c.phone || 'بدون هاتف'}</small></span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}

            {customer && (
              <>
                <div className="gco-step">
                  <span>٣</span>
                  <div><h2>{mode === 'new' ? 'اختر الباقة' : 'اختر الاشتراك المراد تجديده'}</h2><small>نقرة واحدة</small></div>
                </div>
                {mode === 'new' ? (
                  packages.length === 0 ? <p className="gco-state">لا توجد باقات متاحة. أضفها من تبويب «دليل الباقات والأنواع».</p> : (
                    <div className="gco-choices">
                      {packages.map((p) => {
                        const saving = p.original_price > p.price ? Math.round(((p.original_price - p.price) / p.original_price) * 100) : 0;
                        return (
                          <button key={p.id} type="button" className={packageId === p.id ? 'is-on' : ''} aria-pressed={packageId === p.id} onClick={() => { setPackageId(p.id); setFreeError(''); }}>
                            <strong>{money(p.price)}<small>ج.م</small></strong>
                            <b>{p.name}</b>
                            <span className="gco-pills">
                              <i>{p.duration_days} يوم</i>
                              {p.is_unlimited_sessions ? <i>جلسات غير محدودة</i> : p.total_credits ? <i>{p.total_credits} جلسة</i> : null}
                              {p.advance_booking_days > 0 && <i>حجز مسبق {p.advance_booking_days} يوم</i>}
                              {saving > 0 && <i className="is-save">وفّر {saving}%</i>}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )
                ) : memberSubs.length === 0 ? (
                  <p className="gco-state">لا توجد اشتراكات سابقة لهذا العضو. اختر «اشتراك جديد» بدل التجديد.</p>
                ) : (
                  <div className="gco-choices">
                    {memberSubs.map((s) => (
                      <button key={s.id} type="button" className={subId === s.id ? 'is-on' : ''} aria-pressed={subId === s.id} onClick={() => { setSubId(s.id); setFreeError(''); }}>
                        <strong>{money(s.package_price)}<small>ج.م</small></strong>
                        <b>{s.package_name}</b>
                        <span className="gco-pills"><i>{STATUS[s.status] || s.status}</i><i>ينتهي {day(s.end_date)}</i></span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>

          {target && !isFree && (
            <SubscriptionCheckout
              key={`${mode}-${customer.id}-${mode === 'new' ? pkg.id : sub.id}`}
              inline
              mode={mode}
              customerName={customer.name}
              customerPhone={customer.phone}
              packageName={target.name}
              price={target.price}
              onConfirm={collect}
              onClose={() => reset()}
            />
          )}

          {target && isFree && (
            <section className="gco-card gco-free" aria-label="باقة مجانية">
              <p>{target.name} بدون سعر، فلا يوجد تحصيل. يمكنك تفعيلها مباشرة.</p>
              {freeError && <p className="gco-notice is-bad" role="alert">{freeError}</p>}
              <button type="button" className="gco-btn is-primary" onClick={activateFree}>{mode === 'new' ? 'تفعيل الاشتراك' : 'تجديد الاشتراك'}</button>
            </section>
          )}
        </>
      )}
    </div>
  );
}
