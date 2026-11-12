import { useEffect, useMemo, useState } from 'react';
import * as legalApi from '../../api/legal.js';
import LegalIcon from './LegalIcon.jsx';
import '../../styles/legalClients.css';

const PAGE_SIZE = 6;

const CASE_TYPES = {
  civil: 'مدني',
  commercial: 'تجاري',
  criminal: 'جنائي',
  labor: 'عمالي',
  family: 'أسرة',
  administrative: 'إداري',
  inheritance: 'مواريث',
};

const CONTACT_TYPES = {
  call: 'مكالمة',
  message: 'رسالة',
  note: 'ملاحظة',
  complaint: 'شكوى',
};

// shortcut: no client_type column, so a company is detected from the name prefix.
// Upgrade when customers gets a real client_type field.
const COMPANY_PREFIX = /^(شرك|مؤسس|مصنع|مكتب|مركز|جمعي|بنك|مستشفى|معهد)/;

function dayDiff(dateText) {
  if (!dateText) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${String(dateText).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  return Math.round((target - today) / 86400000);
}

function powerStatus(client) {
  if (!client.powers_count) return { key: 'none', label: 'بدون توكيل', tone: 'warn' };
  const scope = (client.poa_scope || '').trim();
  const withScope = (text) => (scope ? `${scope} · ${text}` : text);
  const days = client.poa_expires_at ? dayDiff(client.poa_expires_at) : null;
  if (days === null) return { key: 'open', label: withScope('ساري'), tone: 'ok' };
  if (days < 0) return { key: 'expired', label: 'منتهي', tone: 'bad' };
  if (days <= 30) return { key: 'expiring', label: withScope(`ينتهي بعد ${days} يوم`), tone: 'warn', days };
  return { key: 'active', label: withScope('ساري'), tone: 'ok', days };
}

function lastContactLabel(value) {
  if (!value) return 'لا يوجد تواصل';
  const days = -dayDiff(value);
  if (days === null || Number.isNaN(days)) return 'لا يوجد تواصل';
  if (days <= 0) return 'آخر تواصل: اليوم';
  if (days === 1) return 'آخر تواصل: أمس';
  if (days < 30) return `آخر تواصل: منذ ${days} يوم`;
  return `آخر تواصل: ${new Date(value).toLocaleDateString('ar-EG')}`;
}

function num(value) {
  return Number(value || 0).toLocaleString('ar-EG');
}

function money(value) {
  return `${num(Math.round(Number(value) || 0))} ج`;
}

function decorate(client) {
  const isCompany = COMPANY_PREFIX.test((client.name || '').trim());
  const kind = client.cases_count ? (isCompany ? 'company' : 'individual') : 'potential';
  const contract = Number(client.contract_total) || 0;
  const paid = Number(client.paid_total) || 0;
  return {
    ...client,
    kind,
    kindLabel: kind === 'company' ? 'شركة' : kind === 'potential' ? 'محتمل' : 'فرد',
    fileCode: `CL-${1000 + Number(client.id)}`,
    power: powerStatus(client),
    outstanding: Number(client.outstanding_fees) || 0,
    paidRatio: contract > 0 ? Math.min(100, Math.round((paid / contract) * 100)) : null,
    caseTypeLabel: CASE_TYPES[client.main_case_type] || client.main_case_type || '',
    contactLabel: lastContactLabel(client.last_contact_at),
    contactStamp: client.last_contact_at ? new Date(client.last_contact_at).getTime() : 0,
  };
}

const FILTERS = [
  ['all', 'الكل'],
  ['individual', 'أفراد'],
  ['company', 'شركات'],
  ['potential', 'محتملون'],
  ['dues', 'عليهم مستحقات'],
];

export default function LegalClientsWorkspace({ refreshKey, onOpenClient }) {
  const [rows, setRows] = useState([]);
  const [followUps, setFollowUps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('contact');
  const [page, setPage] = useState(1);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    legalApi.getLegalClientsOverview()
      .then((data) => {
        if (cancelled) return;
        setRows((data?.clients || []).map(decorate));
        setFollowUps(data?.followUps || []);
        setError('');
      })
      .catch((loadError) => {
        if (cancelled) return;
        console.error('تعذر تحميل قائمة الموكلين:', loadError);
        setError(loadError instanceof Error ? loadError.message : 'تعذر تحميل بيانات الموكلين');
      })
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [refreshKey]);

  const stats = useMemo(() => {
    const now = new Date();
    const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const expiring = rows
      .filter((c) => c.power.key === 'expiring')
      .sort((a, b) => a.power.days - b.power.days);
    const withDues = rows.filter((c) => c.outstanding > 0);
    const complete = rows.filter((c) => c.phone && c.email && c.powers_count > 0);
    return {
      total: rows.length,
      active: rows.filter((c) => c.active_cases > 0).length,
      potential: rows.filter((c) => c.kind === 'potential').length,
      newThisMonth: rows.filter((c) => String(c.created_at || '').startsWith(monthPrefix)).length,
      expiring,
      dues: withDues.reduce((sum, c) => sum + c.outstanding, 0),
      duesClients: withDues.length,
      completion: rows.length ? Math.round((complete.length / rows.length) * 100) : 100,
      missingPhone: rows.filter((c) => !c.phone).length,
      missingPower: rows.filter((c) => !c.powers_count).length,
    };
  }, [rows]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = rows.filter((c) => {
      if (filter === 'dues' ? c.outstanding <= 0 : filter !== 'all' && c.kind !== filter) return false;
      if (!term) return true;
      return c.name.toLowerCase().includes(term)
        || (c.phone || '').includes(term)
        || c.fileCode.toLowerCase().includes(term);
    });
    const sorted = [...list];
    if (sort === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name, 'ar'));
    else if (sort === 'dues') sorted.sort((a, b) => b.outstanding - a.outstanding);
    else sorted.sort((a, b) => b.contactStamp - a.contactStamp);
    return sorted;
  }, [rows, search, filter, sort]);

  const counts = useMemo(() => ({
    all: rows.length,
    individual: rows.filter((c) => c.kind === 'individual').length,
    company: rows.filter((c) => c.kind === 'company').length,
    potential: stats.potential,
    dues: stats.duesClients,
  }), [rows, stats]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [search, filter, sort]);

  if (loading) return <div className="legal-clients-loading">جاري تحميل بيانات الموكلين...</div>;
  if (error) return <div className="legal-clients-error">{error}</div>;

  return (
    <div className="legal-clients">
      <div className="legal-kpi-row">
        {[
          {
            icon: 'users',
            label: 'إجمالي الموكلين',
            value: num(stats.total),
            note: `${num(stats.active)} نشط · ${num(stats.potential)} محتمل`,
          },
          {
            icon: 'trend',
            label: 'موكلون جدد هذا الشهر',
            value: num(stats.newThisMonth),
            note: 'مسجلون خلال الشهر الحالي',
            tone: 'ok',
          },
          {
            icon: 'certificate',
            label: 'توكيلات تنتهي خلال ٣٠ يوم',
            value: num(stats.expiring.length),
            note: stats.expiring.length
              ? `أقربها بعد ${num(stats.expiring[0].power.days)} يوم`
              : 'لا توكيلات على وشك الانتهاء',
            tone: stats.expiring.length ? 'warn' : undefined,
          },
          {
            icon: 'coins',
            label: 'أتعاب متأخرة',
            value: money(stats.dues),
            note: `على ${num(stats.duesClients)} موكلين`,
            tone: stats.dues > 0 ? 'warn' : undefined,
          },
        ].map((card) => (
          <article className="legal-kpi" key={card.label}>
            <header>
              <span className="legal-kpi-icon"><LegalIcon name={card.icon} size={18} /></span>
              <span className="legal-kpi-label">{card.label}</span>
            </header>
            <strong className="legal-kpi-value">{card.value}</strong>
            <span className={`legal-kpi-note${card.tone ? ` legal-kpi-note--${card.tone}` : ''}`}>{card.note}</span>
          </article>
        ))}
      </div>

      <div className="legal-filter-row">
        {FILTERS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`legal-chip ${filter === key ? 'active' : ''}`}
            onClick={() => setFilter(key)}
          >
            {label}
            <span className="legal-chip-count">{num(counts[key])}</span>
          </button>
        ))}
      </div>

      <div className="legal-clients-grid">
        <section className="legal-card legal-clients-main">
          <header className="legal-card-head">
            <div>
              <h2>قائمة الموكلين</h2>
              <p>ابحث بالاسم أو رقم الهاتف أو كود الملف.</p>
            </div>
            <div className="legal-card-tools">
              <label className="legal-search">
                <LegalIcon name="search" size={16} />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="اسم الموكل أو الهاتف أو الكود..."
                  aria-label="البحث عن موكل"
                />
              </label>
              <select
                className="legal-sort"
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                aria-label="ترتيب القائمة"
              >
                <option value="contact">الأحدث تواصلًا</option>
                <option value="name">الاسم أبجديًا</option>
                <option value="dues">أعلى مستحقات</option>
              </select>
            </div>
          </header>

          <table className="legal-clients-table">
            <thead>
              <tr>
                <th>الموكل</th>
                <th>الصفة</th>
                <th>التواصل</th>
                <th>القضايا</th>
                <th>التوكيل</th>
                <th>الأتعاب</th>
                <th>الملف</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((client) => (
                <tr key={client.id}>
                  <td>
                    <div className="legal-client-cell">
                      <span className={`legal-avatar legal-avatar--${client.kind}`}>{client.name.trim().charAt(0)}</span>
                      <div>
                        <strong>{client.name}</strong>
                        <small>{client.fileCode}</small>
                      </div>
                    </div>
                  </td>
                  <td><span className={`legal-badge legal-badge--${client.kind}`}>{client.kindLabel}</span></td>
                  <td>
                    <div className="legal-stack">
                      <span className="legal-phone">{client.phone || '—'}</span>
                      <small>{client.contactLabel}</small>
                    </div>
                  </td>
                  <td>
                    <div className="legal-stack legal-stack--center">
                      <strong className="legal-cases-count">{num(client.cases_count)}</strong>
                      <small>{client.active_cases ? `${num(client.active_cases)} متداولة` : client.caseTypeLabel || 'لا قضايا'}</small>
                    </div>
                  </td>
                  <td>
                    <span className={`legal-status legal-status--${client.power.tone}`}>
                      <i aria-hidden="true" />
                      {client.power.label}
                    </span>
                  </td>
                  <td>
                    <div className="legal-stack">
                      <small>
                        {client.outstanding > 0
                          ? `متأخر ${money(client.outstanding)}`
                          : client.paidRatio === null ? 'لم يُتفق' : `مدفوع ${num(client.paidRatio)}٪`}
                      </small>
                      <span className="legal-meter" aria-hidden="true">
                        <i style={{ width: `${client.paidRatio ?? 0}%` }} />
                      </span>
                    </div>
                  </td>
                  <td>
                    <button type="button" className="legal-open-btn" onClick={() => onOpenClient(client)}>
                      فتح الملف
                      <LegalIcon name="chevronLeft" size={14} />
                    </button>
                  </td>
                </tr>
              ))}
              {pageRows.length === 0 && (
                <tr>
                  <td colSpan={7} className="legal-empty">
                    {rows.length ? 'لا توجد نتائج مطابقة' : 'لم يتم تسجيل أي موكلين بعد'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <footer className="legal-card-foot">
            <span>عرض {num(filtered.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0)}-{num(Math.min(currentPage * PAGE_SIZE, filtered.length))} من {num(filtered.length)}</span>
            <div className="legal-pager">
              <button type="button" onClick={() => setPage(currentPage - 1)} disabled={currentPage <= 1} aria-label="الصفحة السابقة">
                <LegalIcon name="chevronRight" size={16} />
              </button>
              <span>{num(currentPage)} / {num(pageCount)}</span>
              <button type="button" onClick={() => setPage(currentPage + 1)} disabled={currentPage >= pageCount} aria-label="الصفحة التالية">
                <LegalIcon name="chevronLeft" size={16} />
              </button>
            </div>
          </footer>
        </section>

        <aside className="legal-clients-side">
          <section className="legal-card legal-side-card">
            <header className="legal-side-head">
              <h3>توكيلات على وشك الانتهاء</h3>
              <span className="legal-side-count">{num(stats.expiring.length)}</span>
            </header>
            {stats.expiring.length === 0 ? (
              <p className="legal-side-empty">لا توجد توكيلات تنتهي خلال ٣٠ يوم.</p>
            ) : stats.expiring.slice(0, 4).map((client) => (
              <button type="button" key={client.id} className="legal-side-row" onClick={() => onOpenClient(client)}>
                <span className={`legal-avatar legal-avatar--${client.kind}`}>{client.name.trim().charAt(0)}</span>
                <span className="legal-side-text">
                  <strong>{client.name}</strong>
                  <small>توكيل {client.poa_number || '—'} · {client.poa_scope || 'بدون نطاق'}</small>
                </span>
                <span className="legal-side-tag">{num(client.power.days)} يوم</span>
              </button>
            ))}
          </section>

          <section className="legal-card legal-side-card">
            <header className="legal-side-head">
              <h3>متابعات اليوم</h3>
              <span className="legal-side-count">{num(followUps.length)}</span>
            </header>
            {followUps.length === 0 ? (
              <p className="legal-side-empty">لا توجد متابعات مجدولة اليوم.</p>
            ) : followUps.slice(0, 5).map((item) => (
              <div key={item.id} className="legal-side-row legal-side-row--static">
                <span className="legal-side-text">
                  <strong>{item.client_name}</strong>
                  <small>{item.subject}</small>
                </span>
                <span className="legal-side-tag">{CONTACT_TYPES[item.type] || item.type}</span>
              </div>
            ))}
          </section>

          <section className="legal-card legal-side-card legal-side-card--accent">
            <h3>اكتمال بيانات الموكلين</h3>
            <div className="legal-progress-head">
              <strong>{num(stats.completion)}٪</strong>
              <span>من الملفات مكتملة</span>
            </div>
            <span className="legal-meter legal-meter--lg" aria-hidden="true">
              <i style={{ width: `${stats.completion}%` }} />
            </span>
            <p className="legal-side-empty">
              {num(stats.missingPhone)} موكل بدون رقم هاتف، و{num(stats.missingPower)} بدون بيانات توكيل — وده بيعطل تجهيز الصحف والمذكرات.
            </p>
            <button
              type="button"
              className="legal-side-cta"
              disabled={stats.completion === 100}
              onClick={() => {
                const incomplete = rows.find((c) => !c.phone || !c.email || !c.powers_count);
                if (incomplete) onOpenClient(incomplete);
              }}
            >
              استكمال الناقص
            </button>
          </section>
        </aside>
      </div>
    </div>
  );
}
