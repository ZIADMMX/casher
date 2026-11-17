import { useCallback, useEffect, useMemo, useState } from 'react';
import { isBridgeAvailable } from '../api/bridge.js';
import * as workshopApi from '../api/enterprise.js';
import Toast from '../components/ui/Toast.jsx';
import LineIcon from '../components/icons/LineIcons.jsx';
import VehiclePlate from '../components/workshop/VehiclePlate.jsx';
import '../styles/workshop.css';
import '../styles/vehicles.css';
import '../styles/maintenanceReminders.css';

const FILTERS = [
  ['all', 'الكل'],
  ['due', 'مستحقة'],
  ['sent', 'أُرسلت'],
  ['booked', 'محجوزة'],
];

const VARS = ['date', 'service', 'plate', 'customer'];

const fmt = (n) => (Number(n) || 0).toLocaleString('ar-EG');

function fillPreview(template, { customer, plate, service, date }) {
  return String(template || '').replace(/\{(\w+)\}/g, (_, k) => {
    if (k === 'customer') return customer;
    if (k === 'plate') return plate;
    if (k === 'service') return service;
    if (k === 'date') return date;
    return '';
  });
}

function longDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(`${iso}T00:00:00`).toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch { return iso; }
}

export default function MaintenanceRemindersPage() {
  const bridge = isBridgeAvailable();
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);
  const [draftTemplate, setDraftTemplate] = useState('');
  const [editingRules, setEditingRules] = useState(null);

  const load = useCallback(async () => {
    if (!bridge) return;
    setBusy(true); setError('');
    try {
      const d = await workshopApi.getMaintenanceDashboard({ filter });
      setData(d);
      if (editingRules === null) setDraftTemplate(d.template || '');
    } catch (err) { setError(err?.message || 'تعذر تحميل التذكيرات'); }
    finally { setBusy(false); }
  }, [bridge, filter, editingRules]);

  useEffect(() => { load(); }, [load]);

  const items = data?.items || [];
  const rules = (editingRules ?? data?.rules) || [];
  const template = data?.template || '';

  const visibleItems = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.trim();
    return items.filter((it) => (
      it.plate?.includes(q) || it.customer_name?.includes(q) || it.kind?.includes(q) || it.customer_phone?.includes(q)
    ));
  }, [items, query]);

  const toggleSelect = (key) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };
  const selectAll = () => {
    const selectable = visibleItems.filter((it) => it.status === 'due' || it.status === 'sent').map((it) => it.key);
    setSelected((prev) => prev.size >= selectable.length ? new Set() : new Set(selectable));
  };

  async function sendOne(key) {
    try {
      const res = await workshopApi.sendMaintenanceReminder(key);
      if (res?.url) window.open(res.url, '_blank', 'noopener');
      setToast({ kind: 'success', text: 'تم فتح واتساب — أرسل الرسالة لتأكيد التذكير.' });
      load();
    } catch (err) { setToast({ kind: 'danger', text: err?.message || 'تعذر الإرسال' }); }
  }

  async function sendBulk() {
    const keys = [...selected];
    if (!keys.length) return;
    try {
      const results = await workshopApi.sendMaintenanceReminders(keys);
      const ok = results.filter((r) => r.ok);
      for (const r of ok) if (r.url) window.open(r.url, '_blank', 'noopener');
      const failed = results.length - ok.length;
      setToast({ kind: failed ? 'danger' : 'success', text: failed ? `فتح ${ok.length} وفشل ${failed}` : `جاري إرسال ${ok.length} تذكير` });
      setSelected(new Set());
      load();
    } catch (err) { setToast({ kind: 'danger', text: err?.message || 'تعذر الإرسال' }); }
  }

  async function bookNext(item) {
    const date = window.prompt('تاريخ الحجز (YYYY-MM-DD):', new Date().toISOString().slice(0, 10));
    if (!date) return;
    try {
      await workshopApi.bookMaintenanceReminder(item.key, date);
      setToast({ kind: 'success', text: `تم تسجيل الحجز يوم ${longDate(date)}` });
      load();
    } catch (err) { setToast({ kind: 'danger', text: err?.message || 'تعذر الحجز' }); }
  }

  function startEditRules() { setEditingRules(JSON.parse(JSON.stringify(data?.rules || []))); }
  function cancelEditRules() { setEditingRules(null); }
  async function saveRules() {
    try {
      await workshopApi.saveMaintenanceRules(editingRules);
      setEditingRules(null);
      setToast({ kind: 'success', text: 'تم حفظ قواعد التذكير' });
      load();
    } catch (err) { setToast({ kind: 'danger', text: err?.message || 'تعذر الحفظ' }); }
  }
  async function toggleRule(id, active) {
    if (editingRules) {
      setEditingRules(editingRules.map((r) => (r.id === id ? { ...r, active } : r)));
      return;
    }
    try { await workshopApi.setMaintenanceRuleActive(id, active); load(); }
    catch (err) { setToast({ kind: 'danger', text: err?.message || 'تعذر التعديل' }); }
  }
  function updateRuleField(id, field, value) {
    setEditingRules(editingRules.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  }
  function addRule() {
    const nextId = (editingRules.reduce((m, r) => Math.max(m, r.id || 0), 0) || 0) + 1;
    setEditingRules([...editingRules, { id: nextId, kind: '', interval_km: 5000, interval_months: 6, active: true }]);
  }
  function removeRule(id) { setEditingRules(editingRules.filter((r) => r.id !== id)); }

  async function saveTemplate() {
    try {
      await workshopApi.saveMaintenanceTemplate(draftTemplate);
      setToast({ kind: 'success', text: 'تم حفظ قالب الرسالة' });
      load();
    } catch (err) { setToast({ kind: 'danger', text: err?.message || 'تعذر الحفظ' }); }
  }

  const insertVar = (name) => setDraftTemplate((t) => `${t}{${name}}`);

  const stats = data?.stats || { due_today: 0, due_week: 0, sent_month: 0, booked_month: 0, counts_by_status: { due: 0, sent: 0, booked: 0 } };
  const preview = useMemo(() => fillPreview(draftTemplate || template, {
    customer: items[0]?.customer_name || 'أحمد محمود',
    plate: items[0]?.plate || 'ق ن ر ٣٤٨١',
    service: items[0]?.kind || 'تغيير زيت وفلتر',
    date: longDate(items[0]?.due_date) || longDate(new Date().toISOString().slice(0, 10)),
  }), [draftTemplate, template, items]);

  return (
    <section className="wk mr-page">
      <header className="mr-header wk-card">
        <div>
          <h1>تذكيرات الصيانة</h1>
          <p>{new Date().toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} — تُحدَّث القائمة تلقائيًا من عدّاد المركبات وسجل الصيانة</p>
        </div>
        <button type="button" className="wk-btn" onClick={load} disabled={busy}>
          <LineIcon name="refresh" size={16} /> تحديث القائمة
        </button>
      </header>

      <div className="mr-stats">
        <StatCard title="مستحقة اليوم" value={fmt(stats.due_today)} hint={stats.counts_by_status.due ? `منها ${fmt(stats.counts_by_status.due)} متأخرة` : '—'} tone="bad" icon="clock" />
        <StatCard title="مستحقة هذا الأسبوع" value={fmt(stats.due_week)} hint="قبل نهاية الجمعة" tone="warn" icon="calendar" />
        <StatCard title="أُرسلت هذا الشهر" value={fmt(stats.sent_month)} hint="عبر واتساب" tone="blue" icon="send" />
        <StatCard title="تحوّلت إلى حجز" value={fmt(stats.booked_month)} hint={stats.sent_month ? `نسبة الاستجابة ${Math.round((stats.booked_month / stats.sent_month) * 100)}%` : '—'} tone="ok" icon="check" />
      </div>

      <div className="mr-body">
        <section className="wk-card mr-list">
          <header className="mr-list__head">
            <div className="mr-tabs">
              <strong>المستحقّة والقادمة</strong>
              {FILTERS.map(([key, label]) => {
                const count = key === 'all' ? items.length : stats.counts_by_status[key] || 0;
                return (
                  <button key={key} type="button"
                    className={`wk-btn wk-btn--sm${filter === key ? ' is-primary' : ''}`}
                    onClick={() => setFilter(key)}>
                    {label} <span className="mr-tab__count">{fmt(count)}</span>
                  </button>
                );
              })}
            </div>
            <div className="mr-list__search">
              <LineIcon name="search" size={14} />
              <input type="search" placeholder="لوحة أو عميل أو خدمة" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
          </header>

          {selected.size > 0 && (
            <div className="mr-bulk">
              <span>تم تحديد {fmt(selected.size)}</span>
              <button type="button" className="wk-btn wk-btn--sm" onClick={() => setSelected(new Set())}>إلغاء التحديد</button>
              <button type="button" className="wk-btn wk-btn--sm is-primary" onClick={sendBulk}>
                <LineIcon name="send" size={14} /> إرسال للمحدد ({fmt(selected.size)})
              </button>
            </div>
          )}

          {error && <p className="wk-error">{error}</p>}

          <div className="mr-table" role="table">
            <div className="mr-row mr-row--head" role="row">
              <span><button type="button" className="mr-check" onClick={selectAll} aria-label="تحديد الكل">{selected.size > 0 ? '−' : ''}</button></span>
              <span>اللوحة</span>
              <span>العميل</span>
              <span>الخدمة المستحقة</span>
              <span>السبب</span>
              <span>الحالة</span>
              <span />
            </div>
            {!visibleItems.length && !busy && (
              <p className="wk-empty">
                {items.length === 0 ? 'لا توجد سيارات مستحقّة للصيانة حسب القواعد الحالية.' : 'لا نتائج مطابقة.'}
              </p>
            )}
            {visibleItems.map((item) => (
              <ReminderRow key={item.key} item={item}
                checked={selected.has(item.key)}
                onToggle={() => toggleSelect(item.key)}
                onSend={() => sendOne(item.key)}
                onBook={() => bookNext(item)} />
            ))}
          </div>
          {data && (
            <footer className="mr-list__foot">عرض {fmt(visibleItems.length)} من {fmt(items.length)} تذكير</footer>
          )}
        </section>

        <aside className="wk-card mr-rules">
          <header className="mr-rules__head">
            <div>
              <strong>القواعد</strong>
              <p>يُنشأ التذكير عند بلوغ أول الحدّين: المسافة أو المدة.</p>
            </div>
            {editingRules ? (
              <div className="mr-rules__actions">
                <button type="button" className="wk-btn wk-btn--sm" onClick={cancelEditRules}>إلغاء</button>
                <button type="button" className="wk-btn wk-btn--sm is-primary" onClick={saveRules}>حفظ</button>
              </div>
            ) : (
              <button type="button" className="wk-btn wk-btn--sm" onClick={startEditRules}>
                <LineIcon name="edit" size={14} /> تعديل
              </button>
            )}
          </header>
          <ul className="mr-rule-list">
            {rules.map((rule) => (
              <li key={rule.id} className="mr-rule">
                <label className="mr-switch">
                  <input type="checkbox" checked={!!rule.active} onChange={(e) => toggleRule(rule.id, e.target.checked)} />
                  <span />
                </label>
                <div className="mr-rule__body">
                  {editingRules ? (
                    <>
                      <input type="text" value={rule.kind} placeholder="اسم الصيانة"
                        onChange={(e) => updateRuleField(rule.id, 'kind', e.target.value)} />
                      <div className="mr-rule__fields">
                        <label>كل <input type="number" min="0" step="500" value={rule.interval_km ?? ''}
                          onChange={(e) => updateRuleField(rule.id, 'interval_km', e.target.value ? Number(e.target.value) : null)} /> كم</label>
                        <label>أو <input type="number" min="0" step="1" value={rule.interval_months ?? ''}
                          onChange={(e) => updateRuleField(rule.id, 'interval_months', e.target.value ? Number(e.target.value) : null)} /> شهر</label>
                      </div>
                    </>
                  ) : (
                    <>
                      <strong>{rule.kind}</strong>
                      <span>
                        {rule.interval_km ? `كل ${fmt(rule.interval_km)} كم` : ''}
                        {rule.interval_km && rule.interval_months ? ' أو ' : ''}
                        {rule.interval_months ? `${fmt(rule.interval_months)} شهرًا` : ''}
                      </span>
                    </>
                  )}
                </div>
                {editingRules && (
                  <button type="button" className="wk-iconbtn" title="حذف" onClick={() => removeRule(rule.id)}>
                    <LineIcon name="trash" size={14} />
                  </button>
                )}
              </li>
            ))}
          </ul>
          {editingRules && (
            <button type="button" className="wk-btn wk-btn--sm" onClick={addRule}>
              + إضافة قاعدة
            </button>
          )}
        </aside>
      </div>

      <section className="wk-card mr-template">
        <header className="mr-template__head">
          <div>
            <strong>قالب رسالة واتساب</strong>
            <p>تُرسل هذه الرسالة لكل تذكير. المتغيرات تُستبدل ببيانات العميل تلقائيًا.</p>
          </div>
        </header>
        <div className="mr-template__body">
          <div className="mr-template__edit">
            <div className="mr-chips">
              <span>أدرج متغيّرًا:</span>
              {VARS.map((v) => (
                <button key={v} type="button" className="wk-btn wk-btn--sm" onClick={() => insertVar(v)}>{`{${v}}`}</button>
              ))}
            </div>
            <label className="mr-field">
              <span>نص الرسالة</span>
              <textarea rows="6" maxLength="1024" value={draftTemplate} onChange={(e) => setDraftTemplate(e.target.value)} />
              <small>{fmt(draftTemplate.length)} من 1,024 حرف، وهو الحد المسموح لرسالة واتساب الواحدة.</small>
            </label>
            <div className="mr-template__save">
              <button type="button" className="wk-btn" disabled={draftTemplate === template} onClick={() => setDraftTemplate(template)}>تراجع</button>
              <button type="button" className="wk-btn is-primary" disabled={draftTemplate === template || !draftTemplate.trim()} onClick={saveTemplate}>
                <LineIcon name="check" size={14} /> حفظ القالب
              </button>
            </div>
          </div>
          <aside className="mr-preview">
            <strong>معاينة مباشرة</strong>
            <div className="mr-phone">
              <div className="mr-phone__head">ورشة الفاروق</div>
              <div className="mr-phone__bubble">{preview}</div>
              <div className="mr-phone__time">9:00 ص</div>
            </div>
          </aside>
        </div>
      </section>

      {toast && <Toast message={toast.text} type={toast.kind} onClose={() => setToast(null)} />}
    </section>
  );
}

function StatCard({ title, value, hint, tone, icon }) {
  return (
    <article className={`wk-card mr-stat is-${tone}`}>
      <div className="mr-stat__body">
        <span className="mr-stat__title">{title}</span>
        <strong className="mr-stat__value">{value}</strong>
        <span className="mr-stat__hint">{hint}</span>
      </div>
      <span className="mr-stat__icon"><LineIcon name={icon} size={18} /></span>
    </article>
  );
}

function ReminderRow({ item, checked, onToggle, onSend, onBook }) {
  const tone = item.status === 'booked' ? 'ok' : item.status === 'sent' ? 'blue' : 'bad';
  const label = item.status === 'booked' ? 'محجوزة' : item.status === 'sent' ? 'أُرسلت' : 'مستحقة';
  return (
    <div className="mr-row" role="row">
      <span>
        <label className="mr-check">
          <input type="checkbox" checked={checked} onChange={onToggle} aria-label={`تحديد ${item.plate}`} />
        </label>
      </span>
      <span><VehiclePlate plate={item.plate} city={item.plate_city} kind={item.plate_kind} /></span>
      <span className="mr-cell-customer">
        <strong>{item.customer_name || '—'}</strong>
        <small>{[item.make, item.model, item.year].filter(Boolean).join(' ')}</small>
        <small>{item.customer_phone || '—'}</small>
      </span>
      <span>{item.kind}</span>
      <span className={`mr-reason ${item.status === 'due' ? 'is-over' : ''}`}>{item.reason}</span>
      <span><em className={`wk-pill is-${tone}`}>{label}</em></span>
      <span className="mr-actions">
        {item.status === 'booked' ? (
          <span className="wk-pill is-ok">
            <LineIcon name="check" size={12} /> حجز {longDate(item.booked_for)}
          </span>
        ) : item.status === 'sent' ? (
          <>
            <button type="button" className="wk-btn wk-btn--sm" onClick={onSend}>
              <LineIcon name="refresh" size={14} /> إعادة الإرسال
            </button>
            <button type="button" className="wk-btn wk-btn--sm is-primary" onClick={onBook}>تسجيل حجز</button>
          </>
        ) : (
          <button type="button" className="wk-btn wk-btn--sm is-primary" onClick={onSend}>
            <LineIcon name="send" size={14} /> إرسال واتساب
          </button>
        )}
      </span>
    </div>
  );
}
