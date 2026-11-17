import { useCallback, useEffect, useState } from 'react';
import * as enterpriseApi from '../api/enterprise.js';
import { openWhatsapp } from '../utils/whatsapp.js';
import '../styles/reservations.css';

const FILTERS = [['all', 'الكل'], ['open', 'مفتوحة'], ['late', 'متأخرة'], ['warranty', 'في الضمان']];
const CLAIM_LABEL = { open: 'مفتوحة', accepted: 'مقبولة', rejected: 'مرفوضة' };

export default function MaintenanceWorkshopPage({ onNavigate }) {
  const [board, setBoard] = useState({ summary: { open: 0, late: 0, in_warranty: 0, open_claims: 0 }, tickets: [] });
  const [claims, setClaims] = useState([]);
  const [tab, setTab] = useState('tickets');
  const [filter, setFilter] = useState('open');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [b, c] = await Promise.all([enterpriseApi.getMaintenanceBoard(), enterpriseApi.getWarrantyClaims()]);
      setBoard(b); setClaims(c); setError('');
    } catch (err) { setError(err.message || 'تعذر تحميل لوحة الورشة'); }
  }, []);
  useEffect(() => { load(); const timer = setInterval(load, 30_000); return () => clearInterval(timer); }, [load]);

  async function run(fn) {
    if (busy) return;
    setBusy(true);
    try { await fn(); setError(''); await load(); } catch (err) { setError(err.message || 'تعذر تنفيذ العملية'); } finally { setBusy(false); }
  }
  const openClaim = (t) => {
    const reason = window.prompt(`سبب مطالبة الضمان على ${t.ticket_number}`);
    if (reason) run(() => enterpriseApi.openWarrantyClaim(t.id, reason));
  };
  const decide = (c, decision) => {
    const note = decision === 'rejected' ? window.prompt('سبب الرفض') : '';
    if (decision === 'rejected' && !note) return;
    run(() => enterpriseApi.decideWarrantyClaim(c.id, decision, note));
  };

  const shown = board.tickets.filter((t) => (filter === 'open' ? !t.is_final : filter === 'late' ? t.late : filter === 'warranty' ? t.warranty.covered : true));
  const { summary } = board;

  return (
    <div className="resv" dir="rtl">
      <header className="resv-head">
        <div><h1>ورشة الصيانة</h1><p>{summary.open} تذكرة مفتوحة · {summary.late} متأخرة · {summary.in_warranty} في الضمان</p></div>
        {onNavigate && <button type="button" className="resv-btn" onClick={() => onNavigate('workflows')}>لوحة المسارات وتذكرة جديدة</button>}
      </header>

      <div className="resv-nav" role="tablist" aria-label="أقسام الورشة">
        <button type="button" role="tab" aria-selected={tab === 'tickets'} className={`resv-btn${tab === 'tickets' ? ' is-primary' : ''}`} onClick={() => setTab('tickets')}>التذاكر</button>
        <button type="button" role="tab" aria-selected={tab === 'claims'} className={`resv-btn${tab === 'claims' ? ' is-primary' : ''}`} onClick={() => setTab('claims')}>
          مطالبات الضمان{summary.open_claims > 0 ? ` (${summary.open_claims})` : ''}
        </button>
      </div>

      {error && <p className="resv-error" role="alert">{error}</p>}

      {tab === 'tickets' ? (
        <>
          <div className="resv-nav" role="group" aria-label="تصفية التذاكر">
            {FILTERS.map(([key, label]) => <button key={key} type="button" aria-pressed={filter === key} className={`resv-btn${filter === key ? ' is-primary' : ''}`} onClick={() => setFilter(key)}>{label}</button>)}
          </div>
          {shown.length === 0 ? <p className="resv-empty">مفيش تذاكر هنا.</p> : (
            <ul className="resv-list">
              {shown.map((t) => (
                <li key={t.id} className={`resv-card ${t.is_final ? 'is-done' : ''}`} style={{ gridTemplateColumns: '1fr auto' }}>
                  <div className="resv-body">
                    <b>{t.ticket_number} · {t.title}</b>
                    <span>{t.customer_name || 'بدون اسم'}{t.customer_phone ? <> · <bdi>{t.customer_phone}</bdi></> : null}{t.device_serial ? <> · <bdi>{t.device_serial}</bdi></> : null}</span>
                    <small>
                      {t.status_label || t.current_status_key}{t.late ? ' · متأخرة' : ''}
                      {t.warranty.covered ? ` · ضمان حتى ${t.warranty.until} (${t.warranty.days_left} يوم)` : t.sale_id && t.warranty.until ? ` · الضمان خلص ${t.warranty.until}` : ''}
                    </small>
                  </div>
                  <div className="resv-actions" style={{ gridColumn: 'auto' }}>
                    {t.customer_phone && !t.is_final && <button type="button" className="resv-btn" onClick={() => openWhatsapp(t.customer_phone, `أهلًا ${t.customer_name || ''}، بخصوص جهازك (${t.title}) تذكرة ${t.ticket_number}.`)}>واتساب</button>}
                    {t.open_claim_id ? <span className="resv-pill">مطالبة ضمان مفتوحة</span>
                      : t.warranty.covered && <button type="button" className="resv-btn" disabled={busy} onClick={() => openClaim(t)}>مطالبة ضمان</button>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : claims.length === 0 ? <p className="resv-empty">مفيش مطالبات ضمان.</p> : (
        <ul className="resv-list">
          {claims.map((c) => (
            <li key={c.id} className={`resv-card ${c.status === 'accepted' ? 'is-seated' : c.status === 'rejected' ? 'is-off' : ''}`} style={{ gridTemplateColumns: '1fr auto' }}>
              <div className="resv-body">
                <b>{c.ticket_number} · {c.title}</b>
                <span>{c.customer_name || 'بدون اسم'} — {c.reason}</span>
                {c.decision_note && <small>القرار: {c.decision_note}</small>}
                {c.claim_ticket_number && <small>اتفتحت تذكرة ضمان {c.claim_ticket_number}</small>}
              </div>
              {c.status === 'open' ? (
                <div className="resv-actions" style={{ gridColumn: 'auto' }}>
                  <button type="button" className="resv-btn is-primary" disabled={busy} onClick={() => decide(c, 'accepted')}>قبول (تذكرة مجانية)</button>
                  <button type="button" className="resv-btn is-danger" disabled={busy} onClick={() => decide(c, 'rejected')}>رفض</button>
                </div>
              ) : <span className="resv-pill">{CLAIM_LABEL[c.status]}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
