import { useEffect, useMemo, useState } from 'react';
import {
  CallIcon, CheckIcon, PencilIcon, PlusIcon, SearchIcon, UserPlusIcon,
} from '../icons/PosIcons.jsx';

const PAGE_SIZE = 20;
const STALE_CONTACT_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

// Tier values are stored in English (see CustomerTimelineDrawer); labels and badge tones live here.
const TIERS = {
  VIP: { label: 'كبار العملاء', tone: 'primary' },
  Gold: { label: 'عميل مميز', tone: 'success' },
  Silver: { label: 'عميل متكرر', tone: 'warning' },
  Regular: { label: 'عميل عادي', tone: 'info' },
};

const num = (value) => Number(value || 0).toLocaleString('ar-EG');

function initials(name) {
  return String(name || '?').trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('.');
}

function parseDbDate(value) {
  if (!value) return null;
  const date = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${String(value).replace(' ', 'T')}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function lastContact(value) {
  const date = parseDbDate(value);
  if (!date) return { text: 'لا يوجد تواصل', stale: true };
  const days = Math.floor((Date.now() - date.getTime()) / DAY_MS);
  const text = days <= 0 ? 'اليوم' : days === 1 ? 'أمس' : days <= 10 ? `منذ ${num(days)} أيام` : `منذ ${num(days)} يوم`;
  return { text, stale: days > STALE_CONTACT_DAYS, title: date.toLocaleString('ar-EG') };
}

function CRMContactsTable({
  customers, totalCount, loading, search, onSearch, searchPending,
  copiedPhone, onCopyPhone, onOpen360, onAdd, onImport,
}) {
  const [tier, setTier] = useState('');
  const [page, setPage] = useState(0);

  const rows = useMemo(
    () => (tier ? customers.filter((customer) => (customer.tier || 'Regular') === tier) : customers),
    [customers, tier],
  );
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // A new search or filter starts from the first page.
  useEffect(() => { setPage(0); }, [search, tier]);

  if (!loading && totalCount === 0) {
    return (
      <section className="crm-ds crm-ov-card crm-ct">
        <div className="crm-ov-empty crm-ct-empty">
          <span className="crm-ov-chip crm-ov-chip--lg"><UserPlusIcon size={24} /></span>
          <strong>لم يتم تسجيل أي عملاء بعد</strong>
          <p>أضف أول عميل يدوياً، أو استورد ملف Excel فيه الأسماء والأرقام وهيتسجلوا كلهم مرة واحدة.</p>
          <div className="crm-ov-actions">
            <button type="button" className="crm-ov-btn crm-ov-btn--primary" onClick={onAdd}>
              <PlusIcon size={18} />
              أضف أول عميل
            </button>
            {onImport && (
              <button type="button" className="crm-ov-btn" onClick={onImport}>استيراد من Excel</button>
            )}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="crm-ds crm-ov-card crm-ct" aria-busy={loading || searchPending}>
      <div className="crm-ct-toolbar">
        <h2 className="crm-ct-title">
          إجمالي العملاء المسجلين <span>{loading ? '—' : num(totalCount)}</span>
        </h2>
        <div className="crm-ct-filters">
          <label className="crm-ct-search">
            <SearchIcon size={18} />
            <input
              type="search"
              placeholder="ابحث بالاسم أو الهاتف أو الشركة"
              value={search}
              onChange={(event) => onSearch(event.target.value)}
              aria-label="البحث عن عميل"
            />
          </label>
          <select
            className="crm-ct-select"
            value={tier}
            onChange={(event) => setTier(event.target.value)}
            aria-label="تصفية حسب التصنيف"
          >
            <option value="">كل التصنيفات</option>
            {Object.entries(TIERS).map(([value, { label }]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="crm-ct-scroll">
        <table className="crm-ct-table">
          <thead>
            <tr>
              <th>اسم العميل</th>
              <th>الشركة</th>
              <th>رقم الهاتف</th>
              <th>المصدر</th>
              <th>التصنيف</th>
              <th>آخر تواصل</th>
              <th>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="crm-ct-note">جارٍ تحميل بيانات العملاء...</td></tr>
            ) : pageRows.length === 0 ? (
              <tr><td colSpan={7} className="crm-ct-note">لا توجد نتائج مطابقة للبحث</td></tr>
            ) : pageRows.map((customer, index) => {
              const tierInfo = TIERS[customer.tier] || TIERS.Regular;
              const contact = lastContact(customer.last_interaction_at);
              const copied = copiedPhone && copiedPhone === customer.phone;
              return (
                <tr key={customer.id}>
                  <td>
                    <div className="crm-ct-person">
                      <span className={`crm-ov-avatar ${index % 2 === 0 ? 'is-top' : ''}`}>{initials(customer.name)}</span>
                      <div>
                        <strong>{customer.name}</strong>
                        {customer.email && <span dir="ltr">{customer.email}</span>}
                      </div>
                    </div>
                  </td>
                  <td>{customer.company_name || '—'}</td>
                  <td dir="ltr" className="crm-ct-phone">{customer.phone || '—'}</td>
                  <td>{customer.lead_source || '—'}</td>
                  <td><span className={`crm-ct-badge crm-ct-badge--${tierInfo.tone}`}>{tierInfo.label}</span></td>
                  <td className={contact.stale ? 'crm-ct-stale' : 'crm-ct-muted'} title={contact.title}>{contact.text}</td>
                  <td>
                    <div className="crm-ct-actions">
                      <button
                        type="button"
                        className="crm-ct-icon-btn"
                        onClick={() => onCopyPhone(customer.phone)}
                        disabled={!customer.phone}
                        title={copied ? 'تم نسخ الرقم' : 'نسخ رقم الهاتف'}
                        aria-label={`نسخ رقم ${customer.name}`}
                      >
                        {copied ? <CheckIcon size={16} /> : <CallIcon size={16} />}
                      </button>
                      <button
                        type="button"
                        className="crm-ct-icon-btn"
                        onClick={() => onOpen360(customer)}
                        title="تعديل التصنيف والملاحظات"
                        aria-label={`تعديل ${customer.name}`}
                      >
                        <PencilIcon size={16} />
                      </button>
                      <button
                        type="button"
                        className="crm-ct-icon-btn crm-ct-360"
                        onClick={() => onOpen360(customer)}
                        title="عرض السجل الكامل Customer 360°"
                      >
                        360°
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!loading && rows.length > 0 && (
        <div className="crm-ct-footer">
          <span>
            عرض {num(page * PAGE_SIZE + 1)}–{num(page * PAGE_SIZE + pageRows.length)} من {num(rows.length)} عميل
          </span>
          <div className="crm-ov-actions">
            <button type="button" className="crm-ov-btn crm-ov-btn--sm" onClick={() => setPage(page - 1)} disabled={page === 0}>
              السابق
            </button>
            <button type="button" className="crm-ov-btn crm-ov-btn--sm" onClick={() => setPage(page + 1)} disabled={page >= pageCount - 1}>
              التالي
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

export default CRMContactsTable;
