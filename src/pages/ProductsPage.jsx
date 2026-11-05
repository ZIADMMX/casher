import { useState, useEffect, useMemo, useCallback } from 'react';
import useProducts from '../hooks/useProducts.js';
import { useDebounce } from '../hooks/useDebounce.js';
import useBarcodeScanner, { normalizeBarcodeText } from '../hooks/useBarcodeScanner.js';
import ImportExcelModal from '../components/ImportExcelModal.jsx';
import { playSuccessBeep } from '../utils/beep.js';
import { formatProductImageUrl } from '../utils/media.js';
import { useBusinessProfile } from '../contexts/BusinessProfileContext.jsx';
import ThreeLoadingScreen from '../components/ThreeLoadingScreen.jsx';
import BundlePromotionsPanel from '../components/products/BundlePromotionsPanel.jsx';
import { useUser } from '../contexts/UserContext.jsx';
import ProductUnitsModal from '../components/products/ProductUnitsModal.jsx';
import ExpiryManagerModal from '../components/products/ExpiryManagerModal.jsx';
import { getCategoryIcon } from '../components/ProductGrid.jsx';
import { useDispatch } from 'react-redux';
import { setProducts } from '../features/products/productsSlice';
import * as enterpriseApi from '../api/enterprise.js';
import * as groceryApi from '../api/grocery.js';
import * as printingApi from '../api/printing.js';
import * as productsApi from '../api/products.js';

function ProductAttributeFields({ definitions, values, onChange }) {
  if (!definitions.length) return null;

  return (
    <div className="fox-form-grid-main" style={{ marginTop: '12px' }}>
      {definitions.map((definition) => {
        let options = [];
        try {
          options = JSON.parse(definition.options_json || '[]');
        } catch (err) {
          console.error(`خيارات الخاصية ${definition.attribute_key} غير صالحة:`, err);
        }
        const commonProps = {
          className: 'fox-lux-input',
          required: Boolean(definition.is_required),
          value: values[definition.id] ?? '',
          onChange: (event) => onChange(definition.id, event.target.value),
        };

        return (
          <div className="form-field-group" key={definition.id}>
            <label className="form-label">
              {definition.attribute_name}
              {definition.is_required ? <span className="req-star"> *</span> : ''}
            </label>
            {definition.data_type === 'select' && options.length > 0 ? (
              <select {...commonProps}>
                <option value="">اختر {definition.attribute_name}</option>
                {options.map((option) => (
                  <option key={option.value ?? option} value={option.value ?? option}>
                    {option.label ?? option}
                  </option>
                ))}
              </select>
            ) : (
              <input
                {...commonProps}
                type={definition.data_type === 'number' ? 'number' : definition.data_type === 'date' ? 'date' : 'text'}
                placeholder={definition.attribute_name}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function ProductVariantsModal({
  product,
  attributes,
  onClose,
  onAddVariant,
  onEditVariant,
  onDeleteVariant,
  onPrintBarcode,
  onPrintPriceTag,
  onOpenUnits,
  quantityLabel,
}) {
  const sizeLabel = attributes.find((attribute) => attribute.attribute_key === 'size')?.attribute_name || 'المقاس';
  const colorLabel = attributes.find((attribute) => attribute.attribute_key === 'color')?.attribute_name || 'اللون';
  const customAttributes = attributes.filter((attribute) => !['size', 'color'].includes(attribute.attribute_key));
  const [editingVariantId, setEditingVariantId] = useState(null);
  const [editVariantForm, setEditVariantForm] = useState({
    size: '', color: '', price: '', stockQuantity: '', barcode: '',
  });
  const [editAttributeValues, setEditAttributeValues] = useState({});

  const [showAddForm, setShowAddForm] = useState(false);
  const [newVariantForm, setNewVariantForm] = useState({
    size: '', color: '', price: '', stockQuantity: '', barcode: '',
  });
  const [newAttributeValues, setNewAttributeValues] = useState({});

  const [copiedSku, setCopiedSku] = useState(null);

  async function handleCopySku(sku) {
    if (!sku) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(sku);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = sku;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopiedSku(sku);
      setTimeout(() => setCopiedSku(null), 1500);
    } catch (err) {
      console.error(err);
    }
  }

  async function startEdit(v) {
    setEditingVariantId(v.id);
    setEditVariantForm({
      size: v.size || '',
      color: v.color || '',
      price: v.selling_price || 0,
      stockQuantity: v.stock_quantity,
      barcode: v.barcode || '',
    });
    try {
      const savedValues = await enterpriseApi.getVariantAttributeValues(v.id);
      setEditAttributeValues(Object.fromEntries(savedValues.map((item) => [item.attribute_id, item.value])));
    } catch (err) {
      setEditingVariantId(null);
      alert(`تعذر تحميل خصائص المنتج: ${err.message}`);
    }
  }

  async function handleSaveEdit(e, vId) {
    e.preventDefault();
    const priceVal = parseFloat(editVariantForm.price) || 0;
    const success = await onEditVariant(vId, {
      size: editVariantForm.size,
      color: editVariantForm.color,
      purchasePrice: 0,
      sellingPrice: priceVal,
      stockQuantity: parseInt(editVariantForm.stockQuantity, 10) || 0,
      barcode: editVariantForm.barcode || null,
      attributeValues: editAttributeValues,
    });
    if (success) setEditingVariantId(null);
  }

  async function handleSaveNew(e) {
    e.preventDefault();
    const priceVal = parseFloat(newVariantForm.price) || 0;
    const success = await onAddVariant(product.id, {
      size: newVariantForm.size,
      color: newVariantForm.color,
      purchasePrice: 0,
      sellingPrice: priceVal,
      stockQuantity: parseInt(newVariantForm.stockQuantity, 10) || 0,
      barcode: newVariantForm.barcode || null,
      attributeValues: newAttributeValues,
    });
    if (success) {
      setNewVariantForm({ size: '', color: '', price: '', stockQuantity: '', barcode: '' });
      setNewAttributeValues({});
      setShowAddForm(false);
    }
  }

  const totalProductPieces = product.variants.reduce((acc, v) => acc + (v.stock_quantity || 0), 0);
  const minPrice = Math.min(...product.variants.map((v) => v.selling_price));
  const maxPrice = Math.max(...product.variants.map((v) => v.selling_price));
  const priceDisplay = minPrice === maxPrice ? `${minPrice} ج.م` : `${minPrice} - ${maxPrice} ج.م`;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="product-modal-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="product-modal-header">
          <h3>
            <span>📦</span>
            <span>{product.name}</span>
            {product.categoryName && <span className="prod-cat-badge">{product.categoryName}</span>}
          </h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="product-modal-quick-stats">
          <div className="quick-stat-box">
            <span>{attributes.some((attribute) => ['size', 'color'].includes(attribute.attribute_key)) ? `إجمالي ${sizeLabel}/${colorLabel}` : 'إجمالي المتغيرات'}</span>
            <span>{product.variants.length} متغيرات</span>
          </div>
          <div className="quick-stat-box">
            <span>إجمالي المخزون</span>
            <span>{totalProductPieces} {quantityLabel}</span>
          </div>
          <div className="quick-stat-box">
            <span>نطاق الأسعار</span>
            <span>{priceDisplay}</span>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
          <h4 style={{ margin: 0, fontSize: '15px', color: '#1E293B' }}>قائمة المتغيرات والأسعار</h4>
          <button
            type="button"
            className="primary-btn"
            style={{ padding: '6px 14px', fontSize: '12px' }}
            onClick={() => setShowAddForm((v) => !v)}
          >
            {showAddForm ? 'إلغاء الإضافة' : '+ إضافة متغير جديد'}
          </button>
        </div>

        {showAddForm && (
          <form className="add-variant-box" onSubmit={handleSaveNew}>
            <h4>➕ إضافة متغير جديد للمنتج</h4>
            <div className="add-variant-grid">
              {attributes.some((attribute) => attribute.attribute_key === 'size') && (
                <input
                  type="text" placeholder={sizeLabel}
                  value={newVariantForm.size}
                  onChange={(e) => setNewVariantForm({ ...newVariantForm, size: e.target.value })}
                />
              )}
              {attributes.some((attribute) => attribute.attribute_key === 'color') && (
                <input
                  type="text" placeholder={colorLabel}
                  value={newVariantForm.color}
                  onChange={(e) => setNewVariantForm({ ...newVariantForm, color: e.target.value })}
                />
              )}
              <input
                type="text" placeholder="الباركود (تلقائي لو فارغ)"
                value={newVariantForm.barcode}
                onChange={(e) => setNewVariantForm({ ...newVariantForm, barcode: e.target.value })}
              />
              <input
                type="number" placeholder="السعر (ج.م)" required
                value={newVariantForm.price}
                onChange={(e) => setNewVariantForm({ ...newVariantForm, price: e.target.value })}
              />
              <input
                type="number" placeholder="الكمية المتاحة" required
                value={newVariantForm.stockQuantity}
                onChange={(e) => setNewVariantForm({ ...newVariantForm, stockQuantity: e.target.value })}
              />
            </div>
            <ProductAttributeFields
              definitions={customAttributes}
              values={newAttributeValues}
              onChange={(id, value) => setNewAttributeValues((previous) => ({ ...previous, [id]: value }))}
            />
            <button type="submit" className="primary-btn" style={{ fontSize: '13px', padding: '8px 16px' }}>
              حفظ المتغير
            </button>
          </form>
        )}

        <table className="variants-details-table">
          <thead>
            <tr>
              <th>SKU / الباركود</th>
              {attributes.some((attribute) => attribute.attribute_key === 'size') && <th>{sizeLabel}</th>}
              {attributes.some((attribute) => attribute.attribute_key === 'color') && <th>{colorLabel}</th>}
              {customAttributes.map((attribute) => <th key={attribute.id}>{attribute.attribute_name}</th>)}
              <th>السعر</th>
              <th>المخزون</th>
              <th>الحالة</th>
              <th>الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {product.variants.map((v) => (
              editingVariantId === v.id ? (
                <tr key={v.id} style={{ background: '#f8fafc', borderBottom: '2px solid #F2600C' }}>
                  <td>
                    <input
                      type="text"
                      placeholder="الباركود"
                      value={editVariantForm.barcode}
                      onChange={(e) => setEditVariantForm({ ...editVariantForm, barcode: e.target.value })}
                      style={{ width: '100%', minWidth: '90px', padding: '6px 8px', border: '1px solid #94a3b8', borderRadius: '6px', fontSize: '12px' }}
                    />
                  </td>
                  {attributes.some((attribute) => attribute.attribute_key === 'size') && (
                    <td>
                      <input
                        type="text"
                        placeholder={sizeLabel}
                        value={editVariantForm.size}
                        onChange={(e) => setEditVariantForm({ ...editVariantForm, size: e.target.value })}
                        style={{ width: '100%', minWidth: '70px', padding: '6px 8px', border: '1px solid #94a3b8', borderRadius: '6px', fontSize: '12px' }}
                      />
                    </td>
                  )}
                  {attributes.some((attribute) => attribute.attribute_key === 'color') && (
                    <td>
                      <input
                        type="text"
                        placeholder={colorLabel}
                        value={editVariantForm.color}
                        onChange={(e) => setEditVariantForm({ ...editVariantForm, color: e.target.value })}
                        style={{ width: '100%', minWidth: '70px', padding: '6px 8px', border: '1px solid #94a3b8', borderRadius: '6px', fontSize: '12px' }}
                      />
                    </td>
                  )}
                  {customAttributes.map((attribute) => {
                    let options = [];
                    try {
                      options = JSON.parse(attribute.options_json || '[]');
                    } catch {
                      options = [];
                    }

                    return (
                      <td key={attribute.id}>
                        {attribute.data_type === 'select' && options.length > 0 ? (
                          <select
                            value={editAttributeValues[attribute.id] ?? ''}
                            onChange={(e) => setEditAttributeValues((prev) => ({ ...prev, [attribute.id]: e.target.value }))}
                            style={{ width: '100%', minWidth: '80px', padding: '6px 8px', border: '1px solid #94a3b8', borderRadius: '6px', fontSize: '12px' }}
                          >
                            <option value="">—</option>
                            {options.map((opt) => (
                              <option key={opt.value ?? opt} value={opt.value ?? opt}>
                                {opt.label ?? opt}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type={attribute.data_type === 'number' ? 'number' : attribute.data_type === 'date' ? 'date' : 'text'}
                            placeholder={attribute.attribute_name}
                            value={editAttributeValues[attribute.id] ?? ''}
                            onChange={(e) => setEditAttributeValues((prev) => ({ ...prev, [attribute.id]: e.target.value }))}
                            style={{ width: '100%', minWidth: '80px', padding: '6px 8px', border: '1px solid #94a3b8', borderRadius: '6px', fontSize: '12px' }}
                          />
                        )}
                      </td>
                    );
                  })}
                  <td>
                    <input
                      type="number"
                      placeholder="السعر"
                      value={editVariantForm.price}
                      onChange={(e) => setEditVariantForm({ ...editVariantForm, price: e.target.value })}
                      required
                      style={{ width: '100%', minWidth: '70px', padding: '6px 8px', border: '1px solid #94a3b8', borderRadius: '6px', fontSize: '12px' }}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      placeholder="الكمية"
                      value={editVariantForm.stockQuantity}
                      onChange={(e) => setEditVariantForm({ ...editVariantForm, stockQuantity: e.target.value })}
                      required
                      style={{ width: '100%', minWidth: '60px', padding: '6px 8px', border: '1px solid #94a3b8', borderRadius: '6px', fontSize: '12px' }}
                    />
                  </td>
                  <td>
                    <span className="badge badge-warning" style={{ fontSize: '11px' }}>تعديل...</span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                      <button
                        type="button"
                        className="primary-btn"
                        style={{ padding: '4px 10px', fontSize: '12px', minWidth: '45px' }}
                        onClick={(e) => handleSaveEdit(e, v.id)}
                      >
                        حفظ
                      </button>
                      <button
                        type="button"
                        className="secondary-btn"
                        style={{ padding: '4px 8px', fontSize: '12px', minWidth: '40px', margin: 0 }}
                        onClick={() => setEditingVariantId(null)}
                      >
                        إلغاء
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={v.id} className={v.stock_quantity <= v.low_stock_threshold ? 'low-stock' : ''}>
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span
                        className="sku-cell"
                        style={{ cursor: 'pointer' }}
                        title="انقر لنسخ SKU"
                        onClick={() => handleCopySku(v.sku)}
                      >
                        {copiedSku === v.sku ? '✓ تم النسخ' : v.sku || '—'}
                      </span>
                      {v.barcode && <span style={{ fontSize: '10px', color: '#94A3B8' }}>{v.barcode}</span>}
                    </div>
                  </td>
                  {attributes.some((attribute) => attribute.attribute_key === 'size') && <td><strong>{v.size || '—'}</strong></td>}
                  {attributes.some((attribute) => attribute.attribute_key === 'color') && <td>{v.color || '—'}</td>}
                  {customAttributes.map((attribute) => (
                    <td key={attribute.id}>
                      {v.attributes?.find((value) => value.attribute_id === attribute.id)?.value || '—'}
                    </td>
                  ))}
                  <td><strong style={{ color: '#F2600C' }}>{v.selling_price} ج.م</strong></td>
                  <td><strong>{v.stock_quantity}</strong></td>
                  <td>
                    {v.stock_quantity === 0 ? (
                      <span className="badge badge-danger">نفذت</span>
                    ) : v.stock_quantity <= v.low_stock_threshold ? (
                      <span className="badge badge-warning">منخفض</span>
                    ) : (
                      <span className="badge badge-success">متوفر</span>
                    )}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button className="icon-btn" title="تعديل هذا المتغير" onClick={() => startEdit(v)}>✎</button>
                      <button className="icon-btn" title="تعدد وحدات القياس (كرتونة / باكت)" onClick={() => onOpenUnits?.(v, product.name)}>📦</button>
                      <button className="icon-btn" title="طباعة باركود" onClick={() => onPrintBarcode(v, product.name)}>🏷</button>
                      <button className="icon-btn" title="طباعة بطاقة سعر معلقة" onClick={() => onPrintPriceTag(v, product.name)}>💳</button>
                      <button className="icon-btn icon-btn-danger" title="حذف المتغير" onClick={() => onDeleteVariant(v.id)}>🗑</button>
                    </div>
                  </td>
                </tr>
              )
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProductsPage() {
  const { attributes, configuration, getTerm } = useBusinessProfile();
  const sectorKey = configuration?.profile?.key
    || configuration?.settings?.business_type
    || configuration?.settings?.onboarding_sector
    || 'retail';
  const isGrocery = sectorKey === 'grocery';
  const quantityLabel = isGrocery ? 'وحدة' : 'قطعة';
  const hasSizeAttribute = attributes.some((attribute) => attribute.attribute_key === 'size');
  const hasColorAttribute = attributes.some((attribute) => attribute.attribute_key === 'color');
  const variantLabel = isGrocery
    ? 'الوحدات والعبوات'
    : hasSizeAttribute && hasColorAttribute
      ? 'المقاسات والألوان'
      : hasSizeAttribute
        ? 'المقاسات'
        : hasColorAttribute
          ? 'الألوان'
          : 'الخيارات';
  const { currentUser } = useUser();
  const {
    products, loading, error, stats,
    addProduct, addVariant,
    editProduct, removeProduct,
    editVariant, removeVariant, refresh
  } = useProducts();

const dispatch = useDispatch();

useEffect(() => {
  if (products) {
    dispatch(setProducts(products));
  }
}, [products, dispatch]);

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 150);
  const [activeCategory, setActiveCategory] = useState('الكل');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [categories, setCategories] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [selectedProductForModal, setSelectedProductForModal] = useState(null);
  const [showBundlePromotions, setShowBundlePromotions] = useState(false);

  // فورم إضافة منتج
  const [form, setForm] = useState({
    name: '', categoryName: '', size: '', color: '',
    price: '', stockQuantity: '', imagePath: '', barcode: '',
  });
  const [attributeValues, setAttributeValues] = useState({});
  const configuredAttributeKeys = new Set((configuration?.settings?.attributes || []).map(String));
  for (const attribute of attributes) configuredAttributeKeys.add(attribute.attribute_key);
  const hasSize = configuredAttributeKeys.has('size');
  const hasColor = configuredAttributeKeys.has('color');
  const customAttributes = attributes.filter((attribute) => !['size', 'color'].includes(attribute.attribute_key));

  // تعديل اسم منتج وفئته
  const [editingProductId, setEditingProductId] = useState(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [editProductForm, setEditProductForm] = useState({ name: '', categoryName: '' });

  // سوبر ماركت: الصلاحيات وتعدد الوحدات
  const [expirySummary, setExpirySummary] = useState(null);
  const [showExpiryModal, setShowExpiryModal] = useState(false);
  const [selectedVariantForUnits, setSelectedVariantForUnits] = useState(null);

  const loadExpirySummary = useCallback(async () => {
    if (groceryApi.getGroceryExpirySummary.isAvailable()) {
      try {
        const sum = await groceryApi.getGroceryExpirySummary(30);
        setExpirySummary(sum);
      } catch (err) {
        console.error('فشل جلب ملخص الصلاحيات:', err);
      }
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    productsApi.getAllCategories()
      .then((cats) => { if (!cancelled) setCategories(cats); })
      .catch((err) => console.error('فشل جلب التصنيفات:', err));

    loadExpirySummary();

    return () => { cancelled = true; };
  }, [products, loadExpirySummary]);

  const allCategoryNames = useMemo(() => {
    return ['الكل', ...new Set(products.map((p) => p.categoryName).filter(Boolean)), 'نقص المخزون ⚠️'];
  }, [products]);

  const filteredProducts = useMemo(() => {
    const term = debouncedSearch.trim().toLowerCase();
    return products.filter((p) => {
      const matchesSearch =
        !term ||
        p.name.toLowerCase().includes(term) ||
        p.variants?.some((v) =>
          (v.barcode && v.barcode.toLowerCase().includes(term)) ||
          (v.sku && v.sku.toLowerCase().includes(term))
        );
      if (!matchesSearch) return false;

      if (activeCategory === 'الكل') return true;
      if (activeCategory === 'نقص المخزون ⚠️') {
        return p.variants.some((v) => v.stock_quantity <= v.low_stock_threshold);
      }
      return p.categoryName === activeCategory;
    });
  }, [products, debouncedSearch, activeCategory]);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, activeCategory, pageSize]);

  const pageCount = Math.max(1, Math.ceil(filteredProducts.length / pageSize));
  const visiblePage = Math.min(currentPage, pageCount);
  const pagedProducts = useMemo(() => {
    const startIndex = (visiblePage - 1) * pageSize;
    return filteredProducts.slice(startIndex, startIndex + pageSize);
  }, [filteredProducts, pageSize, visiblePage]);

  useEffect(() => {
    if (currentPage > pageCount) setCurrentPage(pageCount);
  }, [currentPage, pageCount]);

  useBarcodeScanner((code) => {
    const clean = normalizeBarcodeText(code);
    if (!clean) return;

    if (showForm) {
      updateForm('barcode', clean);
      playSuccessBeep();
    } else {
      setSearch(clean);
      playSuccessBeep();
    }
  });

  function updateForm(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handlePickImage() {
    const path = await productsApi.selectProductImage();
    if (path) updateForm('imagePath', path);
  }

  async function handleAddProduct(e) {
    e.preventDefault();
    const priceVal = parseFloat(form.price) || 0;
    const result = await addProduct({
      name: form.name,
      categoryName: form.categoryName,
      size: form.size,
      color: form.color,
      purchasePrice: 0,
      sellingPrice: priceVal,
      stockQuantity: parseInt(form.stockQuantity, 10) || 0,
      imagePath: form.imagePath || null,
      barcode: form.barcode || null,
      attributeValues,
    });
    if (result) {
      setForm({ name: '', categoryName: '', size: '', color: '', price: '', stockQuantity: '', imagePath: '', barcode: '' });
      setAttributeValues({});
      setShowForm(false);
    }
  }

  function startEditProduct(product) {
    setEditingProductId(product.id);
    setEditProductForm({ name: product.name, categoryName: product.categoryName || '' });
  }

  async function handleSaveProductEdit(e, productId) {
    e.preventDefault();
    const success = await editProduct(productId, {
      name: editProductForm.name,
      categoryName: editProductForm.categoryName,
    });
    if (success) setEditingProductId(null);
  }

  async function handleDeleteProduct(productId, productName) {
    if (!window.confirm(`متأكد إنك عايز تحذف "${productName}" وكل المتغيرات المرتبطة به؟`)) return;
    await removeProduct(productId);
    if (selectedProductForModal?.id === productId) {
      setSelectedProductForModal(null);
    }
  }

  async function handlePrintBarcode(variant, productName) {
    try {
      await printingApi.printBarcodeLabel({ ...variant, productName, labelType: 'barcode' });
    } catch (err) {
      alert('فشلت الطباعة: ' + err.message);
    }
  }

  async function handlePrintPriceTag(variant, productName) {
    try {
      await printingApi.printBarcodeLabel({ ...variant, productName, labelType: 'hangTag' });
    } catch (err) {
      alert('فشلت الطباعة: ' + err.message);
    }
  }

  // تحديث المنتج المفتوح في المودال في حالة حدوث تعديل
  const currentModalProduct = selectedProductForModal
    ? products.find((p) => p.id === selectedProductForModal.id) || null
    : null;

  return (
    <div className="products-page-container reports-fade-in">
      {/* Header */}
      <div className="page-header-row">
        <div>
          <h1>إدارة {getTerm('product', 'المنتجات')} والمخزون</h1>
          <p className="page-subtitle">
            إجمالي {stats.totalProducts} منتج مسجل · {stats.totalPieces} {quantityLabel} متوفرة بالمخزن
          </p>
        </div>
        <div className="header-action-group" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {currentUser?.role === 'admin' && <button
            type="button"
            className="secondary-btn"
            onClick={() => setShowBundlePromotions((visible) => !visible)}
          >
            {showBundlePromotions ? 'إغلاق العروض' : '🎁 العروض المركبة'}
          </button>}
          <button
            type="button"
            className="secondary-btn"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            onClick={() => setShowExpiryModal(true)}
            title="إدارة تواريخ الصلاحية وتنبيهات الهالك وإعدادات الميزان"
          >
            <span>🛡️</span>
            <span>الصلاحيات والموازين</span>
            {expirySummary?.expiringCount > 0 && (
              <span style={{ background: '#F59E0B', color: '#fff', fontSize: '10px', padding: '1px 5px', borderRadius: '10px', fontWeight: 800 }}>
                {expirySummary.expiringCount}
              </span>
            )}
            {expirySummary?.expiredCount > 0 && (
              <span style={{ background: '#EF4444', color: '#fff', fontSize: '10px', padding: '1px 5px', borderRadius: '10px', fontWeight: 800 }}>
                {expirySummary.expiredCount}
              </span>
            )}
          </button>
          <button
            type="button"
            className="secondary-btn"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            onClick={() => setShowImportModal(true)}
            title="استيراد منتجات دفعة واحدة من ملف Excel"
          >
            <span>📊</span>
            <span>استيراد من Excel</span>
          </button>
          <button className="primary-btn" onClick={() => setShowForm((v) => !v)}>
            {showForm ? '✕ إلغاء' : '+ إضافة منتج جديد'}
          </button>
        </div>
      </div>

      {showBundlePromotions && currentUser?.role === 'admin' && (
        <BundlePromotionsPanel products={products} onClose={() => setShowBundlePromotions(false)} />
      )}

      {/* Fox Stats Cards */}
      <div className="fox-stats-row">
        <div className="fox-stat-card fox-stat-blue fox-hover-lift">
          <div className="fox-stat-icon">💎</div>
          <span className="fox-stat-label">القيمة البيعية المقدرة</span>
          <span className="fox-stat-value">{stats.estimatedSaleValue.toLocaleString()} ج.م</span>
        </div>

        <div className="fox-stat-card fox-stat-purple fox-hover-lift">
          <div className="fox-stat-icon">📦</div>
          <span className="fox-stat-label">قيمة رأس مال المخزون</span>
          <span className="fox-stat-value">{stats.inventoryValue.toLocaleString()} ج.م</span>
        </div>

        <div className="fox-stat-card fox-stat-amber fox-hover-lift">
          <div className="fox-stat-icon">⚠️</div>
          <span className="fox-stat-label">تنبيهات نقص المخزون</span>
          <span className={`fox-stat-value ${stats.lowStockCount > 0 ? 'text-danger' : ''}`}>
            {stats.lowStockCount} أصناف
          </span>
        </div>

        <div className="fox-stat-card fox-stat-green fox-hover-lift">
          <div className="fox-stat-icon">📦</div>
          <span className="fox-stat-label">إجمالي وحدات المخزون</span>
          <span className="fox-stat-value">{stats.totalPieces.toLocaleString()} وحدة</span>
        </div>
      </div>

      {/* Expiry Warning Banner (Supermarket Food Safety & Loss Prevention) */}
      {expirySummary && (expirySummary.expiredCount > 0 || expirySummary.expiringCount > 0) && (
        <div
          onClick={() => setShowExpiryModal(true)}
          style={{
            background: expirySummary.expiredCount > 0 ? '#FEF2F2' : '#FFFBEB',
            border: `1.5px solid ${expirySummary.expiredCount > 0 ? '#FCA5A5' : '#FCD34D'}`,
            borderRadius: '12px',
            padding: '12px 18px',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
            boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
            transition: 'transform 0.15s ease',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '24px' }}>{expirySummary.expiredCount > 0 ? '🚫' : '⚠️'}</span>
            <div>
              <div style={{ fontWeight: 800, color: expirySummary.expiredCount > 0 ? '#991B1B' : '#92400E', fontSize: '14px' }}>
                {expirySummary.expiredCount > 0
                  ? `يوجد ${expirySummary.expiredCount} تشغيلة منتهية الصلاحية تماماً و ${expirySummary.expiringCount} قريبة من الانتهاء!`
                  : `تنبيه أمان المخزون الغذائي: ${expirySummary.expiringCount} تشغيلة تقترب من انتهاء الصلاحية خلال 30 يوماً`}
              </div>
              <div style={{ fontSize: '12px', color: expirySummary.expiredCount > 0 ? '#B91C1C' : '#B45309', marginTop: '2px' }}>
                إجمالي القيمة المعرضة للهلاك: <strong>{((expirySummary.expiredValue || 0) + (expirySummary.expiringValue || 0)).toFixed(2)} ج.م</strong> · اضغط هنا لفتح لوحة الصلاحيات والإعدام
              </div>
            </div>
          </div>
          <button
            type="button"
            className="fox-btn-secondary"
            style={{ fontSize: '12px', fontWeight: 700, padding: '6px 12px', whiteSpace: 'nowrap' }}
          >
            عرض التشغيلات والهالك 🔍
          </button>
        </div>
      )}

      {/* Add Product Form - Fox Luxury Card */}
      {showForm && (
        <form className="fox-form-card reports-fade-in" onSubmit={handleAddProduct}>
          <div className="fox-form-card-header">
            <div className="form-card-title-group">
              <span className="form-title-badge">✨ إضافة صنف</span>
              <h3 className="form-card-title">إضافة {getTerm('product', 'منتج')} جديد للمخزون</h3>
            </div>
            <button type="button" className="form-close-btn" onClick={() => setShowForm(false)}>✕ إلغاء</button>
          </div>

          {error && <p className="form-error">{error}</p>}

          <div className="fox-form-grid-main">
            {/* الحقول الأساسية */}
            <div className="form-field-group">
              <label className="form-label">اسم المنتج <span className="req-star">*</span></label>
              <div className="fox-field-input-wrap">
                <span className="field-icon">🏷️</span>
                <input
                  type="text"
                  className="fox-lux-input"
                  placeholder="اسم المنتج"
                  value={form.name}
                  onChange={(e) => updateForm('name', e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-field-group">
              <label className="form-label">الفئة أو التصنيف</label>
              <div className="fox-field-input-wrap">
                <span className="field-icon">📁</span>
                <input
                  type="text"
                  className="fox-lux-input"
                  list="category-list"
                  placeholder="اسم الفئة أو التصنيف"
                  value={form.categoryName}
                  onChange={(e) => updateForm('categoryName', e.target.value)}
                />
              </div>
              <datalist id="category-list">
                {categories.map((c) => <option key={c.id} value={c.name} />)}
              </datalist>
            </div>
          </div>

          {/* Variant details */}
          <div className="form-section-divider">
            <span>تفاصيل المتغير والأسعار المبدئية</span>
          </div>

          <div className="fox-form-row-5">
            {hasSize && <div className="form-field-group">
              <label className="form-label">المقاس</label>
              <input
                type="text"
                className="fox-lux-input"
                placeholder="M, L, XL, 32.."
                value={form.size}
                onChange={(e) => updateForm('size', e.target.value)}
              />
            </div>}

            {hasColor && <div className="form-field-group">
              <label className="form-label">اللون</label>
              <input
                type="text"
                className="fox-lux-input"
                placeholder="أسود, كحلي.."
                value={form.color}
                onChange={(e) => updateForm('color', e.target.value)}
              />
            </div>}

            <div className="form-field-group">
              <label className="form-label">السعر (ج.م) <span className="req-star">*</span></label>
              <div className="fox-field-input-wrap">
                <span className="field-icon">💰</span>
                <input
                  type="number"
                  className="fox-lux-input"
                  placeholder="0.00"
                  value={form.price}
                  onChange={(e) => updateForm('price', e.target.value)}
                  required
                />
              </div>
            </div>
            <ProductAttributeFields
              definitions={customAttributes}
              values={attributeValues}
              onChange={(id, value) => setAttributeValues((previous) => ({ ...previous, [id]: value }))}
            />

            <div className="form-field-group">
              <label className="form-label">الكمية بالمخزن <span className="req-star">*</span></label>
              <div className="fox-field-input-wrap">
                <span className="field-icon">📦</span>
                <input
                  type="number"
                  className="fox-lux-input"
                  placeholder="0"
                  value={form.stockQuantity}
                  onChange={(e) => updateForm('stockQuantity', e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-field-group">
              <label className="form-label">الباركود</label>
              <input
                type="text"
                className="fox-lux-input"
                placeholder="تلقائي لو فارغ"
                value={form.barcode}
                onChange={(e) => updateForm('barcode', e.target.value)}
              />
            </div>
          </div>

          {/* اختيار الصورة وزر الحفظ */}
          <div className="fox-form-footer-row">
            <div className="image-pick-area">
              <button type="button" className="fox-img-btn" onClick={handlePickImage}>
                <span>🖼️</span>
                <span>{form.imagePath ? 'تغيير صورة المنتج' : 'اختيار صورة المنتج من الجهاز'}</span>
              </button>
              {form.imagePath && (
                <div className="image-picked-preview">
                  <span className="picked-check">✓ تم إرفاق الصورة</span>
                  <button type="button" className="remove-img-btn" onClick={() => updateForm('imagePath', '')}>✕ إزالة</button>
                </div>
              )}
            </div>

            <button type="submit" className="fox-save-btn">
              <span>حفظ وإضافة المنتج للمحل</span>
              <span>←</span>
            </button>
          </div>
        </form>
      )}

      {/* Filter Bar: Search + Category Tabs */}
      <div className="products-filter-bar">
        <div className="search-bar-wrapper">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            placeholder="ابحث باسم المنتج..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className="clear-search-btn" onClick={() => setSearch('')}>✕</button>
          )}
        </div>

        <div className="products-category-pills">
          {allCategoryNames.map((cat) => (
            <button
              key={cat}
              className={`prod-pill ${activeCategory === cat ? 'active' : ''} ${cat.includes('نقص') ? 'warning-pill' : ''}`}
              onClick={() => setActiveCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Products Grid / Cards */}
      {loading ? (
        <ThreeLoadingScreen
          size="sm"
          text="جاري عرض تشكيلة المنتجات..."
          subtext="لحظات وتكون كل التفاصيل جاهزة أمامك..."
        />
      ) : (
        <div className="products-grid-modern">
          {pagedProducts.map((product) => {
            const totalStock = product.variants.reduce((sum, v) => sum + (v.stock_quantity || 0), 0);
            const isLowStock = product.variants.some((v) => v.stock_quantity <= v.low_stock_threshold);
            const minPrice = Math.min(...product.variants.map((v) => v.selling_price));
            const maxPrice = Math.max(...product.variants.map((v) => v.selling_price));
            const priceText = minPrice === maxPrice ? `${minPrice} ج.م` : `${minPrice} - ${maxPrice} ج.م`;

            return (
              <div key={product.id} className="fox-product-card fox-hover-lift">
                {/* Card Top Image & Badges */}
                <div className="prod-card-top-image">
                  {product.image_path ? (
                    <img
                      src={formatProductImageUrl(product.image_path)}
                      alt={product.name}
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <span className="prod-placeholder-icon">
                      {getCategoryIcon(product.categoryName, product.name, sectorKey)}
                    </span>
                  )}

                  <div className="prod-card-badges">
                    <span className="prod-cat-badge">{product.categoryName || 'منتجات'}</span>
                    {totalStock === 0 ? (
                      <span className="prod-stock-pill badge-danger">نفذت بالكامل</span>
                    ) : isLowStock ? (
                      <span className="prod-stock-pill badge-warning">نواقص ({totalStock})</span>
                    ) : (
                      <span className="prod-stock-pill badge-success">{totalStock} {quantityLabel}</span>
                    )}
                  </div>
                </div>

                {/* Card Body */}
                <div className="prod-card-body">
                  {editingProductId === product.id ? (
                    <form className="edit-product-form" onSubmit={(e) => handleSaveProductEdit(e, product.id)}>
                      <input
                        type="text" value={editProductForm.name}
                        onChange={(e) => setEditProductForm((p) => ({ ...p, name: e.target.value }))}
                        required
                      />
                      <input
                        type="text" list="category-list" placeholder="الفئة"
                        value={editProductForm.categoryName}
                        onChange={(e) => setEditProductForm((p) => ({ ...p, categoryName: e.target.value }))}
                      />
                      <button type="submit" className="small-btn">حفظ</button>
                      <button type="button" className="small-btn-outline" onClick={() => setEditingProductId(null)}>إلغاء</button>
                    </form>
                  ) : (
                    <div className="prod-title-row">
                      <h4 className="prod-title">{product.name}</h4>
                      <span className="prod-price-tag">{priceText}</span>
                    </div>
                  )}

                  {/* Variants Preview Chips */}
                  <div className="prod-variants-summary">
                    <div className="variants-summary-title">
                      <span>{variantLabel} ({product.variants.length})</span>
                      <span>المخزون الإجمالي: {totalStock}</span>
                    </div>
                    <div className="variants-chips-row">
                      {product.variants.slice(0, 5).map((v) => (
                        <span
                          key={v.id}
                          className={`size-chip-badge ${v.stock_quantity === 0 ? 'chip-out' : ''}`}
                          title={`الكمية: ${v.stock_quantity} | السعر: ${v.selling_price} ج.م`}
                        >
                          <span className="chip-color-dot" />
                          {v.size || v.color || v.attributes?.map((attribute) => attribute.value).find(Boolean) || (isGrocery ? 'وحدة' : 'متغير')} ({v.stock_quantity})
                        </span>
                      ))}
                      {product.variants.length > 5 && (
                        <span className="size-chip-badge" style={{ background: '#EEF2FF', color: '#F2600C' }}>
                          +{product.variants.length - 5} أكثر
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Card Footer Actions */}
                  <div className="prod-card-footer">
                    <button
                      type="button"
                      className="prod-btn-details"
                      onClick={() => setSelectedProductForModal(product)}
                    >
                      <span>⚙️ إدارة {variantLabel} والأسعار ({product.variants.length})</span>
                    </button>
                    {product.variants?.[0] && (
                      <button
                        type="button"
                        className="icon-btn"
                        title="تعدد وحدات القياس (كرتونة / باكت / علبة)"
                        onClick={() => setSelectedVariantForUnits({ variant: product.variants[0], productName: product.name })}
                      >
                        📦
                      </button>
                    )}
                    <button className="icon-btn" title="تعديل اسم المنتج" onClick={() => startEditProduct(product)}>✎</button>
                    <button className="icon-btn icon-btn-danger" title="حذف المنتج" onClick={() => handleDeleteProduct(product.id, product.name)}>🗑</button>
                  </div>
                </div>
              </div>
            );
          })}

          {filteredProducts.length === 0 && (
            <div className="products-empty">
              <span>{getCategoryIcon('', '', sectorKey)}</span>
              <strong>لا توجد منتجات مطابقة لهذا البحث أو التصنيف</strong>
              <p>جرّب اختيار تصنيف آخر أو إضافة منتجات جديدة إلى المحل</p>
            </div>
          )}
        </div>
      )}

      {!loading && filteredProducts.length > 0 && (
        <nav className="products-pagination" aria-label="صفحات المنتجات">
          <div className="products-pagination-summary">
            عرض {(visiblePage - 1) * pageSize + 1} - {Math.min(visiblePage * pageSize, filteredProducts.length)} من {filteredProducts.length} منتج
          </div>
          <div className="products-pagination-controls">
            <label htmlFor="products-page-size">منتج في الصفحة</label>
            <select
              id="products-page-size"
              value={pageSize}
              onChange={(event) => setPageSize(Number(event.target.value))}
            >
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <button
              type="button"
              className="secondary-btn"
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              disabled={visiblePage === 1}
              aria-label="الصفحة السابقة"
            >
              السابقة
            </button>
            <span aria-live="polite">الصفحة {visiblePage} من {pageCount}</span>
            <button
              type="button"
              className="secondary-btn"
              onClick={() => setCurrentPage((page) => Math.min(pageCount, page + 1))}
              disabled={visiblePage === pageCount}
              aria-label="الصفحة التالية"
            >
              التالية
            </button>
          </div>
        </nav>
      )}

      {/* Modal for Detailed Variants & Pricing Management */}
      {currentModalProduct && (
        <ProductVariantsModal
          product={currentModalProduct}
          attributes={attributes}
          onClose={() => setSelectedProductForModal(null)}
          onAddVariant={addVariant}
          onEditVariant={editVariant}
          onDeleteVariant={removeVariant}
          onPrintBarcode={handlePrintBarcode}
          onPrintPriceTag={handlePrintPriceTag}
          onOpenUnits={(v, name) => setSelectedVariantForUnits({ variant: v, productName: name })}
          quantityLabel={quantityLabel}
        />
      )}

      {/* Modal for Multi-UOM Secondary Units (Carton / Box / Pack) */}
      {selectedVariantForUnits && (
        <ProductUnitsModal
          isOpen={Boolean(selectedVariantForUnits)}
          onClose={() => setSelectedVariantForUnits(null)}
          productVariant={selectedVariantForUnits.variant}
          productName={selectedVariantForUnits.productName}
        />
      )}

      {/* Modal for Expiry, Batches, and Scale Barcode Configuration */}
      <ExpiryManagerModal
        isOpen={showExpiryModal}
        onClose={() => {
          setShowExpiryModal(false);
          loadExpirySummary();
        }}
        products={products}
      />

      {/* Import Excel Modal */}
      <ImportExcelModal 
        isOpen={showImportModal} 
        onClose={() => setShowImportModal(false)} 
        type="products" 
        onSuccess={() => refresh()} 
      />
    </div>
  );
}

export default ProductsPage;
