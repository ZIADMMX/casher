import { useEffect, useState } from 'react';
import * as tablesApi from '../../api/tables.js';
import { normalizeErrorMessage } from '../../utils/normalizeError.js';
import { Dialog } from './ProductDialogs.jsx';
import { PackageIcon, TrashIcon } from '../icons/PosIcons.jsx';

const variantName = (product, variant) => [product.name, variant.size, variant.color].filter(Boolean).join(' - ');

/**
 * A menu item's recipe: which stock items one unit uses ("burger" = 1 bun +
 * 0.15 kg beef). Selling the item takes these out of stock instead of the item.
 */
export default function RecipeDialog({ variant, productName, products, canEdit, onClose }) {
  const [rows, setRows] = useState([]);
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    Promise.resolve(tablesApi.getRecipe(variant.id))
      .then((list) => setRows((list || []).map((ing) => ({ variantId: ing.ingredient_variant_id, quantity: String(ing.quantity) }))))
      .catch((err) => setError(normalizeErrorMessage(err, 'تعذر تحميل الوصفة')));
  }, [variant.id]);

  // Stock items only: not this item and not other recipe items.
  const options = (products || []).flatMap((product) => (product.variants || [])
    .filter((v) => v.id !== variant.id && !v.has_recipe && !product.is_service)
    .map((v) => ({ id: v.id, label: variantName(product, v) })));
  const labelOf = (id) => options.find((o) => o.id === id)?.label || `صنف #${id}`;

  async function save() {
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      await tablesApi.setRecipe(variant.id, rows.map((row) => ({ variantId: row.variantId, quantity: Number(row.quantity) })));
      setSaved(true);
    } catch (err) {
      setError(normalizeErrorMessage(err, 'تعذر حفظ الوصفة'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={`وصفة: ${productName}`}
      subtitle="كمية كل خامة في قطعة واحدة. لما الصنف يتباع، الخامات دي هي اللي تتخصم من المخزون. سيبها فاضية لو الصنف بيتخصم بنفسه."
      icon={<PackageIcon size={20} />}
      onClose={onClose}
      size="md"
    >
      <div className="prd-dialog__body">
        {rows.length === 0 && <p className="prd-field__label">مفيش وصفة؛ الصنف بيتخصم من مخزونه هو.</p>}
        {rows.map((row, index) => (
          <div key={row.variantId} style={{ display: 'grid', gridTemplateColumns: '1fr 120px auto', gap: '8px', alignItems: 'center' }}>
            <span>{labelOf(row.variantId)}</span>
            <input
              className="prd-input"
              type="number"
              min="0.001"
              step="0.001"
              value={row.quantity}
              disabled={!canEdit}
              aria-label={`كمية ${labelOf(row.variantId)}`}
              onChange={(e) => setRows((prev) => prev.map((r, i) => (i === index ? { ...r, quantity: e.target.value } : r)))}
            />
            {canEdit && (
              <button type="button" className="prd-icon-btn prd-icon-btn--danger" aria-label={`حذف ${labelOf(row.variantId)}`}
                onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))}>
                <TrashIcon size={16} />
              </button>
            )}
          </div>
        ))}

        {canEdit && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <select className="prd-input" value={pick} aria-label="اختار خامة" onChange={(e) => setPick(e.target.value)}>
              <option value="">اختار خامة من المخزون…</option>
              {options.filter((o) => !rows.some((r) => r.variantId === o.id)).map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
            <button type="button" className="prd-btn prd-btn--ghost" disabled={!pick}
              onClick={() => { setRows((prev) => [...prev, { variantId: Number(pick), quantity: '1' }]); setPick(''); }}>
              إضافة
            </button>
          </div>
        )}

        {error && <p role="alert" style={{ color: 'var(--danger, #DC2626)' }}>{error}</p>}
        {saved && <p role="status">تم حفظ الوصفة</p>}
        <div className="prd-dialog__actions">
          <button type="button" className="prd-btn prd-btn--ghost" onClick={onClose}>إغلاق</button>
          {canEdit && (
            <button type="button" className="prd-btn prd-btn--dark" disabled={busy} onClick={save}>
              {busy ? 'جاري الحفظ...' : 'حفظ الوصفة'}
            </button>
          )}
        </div>
      </div>
    </Dialog>
  );
}
