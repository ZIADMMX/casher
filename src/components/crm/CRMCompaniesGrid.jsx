import { useEffect, useMemo, useState } from 'react';
import { BuildingIcon, MapPinIcon, PlusIcon, SearchIcon } from '../icons/PosIcons.jsx';
import * as crmApi from '../../api/crm.js';
import * as customersApi from '../../api/customers.js';

const num = (value) => Number(value || 0).toLocaleString('ar-EG');
const compactMoney = (value) => new Intl.NumberFormat('ar-EG', { notation: 'compact', maximumFractionDigits: 1 })
  .format(Number(value) || 0);

function initials(name) {
  const words = String(name || '?').trim().split(/\s+/);
  return words.length > 1 ? `${words[0][0]}${words[1][0]}` : words[0].slice(0, 2);
}

/** Groups companies into top-level cards; every descendant (branch of a branch too) is listed under its root. */
export function buildTree(companies) {
  const byId = new Map(companies.map((company) => [company.id, company]));
  const children = new Map();
  companies.forEach((company) => {
    if (company.parent_company_id && byId.has(company.parent_company_id)) {
      const list = children.get(company.parent_company_id) || [];
      list.push(company);
      children.set(company.parent_company_id, list);
    }
  });
  const descendants = (id, seen = new Set([id])) => (children.get(id) || []).flatMap((child) => {
    if (seen.has(child.id)) return []; // guards against a parent cycle in bad data
    seen.add(child.id);
    return [child, ...descendants(child.id, seen)];
  });
  return companies
    .filter((company) => !company.parent_company_id || !byId.has(company.parent_company_id))
    .map((company) => ({ ...company, branches: descendants(company.id) }));
}

function CRMCompaniesGrid({ companies, loading, onAdd, onAddBranch, onEdit }) {
  const [search, setSearch] = useState('');
  const [industry, setIndustry] = useState('');
  const [customers, setCustomers] = useState([]);
  const [opportunities, setOpportunities] = useState([]);

  useEffect(() => {
    let active = true;
    // Only feeds the per-card counters; the cards still render if this fails.
    Promise.all([customersApi.getAllCustomersWithStats(), crmApi.getAllCRMOpportunities()])
      .then(([customerRows, opportunityRows]) => {
        if (!active) return;
        setCustomers(Array.isArray(customerRows) ? customerRows : []);
        setOpportunities(Array.isArray(opportunityRows) ? opportunityRows : []);
      })
      .catch((error) => console.error('Failed to load company stats:', error));
    return () => { active = false; };
  }, [companies]);

  const tree = useMemo(() => buildTree(companies), [companies]);
  const industries = useMemo(
    () => [...new Set(companies.map((company) => company.industry).filter(Boolean))].sort(),
    [companies],
  );

  const cards = useMemo(() => {
    const term = search.trim().toLowerCase();
    return tree
      .filter((company) => !industry || company.industry === industry)
      .filter((company) => !term || [company, ...company.branches].some((item) => (
        `${item.name} ${item.industry || ''}`.toLowerCase().includes(term)
      )))
      .map((company) => {
        const ids = new Set([company.id, ...company.branches.map((branch) => branch.id)]);
        const contactIds = new Set(customers.filter((customer) => ids.has(customer.company_id)).map((customer) => customer.id));
        const open = opportunities.filter((item) => contactIds.has(item.customer_id) && !['won', 'lost'].includes(item.stage));
        return {
          ...company,
          contactCount: contactIds.size,
          openValue: open.reduce((total, item) => total + (Number(item.expected_value) || 0), 0),
          openCount: open.length,
        };
      });
  }, [tree, industry, search, customers, opportunities]);

  const branchCount = companies.length - tree.length;

  return (
    <div className="crm-ds crm-co">
      <div className="crm-ov-card crm-co-toolbar">
        <label className="crm-ct-search">
          <SearchIcon size={18} />
          <input
            type="search"
            placeholder="ابحث باسم الشركة أو النشاط"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="البحث عن شركة"
          />
        </label>
        <select className="crm-ct-select" value={industry} onChange={(event) => setIndustry(event.target.value)} aria-label="تصفية حسب النشاط">
          <option value="">كل الأنشطة</option>
          {industries.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <span className="crm-co-summary">
          {loading ? 'جارٍ التحميل...' : `${num(tree.length)} شركات · ${num(branchCount)} فرع`}
        </span>
      </div>

      <div className="crm-co-grid">
        {cards.map((company) => (
          <article key={company.id} className="crm-ov-card crm-co-card">
            <div className="crm-co-head">
              <span className="crm-co-logo">{initials(company.name)}</span>
              <div className="crm-co-name">
                <h3>{company.name}</h3>
                <p>{[company.industry, company.address].filter(Boolean).join(' · ') || 'شركة رئيسية'}</p>
              </div>
              <span className={`crm-ct-badge crm-ct-badge--${company.openCount ? 'success' : 'warning'}`}>
                {company.openCount ? 'عميل نشط' : 'يحتاج متابعة'}
              </span>
            </div>

            <dl className="crm-co-stats">
              <div><dt>فروع</dt><dd>{num(company.branches.length)}</dd></div>
              <div><dt>جهات اتصال</dt><dd>{num(company.contactCount)}</dd></div>
              <div><dt>صفقات مفتوحة</dt><dd className="crm-co-money">{compactMoney(company.openValue)}</dd></div>
            </dl>

            <div className="crm-co-branches">
              <h4>الفروع</h4>
              {company.branches.length ? (
                <ul>
                  {company.branches.map((branch, index) => (
                    <li key={branch.id}>
                      <button type="button" className="crm-co-chip" onClick={() => onEdit(branch)} title="تعديل بيانات الفرع">
                        {index === 0 && <MapPinIcon size={14} />}
                        {branch.name}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : <p>لا توجد فروع مسجلة لهذه الشركة.</p>}
            </div>

            <div className="crm-co-foot">
              <button type="button" className="crm-ov-btn crm-ov-btn--sm" onClick={() => onEdit(company)}>تعديل بيانات الشركة</button>
              <button type="button" className="crm-ov-btn crm-ov-btn--sm" onClick={() => onAddBranch(company)}>+ فرع</button>
            </div>
          </article>
        ))}

        {!loading && (
          <div className="crm-ov-empty crm-co-add">
            <span className="crm-ov-chip crm-ov-chip--lg"><BuildingIcon size={24} /></span>
            <strong>{companies.length ? 'أضف شركة جديدة' : 'لا توجد شركات مسجلة بعد'}</strong>
            <p>اربط جهات الاتصال بالشركة وفروعها عشان تعرف إجمالي تعاملك مع كل مجموعة، مش كل شخص لوحده.</p>
            <button type="button" className="crm-ov-btn crm-ov-btn--primary" onClick={onAdd}>
              <PlusIcon size={18} />
              شركة جديدة
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default CRMCompaniesGrid;
