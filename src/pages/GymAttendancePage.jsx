import { useCallback, useEffect, useMemo, useState } from 'react';
import * as subsApi from '../api/subscriptions.js';
import { errText } from '../components/gym/GymDialogs.jsx';
import '../styles/gymTraining.css';

const parse = (s) => { const d = new Date(String(s).replace(' ', 'T')); return Number.isNaN(d.getTime()) ? null : d; };
const fmtDate = (s) => { const d = parse(s); return d ? d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' }) : '—'; };
const fmtTime = (s) => { const d = parse(s); return d ? d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : ''; };

const STATUS_MAP = {
  active:   { label: 'نشط',      cls: 'gym-badge--success' },
  frozen:   { label: 'مجمّد',    cls: 'gym-badge--info' },
  expired:  { label: 'منتهي',    cls: 'gym-badge--danger' },
  depleted: { label: 'نفد الرصيد', cls: 'gym-badge--warning' },
};

export default function GymAttendancePage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('visits'); // visits | last | name
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const data = await subsApi.getGymAttendanceReport();
      setRows(data || []);
    } catch (e) {
      setError(`تعذر تحميل سجل الحضور: ${errText(e)}`);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    let list = rows;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((m) => m.name?.toLowerCase().includes(q) || String(m.id).includes(q) || m.phone?.includes(q));
    }
    if (sort === 'visits') list = [...list].sort((a, b) => b.visits - a.visits);
    else if (sort === 'last') list = [...list].sort((a, b) => (b.last_visit || '').localeCompare(a.last_visit || ''));
    else if (sort === 'name') list = [...list].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar'));
    return list;
  }, [rows, search, sort]);

  const totalVisits = rows.reduce((s, m) => s + m.visits, 0);
  const avg = rows.length ? (totalVisits / rows.length).toFixed(1) : '0';

  return (
    <div className="gym-page legal-ds">
      <div className="gym-ambient" aria-hidden="true"><i /><i /><i /></div>

      <header className="gym-top">
        <div className="gym-top__title">
          <span className="gym-logo" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" /><polyline points="17 11 19 13 23 9" /></svg>
          </span>
          <h1>حضور الأعضاء</h1>
          <span className="gym-muted">سجل البوابة — الشهر الحالي</span>
        </div>
        <button type="button" className="gym-btn gym-btn--sm" onClick={load} title="تحديث">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 4v6h6" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></svg>
        </button>
      </header>

      {error && <div className="gym-alert" role="alert">{error}</div>}

      {/* Stats */}
      <div className="gym-card gym-stats">
        <div><strong>{totalVisits}</strong><span>إجمالي الزيارات</span></div>
        <div><strong>{rows.length}</strong><span>أعضاء حضروا</span></div>
        <div><strong>{avg}</strong><span>متوسط زيارات / عضو</span></div>
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 'var(--space-3)', marginBlockEnd: 'var(--space-4)', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="search"
          className="gym-input"
          placeholder="ابحث بالاسم أو الكود أو الهاتف..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: '1 1 220px', minInlineSize: '180px' }}
        />
        <select className="gym-input" value={sort} onChange={(e) => setSort(e.target.value)} style={{ minInlineSize: '140px' }}>
          <option value="visits">ترتيب: الأكثر حضوراً</option>
          <option value="last">ترتيب: آخر زيارة</option>
          <option value="name">ترتيب: الاسم</option>
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="gym-empty"><p>جاري التحميل...</p></div>
      ) : !filtered.length ? (
        <div className="gym-empty gym-empty--hero">
          <div className="gym-empty__icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" /><path d="M20 8v6M23 11h-6" /></svg>
          </div>
          <p style={{ fontWeight: 'var(--weight-heavy)' }}>
            {search ? 'لا توجد نتائج للبحث' : 'لا توجد بيانات حضور هذا الشهر'}
          </p>
          <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
            بيانات الحضور تتجمع تلقائياً من بوابة الاستقبال عند مسح كود العضو
          </p>
        </div>
      ) : (
        <div className="gym-card" style={{ overflow: 'hidden' }}>
          <table className="gym-table">
            <thead>
              <tr>
                <th>العضو</th>
                <th>الباقة</th>
                <th>الزيارات</th>
                <th>آخر زيارة</th>
                <th>أول زيارة</th>
                <th>حالة الاشتراك</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => {
                const st = STATUS_MAP[m.sub_status];
                return (
                  <tr key={m.id}>
                    <td>
                      <strong>{m.name}</strong>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                        GM-{m.id}{m.phone ? ` · ${m.phone}` : ''}
                      </div>
                    </td>
                    <td>{m.package_name || '—'}</td>
                    <td>
                      <span className={`gym-badge ${m.visits >= 15 ? 'gym-badge--success' : m.visits >= 8 ? 'gym-badge--warning' : 'gym-badge--info'}`}>
                        {m.visits}
                      </span>
                    </td>
                    <td>
                      {fmtDate(m.last_visit)}
                      <span style={{ color: 'var(--color-text-muted)', marginInlineStart: 'var(--space-1)', fontSize: 'var(--text-xs)' }}>{fmtTime(m.last_visit)}</span>
                    </td>
                    <td style={{ color: 'var(--color-text-muted)' }}>{fmtDate(m.first_visit)}</td>
                    <td>{st ? <span className={`gym-badge ${st.cls}`}>{st.label}</span> : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
