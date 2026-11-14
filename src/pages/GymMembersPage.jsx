import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { isBridgeAvailable } from '../api/bridge.js';
import * as customersApi from '../api/customers.js';
import * as importExportApi from '../api/importExport.js';
import * as subscriptionsApi from '../api/subscriptions.js';
import ImportExcelModal from '../components/ImportExcelModal.jsx';
import Toast from '../components/ui/Toast.jsx';
import LineIcon from '../components/icons/LineIcons.jsx';
import Kpi from '../components/gym/GymKpi.jsx';
import { AddMemberSheet, PaySheet } from '../components/gym/GymMembersSheets.jsx';
import GymMemberProfile from '../components/gym/GymMemberProfile.jsx';
import { openWhatsapp } from '../utils/whatsapp.js';
import { FILTERS, STATUS, buildMembers, filterMembers, summarize } from '../utils/gymMembers.js';
import '../styles/gymCheckout.css';
import '../styles/gymMembers.css';
import '../styles/gymMembersPage.css';

const PAGE = 100;
const money = (v) => (Number(v) || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
const shortDate = (v) => (v ? new Date(String(v).replace(' ', 'T')).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
// Visits and "never visited" are non-critical: a failure there must not blank the directory.
const soft = (call) => (call.isAvailable && !call.isAvailable() ? Promise.resolve([]) : Promise.resolve(call()).catch(() => []));

const COLUMNS = ['الاسم', 'الكود', 'الهاتف', 'الباقة', 'الحالة', 'ينتهي في', 'آخر زيارة', 'زيارات الشهر', 'المدرب', 'مستحق', 'الإجراءات'];

/** A macOS-style popover menu anchored to its button (fixed, so the table never clips it). */
function RowMenu({ member, onCopy }) {
  const [at, setAt] = useState(null);
  const button = useRef(null);
  const close = useCallback(() => setAt(null), []);

  useEffect(() => {
    if (!at) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [at, close]);

  function toggle() {
    if (at) { close(); return; }
    const r = button.current.getBoundingClientRect();
    const height = 188;
    setAt({ top: r.bottom + height > window.innerHeight ? r.top - height - 6 : r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - 232)) });
  }
  const pick = (fn) => () => { close(); fn(); };
  const noPhone = !member.phone;

  return (
    <>
      <button ref={button} type="button" className="gms-iconbtn" aria-label={`المزيد لـ ${member.name}`} aria-haspopup="menu" aria-expanded={Boolean(at)} onClick={toggle}>
        <LineIcon name="dots" size={18} />
      </button>
      {at && createPortal(
        <>
          <div className="gmp-scrim" onClick={close} />
          <div className="gmp-menu" role="menu" style={{ top: at.top, left: at.left }}>
            <a role="menuitem" className={noPhone ? 'is-off' : ''} href={noPhone ? undefined : `tel:${member.phone}`} onClick={close}><LineIcon name="phone" size={16} /> اتصال</a>
            <button type="button" role="menuitem" disabled={noPhone} onClick={pick(() => openWhatsapp(member.phone))}><LineIcon name="message" size={16} /> واتساب</button>
            <hr />
            <button type="button" role="menuitem" disabled={noPhone} onClick={pick(() => onCopy(member.phone, 'رقم الهاتف'))}><LineIcon name="file" size={16} /> نسخ رقم الهاتف</button>
            <button type="button" role="menuitem" onClick={pick(() => onCopy(member.code, 'كود العضو'))}><LineIcon name="idCard" size={16} /> نسخ كود العضو</button>
          </div>
        </>,
        document.body,
      )}
    </>
  );
}

/**
 * The gym's members directory: everyone registered (with or without a subscription), their
 * subscription state, visits and balance. Renewing and opening a member's file hand over to
 * the subscriptions hub (GymCheckoutPage), which owns freeze / upgrade / transfer / collection.
 */
export default function GymMembersPage({ onNavigate }) {
  const [data, setData] = useState({ customers: [], subscriptions: [], visits: [], profiles: [] });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [shown, setShown] = useState(PAGE);
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [payFor, setPayFor] = useState(null);
  const [profileId, setProfileId] = useState(null);
  const [toast, setToast] = useState(null);

  const load = useCallback(async () => {
    if (!isBridgeAvailable()) { setLoading(false); return; }
    setLoading(true);
    setLoadError('');
    try {
      const [customers, subscriptions, visits, profiles] = await Promise.all([
        customersApi.getAllCustomersWithStats(),
        subscriptionsApi.getAllSubscriptions({ limit: 10000 }), // the default page size (100) would hide older members
        soft(subscriptionsApi.getGymVisitSummary),
        soft(subscriptionsApi.getGymMemberProfiles),
      ]);
      setData({ customers: customers || [], subscriptions: subscriptions || [], visits: visits || [], profiles: profiles || [] });
    } catch (err) {
      setLoadError(err.message || 'تعذر تحميل الأعضاء');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const members = useMemo(() => buildMembers(data), [data]);
  const summary = useMemo(() => summarize(members), [members]);
  const selected = useMemo(() => members.find((m) => m.id === profileId) || null, [members, profileId]);
  const visible = useMemo(() => filterMembers(members, filter, query), [members, filter, query]);
  const counts = { all: summary.total, active: summary.active, expiring: summary.expiring, frozen: summary.frozen, expired: members.filter((m) => m.status === 'expired').length, none: summary.none };

  const notify = (message, type = 'success') => setToast({ id: Date.now(), type, message });
  const open = (action, m, extra = {}) => onNavigate('gym-checkout', { gymIntent: { action, customerId: m.id, ...extra } });

  async function copy(text, what) {
    try {
      await navigator.clipboard.writeText(text);
      notify(`تم نسخ ${what}`);
    } catch {
      notify('تعذر النسخ', 'danger');
    }
  }

  async function exportExcel() {
    try {
      const result = await importExportApi.exportCustomers();
      if (!result.canceled) notify('تم تصدير ملف إكسيل بنجاح');
    } catch (err) {
      notify(err.message || 'تعذر تصدير بيانات الأعضاء', 'danger');
    }
  }

  return (
    <div className="gco gmp" dir="rtl">
      {toast && <Toast key={toast.id} message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {selected ? (
        <div className="gmp-body">
          <GymMemberProfile
            member={selected}
            customer={data.customers.find((c) => c.id === selected.id)}
            subs={data.subscriptions.filter((s) => s.customer_id === selected.id)}
            onBack={() => setProfileId(null)}
            onRenew={(m) => open('renew', m, { subscriptionId: m.sub.id })}
            onOpenFile={(m) => open('open', m)}
            onSubscribe={(m) => open('activate', m)}
            onPay={setPayFor}
            onCopy={copy}
          />
        </div>
      ) : (<>
      <header className="gco-card gco-head">
        <div className="gco-head__title">
          <span className="gco-tile is-dark"><LineIcon name="users" size={30} /></span>
          <div>
            <h1>الأعضاء</h1>
            <p>تسجيل ومتابعة أعضاء النادي واشتراكاتهم</p>
          </div>
        </div>
        <div className="gco-head__actions">
          <button type="button" className="gco-btn" onClick={() => setImportOpen(true)}><LineIcon name="upload" size={18} /> استيراد من Excel</button>
          <button type="button" className="gco-btn" onClick={exportExcel}><LineIcon name="download" size={18} /> تصدير (Excel)</button>
          <button type="button" className="gco-btn is-primary" onClick={() => setAddOpen(true)}><LineIcon name="userPlus" size={18} /> إضافة عضو جديد</button>
        </div>
      </header>

      {loadError && <div className="gco-notice is-bad" role="alert">{loadError} <button type="button" onClick={load}>إعادة المحاولة</button></div>}

      <div className="gmp-body">
      <section className="gmp-kpis" aria-label="مؤشرات الأعضاء">
        {[
          ['إجمالي الأعضاء', summary.total, 'كل المسجلين', 'brand'],
          ['نشطون', summary.active, 'اشتراك ساري', 'ok'],
          ['ينتهي هذا الأسبوع', summary.expiring, 'أقل من 7 أيام', 'warn'],
          ['مجمدون', summary.frozen, 'اشتراك موقوف', 'ice'],
          ['بدون اشتراك', summary.none, 'مسجلون فقط', 'mute'],
          ['أعضاء جدد', summary.fresh, 'هذا الشهر', 'brand'],
        ].map(([label, value, hint, tone]) => (
          <Kpi key={label} label={label} value={value} hint={hint} tone={tone} ratio={summary.total ? value / summary.total : 0} />
        ))}
      </section>

      <section className="gms-card gmp-panel" aria-label="دليل الأعضاء">
        <div className="gmp-tools">
          <label className="gms-search">
            <LineIcon name="search" size={18} />
            <input type="search" placeholder="ابحث بالاسم أو الهاتف أو كود العضو..." aria-label="بحث عن عضو" value={query} onChange={(e) => { setQuery(e.target.value); setShown(PAGE); }} />
          </label>
          <div className="gms-chips" role="group" aria-label="تصفية الأعضاء">
            {FILTERS.map((f) => (
              <button key={f.key} type="button" className={filter === f.key ? 'is-on' : ''} aria-pressed={filter === f.key} onClick={() => { setFilter(f.key); setShown(PAGE); }}>
                {f.label} <small>{counts[f.key]}</small>
              </button>
            ))}
          </div>
        </div>

        <div className="gmp-table" role="table" aria-label="جدول الأعضاء">
          <div className="gmp-row is-head" role="row">
            {COLUMNS.map((c) => <span key={c} role="columnheader">{c}</span>)}
          </div>

          {loading && <p className="gms-empty">جاري التحميل...</p>}
          {!loading && visible.length === 0 && (
            <p className="gms-empty">{members.length === 0 ? 'لا يوجد أعضاء مسجلون بعد. استخدم «إضافة عضو جديد» لتسجيل أول عضو.' : 'لا توجد نتائج مطابقة'}</p>
          )}

          {visible.slice(0, shown).map((m) => {
            const st = STATUS[m.status];
            return (
              <div key={m.id} className="gmp-row" role="row">
                <span role="cell" data-label="الاسم" className="gmp-who">
                  <span className="gms-avatar" aria-hidden="true">{(m.name || '؟').trim().charAt(0).toUpperCase()}</span>
                  <button type="button" className="gmp-name" onClick={() => setProfileId(m.id)} aria-label={`فتح بروفايل ${m.name}`}>{m.name}</button>
                </span>
                <span role="cell" data-label="الكود" className="gmp-code" dir="ltr">{m.code}</span>
                <span role="cell" data-label="الهاتف" dir="ltr" className="gmp-phone">{m.phone || '—'}</span>
                <span role="cell" data-label="الباقة">{m.packageName || '—'}</span>
                <span role="cell" data-label="الحالة"><i className={`gms-pill is-${st.tone}`}>{st.label}</i></span>
                <span role="cell" data-label="ينتهي في" className={`gmp-end${m.expiring ? ' is-warn' : ''}`}>
                  {m.endDate ? <><b>{shortDate(m.endDate)}</b>{m.daysLeft !== null && <small>{m.daysLeft} يوم متبقي</small>}</> : '—'}
                </span>
                <span role="cell" data-label="آخر زيارة">{shortDate(m.lastVisit)}</span>
                <span role="cell" data-label="زيارات الشهر" className="gmp-num">{m.visitsMonth}</span>
                <span role="cell" data-label="المدرب">{m.trainer || '—'}</span>
                <span role="cell" data-label="مستحق" className="gmp-due">
                  {m.debt > 0 ? (
                    <>
                      <i className="gms-pill is-bad">{money(m.debt)} ج.م</i>
                      <button type="button" className="gmp-pay" onClick={() => setPayFor(m)} aria-label={`سداد مستحق ${m.name}`}>سداد</button>
                    </>
                  ) : '—'}
                </span>
                <span role="cell" data-label="الإجراءات" className="gmp-actions">
                  {m.sub ? (
                    <>
                      <button type="button" className="gms-btn is-primary gmp-btn" onClick={() => open('renew', m, { subscriptionId: m.sub.id })} aria-label={`تجديد اشتراك ${m.name}`}><LineIcon name="refresh" size={16} /> تجديد</button>
                      <button type="button" className="gms-iconbtn" title="فتح ملف العضو" aria-label={`فتح ملف ${m.name}`} onClick={() => open('open', m)}><LineIcon name="idCard" size={18} /></button>
                    </>
                  ) : (
                    <button type="button" className="gms-btn is-primary gmp-btn" onClick={() => open('activate', m)} aria-label={`اشتراك جديد لـ ${m.name}`}><LineIcon name="bolt" size={16} /> اشتراك الآن</button>
                  )}
                  <RowMenu member={m} onCopy={copy} />
                </span>
              </div>
            );
          })}
        </div>

        {visible.length > shown && (
          <div className="gmp-more"><button type="button" className="gms-btn" onClick={() => setShown((n) => n + PAGE)}>عرض المزيد ({visible.length - shown})</button></div>
        )}
      </section>
      </div>

      </>)}

      {addOpen && (
        <AddMemberSheet
          onClose={() => setAddOpen(false)}
          onCreated={load}
          onSubscribe={(id) => { setAddOpen(false); onNavigate('gym-checkout', { gymIntent: { action: 'activate', customerId: id } }); }}
        />
      )}
      {payFor && <PaySheet member={payFor} onClose={() => setPayFor(null)} onDone={(message) => { setPayFor(null); notify(message); load(); }} />}
      <ImportExcelModal isOpen={importOpen} onClose={() => setImportOpen(false)} type="customers" onSuccess={load} />
    </div>
  );
}
