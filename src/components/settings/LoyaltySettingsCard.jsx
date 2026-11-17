import { useEffect, useState } from 'react';
import { useSettings } from '../../contexts/SettingsContext.jsx';

// Loyalty points: off until turned on here. Customers earn points on every paid sale and spend them as a discount
// at the till. Saved in `loyalty_enabled`, `loyalty_earn_per_100`, `loyalty_redeem_value_per_100`, `loyalty_min_redeem`.
export default function LoyaltySettingsCard() {
  const { settings, saveSettings } = useSettings();
  const [enabled, setEnabled] = useState(false);
  const [earn, setEarn] = useState('10');
  const [redeem, setRedeem] = useState('10');
  const [min, setMin] = useState('100');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    setEnabled(settings.loyalty_enabled === '1');
    setEarn(String(settings.loyalty_earn_per_100 ?? 10));
    setRedeem(String(settings.loyalty_redeem_value_per_100 ?? 10));
    setMin(String(settings.loyalty_min_redeem ?? 100));
  }, [settings.loyalty_enabled, settings.loyalty_earn_per_100, settings.loyalty_redeem_value_per_100, settings.loyalty_min_redeem]);

  async function handleSave() {
    const e = Number(earn);
    const r = Number(redeem);
    const m = Number(min);
    if (!Number.isFinite(e) || e < 0 || e > 1000) return setFeedback({ type: 'error', text: 'نقاط الكسب غير صالحة' });
    if (!Number.isFinite(r) || r <= 0 || r > 100000) return setFeedback({ type: 'error', text: 'قيمة النقاط لازم تكون أكبر من صفر' });
    if (!Number.isInteger(m) || m < 1) return setFeedback({ type: 'error', text: 'أقل عدد نقاط للاستبدال لازم يكون رقم صحيح' });
    setSaving(true);
    const res = await saveSettings({
      loyalty_enabled: enabled ? '1' : '0',
      loyalty_earn_per_100: String(e),
      loyalty_redeem_value_per_100: String(r),
      loyalty_min_redeem: String(m),
    });
    setSaving(false);
    setFeedback(res?.success ? { type: 'success', text: 'تم حفظ إعدادات نقاط الولاء' } : { type: 'error', text: res?.error || 'تعذر حفظ الإعدادات' });
  }

  return (
    <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', padding: '24px', boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}>
      <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#1E293B', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span>⭐</span> نقاط الولاء
      </h3>
      <p style={{ color: '#64748B', fontSize: '13px', margin: '0 0 16px 0' }}>
        العميل المسجّل بيكسب نقاط على كل فاتورة مدفوعة، وبيستبدلها بخصم من الكاشير. الفواتير الآجلة ما بتكسبش نقاط.
      </p>
      <label style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '12px', fontWeight: 700 }}>
        <input type="checkbox" checked={enabled} onChange={(ev) => setEnabled(ev.target.checked)} /> تفعيل نقاط الولاء
      </label>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '12px', opacity: enabled ? 1 : 0.55 }}>
        <label>
          <span className="form-label">نقاط لكل 100 ج.م</span>
          <input className="form-input" type="number" min="0" step="1" value={earn} onChange={(ev) => setEarn(ev.target.value)} />
        </label>
        <label>
          <span className="form-label">قيمة كل 100 نقطة (ج.م)</span>
          <input className="form-input" type="number" min="1" step="1" value={redeem} onChange={(ev) => setRedeem(ev.target.value)} />
        </label>
        <label>
          <span className="form-label">أقل استبدال (نقطة)</span>
          <input className="form-input" type="number" min="1" step="1" value={min} onChange={(ev) => setMin(ev.target.value)} />
        </label>
      </div>
      <button type="button" className="primary-btn" disabled={saving} onClick={handleSave}>{saving ? 'جاري الحفظ...' : 'حفظ'}</button>
      {feedback && <p role="status" style={{ marginTop: '10px', color: feedback.type === 'error' ? '#B3261E' : '#15803D', fontWeight: 700 }}>{feedback.text}</p>}
    </div>
  );
}
