import { useMemo, useState } from 'react';
import { PlusIcon, SearchIcon, UserPlusIcon } from '../icons/PosIcons.jsx';
import { agoText, daysBetween, dueText, initials, num, parseDbDate } from './crmFormat.js';

export const LEAD_STATUSES = [
  ['new', 'جديد', 'muted'],
  ['contacted', 'تم التواصل', 'info'],
  ['qualified', 'مؤهل', 'success'],
  ['lost', 'مرفوض', 'danger'],
];
const CONVERTED = ['converted', 'تم التحويل', 'primary'];
const ACTIVITY_LABELS = { call: 'مكالمة', meeting: 'اجتماع', task: 'مهمة', email: 'بريد', note: 'ملاحظة' };

/**
 * Next open activity and follow-up state for each lead.
 * A lead still being worked (new / contacted) with no touch for more than `staleDays` is stale.
 */
export function describeLeads(leads, activities, staleDays, now = new Date()) {
  const byLead = new Map();
  activities.forEach((activity) => {
    if (activity.record_type !== 'lead') return;
    const list = byLead.get(Number(activity.record_id)) || [];
    list.push(activity);
    byLead.set(Number(activity.record_id), list);
  });

  return new Map(leads.map((lead) => {
    const own = byLead.get(Number(lead.id)) || [];
    const open = own.filter((activity) => activity.status === 'open');
    // Earliest due first; undated tasks after dated ones.
    const next = open.slice().sort((a, b) => (
      (parseDbDate(a.due_at)?.getTime() ?? Infinity) - (parseDbDate(b.due_at)?.getTime() ?? Infinity)
    ))[0];
    const touches = [lead.updated_at, lead.created_at, ...own.map((activity) => activity.updated_at || activity.created_at)]
      .map(parseDbDate).filter(Boolean);
    const lastTouch = touches.length ? new Date(Math.max(...touches.map((date) => date.getTime()))) : null;
    const idleDays = lastTouch ? daysBetween(lastTouch, now) : 0;
    const stale = ['new', 'contacted'].includes(lead.status) && !next && idleDays > staleDays;

    let nextStep = { text: 'لا توجد خطوة محددة', tone: 'none' };
    if (next) {
      const due = parseDbDate(next.due_at);
      if (due && due < now && daysBetween(due, now) > 0) {
        nextStep = { text: `${ACTIVITY_LABELS[next.activity_type] || 'مهمة'} متأخرة`, tone: 'late' };
      } else {
        nextStep = { text: due ? `${next.title} — ${dueText(due, now)}` : next.title, tone: 'due' };
      }
    }
    return [lead.id, { nextStep, stale, idleDays }];
  }));
}

function CRMLeadsList({
  leads, activities, assignees, loading, staleDays,
  search, onSearch, status, onStatus, source, onSource, owner, onOwner,
  savedFilters, onApplyFilter, onSaveFilter,
  onAdd, onLogActivity, onConvert, onEdit, onDelete, onStatusChange,
}) {
  const [filterName, setFilterName] = useState('');
  const [namingFilter, setNamingFilter] = useState(false);

  const sources = useMemo(
    () => [...new Set(leads.map((lead) => lead.source).filter(Boolean))].sort(),
    [leads],
  );
  const details = useMemo(() => describeLeads(leads, activities, staleDays), [leads, activities, staleDays]);

  // Status chips count the leads that match the other filters, so the numbers add up to "الكل".
  const matchesOthers = (lead) => (!source || lead.source === source)
    && (!owner || String(lead.owner_user_id || '') === owner);
  const base = leads.filter(matchesOthers);
  const chips = [['', 'الكل'], ...LEAD_STATUSES, ...(base.some((lead) => lead.status === 'converted') ? [CONVERTED] : [])]
    .map(([key, label]) => ({ key, label, count: key ? base.filter((lead) => lead.status === key).length : base.length }));
  const rows = status ? base.filter((lead) => lead.status === status) : base;

  const saveFilter = async () => {
    if (!filterName.trim()) return;
    await onSaveFilter(filterName.trim());
    setFilterName('');
    setNamingFilter(false);
  };

  return (
    <div className="crm-ds crm-ld">
      <div className="crm-ld-chips" role="group" aria-label="تصفية حسب الحالة">
        {chips.map((chip) => (
          <button
            key={chip.key || 'all'}
            type="button"
            className={`crm-ld-chip ${status === chip.key ? 'is-active' : ''}`}
            aria-pressed={status === chip.key}
            onClick={() => onStatus(chip.key)}
          >
            {chip.label} {num(chip.count)}
          </button>
        ))}
      </div>

      <div className="crm-ov-card crm-ld-toolbar">
        <label className="crm-ct-search">
          <SearchIcon size={18} />
          <input
            type="search"
            placeholder="ابحث بالاسم أو الهاتف أو المصدر"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            aria-label="بحث في العملاء المحتملين"
          />
        </label>
        <select className="crm-ct-select" value={source} onChange={(event) => onSource(event.target.value)} aria-label="تصفية حسب المصدر">
          <option value="">كل المصادر</option>
          {sources.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select className="crm-ct-select" value={owner} onChange={(event) => onOwner(event.target.value)} aria-label="تصفية حسب المسؤول">
          <option value="">كل المسؤولين</option>
          {assignees.map((user) => (
            <option key={user.id} value={String(user.id)}>
              {[user.first_name, user.last_name].filter(Boolean).join(' ') || user.username}
            </option>
          ))}
        </select>
        {savedFilters.length > 0 && (
          <select
            className="crm-ct-select"
            value=""
            aria-label="الفلاتر المحفوظة"
            onChange={(event) => {
              const filter = savedFilters.find((item) => String(item.id) === event.target.value);
              if (filter) onApplyFilter(filter.filters || {});
            }}
          >
            <option value="">الفلاتر المحفوظة</option>
            {savedFilters.map((filter) => <option key={filter.id} value={filter.id}>{filter.name}</option>)}
          </select>
        )}
        <div className="crm-ld-save">
          {namingFilter ? (
            <>
              <input
                aria-label="اسم الفلتر"
                placeholder="اسم الفلتر"
                maxLength={60}
                value={filterName}
                autoFocus
                onChange={(event) => setFilterName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') saveFilter();
                  if (event.key === 'Escape') setNamingFilter(false);
                }}
              />
              <button type="button" className="crm-ov-btn crm-ov-btn--primary" disabled={!filterName.trim()} onClick={saveFilter}>حفظ</button>
              <button type="button" className="crm-ov-btn" onClick={() => setNamingFilter(false)}>إلغاء</button>
            </>
          ) : (
            <button type="button" className="crm-ov-btn" onClick={() => setNamingFilter(true)}>حفظ الفلتر</button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="crm-ov-card crm-pl-note">جارٍ تحميل العملاء المحتملين...</div>
      ) : rows.length === 0 ? (
        <div className="crm-ov-card crm-pl-note">
          <div className="crm-ov-empty crm-ct-empty">
            <span className="crm-ov-chip crm-ov-chip--lg"><UserPlusIcon size={24} /></span>
            <strong>{leads.length ? 'لا توجد نتائج مطابقة' : 'لم يتم تسجيل أي عميل محتمل بعد'}</strong>
            <p>سجّل كل فرصة من أول تواصل، وتابعها لحد ما تتحوّل لعميل.</p>
            <button type="button" className="crm-ov-btn crm-ov-btn--primary" onClick={onAdd}>
              <PlusIcon size={18} />
              عميل محتمل جديد
            </button>
          </div>
        </div>
      ) : (
        <ul className="crm-ld-list">
          {rows.map((lead, index) => {
            const info = details.get(lead.id);
            const [, statusLabel, statusTone] = [...LEAD_STATUSES, CONVERTED].find(([key]) => key === lead.status) || CONVERTED;
            const converted = lead.status === 'converted';
            const reach = lead.phone || lead.email;
            return (
              <li key={lead.id} className={`crm-ov-card crm-ld-row ${info.stale ? 'is-stale' : ''}`}>
                <div className="crm-ld-person">
                  <span className={`crm-ov-avatar ${index % 2 === 0 ? 'is-top' : ''}`}>{initials(lead.name)}</span>
                  <div>
                    <strong>{lead.name}</strong>
                    <span>
                      {lead.company_name}
                      {lead.company_name && reach && ' · '}
                      {reach && <bdi dir="ltr">{reach}</bdi>}
                      {!lead.company_name && !reach && 'بدون بيانات اتصال'}
                    </span>
                  </div>
                </div>
                <dl className="crm-ld-field">
                  <dt>المصدر</dt>
                  <dd>{lead.source || 'غير محدد'}</dd>
                </dl>
                <dl className="crm-ld-field">
                  <dt>الحالة</dt>
                  <dd>
                    {info.stale ? (
                      <span className="crm-ct-badge crm-ct-badge--warning" title={`آخر متابعة ${agoText(info.idleDays)}`}>
                        لم يتابع {num(info.idleDays)} يوم
                      </span>
                    ) : (
                      <span className={`crm-ct-badge crm-ct-badge--${statusTone}`}>{statusLabel}</span>
                    )}
                  </dd>
                </dl>
                <dl className="crm-ld-field">
                  <dt>الخطوة التالية</dt>
                  <dd className={`crm-ld-next--${info.nextStep.tone}`}>{info.nextStep.text}</dd>
                </dl>
                <dl className="crm-ld-field">
                  <dt>المسؤول</dt>
                  <dd>{lead.owner_username || 'غير معيّن'}</dd>
                </dl>
                <div className="crm-ld-actions">
                  {!converted && (
                    <>
                      <button type="button" className="crm-ov-btn" onClick={() => onLogActivity(lead)}>سجل نشاط</button>
                      <button type="button" className="crm-ov-btn crm-ov-btn--primary" onClick={() => onConvert(lead)}>حوّل لعميل</button>
                      <details className="crm-ld-menu">
                        <summary aria-label={`خيارات ${lead.name}`}>⋯</summary>
                        <div className="crm-ld-menu-body">
                          <button type="button" onClick={(event) => { event.currentTarget.closest('details').open = false; onEdit(lead); }}>
                            تعديل البيانات
                          </button>
                          <label>
                            تغيير الحالة
                            <select
                              value={lead.status}
                              onChange={(event) => { event.currentTarget.closest('details').open = false; onStatusChange(lead, event.target.value); }}
                            >
                              {LEAD_STATUSES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                            </select>
                          </label>
                          <button type="button" className="is-danger" onClick={(event) => { event.currentTarget.closest('details').open = false; onDelete(lead); }}>
                            حذف العميل المحتمل
                          </button>
                        </div>
                      </details>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {!loading && rows.length > 0 && (
        <p className="crm-ld-foot">عرض {num(rows.length)} من {num(leads.length)}</p>
      )}
    </div>
  );
}

export default CRMLeadsList;
