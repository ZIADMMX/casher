import { useCallback, useEffect, useState } from 'react';
import * as subscriptionsApi from '../../api/subscriptions.js';
import { PACKAGE_STATUS, slashDate } from '../../utils/gymTraining.js';

/**
 * The member's private-trainer packages (the balance of sessions they paid for), inside the member profile.
 * Shows nothing for a member who has none. "حجز حصة" counts one session, same as on the trainers screen.
 */
export default function GymMemberPtCard({ customerId }) {
  const [packages, setPackages] = useState([]);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const all = await Promise.resolve(subscriptionsApi.getGymPtPackages?.());
      setPackages((Array.isArray(all) ? all : []).filter((p) => Number(p.customer_id) === Number(customerId)));
    } catch {
      setPackages([]);
    }
  }, [customerId]);
  useEffect(() => { load(); }, [load]);

  async function logSession(pkg) {
    setBusyId(pkg.id);
    setError('');
    try { await subscriptionsApi.logGymPtSession(pkg.id); await load(); } catch (err) { setError(err.message || 'تعذر تسجيل الحصة'); } finally { setBusyId(null); }
  }

  if (packages.length === 0) return null;
  return (
    <article className="gms-card gms-pt" aria-label="حصص المدرب الخاص">
      <header><h3>حصص المدرب الخاص</h3></header>
      <ul>
        {packages.map((p) => {
          const status = PACKAGE_STATUS[p.status] || { label: p.status, tone: 'muted' };
          const usable = p.status === 'active' || p.status === 'ending';
          return (
            <li key={p.id}>
              <div className="gms-pt__count"><strong>{p.remaining}</strong><span>من {p.sessions_total}</span></div>
              <div className="gms-pt__info">
                <b>مع {p.trainer_name}</b>
                <small>تنتهي {slashDate(p.valid_until)}{p.last_session ? ` · آخر حصة ${slashDate(p.last_session)}` : ''}</small>
              </div>
              <span className={`gms-pill ${status.tone === 'ok' ? 'is-ok' : 'is-warn'}`}>{status.label}</span>
              <button type="button" className="gms-btn" disabled={!usable || busyId === p.id} onClick={() => logSession(p)}>حجز حصة</button>
            </li>
          );
        })}
      </ul>
      {error && <p role="alert" className="gms-empty">{error}</p>}
    </article>
  );
}
