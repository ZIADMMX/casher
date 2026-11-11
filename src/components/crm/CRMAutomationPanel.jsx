import { BellIcon } from '../icons/PosIcons.jsx';
import { num } from './crmFormat.js';

export const DEFAULT_STALE_RULE = { days: 7, is_enabled: true };

const STEPS = [
  'النظام بيفحص الصفقات المفتوحة مرة كل يوم.',
  'بيقارن آخر تحريك للصفقة بين المراحل بالمدة اللي حددتها.',
  'بيبعت تنبيه واحد لكل صفقة واقفة، ويتصفّر لما تحرّكها أو تغيّر القاعدة.',
];

// Always available and free; shown so the owner knows how the alert reaches people.
const FREE_CHANNELS = [
  ['واتساب بضغطة واحدة', 'من كارت الصفقة أو العميل المحتمل: زرار واتساب بيفتح المحادثة والرسالة مكتوبة، وإنت بس تدوس إرسال. مجاني ومن غير ربط.'],
];

function CRMAutomationPanel({ rule, onChange, onSubmit }) {
  const days = Number(rule.days) || 0;
  return (
    <div className="crm-ds crm-au">
      <form className="crm-ov-card crm-au-main" onSubmit={onSubmit}>
        <header className="crm-au-head">
          <h2>قاعدة المتابعة والتذكير الآلي</h2>
          <p>إرسال تنبيه للمسؤول لما صفقة تقف في مرحلتها من غير تحريك.</p>
        </header>

        <div className="crm-au-section">
          <label className="crm-au-label" htmlFor="crm-au-days">تنبيه عند توقف الصفقة أكثر من</label>
          <div className="crm-au-days">
            <input
              id="crm-au-days"
              type="number"
              min="1"
              max="365"
              step="1"
              required
              value={rule.days}
              onChange={(event) => onChange({ ...rule, days: event.target.value })}
            />
            <span>يوم في نفس المرحلة</span>
          </div>
          <p className="crm-au-hint">المدى المقترح من ٥ إلى ١٠ أيام حسب طول دورة البيع عندك.</p>
        </div>

        <fieldset className="crm-au-section crm-au-channels">
          <legend className="crm-au-label">قنوات التنبيه</legend>
          <label className="crm-au-channel">
            <input
              type="checkbox"
              checked={rule.is_enabled}
              onChange={(event) => onChange({ ...rule, is_enabled: event.target.checked })}
            />
            <span>
              <strong>إشعار داخل النظام + إشعار ويندوز</strong>
              <small>بيظهر في جرس الإشعارات، وكمان كإشعار على الشاشة حتى لو البرنامج متصغّر.</small>
            </span>
            <span className={`crm-ct-badge crm-ct-badge--${rule.is_enabled ? 'success' : 'muted'}`}>
              {rule.is_enabled ? 'مفعّل' : 'متوقف'}
            </span>
          </label>
          {FREE_CHANNELS.map(([title, hint]) => (
            <div key={title} className="crm-au-channel is-info">
              <span className="crm-au-channel-dot" aria-hidden="true" />
              <span>
                <strong>{title}</strong>
                <small>{hint}</small>
              </span>
              <span className="crm-ct-badge crm-ct-badge--success">متاح دايماً</span>
            </div>
          ))}
        </fieldset>

        <div className="crm-au-section">
          <span className="crm-au-label">مين بيستلم التنبيه</span>
          <p className="crm-au-recipient">مسؤول الصفقة. ولو الصفقة مالهاش مسؤول، التنبيه بيظهر كإشعار عام.</p>
        </div>

        <footer className="crm-au-foot">
          <button type="submit" className="crm-ov-btn crm-ov-btn--primary">حفظ إعدادات الأتمتة</button>
          <button type="button" className="crm-ov-btn" onClick={() => onChange(DEFAULT_STALE_RULE)}>استرجاع الافتراضي</button>
        </footer>
      </form>

      <aside className="crm-au-side">
        <section className="crm-ov-card crm-au-card">
          <h2>آلية العمل</h2>
          <ol className="crm-au-steps">
            {STEPS.map((step, index) => (
              <li key={step}><span className="crm-ov-step-num">{num(index + 1)}</span>{step}</li>
            ))}
          </ol>
        </section>

        <section className="crm-ov-card crm-au-card">
          <h2>شكل التنبيه</h2>
          <p className="crm-au-hint">معاينة بالإعدادات الحالية</p>
          <div className={`crm-au-preview ${rule.is_enabled ? '' : 'is-off'}`}>
            <span className="crm-ov-chip crm-ov-chip--warning"><BellIcon size={18} /></span>
            <div>
              <strong>صفقة تحتاج إلى متابعة</strong>
              <p>
                {rule.is_enabled
                  // Same wording the reminder job sends (crm.service checkDueReminders).
                  ? `الصفقة "تجديد عقد التوريد" مع فندق المنارة متوقفة منذ ${days} أيام.`
                  : 'التنبيه متوقف، ومش هيتبعت لحد ما تفعّل الإشعار داخل النظام.'}
              </p>
            </div>
          </div>
        </section>
      </aside>
    </div>
  );
}

export default CRMAutomationPanel;
