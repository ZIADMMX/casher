import { useCallback, useEffect, useState } from 'react';
import * as webhooksApi from '../api/webhooks.js';
import '../styles/webhooks.css';

const EVENT_LABELS = {
  'sale.created': 'فاتورة بيع جديدة',
  'return.processed': 'مرتجع جديد',
  'customer.created': 'عميل جديد',
};

const SHEET_MS = 260;
const EMPTY_FORM = { name: '', url: '', events: ['sale.created'], is_active: true };

function WebhooksPage() {
  const [events, setEvents] = useState([]);
  const [hooks, setHooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sheet, setSheet] = useState(null); // { form, id } while open
  const [sheetClosing, setSheetClosing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [testing, setTesting] = useState(null);
  const [toast, setToast] = useState(null);

  const load = useCallback(async () => {
    try {
      const result = await webhooksApi.getWebhooks();
      setEvents(result.events);
      setHooks(result.webhooks);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  function openSheet(hook) {
    setSheetClosing(false);
    setSheet(hook
      ? { id: hook.id, form: { name: hook.name, url: hook.url, events: hook.events, is_active: hook.is_active } }
      : { id: null, form: EMPTY_FORM });
  }

  // Keep the sheet mounted until its slide-up finishes, like a macOS sheet.
  function closeSheet() {
    setSheetClosing(true);
    setTimeout(() => { setSheet(null); setSheetClosing(false); }, SHEET_MS);
  }

  useEffect(() => {
    if (!sheet) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') closeSheet(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sheet]);

  function setField(key, value) {
    setSheet((s) => ({ ...s, form: { ...s.form, [key]: value } }));
  }

  function toggleEvent(key) {
    const list = sheet.form.events;
    setField('events', list.includes(key) ? list.filter((e) => e !== key) : [...list, key]);
  }

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    try {
      if (sheet.id) await webhooksApi.updateWebhook({ id: sheet.id, ...sheet.form });
      else await webhooksApi.createWebhook(sheet.form);
      await load();
      closeSheet();
      setToast({ tone: 'ok', text: 'تم الحفظ' });
    } catch (err) {
      setToast({ tone: 'err', text: err.message });
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(hook) {
    try {
      await webhooksApi.updateWebhook({ id: hook.id, name: hook.name, url: hook.url, events: hook.events, is_active: !hook.is_active });
      await load();
    } catch (err) {
      setToast({ tone: 'err', text: err.message });
    }
  }

  async function remove(hook) {
    if (!window.confirm(`حذف الويب هوك "${hook.name}"؟`)) return;
    setRemoving(hook.id);
    try {
      await webhooksApi.deleteWebhook(hook.id);
      // Let the card finish its minimize animation before it leaves the list.
      setTimeout(() => { setHooks((list) => list.filter((h) => h.id !== hook.id)); setRemoving(null); }, 380);
    } catch (err) {
      setRemoving(null);
      setToast({ tone: 'err', text: err.message });
    }
  }

  async function test(hook) {
    setTesting(hook.id);
    try {
      const result = await webhooksApi.testWebhook(hook.id);
      setToast(result.ok
        ? { tone: 'ok', text: `وصل الاختبار (HTTP ${result.status})` }
        : { tone: 'err', text: result.error || `فشل الاختبار (HTTP ${result.status})` });
      await load();
    } catch (err) {
      setToast({ tone: 'err', text: err.message });
    } finally {
      setTesting(null);
    }
  }

  async function copySecret(secret) {
    try {
      await navigator.clipboard.writeText(secret);
      setToast({ tone: 'ok', text: 'تم نسخ المفتاح السري' });
    } catch {
      setToast({ tone: 'err', text: 'تعذر النسخ' });
    }
  }

  return (
    <div className="wh-page" dir="rtl">
      <header className="wh-header">
        <div>
          <h1>Webhooks API</h1>
          <p>ابعت إشعار فوري لأي سيستم خارجي (متجر، محاسبة، واتساب بوت) عند كل بيع أو مرتجع أو عميل جديد.</p>
        </div>
        <button type="button" className="wh-btn wh-btn-primary" onClick={() => openSheet(null)}>+ ويب هوك جديد</button>
      </header>

      {error && <div className="wh-error" role="alert">{error}</div>}

      {loading ? (
        <div className="wh-empty">جاري التحميل…</div>
      ) : hooks.length === 0 ? (
        <div className="wh-empty wh-rise">
          <strong>مفيش ويب هوكس لسه</strong>
          <span>أضف رابط وهنبعتله POST موقّع بـ HMAC-SHA256 في الهيدر <code>X-Fox-Signature</code>.</span>
        </div>
      ) : (
        <ul className="wh-list">
          {hooks.map((hook, i) => (
            <li
              key={hook.id}
              className={`wh-card wh-rise ${removing === hook.id ? 'is-removing' : ''} ${hook.is_active ? '' : 'is-off'}`}
              style={{ '--i': i }}
            >
              <div className="wh-card-head">
                <span className={`wh-dot ${hook.last_status && hook.last_status < 300 ? 'ok' : hook.last_delivery_at ? 'err' : ''}`} aria-hidden="true" />
                <h2>{hook.name}</h2>
                <label className="wh-switch" title={hook.is_active ? 'مفعّل' : 'متوقف'}>
                  <input type="checkbox" checked={hook.is_active} onChange={() => toggleActive(hook)} aria-label={`تفعيل ${hook.name}`} />
                  <span />
                </label>
              </div>
              <code className="wh-url" dir="ltr">{hook.url}</code>
              <div className="wh-tags">
                {hook.events.map((e) => <span key={e} className="wh-tag">{EVENT_LABELS[e] || e}</span>)}
              </div>
              <div className="wh-meta">
                {hook.last_delivery_at
                  ? <>آخر إرسال: {hook.last_delivery_at} — {hook.last_error || `HTTP ${hook.last_status}`}</>
                  : 'لم يُرسل بعد'}
              </div>
              <div className="wh-actions">
                <button type="button" className="wh-btn" onClick={() => test(hook)} disabled={testing === hook.id}>
                  {testing === hook.id ? 'بيختبر…' : 'اختبار'}
                </button>
                <button type="button" className="wh-btn" onClick={() => copySecret(hook.secret)}>نسخ المفتاح</button>
                <button type="button" className="wh-btn" onClick={() => openSheet(hook)}>تعديل</button>
                <button type="button" className="wh-btn wh-btn-danger" onClick={() => remove(hook)}>حذف</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {sheet && (
        <div className={`wh-backdrop ${sheetClosing ? 'is-closing' : ''}`} onMouseDown={(e) => { if (e.target === e.currentTarget) closeSheet(); }}>
          <form className="wh-sheet" onSubmit={save} role="dialog" aria-modal="true" aria-labelledby="wh-sheet-title">
            <h2 id="wh-sheet-title">{sheet.id ? 'تعديل ويب هوك' : 'ويب هوك جديد'}</h2>
            <label className="wh-field">
              <span>الاسم</span>
              <input autoFocus value={sheet.form.name} onChange={(e) => setField('name', e.target.value)} placeholder="مثلاً: متجر Shopify" required />
            </label>
            <label className="wh-field">
              <span>رابط الاستقبال (URL)</span>
              <input dir="ltr" type="url" value={sheet.form.url} onChange={(e) => setField('url', e.target.value)} placeholder="https://example.com/fox-webhook" required />
            </label>
            <fieldset className="wh-field">
              <legend>الأحداث</legend>
              {events.map((key) => (
                <label key={key} className="wh-check">
                  <input type="checkbox" checked={sheet.form.events.includes(key)} onChange={() => toggleEvent(key)} />
                  <span>{EVENT_LABELS[key] || key}</span>
                  <code dir="ltr">{key}</code>
                </label>
              ))}
            </fieldset>
            <div className="wh-sheet-actions">
              <button type="button" className="wh-btn" onClick={closeSheet}>إلغاء</button>
              <button type="submit" className="wh-btn wh-btn-primary" disabled={saving}>{saving ? 'بيحفظ…' : 'حفظ'}</button>
            </div>
          </form>
        </div>
      )}

      {toast && <div key={toast.text} className={`wh-toast ${toast.tone}`} role="status">{toast.text}</div>}
    </div>
  );
}

export default WebhooksPage;
