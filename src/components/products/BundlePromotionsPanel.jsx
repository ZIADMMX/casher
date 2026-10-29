import { useEffect, useMemo, useState } from 'react';

const emptyPromotion = {
  name: '',
  type: 'buy_x_get_y',
  buyQuantity: '2',
  freeQuantity: '1',
  bundleQuantity: '2',
  bundlePrice: '',
  eligibleVariantIds: [],
  startsAt: '',
  endsAt: '',
  active: true,
};

function BundlePromotionsPanel({ products, onClose }) {
  const [promotions, setPromotions] = useState([]);
  const [form, setForm] = useState(emptyPromotion);
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    window.electronAPI.getBundlePromotions()
      .then((saved) => setPromotions(Array.isArray(saved) ? saved : []))
      .catch((loadError) => setError(`تعذر تحميل العروض: ${loadError.message}`))
      .finally(() => setLoading(false));
  }, []);

  const variants = useMemo(() => products.flatMap((product) => (
    (product.variants || []).map((variant) => ({
      ...variant,
      productName: product.name,
    }))
  )), [products]);
  const visibleVariants = variants.filter((variant) => {
    const term = search.trim().toLowerCase();
    return !term || `${variant.productName} ${variant.size || ''} ${variant.color || ''}`
      .toLowerCase().includes(term);
  });

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function resetForm() {
    setForm(emptyPromotion);
    setEditingId(null);
    setError('');
  }

  function editPromotion(promotion) {
    setEditingId(promotion.id);
    setForm({
      ...emptyPromotion,
      ...promotion,
      buyQuantity: String(promotion.buyQuantity ?? 2),
      freeQuantity: String(promotion.freeQuantity ?? 1),
      bundleQuantity: String(promotion.bundleQuantity ?? 2),
      bundlePrice: String(promotion.bundlePrice ?? ''),
      startsAt: promotion.startsAt || '',
      endsAt: promotion.endsAt || '',
    });
    setError('');
  }

  function toggleVariant(variantId) {
    const id = Number(variantId);
    updateForm(
      'eligibleVariantIds',
      form.eligibleVariantIds.includes(id)
        ? form.eligibleVariantIds.filter((item) => item !== id)
        : [...form.eligibleVariantIds, id]
    );
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const promotion = {
        ...form,
        ...(editingId ? { id: editingId } : {}),
        buyQuantity: Number(form.buyQuantity),
        freeQuantity: Number(form.freeQuantity),
        bundleQuantity: Number(form.bundleQuantity),
        bundlePrice: Number(form.bundlePrice),
      };
      const next = editingId
        ? promotions.map((item) => item.id === editingId ? promotion : item)
        : [...promotions, promotion];
      const saved = await window.electronAPI.saveBundlePromotions(next);
      setPromotions(saved);
      resetForm();
    } catch (saveError) {
      setError(`تعذر حفظ العرض: ${saveError.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function deletePromotion(id) {
    if (!window.confirm('هل تريد حذف هذا العرض؟')) return;
    setSaving(true);
    setError('');
    try {
      const saved = await window.electronAPI.saveBundlePromotions(
        promotions.filter((promotion) => promotion.id !== id)
      );
      setPromotions(saved);
      if (editingId === id) resetForm();
    } catch (saveError) {
      setError(`تعذر حذف العرض: ${saveError.message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="fox-form-card reports-fade-in" aria-labelledby="bundle-promotions-title">
      <div className="fox-form-card-header">
        <div>
          <h3 id="bundle-promotions-title">العروض الترويجية المركبة</h3>
          <p>حدد الأصناف المؤهلة وسيطبّق النظام العرض الأعلى توفيرًا تلقائيًا دون جمعه مع الخصم اليدوي.</p>
        </div>
        <button type="button" className="form-close-btn" onClick={onClose}>إغلاق</button>
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}
      {loading ? <p>جارٍ تحميل العروض...</p> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 0.9fr) minmax(320px, 1.1fr)', gap: 20 }}>
          <div>
            <h4>العروض المسجلة ({promotions.length})</h4>
            {promotions.length === 0 && <p>لا توجد عروض محفوظة.</p>}
            {promotions.map((promotion) => (
              <div key={promotion.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: 10, marginBottom: 8, border: '1px solid #dbe2ea', borderRadius: 8 }}>
                <div>
                  <strong>{promotion.name}</strong>
                  <div style={{ fontSize: 12, color: '#64748b' }}>
                    {promotion.type === 'buy_x_get_y'
                      ? `اشترِ ${promotion.buyQuantity} واحصل على ${promotion.freeQuantity} مجانًا`
                      : `${promotion.bundleQuantity} قطع بسعر ${promotion.bundlePrice} ج.م`}
                    {promotion.active ? ' · نشط' : ' · متوقف'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <button type="button" className="small-btn" disabled={saving} onClick={() => editPromotion(promotion)}>تعديل</button>
                  <button type="button" className="small-btn-outline" disabled={saving} onClick={() => deletePromotion(promotion.id)}>حذف</button>
                </div>
              </div>
            ))}
          </div>

          <form onSubmit={submit}>
            <h4>{editingId ? 'تعديل العرض' : 'إضافة عرض'}</h4>
            <div className="form-field-group">
              <label className="form-label" htmlFor="bundle-name">اسم العرض</label>
              <input id="bundle-name" className="fox-lux-input" value={form.name} maxLength={100} required onChange={(event) => updateForm('name', event.target.value)} />
            </div>
            <div className="form-field-group" style={{ marginTop: 10 }}>
              <label className="form-label" htmlFor="bundle-type">نوع العرض</label>
              <select id="bundle-type" className="fox-lux-input" value={form.type} onChange={(event) => updateForm('type', event.target.value)}>
                <option value="buy_x_get_y">اشترِ كمية واحصل على كمية مجانًا</option>
                <option value="fixed_bundle_price">كمية بسعر إجمالي خاص</option>
              </select>
            </div>

            {form.type === 'buy_x_get_y' ? (
              <div className="add-variant-grid" style={{ marginTop: 10 }}>
                <label>الكمية المدفوعة<input className="fox-lux-input" type="number" min="1" max="99" value={form.buyQuantity} required onChange={(event) => updateForm('buyQuantity', event.target.value)} /></label>
                <label>الكمية المجانية<input className="fox-lux-input" type="number" min="1" max="99" value={form.freeQuantity} required onChange={(event) => updateForm('freeQuantity', event.target.value)} /></label>
              </div>
            ) : (
              <div className="add-variant-grid" style={{ marginTop: 10 }}>
                <label>عدد القطع<input className="fox-lux-input" type="number" min="2" max="100" value={form.bundleQuantity} required onChange={(event) => updateForm('bundleQuantity', event.target.value)} /></label>
                <label>سعر المجموعة (ج.م)<input className="fox-lux-input" type="number" min="0" step="0.01" value={form.bundlePrice} required onChange={(event) => updateForm('bundlePrice', event.target.value)} /></label>
              </div>
            )}

            <div className="add-variant-grid" style={{ marginTop: 10 }}>
              <label>يبدأ في<input className="fox-lux-input" type="date" value={form.startsAt} onChange={(event) => updateForm('startsAt', event.target.value)} /></label>
              <label>ينتهي في<input className="fox-lux-input" type="date" value={form.endsAt} onChange={(event) => updateForm('endsAt', event.target.value)} /></label>
            </div>
            <label style={{ display: 'flex', gap: 8, margin: '12px 0' }}>
              <input type="checkbox" checked={form.active} onChange={(event) => updateForm('active', event.target.checked)} />
              العرض نشط
            </label>

            <div className="form-field-group">
              <label className="form-label" htmlFor="bundle-variant-search">ابحث واختر المنتجات والمتغيرات (المقاس/اللون)</label>
              <input id="bundle-variant-search" className="fox-lux-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="اسم المنتج أو المقاس أو اللون" />
            </div>
            <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid #dbe2ea', borderRadius: 8, marginTop: 8, padding: 8 }}>
              {visibleVariants.map((variant) => (
                <label key={variant.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '5px 0' }}>
                  <input
                    type="checkbox"
                    checked={form.eligibleVariantIds.includes(Number(variant.id))}
                    onChange={() => toggleVariant(variant.id)}
                  />
                  <span>{variant.productName} {variant.size || ''} {variant.color || ''} · {variant.selling_price} ج.م</span>
                </label>
              ))}
              {visibleVariants.length === 0 && <p>لا توجد متغيرات مطابقة.</p>}
            </div>
            <p style={{ fontSize: 12 }}>المحدد: {form.eligibleVariantIds.length} (اختر منتجين/متغيرين على الأقل).</p>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button type="submit" className="primary-btn" disabled={saving || loading}>
                {saving ? 'جارٍ الحفظ...' : editingId ? 'حفظ التعديلات' : 'إضافة العرض'}
              </button>
              {editingId && <button type="button" className="small-btn-outline" onClick={resetForm}>إلغاء التعديل</button>}
            </div>
          </form>
        </div>
      )}
    </section>
  );
}

export default BundlePromotionsPanel;
