import { useEffect, useState } from 'react';
import { useSettings } from '../../contexts/SettingsContext.jsx';
import { parseAddonCatalog } from '../../utils/cartModifiers.js';

const MAX_ADDONS = 50;

// The add-ons the cashier can put on an item (extra cheese, no onion...).
// Saved in the `sector_addons` setting that onboarding fills first.
export default function AddonsSettingsCard() {
  const { settings, saveSettings } = useSettings();
  const [rows, setRows] = useState([]);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    setRows(parseAddonCatalog(settings.sector_addons).map((a) => ({ name: a.name, price: String(a.price) })));
  }, [settings.sector_addons]);

  const update = (index, field, value) => setRows((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)));

  async function handleSave() {
    const cleaned = rows
      .map((row) => ({ name: row.name.trim().slice(0, 80), price: Number(row.price) || 0, currency: 'EGP' }))
      .filter((row) => row.name);
    if (cleaned.some((row) => row.price < 0)) {
      setFeedback({ type: 'error', text: 'السعر لازم يكون صفر أو أكتر' });
      return;
    }
    if (new Set(cleaned.map((row) => row.name)).size !== cleaned.length) {
      setFeedback({ type: 'error', text: 'فيه إضافتين بنفس الاسم' });
      return;
    }
    setSaving(true);
    const res = await saveSettings({ sector_addons: JSON.stringify(cleaned) });
    setSaving(false);
    setFeedback(res?.success
      ? { type: 'success', text: 'تم حفظ الإضافات' }
      : { type: 'error', text: res?.error || 'تعذر حفظ الإضافات' });
  }

  return (
    <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', padding: '24px', boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}>
      <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#1E293B', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span>➕</span> الإضافات على الأصناف
      </h3>
      <p style={{ color: '#64748B', fontSize: '13px', margin: '0 0 16px 0' }}>
        الكاشير يختارها على أي صنف في السلة، زي «جبنة زيادة» أو «من غير بصل». خلي السعر صفر لو الإضافة ببلاش.
      </p>

      {rows.map((row, index) => (
        <div key={index} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: '10px', marginBottom: '8px' }}>
          <input
            className="form-input"
            value={row.name}
            maxLength={80}
            placeholder="اسم الإضافة"
            aria-label={`اسم الإضافة ${index + 1}`}
            onChange={(e) => update(index, 'name', e.target.value)}
          />
          <input
            className="form-input"
            type="number"
            min="0"
            step="0.5"
            value={row.price}
            placeholder="السعر"
            aria-label={`سعر الإضافة ${index + 1}`}
            onChange={(e) => update(index, 'price', e.target.value)}
          />
          <button type="button" className="secondary-btn" onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))}>
            حذف
          </button>
        </div>
      ))}

      <div style={{ display: 'flex', gap: '10px', marginTop: '12px', flexWrap: 'wrap' }}>
        <button
          type="button"
          className="secondary-btn"
          disabled={rows.length >= MAX_ADDONS}
          onClick={() => setRows((prev) => [...prev, { name: '', price: '0' }])}
        >
          + إضافة جديدة
        </button>
        <button type="button" className="primary-btn" disabled={saving} onClick={handleSave}>
          {saving ? 'جارٍ الحفظ...' : 'حفظ الإضافات'}
        </button>
      </div>
      {feedback && (
        <p role={feedback.type === 'error' ? 'alert' : 'status'} style={{ marginTop: '10px', color: feedback.type === 'error' ? '#DC2626' : '#16A34A' }}>
          {feedback.text}
        </p>
      )}
    </div>
  );
}
