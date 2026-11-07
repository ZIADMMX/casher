import { useEffect, useState } from 'react';
import { useSettings } from '../../contexts/SettingsContext.jsx';
import * as printingApi from '../../api/printing.js';
import * as productsApi from '../../api/products.js';
import { parsePrepStations } from '../../utils/prepStations.js';

const MAX_STATIONS = 20;

// Kitchen printing for restaurants: the main kitchen printer and prep stations
// (grill, bar, desserts...). Each station gets the categories it prepares and,
// optionally, its own printer. Saved in `kitchen_printer_name` and `prep_stations`.
export default function RestaurantSettingsCard() {
  const { settings, saveSettings } = useSettings();
  const [kitchenPrinter, setKitchenPrinter] = useState('');
  const [stations, setStations] = useState([]);
  const [printers, setPrinters] = useState([]);
  const [categories, setCategories] = useState([]);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    setKitchenPrinter(settings.kitchen_printer_name || '');
    setStations(parsePrepStations(settings.prep_stations));
  }, [settings.kitchen_printer_name, settings.prep_stations]);

  useEffect(() => {
    Promise.resolve(printingApi.getPrinters.ifAvailable())
      .then((list) => setPrinters(Array.isArray(list) ? list.map((p) => p.name) : [])).catch(() => {});
    Promise.resolve(productsApi.getAllCategories.ifAvailable())
      .then((list) => setCategories(Array.isArray(list) ? list : [])).catch(() => {});
  }, []);

  const update = (index, patch) => setStations((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  const toggleCategory = (index, categoryId) => setStations((prev) => prev.map((s, i) => {
    if (i === index) {
      const has = s.categoryIds.includes(categoryId);
      return { ...s, categoryIds: has ? s.categoryIds.filter((id) => id !== categoryId) : [...s.categoryIds, categoryId] };
    }
    // A category is prepared at one station only.
    return { ...s, categoryIds: s.categoryIds.filter((id) => id !== categoryId) };
  }));

  async function handleSave() {
    const cleaned = stations.map((s) => ({ ...s, name: s.name.trim().slice(0, 40) })).filter((s) => s.name);
    if (new Set(cleaned.map((s) => s.name)).size !== cleaned.length) {
      setFeedback({ type: 'error', text: 'فيه محطتين بنفس الاسم' });
      return;
    }
    setSaving(true);
    const res = await saveSettings({ kitchen_printer_name: kitchenPrinter, prep_stations: JSON.stringify(cleaned) });
    setSaving(false);
    setFeedback(res?.success
      ? { type: 'success', text: 'تم حفظ إعدادات المطبخ' }
      : { type: 'error', text: res?.error || 'تعذر حفظ إعدادات المطبخ' });
  }

  const printerSelect = (value, onChange, label) => (
    <select className="form-input" value={value} aria-label={label} onChange={(e) => onChange(e.target.value)}>
      <option value="">من غير طباعة (شاشة المطبخ بس)</option>
      {[...new Set([value, ...printers].filter(Boolean))].map((name) => <option key={name} value={name}>{name}</option>)}
    </select>
  );

  return (
    <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', padding: '24px', boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}>
      <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#1E293B', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span>🍳</span> المطبخ ومحطات التحضير
      </h3>
      <p style={{ color: '#64748B', fontSize: '13px', margin: '0 0 16px 0' }}>
        كل طلب أو دفعة طاولة بتطلع لها تذكرة مطبخ من غير أسعار. لو عندك محطات (مشويات، بار، حلويات) اختار أقسام كل محطة وطابعتها؛ الباقي يروح لطابعة المطبخ.
      </p>

      <label className="form-label">طابعة المطبخ الرئيسية</label>
      {printerSelect(kitchenPrinter, setKitchenPrinter, 'طابعة المطبخ الرئيسية')}

      {stations.map((station, index) => (
        <div key={index} style={{ border: '1px solid #E2E8F0', borderRadius: '12px', padding: '12px', marginTop: '12px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '10px' }}>
            <input
              className="form-input"
              value={station.name}
              maxLength={40}
              placeholder="اسم المحطة (مثال: البار)"
              aria-label={`اسم المحطة ${index + 1}`}
              onChange={(e) => update(index, { name: e.target.value })}
            />
            {printerSelect(station.printer, (printer) => update(index, { printer }), `طابعة المحطة ${index + 1}`)}
            <button type="button" className="secondary-btn" onClick={() => setStations((prev) => prev.filter((_, i) => i !== index))}>
              حذف
            </button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '10px' }}>
            {categories.length === 0 && <span style={{ color: '#64748B', fontSize: '13px' }}>مفيش أقسام في المنيو لسه.</span>}
            {categories.map((category) => (
              <label key={category.id} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px' }}>
                <input
                  type="checkbox"
                  checked={station.categoryIds.includes(category.id)}
                  onChange={() => toggleCategory(index, category.id)}
                />
                {category.name}
              </label>
            ))}
          </div>
        </div>
      ))}

      <div style={{ display: 'flex', gap: '10px', marginTop: '12px', flexWrap: 'wrap' }}>
        <button
          type="button"
          className="secondary-btn"
          disabled={stations.length >= MAX_STATIONS}
          onClick={() => setStations((prev) => [...prev, { name: '', printer: '', categoryIds: [] }])}
        >
          + محطة جديدة
        </button>
        <button type="button" className="primary-btn" disabled={saving} onClick={handleSave}>
          {saving ? 'جارٍ الحفظ...' : 'حفظ إعدادات المطبخ'}
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
