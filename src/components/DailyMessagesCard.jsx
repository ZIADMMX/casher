import { useCallback, useEffect, useState } from 'react';
import * as crmApi from '../api/crm.js';
import { openWhatsapp } from '../utils/whatsapp.js';
import CRMModal from './crm/CRMModal.jsx';
import { CallIcon, CheckIcon, PencilIcon } from './icons/PosIcons.jsx';
import '../styles/crm.css';
import '../styles/crm-overview.css';
import '../styles/today.css';

// Same kinds as electron/services/dailyMessages.service.js; the words in {} are filled per row.
const TEMPLATE_FIELDS = [
  { kind: 'appointment', label: 'تذكير بموعد بكرة', vars: '{name} {service} {time} {date}' },
  { kind: 'stale_deal', label: 'صفقة واقفة', vars: '{name} {deal}' },
  { kind: 'lead_followup', label: 'متابعة عميل محتمل', vars: '{name}' },
  { kind: 'subscription_expiring', label: 'اشتراك قرب يخلص', vars: '{name} {package} {date}' },
];

const num = (value) => Number(value || 0).toLocaleString('ar-EG');

function TemplatesModal({ onClose }) {
  const [templates, setTemplates] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    crmApi.getDailyMessageTemplates().then(setTemplates).catch((e) => setError(e.message));
  }, []);

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      await crmApi.saveDailyMessageTemplates(templates);
      onClose(true);
    } catch (e) {
      setError(e.message || 'تعذر حفظ القوالب');
      setSaving(false);
    }
  };

  return (
    <CRMModal
      icon={PencilIcon}
      title="قوالب رسائل اليوم"
      subtitle="الكلمات اللي بين {} بتتبدل تلقائياً باسم العميل والموعد. سيب القالب فاضي يرجع للأصلي."
      onClose={() => onClose(false)}
    >
      <form onSubmit={save}>
        <div className="crm-modal-body">
          {error && <div className="crm-error-banner" role="alert">{error}</div>}
          {!templates ? <p className="crm-pl-note">جارٍ التحميل...</p> : (
            <div className="crm-form-grid">
              {TEMPLATE_FIELDS.map(({ kind, label, vars }) => (
                <div key={kind} className="crm-form-group full-width">
                  <label className="crm-form-label" htmlFor={`tpl-${kind}`}>{label}</label>
                  <textarea
                    id={`tpl-${kind}`}
                    className="crm-form-textarea"
                    rows="2"
                    maxLength={1000}
                    value={templates[kind] || ''}
                    onChange={(e) => setTemplates({ ...templates, [kind]: e.target.value })}
                  />
                  <small className="crm-form-hint" dir="ltr">{vars}</small>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="crm-modal-footer">
          <button type="button" className="secondary-btn" onClick={() => onClose(false)}>إلغاء</button>
          <button type="submit" className="primary-btn" disabled={!templates || saving}>حفظ القوالب</button>
        </div>
      </form>
    </CRMModal>
  );
}

/**
 * "Today's messages": the follow-ups due today. Send opens WhatsApp with the text typed in
 * (free wa.me link); the row is then marked sent and logged on the customer.
 */
function DailyMessagesCard() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null);
  const [editing, setEditing] = useState(false);

  const load = useCallback(() => {
    crmApi.getDailyMessages()
      .then((list) => { setItems(Array.isArray(list) ? list : []); setError(''); })
      .catch((e) => setError(e.message || 'تعذر تحميل رسائل اليوم'));
  }, []);

  useEffect(() => { if (crmApi.getDailyMessages.isAvailable()) load(); }, [load]);

  if (!crmApi.getDailyMessages.isAvailable()) return null;

  const send = async (item) => {
    openWhatsapp(item.phone, item.text);
    setBusy(item.key);
    try {
      await crmApi.markDailyMessageSent(item.kind, item.refId);
      setItems((list) => list.map((row) => (row.key === item.key ? { ...row, sent: true } : row)));
    } catch (e) {
      setError(e.message || 'تعذر تسجيل الرسالة');
    } finally {
      setBusy(null);
    }
  };

  const pending = (items || []).filter((item) => !item.sent).length;

  return (
    <div className="today-white-card daily-messages-card">
      <div className="today-white-card-header">
        <h3 className="card-title-with-icon">
          <span className="card-header-icon"><CallIcon size={18} /></span>
          <span>رسائل اليوم</span>
        </h3>
        <div className="daily-messages-head-actions">
          <button type="button" className="btn-sm-outline" onClick={() => setEditing(true)}>تعديل القوالب</button>
          <span className={`card-header-pill ${pending ? 'pill-orange' : ''}`}>{num(pending)}</span>
        </div>
      </div>

      {error && <p className="daily-messages-error" role="alert">{error}</p>}

      {items === null && !error ? (
        <p className="empty-state-subtext">جارٍ تجهيز رسائل اليوم...</p>
      ) : items?.length === 0 ? (
        <div className="green-status-banner">
          <span className="green-check-icon"><CheckIcon size={18} /></span>
          <span>مفيش رسائل متابعة مطلوبة النهارده.</span>
        </div>
      ) : (
        <ul className="daily-messages-list">
          {(items || []).map((item) => (
            <li key={item.key} className={`daily-messages-row ${item.sent ? 'is-sent' : ''}`}>
              <div className="daily-messages-text">
                <strong>{item.name}</strong>
                <span className="daily-messages-reason">{item.label} · {item.reason}</span>
                <p className="daily-messages-preview">{item.text}</p>
              </div>
              {item.sent ? (
                <span className="daily-messages-sent"><CheckIcon size={16} /> اتبعتت</span>
              ) : (
                <button
                  type="button"
                  className="btn-today-orange daily-messages-send"
                  disabled={busy === item.key}
                  onClick={() => send(item)}
                >
                  إرسال واتساب
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <TemplatesModal onClose={(saved) => { setEditing(false); if (saved) load(); }} />
      )}
    </div>
  );
}

export default DailyMessagesCard;
