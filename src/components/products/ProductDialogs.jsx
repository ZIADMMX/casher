import { useEffect, useId, useRef, useState } from 'react';
import * as productsApi from '../../api/products.js';
import { normalizeErrorMessage } from '../../utils/normalizeError.js';
import {
  CloseIcon, KeyIcon, LockIcon, PackageIcon, PencilIcon, PlusIcon, PrinterIcon, ProductLineIcon,
  TagIcon, TrashIcon,
} from '../icons/PosIcons.jsx';

/* ---------------------------------------------------------------------------
   Shared dialog shell: Escape closes, focus stays inside, first field focused.
   Rendered inside .prd-page so it uses the page's design tokens.
   --------------------------------------------------------------------------- */
export function Dialog({ title, subtitle, icon, onClose, size = 'md', children }) {
  const boxRef = useRef(null);

  useEffect(() => {
    const box = boxRef.current;
    const focusables = () => box.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    const first = box.querySelector('input, select, textarea') || focusables()[0];
    first?.focus();
    function onKey(event) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = [...focusables()].filter((item) => !item.disabled);
      if (!items.length) return;
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      if (event.shiftKey && document.activeElement === firstItem) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && document.activeElement === lastItem) {
        event.preventDefault();
        firstItem.focus();
      }
    }
    box.addEventListener('keydown', onKey);
    return () => box.removeEventListener('keydown', onKey);
  }, [onClose]);

  const headingId = useId();
  return (
    <div className="prd-overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className={`prd-dialog prd-dialog--${size}`} role="dialog" aria-modal="true" aria-labelledby={headingId} ref={boxRef}>
        <header className="prd-dialog__head">
          {icon && <span className="prd-dialog__icon">{icon}</span>}
          <div className="prd-dialog__titles">
            <h2 id={headingId}>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button type="button" className="prd-icon-btn" onClick={onClose} aria-label="إغلاق">
            <CloseIcon size={18} />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

function FormError({ message }) {
  if (!message) return null;
  return <p className="prd-form-error" role="alert">{message}</p>;
}

function parseOptions(definition) {
  try {
    return JSON.parse(definition.options_json || '[]');
  } catch {
    return [];
  }
}

// enforceRequired is off when editing: a required field that was never filled
// must not block a price change on an existing item.
function AttributeFields({ definitions, values, onChange, disabled, enforceRequired = true }) {
  return definitions.map((definition) => {
    const options = parseOptions(definition);
    const common = {
      className: 'prd-input',
      required: enforceRequired && Boolean(definition.is_required),
      value: values[definition.id] ?? '',
      disabled,
      onChange: (event) => onChange(definition.id, event.target.value),
    };
    return (
      <label className="prd-field" key={definition.id}>
        <span className="prd-field__label">
          {definition.attribute_name}
          {definition.is_required ? <span className="prd-req"> *</span> : null}
        </span>
        {definition.data_type === 'select' && options.length > 0 ? (
          <select {...common}>
            <option value="">اختر</option>
            {options.map((option) => (
              <option key={option.value ?? option} value={option.value ?? option}>{option.label ?? option}</option>
            ))}
          </select>
        ) : (
          <input
            {...common}
            type={definition.data_type === 'number' ? 'number' : definition.data_type === 'date' ? 'date' : 'text'}
          />
        )}
      </label>
    );
  });
}

/* ---------------------------------------------------------------------------
   Manager unlock: the manager types their own username + password here.
   The main process checks it and lends product-edit rights for 10 minutes.
   --------------------------------------------------------------------------- */
export function UnlockDialog({ onClose, onUnlocked }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const grant = await productsApi.unlockProductEditing({ username, password });
      onUnlocked(grant);
    } catch (err) {
      setError(normalizeErrorMessage(err, 'تعذر فتح التعديل'));
      setPassword('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      title="فتح التعديل بكود المدير"
      subtitle="المدير أو مدير الفرع يكتب اسم الدخول وكلمة السر بتوعه بنفسه. التعديل يفضل مفتوح لحد القفل أو تسجيل الخروج."
      icon={<KeyIcon size={20} />}
      onClose={onClose}
      size="sm"
    >
      <form className="prd-dialog__body" onSubmit={submit}>
        <label className="prd-field">
          <span className="prd-field__label">اسم دخول المدير</span>
          <input className="prd-input" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" required />
        </label>
        <label className="prd-field">
          <span className="prd-field__label">كلمة سر المدير</span>
          <input className="prd-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" required />
        </label>
        <FormError message={error} />
        <div className="prd-dialog__actions">
          <button type="button" className="prd-btn prd-btn--ghost" onClick={onClose}>إلغاء</button>
          <button type="submit" className="prd-btn prd-btn--dark" disabled={busy}>
            <KeyIcon size={18} />
            {busy ? 'جاري التحقق...' : 'فتح التعديل'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

/* ---------------------------------------------------------------------------
   Archive confirmation (no hard delete: old invoices keep the product).
   --------------------------------------------------------------------------- */
export function ArchiveDialog({ product, onClose, onConfirm }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function confirm() {
    setBusy(true);
    setError('');
    try {
      await onConfirm();
    } catch (err) {
      setError(normalizeErrorMessage(err, 'تعذر أرشفة المنتج'));
      setBusy(false);
    }
  }

  return (
    <Dialog title={`أرشفة «${product.name}»؟`} icon={<ArchiveGlyph />} onClose={onClose} size="sm">
      <div className="prd-dialog__body">
        <p className="prd-dialog__text">
          المنتج هيختفي من المنيو وشاشة البيع، والفواتير القديمة هتفضل زي ما هي. مفيش حذف نهائي.
        </p>
        <FormError message={error} />
        <div className="prd-dialog__actions">
          <button type="button" className="prd-btn prd-btn--ghost" onClick={onClose}>تراجع</button>
          <button type="button" className="prd-btn prd-btn--danger" onClick={confirm} disabled={busy}>
            {busy ? 'جاري الأرشفة...' : 'أرشفة المنتج'}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

export function ArchiveGlyph({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="4" rx="1" />
      <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4" />
    </svg>
  );
}

/* ---------------------------------------------------------------------------
   Add product. Opening stock appears only for users allowed to adjust stock.
   --------------------------------------------------------------------------- */
const EMPTY_PRODUCT = { name: '', categoryName: '', size: '', color: '', price: '', stockQuantity: '', imagePath: '', barcode: '' };

export function AddProductDialog({
  categories, hasSize, hasColor, customAttributes, canAdjustStock, termProduct, scannedBarcode, onClose, onSave,
}) {
  const [form, setForm] = useState(EMPTY_PRODUCT);
  const [attributeValues, setAttributeValues] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (scannedBarcode) setForm((previous) => ({ ...previous, barcode: scannedBarcode }));
  }, [scannedBarcode]);

  const update = (field, value) => setForm((previous) => ({ ...previous, [field]: value }));

  async function pickImage() {
    setError('');
    try {
      const path = await productsApi.selectProductImage();
      if (path) update('imagePath', path);
    } catch (err) {
      setError(normalizeErrorMessage(err, 'تعذر اختيار الصورة'));
    }
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await onSave({
        name: form.name,
        categoryName: form.categoryName,
        size: form.size,
        color: form.color,
        sellingPrice: Number(form.price),
        stockQuantity: canAdjustStock ? Number.parseInt(form.stockQuantity, 10) || 0 : 0,
        imagePath: form.imagePath || null,
        barcode: form.barcode || null,
        attributeValues,
      });
    } catch (err) {
      setError(normalizeErrorMessage(err, 'تعذر حفظ المنتج'));
      setBusy(false);
    }
  }

  return (
    <Dialog title={`إضافة ${termProduct}`} subtitle="السعر والخيارات هنا، والكميات من قسم المخزون." icon={<PlusIcon size={20} />} onClose={onClose}>
      <form className="prd-dialog__body" onSubmit={submit}>
        <div className="prd-form-grid">
          <label className="prd-field prd-field--wide">
            <span className="prd-field__label">اسم المنتج <span className="prd-req">*</span></span>
            <input className="prd-input" value={form.name} onChange={(e) => update('name', e.target.value)} maxLength={120} required />
          </label>
          <label className="prd-field">
            <span className="prd-field__label">التصنيف</span>
            <input className="prd-input" list="prd-category-list" value={form.categoryName} onChange={(e) => update('categoryName', e.target.value)} maxLength={60} />
          </label>
          <label className="prd-field">
            <span className="prd-field__label">سعر البيع (ج.م) <span className="prd-req">*</span></span>
            <input className="prd-input prd-input--num" type="number" min="0.01" step="0.01" value={form.price} onChange={(e) => update('price', e.target.value)} required />
          </label>
          {hasSize && (
            <label className="prd-field">
              <span className="prd-field__label">المقاس / الحجم</span>
              <input className="prd-input" value={form.size} onChange={(e) => update('size', e.target.value)} maxLength={60} />
            </label>
          )}
          {hasColor && (
            <label className="prd-field">
              <span className="prd-field__label">اللون</span>
              <input className="prd-input" value={form.color} onChange={(e) => update('color', e.target.value)} maxLength={60} />
            </label>
          )}
          <AttributeFields
            definitions={customAttributes}
            values={attributeValues}
            onChange={(id, value) => setAttributeValues((previous) => ({ ...previous, [id]: value }))}
          />
          <label className="prd-field">
            <span className="prd-field__label">الباركود</span>
            <input className="prd-input" value={form.barcode} onChange={(e) => update('barcode', e.target.value)} placeholder="تلقائي لو فاضي" maxLength={100} />
          </label>
          {canAdjustStock && (
            <label className="prd-field">
              <span className="prd-field__label">رصيد افتتاحي</span>
              <input className="prd-input prd-input--num" type="number" min="0" step="1" value={form.stockQuantity} onChange={(e) => update('stockQuantity', e.target.value)} placeholder="0" />
            </label>
          )}
        </div>
        <datalist id="prd-category-list">
          {categories.map((category) => <option key={category.id} value={category.name} />)}
        </datalist>

        <div className="prd-image-pick">
          <button type="button" className="prd-btn prd-btn--ghost" onClick={pickImage}>
            {form.imagePath ? 'تغيير الصورة' : 'إضافة صورة من الجهاز'}
          </button>
          {form.imagePath && (
            <>
              <span className="prd-image-pick__ok">تم إرفاق الصورة</span>
              <button type="button" className="prd-link-btn" onClick={() => update('imagePath', '')}>إزالة</button>
            </>
          )}
        </div>

        <FormError message={error} />
        <div className="prd-dialog__actions">
          <button type="button" className="prd-btn prd-btn--ghost" onClick={onClose}>إلغاء</button>
          <button type="submit" className="prd-btn prd-btn--primary" disabled={busy}>
            {busy ? 'جاري الحفظ...' : 'حفظ المنتج'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

/* ---------------------------------------------------------------------------
   Product details: price and options per variant. Read-only unless canEdit.
   Changing a price asks for a reason (the server refuses it otherwise).
   --------------------------------------------------------------------------- */
function variantLabel(variant, fallback) {
  return [variant.size, variant.color, ...(variant.attributes || []).map((item) => item.value)]
    .filter(Boolean).join(' · ') || fallback;
}

export function ProductDetailsDialog({
  product, code, emoji, attributes, categories, access, quantityLabel, onClose,
  onEditProduct, onAddVariant, onEditVariant, onDeleteVariant, onPrintBarcode, onPrintPriceTag, onOpenUnits, onOpenRecipe = null,
}) {
  const canEdit = access.canEdit;
  const hasSize = attributes.some((item) => item.attribute_key === 'size');
  const hasColor = attributes.some((item) => item.attribute_key === 'color');
  const customAttributes = attributes.filter((item) => !['size', 'color'].includes(item.attribute_key));

  const [editingInfo, setEditingInfo] = useState(false);
  const [info, setInfo] = useState({ name: product.name, categoryName: product.categoryName || '' });
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [draftAttributes, setDraftAttributes] = useState({});
  const [adding, setAdding] = useState(false);
  const [newVariant, setNewVariant] = useState({ size: '', color: '', price: '', stockQuantity: '', barcode: '' });
  const [newAttributes, setNewAttributes] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function run(action) {
    setBusy(true);
    setError('');
    try {
      await action();
      return true;
    } catch (err) {
      setError(normalizeErrorMessage(err, 'تعذر الحفظ'));
      return false;
    } finally {
      setBusy(false);
    }
  }

  function startEdit(variant) {
    setError('');
    setAdding(false);
    setEditingId(variant.id);
    setDraft({
      size: variant.size || '',
      color: variant.color || '',
      barcode: variant.barcode || '',
      price: String(variant.selling_price ?? ''),
      originalPrice: Number(variant.selling_price),
      reason: '',
    });
    // The catalog already carries each variant's field values; no extra (enterprise) call.
    setDraftAttributes(Object.fromEntries((variant.attributes || []).map((item) => [item.attribute_id, item.value])));
  }

  const priceChanged = draft && Number(draft.price) !== draft.originalPrice;

  async function saveVariant(event) {
    event.preventDefault();
    const ok = await run(() => onEditVariant(editingId, {
      size: draft.size,
      color: draft.color,
      barcode: draft.barcode || null,
      sellingPrice: Number(draft.price),
      reason: draft.reason,
      attributeValues: draftAttributes,
    }));
    if (ok) setEditingId(null);
  }

  async function saveNewVariant(event) {
    event.preventDefault();
    const ok = await run(() => onAddVariant(product.id, {
      size: newVariant.size,
      color: newVariant.color,
      barcode: newVariant.barcode || null,
      sellingPrice: Number(newVariant.price),
      stockQuantity: access.canAdjustStock ? Number.parseInt(newVariant.stockQuantity, 10) || 0 : 0,
      attributeValues: newAttributes,
    }));
    if (ok) {
      setAdding(false);
      setNewVariant({ size: '', color: '', price: '', stockQuantity: '', barcode: '' });
      setNewAttributes({});
    }
  }

  async function saveInfo(event) {
    event.preventDefault();
    const ok = await run(() => onEditProduct(product.id, { name: info.name, categoryName: info.categoryName }));
    if (ok) setEditingInfo(false);
  }

  async function removeVariant(variant) {
    if (!window.confirm(`حذف الخيار «${variantLabel(variant, 'الأساسي')}»؟ ده متاح بس للخيارات اللي ملهاش بيع ولا رصيد.`)) return;
    await run(() => onDeleteVariant(variant.id));
  }

  return (
    <Dialog
      title={product.name}
      subtitle={`${code} · ${product.categoryName || 'بدون تصنيف'} · ${product.variants.length} خيار`}
      icon={<ProductLineIcon emoji={emoji} size={22} />}
      onClose={onClose}
      size="lg"
    >
      <div className="prd-dialog__body">
        {!canEdit && (
          <p className="prd-inline-note">
            <LockIcon size={16} />
            عرض فقط. التعديل يحتاج صلاحية أو كود المدير.
          </p>
        )}

        {canEdit && (
          editingInfo ? (
            <form className="prd-info-edit" onSubmit={saveInfo}>
              <label className="prd-field">
                <span className="prd-field__label">اسم المنتج</span>
                <input className="prd-input" value={info.name} onChange={(e) => setInfo((p) => ({ ...p, name: e.target.value }))} maxLength={120} required />
              </label>
              <label className="prd-field">
                <span className="prd-field__label">التصنيف</span>
                <input className="prd-input" list="prd-category-list-edit" value={info.categoryName} onChange={(e) => setInfo((p) => ({ ...p, categoryName: e.target.value }))} maxLength={60} />
                <datalist id="prd-category-list-edit">
                  {categories.map((category) => <option key={category.id} value={category.name} />)}
                </datalist>
              </label>
              <div className="prd-info-edit__actions">
                <button type="button" className="prd-btn prd-btn--ghost" onClick={() => setEditingInfo(false)}>إلغاء</button>
                <button type="submit" className="prd-btn prd-btn--primary" disabled={busy}>حفظ</button>
              </div>
            </form>
          ) : (
            <div className="prd-dialog__toolbar">
              <button type="button" className="prd-btn prd-btn--ghost" onClick={() => setEditingInfo(true)}>
                <PencilIcon size={16} /> تعديل الاسم والتصنيف
              </button>
              {access.canCreate && (
                <button type="button" className="prd-btn prd-btn--ghost" onClick={() => { setAdding((v) => !v); setEditingId(null); }}>
                  <PlusIcon size={16} /> {adding ? 'إلغاء الخيار الجديد' : 'إضافة خيار'}
                </button>
              )}
            </div>
          )
        )}

        {adding && (
          <form className="prd-variant-form" onSubmit={saveNewVariant}>
            <div className="prd-form-grid">
              {hasSize && (
                <label className="prd-field">
                  <span className="prd-field__label">المقاس / الحجم</span>
                  <input className="prd-input" value={newVariant.size} onChange={(e) => setNewVariant((p) => ({ ...p, size: e.target.value }))} maxLength={60} />
                </label>
              )}
              {hasColor && (
                <label className="prd-field">
                  <span className="prd-field__label">اللون</span>
                  <input className="prd-input" value={newVariant.color} onChange={(e) => setNewVariant((p) => ({ ...p, color: e.target.value }))} maxLength={60} />
                </label>
              )}
              <AttributeFields definitions={customAttributes} values={newAttributes} onChange={(id, value) => setNewAttributes((p) => ({ ...p, [id]: value }))} />
              <label className="prd-field">
                <span className="prd-field__label">سعر البيع <span className="prd-req">*</span></span>
                <input className="prd-input prd-input--num" type="number" min="0.01" step="0.01" value={newVariant.price} onChange={(e) => setNewVariant((p) => ({ ...p, price: e.target.value }))} required />
              </label>
              <label className="prd-field">
                <span className="prd-field__label">الباركود</span>
                <input className="prd-input" value={newVariant.barcode} onChange={(e) => setNewVariant((p) => ({ ...p, barcode: e.target.value }))} placeholder="تلقائي لو فاضي" maxLength={100} />
              </label>
              {access.canAdjustStock && (
                <label className="prd-field">
                  <span className="prd-field__label">رصيد افتتاحي</span>
                  <input className="prd-input prd-input--num" type="number" min="0" step="1" value={newVariant.stockQuantity} onChange={(e) => setNewVariant((p) => ({ ...p, stockQuantity: e.target.value }))} placeholder="0" />
                </label>
              )}
            </div>
            <div className="prd-dialog__actions">
              <button type="submit" className="prd-btn prd-btn--primary" disabled={busy}>حفظ الخيار</button>
            </div>
          </form>
        )}

        <FormError message={error} />

        <ul className="prd-variant-list">
          {product.variants.map((variant) => (
            <li key={variant.id} className={`prd-variant ${editingId === variant.id ? 'is-editing' : ''}`}>
              {editingId === variant.id && draft ? (
                <form className="prd-variant-form" onSubmit={saveVariant}>
                  <div className="prd-form-grid">
                    {hasSize && (
                      <label className="prd-field">
                        <span className="prd-field__label">المقاس / الحجم</span>
                        <input className="prd-input" value={draft.size} onChange={(e) => setDraft((p) => ({ ...p, size: e.target.value }))} maxLength={60} />
                      </label>
                    )}
                    {hasColor && (
                      <label className="prd-field">
                        <span className="prd-field__label">اللون</span>
                        <input className="prd-input" value={draft.color} onChange={(e) => setDraft((p) => ({ ...p, color: e.target.value }))} maxLength={60} />
                      </label>
                    )}
                    <AttributeFields definitions={customAttributes} values={draftAttributes} enforceRequired={false} onChange={(id, value) => setDraftAttributes((p) => ({ ...p, [id]: value }))} />
                    <label className="prd-field">
                      <span className="prd-field__label">سعر البيع <span className="prd-req">*</span></span>
                      <input className="prd-input prd-input--num" type="number" min="0.01" step="0.01" value={draft.price} onChange={(e) => setDraft((p) => ({ ...p, price: e.target.value }))} required />
                    </label>
                    <label className="prd-field">
                      <span className="prd-field__label">الباركود</span>
                      <input className="prd-input" value={draft.barcode} onChange={(e) => setDraft((p) => ({ ...p, barcode: e.target.value }))} maxLength={100} />
                    </label>
                    {priceChanged && (
                      <label className="prd-field prd-field--wide">
                        <span className="prd-field__label">سبب تغيير السعر <span className="prd-req">*</span></span>
                        <input
                          className="prd-input"
                          value={draft.reason}
                          onChange={(e) => setDraft((p) => ({ ...p, reason: e.target.value }))}
                          placeholder={`من ${draft.originalPrice} إلى ${draft.price || '؟'} ج.م — مثال: زيادة سعر الخامات`}
                          minLength={3}
                          maxLength={200}
                          required
                        />
                      </label>
                    )}
                  </div>
                  <div className="prd-dialog__actions">
                    <button type="button" className="prd-btn prd-btn--ghost" onClick={() => setEditingId(null)}>إلغاء</button>
                    <button type="submit" className="prd-btn prd-btn--primary" disabled={busy}>حفظ التعديل</button>
                  </div>
                </form>
              ) : (
                <>
                  <div className="prd-variant__main">
                    <strong>{variantLabel(variant, 'الخيار الأساسي')}</strong>
                    <span className="prd-variant__code">{variant.sku || '—'}{variant.barcode ? ` · ${variant.barcode}` : ''}</span>
                  </div>
                  <span className="prd-variant__stock" title="الكمية بتتعدل من قسم المخزون">
                    {variant.stock_quantity ?? 0} {quantityLabel}
                  </span>
                  <span className="prd-variant__price">{Number(variant.selling_price).toLocaleString('en-US')} ج.م</span>
                  <div className="prd-variant__actions">
                    {canEdit && (
                      <button type="button" className="prd-icon-btn" title="تعديل السعر والخيار" aria-label="تعديل السعر والخيار" onClick={() => startEdit(variant)}>
                        <PencilIcon size={16} />
                      </button>
                    )}
                    <button type="button" className="prd-icon-btn" title="وحدات القياس (كرتونة / علبة)" aria-label="وحدات القياس" onClick={() => onOpenUnits(variant)}>
                      <PackageIcon size={16} />
                    </button>
                    {onOpenRecipe && (
                      <button type="button" className="prd-icon-btn" title="الوصفة (الخامات اللي تتخصم من المخزون)" aria-label="الوصفة" onClick={() => onOpenRecipe(variant)}>
                        <TagIcon size={16} />
                        {variant.has_recipe ? ' ✓' : ''}
                      </button>
                    )}
                    <button type="button" className="prd-icon-btn" title="طباعة باركود" aria-label="طباعة باركود" onClick={() => onPrintBarcode(variant)}>
                      <PrinterIcon size={16} />
                    </button>
                    <button type="button" className="prd-icon-btn" title="طباعة بطاقة سعر" aria-label="طباعة بطاقة سعر" onClick={() => onPrintPriceTag(variant)}>
                      <TagIcon size={16} />
                    </button>
                    {access.canDelete && product.variants.length > 1 && (
                      <button type="button" className="prd-icon-btn prd-icon-btn--danger" title="حذف الخيار" aria-label="حذف الخيار" onClick={() => removeVariant(variant)}>
                        <TrashIcon size={16} />
                      </button>
                    )}
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      </div>
    </Dialog>
  );
}
