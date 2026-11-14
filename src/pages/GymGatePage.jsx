import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import * as subsApi from '../api/subscriptions.js';
import * as customersApi from '../api/customers.js';
import { MemberPicker } from '../components/gym/GymBits.jsx';
import { Sheet, errText } from '../components/gym/GymDialogs.jsx';
import '../styles/gymTraining.css';
import '../styles/gymGate.css';

const GATE = 'بوابة 1';
const RESET_MS = 8000;
const HOURS = Array.from({ length: 18 }, (_, i) => i + 6); // 6 ص → 11 م

const REASONS = {
  ok: 'الاشتراك سارٍ',
  expiring: 'الاشتراك قارب على الانتهاء',
  low_credits: 'الحصص قاربت على الانتهاء',
  no_subscription: 'لا يوجد اشتراك',
  late_payment: 'مدفوعات متأخرة',
  frozen: 'اشتراك مجمّد',
  depleted: 'الحصص انتهت',
  expired: 'اشتراك منتهي',
  unknown_code: 'كود غير معروف',
};
const BADGE = { allowed: ['success', 'دخل'], warning: ['warning', 'تنبيه'], denied: ['danger', 'مرفوض'] };

const parse = (s) => new Date(String(s).replace(' ', 'T'));
const hourLabel = (h) => `${h % 12 || 12}${h < 12 ? 'ص' : 'م'}`;
const timeLabel = (d) => `${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${d.getHours() < 12 ? 'ص' : 'م'}`;
const memberCode = (id) => `GM-${id}`;

function lastVisitLabel(stamp) {
  if (!stamp) return 'أول زيارة';
  const days = Math.round((new Date().setHours(0, 0, 0, 0) - parse(stamp).setHours(0, 0, 0, 0)) / 86400000);
  if (days <= 0) return 'آخر زيارة اليوم';
  if (days === 1) return 'آخر زيارة أمس';
  return `آخر زيارة منذ ${days} يوم`;
}

function useQr(text, size = 220) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let alive = true;
    if (!text) { setUrl(''); return undefined; }
    QRCode.toDataURL(text, { margin: 1, width: size, errorCorrectionLevel: 'M' })
      .then((u) => alive && setUrl(u))
      .catch(() => alive && setUrl(''));
    return () => { alive = false; };
  }, [text, size]);
  return url;
}

function Glyph({ tone }) {
  const d = tone === 'ok' ? 'm7 12.5 3.5 3.5L17 9' : tone === 'deny' ? 'M8 8l8 8M16 8l-8 8' : tone === 'warn' ? 'M12 7v6M12 16.5v.5' : 'M4 8V5h3M17 5h3v3M20 16v3h-3M7 19H4v-3M4 12h16';
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} pathLength="1" className="gate-glyph__path" />
    </svg>
  );
}

function MemberCard({ scan }) {
  const qr = useQr(scan.member ? memberCode(scan.member.id) : '', 160);
  if (!scan.member) {
    return (
      <div className="gate-card">
        <div className="gate-card__avatar">?</div>
        <h3>كود غير مسجل</h3>
        <p className="gate-card__code">{scan.code}</p>
      </div>
    );
  }
  return (
    <div className="gate-card">
      <div className="gate-card__avatar">{scan.member.name?.charAt(0)}</div>
      <h3>{scan.member.name}</h3>
      <p className="gate-card__code">كود {scan.member.code}</p>
      {scan.subscription && <span className="gate-card__pill">{scan.subscription.package}</span>}
      {scan.result !== 'denied' && <p className="gate-card__meta">الزيارة رقم {scan.visitNumber} هذا الشهر</p>}
      {qr && <img className="gate-card__qr" src={qr} alt={`QR ${scan.member.code}`} />}
    </div>
  );
}

function heroText(scan) {
  const sub = scan.subscription;
  const sessions = sub?.type === 'session_based';
  if (scan.result === 'denied') {
    return { title: 'غير مسموح بالدخول', line: REASONS[scan.reason] || 'مرفوض', detail: sub ? `آخر اشتراك: ${sub.package}` : 'راجع الاستقبال' };
  }
  const left = sessions ? `متبقي ${sub.remainingCredits} حصة` : `متبقي ${scan.daysLeft} يوم`;
  const detail = `${left} · ${lastVisitLabel(scan.lastVisit)} · لا مديونيات`;
  if (scan.result === 'warning') {
    return { title: 'مسموح بالدخول', line: `${REASONS[scan.reason]} — جدّد الآن`, detail };
  }
  return { title: 'مسموح بالدخول', line: `${REASONS.ok} — ${sub.package}`, detail };
}

function QrDialog({ members, onClose }) {
  const [customerId, setCustomerId] = useState(null);
  const member = members.find((m) => m.id === customerId);
  const code = member ? memberCode(member.id) : '';
  const qr = useQr(code, 480);

  const print = () => {
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;inset-inline-start:-9999px;inline-size:0;block-size:0;border:0';
    document.body.appendChild(frame);
    const doc = frame.contentDocument;
    doc.open();
    doc.write(`<html dir="rtl"><body style="margin:0;display:grid;place-items:center;min-height:100vh;font-family:sans-serif;text-align:center">
      <div><img src="${qr}" style="width:60mm;height:60mm"/><h2 style="margin:8px 0 2px"></h2><p style="margin:0">${code}</p></div></body></html>`);
    doc.close();
    doc.querySelector('h2').textContent = member.name; // textContent: names are user data
    frame.contentWindow.onafterprint = () => frame.remove();
    setTimeout(() => frame.contentWindow.print(), 50);
  };

  return (
    <Sheet
      title="بطاقة QR للعضو"
      subtitle="كل عضو له كود خاص يمسحه على البوابة"
      onClose={onClose}
      footer={(close) => (
        <>
          <button type="button" className="gym-btn" onClick={close}>إغلاق</button>
          <a className={`gym-btn${qr ? '' : ' is-disabled'}`} href={qr || undefined} download={`${code || 'qr'}.png`}>تحميل الصورة</a>
          <button type="button" className="gym-btn gym-btn--primary" disabled={!qr} onClick={print}>طباعة البطاقة</button>
        </>
      )}
    >
      <div className="gate-qr-dialog">
        <MemberPicker members={members} value={customerId} onChange={setCustomerId} autoFocus />
        <div className="gate-qr-preview" key={code}>
          {qr ? (
            <>
              <img src={qr} alt={`QR ${code}`} />
              <strong>{member.name}</strong>
              <span className="gym-muted">{code}</span>
            </>
          ) : <p className="gym-muted">اختر عضوًا لعرض الكود الخاص به</p>}
        </div>
      </div>
    </Sheet>
  );
}

export default function GymGatePage({ onNavigate }) {
  const [scan, setScan] = useState(null);
  const [overview, setOverview] = useState({ recent: [], hourly: Array(24).fill(0), inside: 0, capacity: 60, nowHour: new Date().getHours() });
  const [now, setNow] = useState(() => new Date());
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [members, setMembers] = useState([]);
  const inputRef = useRef(null);
  const resetTimer = useRef(null);

  const loadOverview = useCallback(() => subsApi.getGymGateOverview().then(setOverview).catch((e) => setError(`تعذر تحميل سجل الدخول: ${errText(e)}`)), []);

  useEffect(() => {
    loadOverview();
    const poll = setInterval(loadOverview, 30000);
    const clock = setInterval(() => setNow(new Date()), 15000);
    return () => { clearInterval(poll); clearInterval(clock); clearTimeout(resetTimer.current); };
  }, [loadOverview]);

  useEffect(() => {
    if (!qrOpen || members.length) return;
    customersApi.getAllCustomersWithStats()
      .then((rows) => setMembers((rows || []).filter((c) => c.is_active !== 0)))
      .catch(() => setMembers([]));
  }, [qrOpen, members.length]);

  // USB QR readers type like a keyboard: pull stray keystrokes into the scan box.
  useEffect(() => {
    const onKey = (e) => {
      if (qrOpen || e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return;
      const el = document.activeElement;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      inputRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [qrOpen]);

  const reset = useCallback(() => {
    clearTimeout(resetTimer.current);
    setScan(null);
    inputRef.current?.focus();
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    const text = code.trim();
    if (!text || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await subsApi.checkGymEntry(text, GATE);
      setScan({ ...result, code: text });
      setCode('');
      clearTimeout(resetTimer.current);
      resetTimer.current = setTimeout(reset, RESET_MS);
      loadOverview();
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  };

  const registerSession = async () => {
    clearTimeout(resetTimer.current);
    try {
      const res = await subsApi.registerGymSession(scan.subscription.id);
      setScan((s) => ({ ...s, subscription: { ...s.subscription, remainingCredits: res.remainingCredits }, registered: true }));
      resetTimer.current = setTimeout(reset, RESET_MS);
    } catch (err) {
      setError(errText(err));
    }
  };

  const tone = !scan ? 'idle' : scan.result === 'allowed' ? 'ok' : scan.result === 'warning' ? 'warn' : 'deny';
  const text = scan && heroText(scan);
  const bars = useMemo(() => {
    const max = Math.max(1, ...HOURS.map((h) => overview.hourly[h]));
    const peak = HOURS.reduce((p, h) => (overview.hourly[h] > overview.hourly[p] ? h : p), HOURS[0]);
    return { max, peak, hasData: HOURS.some((h) => overview.hourly[h] > 0) };
  }, [overview.hourly]);
  // A repeated swipe must not offer to deduct a second session for the same entry.
  const canSession = scan?.result !== 'denied' && scan?.subscription?.type === 'session_based' && !scan.registered && !scan.repeat;

  return (
    <div className="legal-ds gym-page gate-page" dir="rtl">
      <div className="gym-ambient" aria-hidden="true"><i /><i /><i /></div>

      <header className="gym-top gate-top">
        <div className="gym-top__title">
          <span className="gym-logo" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M4 21V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v16M9 12h.01M3 21h18" /></svg>
          </span>
          <h1>بوابة الاستقبال</h1>
          <span className="gym-muted">{GATE}</span>
        </div>
        <div className="gate-top__end">
          <button type="button" className="gym-btn gym-btn--sm" onClick={() => setQrOpen(true)}>بطاقات QR</button>
          <span className={`gate-reader${ready ? ' is-on' : ''}`}><i aria-hidden="true" />{ready ? 'القارئ جاهز' : 'اضغط للمسح'}</span>
          <span className="gym-muted gate-date">{now.toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'numeric', year: 'numeric' })}</span>
          <strong className="gate-clock">{timeLabel(now)}</strong>
        </div>
      </header>

      {error && <div className="gate-error" role="alert">{error}</div>}

      <div className="gate-layout">
        <section className={`gate-hero gate-hero--${tone}`} aria-live="polite">
          <div className="gate-hero__bg" aria-hidden="true"><i className="t-idle" /><i className="t-ok" /><i className="t-warn" /><i className="t-deny" /></div>

          <div className="gate-hero__main" key={scan?.id ?? 'idle'}>
            <div className="gate-glyph">
              <span className="gate-glyph__ring" /><span className="gate-glyph__ring" />
              <Glyph tone={tone} />
            </div>
            <div className="gate-hero__text">
              {scan ? (
                <>
                  <span className="gate-hero__chip">{GATE} · كود QR · {timeLabel(parse(scan.at))}{scan.repeat ? ' · مسجّل بالفعل' : ''}</span>
                  <h2>{text.title}</h2>
                  <p className="gate-hero__line">{text.line}</p>
                  <p className="gate-hero__detail">{text.detail}</p>
                </>
              ) : (
                <>
                  <span className="gate-hero__chip">في انتظار المسح</span>
                  <h2>امسح كود العضو</h2>
                  <p className="gate-hero__line">قرّب بطاقة الـ QR من القارئ أو اكتب الكود</p>
                </>
              )}
            </div>
            {scan && <MemberCard scan={scan} />}
          </div>

          <footer className="gate-hero__foot">
            {scan ? (
              <>
                {canSession && <button type="button" className="gate-btn" onClick={registerSession}>تسجيل الحصة</button>}
                {scan.registered && <span className="gate-hero__done">تم خصم حصة · متبقي {scan.subscription.remainingCredits}</span>}
                {scan.member && onNavigate && <button type="button" className="gate-btn" onClick={() => onNavigate('subscriptions')}>ملف العضو</button>}
                <span className="gate-timer"><span>العودة للمسح تلقائيًا</span><i key={`${scan.id}-${scan.registered ? 1 : 0}`} style={{ '--reset': `${RESET_MS}ms` }} /></span>
                <button type="button" className="gate-btn gate-btn--solid" onClick={reset}>مسح جديد</button>
              </>
            ) : null}
            <form className={`gate-scan${scan ? ' is-hidden' : ''}`} onSubmit={submit}>
              <input
                ref={inputRef}
                className="gate-scan__input"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onFocus={() => setReady(true)}
                onBlur={() => setReady(false)}
                placeholder="GM-1042 أو رقم الموبايل"
                aria-label="كود العضو"
                autoFocus
                autoComplete="off"
              />
              <button type="submit" className="gate-btn gate-btn--solid" disabled={busy || !code.trim()}>تحقق</button>
            </form>
          </footer>
        </section>

        <aside className="gate-side">
          <section className="gate-panel gate-recent">
            <header><h3>آخر الدخول</h3><span className="gate-live"><i aria-hidden="true" />مباشر</span></header>
            <ul>
              {overview.recent.map((r) => {
                const [kind, label] = BADGE[r.result];
                const sub = r.result === 'denied' ? REASONS[r.reason] : [r.package_name, r.gate].filter(Boolean).join(' · ');
                return (
                  <li key={r.id}>
                    <span className="gym-avatar gym-avatar--sm">{r.customer_name?.charAt(0) || '?'}</span>
                    <div className="gate-recent__who">
                      <strong>{r.customer_name || r.code_text}</strong>
                      <small>{sub}</small>
                    </div>
                    <div className="gate-recent__end">
                      <time>{timeLabel(parse(r.created_at))}</time>
                      <span className={`gym-badge gym-badge--${kind}`}>{label}</span>
                    </div>
                  </li>
                );
              })}
              {!overview.recent.length && <li className="gym-muted gate-empty">لا يوجد دخول اليوم بعد</li>}
            </ul>
          </section>

          <section className="gate-panel gate-crowd">
            <header>
              <div><h3>الزحام بالساعة</h3><p className="gym-muted">متواجد الآن <b>{overview.inside}</b> من سعة {overview.capacity}</p></div>
              {bars.hasData && <span className="gym-badge gym-badge--warning">ذروة {hourLabel(bars.peak)}</span>}
            </header>
            <div className="gate-bars" role="img" aria-label="عدد مرات الدخول في كل ساعة اليوم">
              {HOURS.map((h) => (
                <div key={h} className={`gate-bar${h === overview.nowHour ? ' is-now' : ''}${h === bars.peak && bars.hasData ? ' is-peak' : ''}`}>
                  <i style={{ '--h': overview.hourly[h] / bars.max }} title={`${overview.hourly[h]} دخول`} />
                  <small>{hourLabel(h)}</small>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>

      {qrOpen && <QrDialog members={members} onClose={() => { setQrOpen(false); inputRef.current?.focus(); }} />}
    </div>
  );
}
