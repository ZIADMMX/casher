import { useState, useEffect, useMemo, useRef } from 'react';
import { getSectorIdentity } from '../../utils/sectorIdentity.js';

/**
 * CatalogPreviewStep.jsx
 * الخطوة 2 من معالج التهيئة: الإعداد الجاهز والكتالوج المخصص
 * تتيح للمستخدم مراجعة المنتجات أو الخدمات والأسعار، الأقسام، والمواعيد بهوية القطاع
 */

export default function CatalogPreviewStep({
  sectorKey = 'retail',
  storeName = '',
  customSectorName = '',
  onBack,
  onNext,
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [presetMeta, setPresetMeta] = useState(null);

  const identity = useMemo(() => getSectorIdentity(sectorKey), [sectorKey]);

  // Core Customization State
  const [storeLogo, setStoreLogo] = useState(null);
  const [workingHours, setWorkingHours] = useState({
    open_time: '09:00',
    close_time: '23:00',
    days: ['السبت', 'الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'],
    closed_days: [],
    formatted_text: 'يومياً من 09:00 صباحاً حتى 11:00 مساءً',
  });
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [addons, setAddons] = useState([]);

  // UI Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('all');

  // New Item Inline/Modal States
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatStation, setNewCatStation] = useState('');

  const [showAddProduct, setShowAddProduct] = useState(false);
  const [newProdName, setNewProdName] = useState('');
  const [newProdCategory, setNewProdCategory] = useState('');
  const [newProdSellPrice, setNewProdSellPrice] = useState('');
  const [newProdBuyPrice, setNewProdBuyPrice] = useState('');
  const [newProdStock, setNewProdStock] = useState('10');

  const [showAddAddon, setShowAddAddon] = useState(false);
  const [newAddonName, setNewAddonName] = useState('');
  const [newAddonPrice, setNewAddonPrice] = useState('');

  const fileInputRef = useRef(null);

  // 1. Fetch Preset on Mount
  useEffect(() => {
    let isMounted = true;
    async function loadPreset() {
      setLoading(true);
      setError('');
      try {
        const getPreset = window.electronAPI?.getOnboardingPreset;
        let data = null;
        if (getPreset) {
          const res = await getPreset(sectorKey);
          if (res && res.success === false) {
            throw new Error(res.message || 'تعذر تحميل بيانات القطاع');
          }
          data = res?.data || res;
        }

        if (!data || !data.starter_categories) {
          // Default Fallback
          data = {
            sector_key: sectorKey,
            sector_name: customSectorName || 'نشاط تجاري عام',
            terminology: { order: 'فاتورة', item: 'صنف', table: 'طاولة', client: 'عميل' },
            starter_categories: [
              { name: 'عام', station: 'المتجر الرئيسي' },
              { name: 'خدمات سريعة', station: 'المتجر الرئيسي' },
            ],
            starter_products: [
              { name: 'بند تجريبي 1', category_name: 'عام', selling_price: 150, purchase_price: 100, stock_quantity: 15 },
              { name: 'بند تجريبي 2', category_name: 'عام', selling_price: 85, purchase_price: 50, stock_quantity: 20 },
            ],
            starter_addons: [],
            starter_working_hours: {
              open_time: '09:00',
              close_time: '23:00',
              days: ['السبت', 'الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'],
              closed_days: [],
              formatted_text: 'يومياً من 09:00 ص إلى 11:00 م',
            },
          };
        }

        if (isMounted) {
          setPresetMeta(data);
          setCategories(data.starter_categories || []);
          setProducts(data.starter_products || []);
          setAddons(data.starter_addons || []);
          if (data.starter_working_hours) {
            setWorkingHours(data.starter_working_hours);
          }
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message || 'تعذر تحميل الإعدادات الافتراضية للنشاط');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadPreset();
    return () => {
      isMounted = false;
    };
  }, [sectorKey, customSectorName]);

  // 2. Computed Financial & Catalog KPIs
  const kpis = useMemo(() => {
    let totalStock = 0;
    let totalCost = 0;
    let totalRetail = 0;

    for (const p of products) {
      const isItemService = identity.isService || p.is_service || Number(p.stock_quantity) === 0;
      const qty = Number(p.stock_quantity) || 0;
      const sell = Number(p.selling_price) || 0;
      const buy = Number(p.purchase_price) || 0;

      if (isItemService) {
        totalCost += buy;
        totalRetail += sell;
      } else {
        totalStock += qty;
        totalCost += buy * qty;
        totalRetail += sell * qty;
      }
    }

    const grossProfit = totalRetail - totalCost;
    const profitMargin = totalRetail > 0 ? ((grossProfit / totalRetail) * 100).toFixed(1) : 0;

    return {
      productsCount: products.length,
      categoriesCount: categories.length,
      addonsCount: addons.length,
      totalStock,
      totalCost: Math.round(totalCost * 100) / 100,
      totalRetail: Math.round(totalRetail * 100) / 100,
      grossProfit: Math.round(grossProfit * 100) / 100,
      profitMargin,
    };
  }, [products, categories, addons, identity.isService]);

  // 3. Logo Upload Handling
  function handleLogoSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('يرجى اختيار ملف صورة صالح (PNG, JPG, SVG, WebP)');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('حجم الصورة كبير جداً، يرجى اختيار صورة أقل من 5 ميجابايت');
      return;
    }

    setError('');
    const reader = new FileReader();
    reader.onload = () => {
      setStoreLogo(reader.result);
    };
    reader.onerror = () => {
      setError('تعذر قراءة ملف الصورة');
    };
    reader.readAsDataURL(file);
  }

  function handleRemoveLogo() {
    setStoreLogo(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  // 4. Product Mutations
  function handleProductPriceChange(index, field, value) {
    const num = Math.max(0, parseFloat(value) || 0);
    setProducts((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: num };
      return copy;
    });
  }

  function handleProductStockChange(index, value) {
    const qty = Math.max(0, parseInt(value, 10) || 0);
    setProducts((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], stock_quantity: qty };
      return copy;
    });
  }

  function handleDeleteProduct(index) {
    setProducts((prev) => prev.filter((_, i) => i !== index));
  }

  function handleAddProductSubmit(e) {
    e.preventDefault();
    if (!newProdName.trim()) {
      setError(`يرجى إدخال اسم ${identity.isService ? 'الخدمة' : 'المنتج'}`);
      return;
    }
    const sellPrice = parseFloat(newProdSellPrice) || 0;
    const buyPrice = parseFloat(newProdBuyPrice) || 0;
    const stock = identity.isService ? 0 : (parseInt(newProdStock, 10) || 0);

    const firstCatName = categories[0]?.name || (typeof categories[0] === 'string' ? categories[0] : 'عام');

    const newProduct = {
      name: newProdName.trim(),
      category_name: newProdCategory.trim() || firstCatName,
      selling_price: sellPrice,
      purchase_price: buyPrice,
      stock_quantity: stock,
      low_stock_threshold: identity.isService ? 0 : 3,
      is_service: identity.isService,
    };

    setProducts((prev) => [newProduct, ...prev]);
    setNewProdName('');
    setNewProdCategory('');
    setNewProdSellPrice('');
    setNewProdBuyPrice('');
    setNewProdStock(identity.isService ? '0' : '10');
    setShowAddProduct(false);
    setError('');
  }

  // 5. Category Mutations
  function handleDeleteCategory(catName) {
    setCategories((prev) => prev.filter((c) => (typeof c === 'string' ? c !== catName : c.name !== catName)));
  }

  function handleAddCategorySubmit(e) {
    e.preventDefault();
    if (!newCatName.trim()) return;
    const trimmed = newCatName.trim();
    if (categories.some((c) => (typeof c === 'string' ? c === trimmed : c.name === trimmed))) {
      setError(`هذا ${identity.categoryUnit || 'القسم'} موجود بالفعل`);
      return;
    }

    setCategories((prev) => [...prev, { name: trimmed, station: newCatStation.trim() || null }]);
    setNewCatName('');
    setNewCatStation('');
    setShowAddCategory(false);
    setError('');
  }

  // 6. Addon Mutations
  function handleDeleteAddon(index) {
    setAddons((prev) => prev.filter((_, i) => i !== index));
  }

  function handleAddAddonSubmit(e) {
    e.preventDefault();
    if (!newAddonName.trim()) return;
    const price = parseFloat(newAddonPrice) || 0;
    setAddons((prev) => [...prev, { name: newAddonName.trim(), price, currency: 'EGP' }]);
    setNewAddonName('');
    setNewAddonPrice('');
    setShowAddAddon(false);
  }

  // 7. Filtered Products
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchesSearch = searchQuery
        ? p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.category_name?.toLowerCase().includes(searchQuery.toLowerCase())
        : true;
      const matchesCategory =
        selectedCategoryFilter === 'all' || p.category_name === selectedCategoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [products, searchQuery, selectedCategoryFilter]);

  // 8. Submit to Next Step (Step 3: Provisioning)
  function handleConfirmAndProceed() {
    if (products.length === 0) {
      setError(identity.isService ? 'يرجى الاحتفاظ بخدمة واحدة على الأقل أو إضافة خدمات جديدة للمتابعة' : 'يرجى الاحتفاظ بمنتج واحد على الأقل أو إضافة منتجات لبدء نشاطك');
      return;
    }

    onNext({
      sectorKey,
      storeName: storeName || presetMeta?.sector_name || 'متجري',
      customSectorName,
      storeLogo,
      workingHours,
      categories,
      products,
      addons,
      kpis,
      primaryActionTitle: presetMeta?.primary_action_title || 'استقبل أول طلب',
      primaryActionRoute: presetMeta?.primary_action_route || '/pos',
    });
  }

  if (loading) {
    return (
      <div className="catalog-loading-state">
        <div className="onboarding-spinner" />
        <p className="loading-text">جارٍ تجهيز الكتالوج وقائمة الأسعار المقترحة للنشاط...</p>
      </div>
    );
  }

  return (
    <div className="catalog-step-container">
      {/* Header Info */}
      <div className="catalog-step-header">
        <div className="header-title-wrap">
          <span className="step-tag">الخطوة 2 من 4 • {identity.businessNamePrefix || 'النشاط'}</span>
          <h2 className="catalog-main-title">{identity.stepTitle}</h2>
          <p className="catalog-sub-title">
            {identity.stepSubtitle || (
              <>
                قمنا بتهيئة قائمة أسعار محلية نموذجية لـ{' '}
                <strong className="text-highlight">
                  {presetMeta?.sector_name || customSectorName || 'نشاطك التجاري'}
                </strong>
                . يمكنك تعديل الأسعار والتخصصات وإضافة بنود جديدة، ثم المتابعة.
              </>
            )}
          </p>
        </div>
      </div>

      {error && (
        <div className="catalog-error-banner" role="alert">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="alert-icon">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {/* Financial KPIs Banner */}
      <div className="catalog-kpi-grid">
        <div className="kpi-card">
          <span className="kpi-label">{identity.kpi1Label}</span>
          <div className="kpi-value-row">
            <span className="kpi-number">{kpis.productsCount}</span>
            <span className="kpi-unit">{identity.kpi1Unit}</span>
          </div>
        </div>

        <div className="kpi-card">
          <span className="kpi-label">{identity.kpi2Label}</span>
          <div className="kpi-value-row">
            <span className="kpi-number">{kpis.categoriesCount}</span>
            <span className="kpi-unit">{identity.kpi2Unit}</span>
          </div>
        </div>

        <div className="kpi-card">
          <span className="kpi-label">{identity.kpi3Label}</span>
          <div className="kpi-value-row">
            <span className="kpi-number text-cyan">{kpis.totalCost.toLocaleString()}</span>
            <span className="kpi-unit">ج.م</span>
          </div>
        </div>

        <div className="kpi-card">
          <span className="kpi-label">{identity.kpi4Label}</span>
          <div className="kpi-value-row">
            <span className="kpi-number text-orange">{kpis.totalRetail.toLocaleString()}</span>
            <span className="kpi-unit">ج.م</span>
          </div>
        </div>

        <div className="kpi-card highlight">
          <span className="kpi-label">{identity.kpi5Label}</span>
          <div className="kpi-value-row">
            <span className="kpi-number text-green">{kpis.profitMargin}%</span>
            <span className="kpi-unit">+{kpis.grossProfit.toLocaleString()} ج.م</span>
          </div>
        </div>
      </div>

      {/* Top 2 Cards: Logo & Working Hours */}
      <div className="catalog-top-grid">
        {/* Logo Card */}
        <div className="catalog-section-card logo-card">
          <div className="card-header-line">
            <div className="card-title-group">
              <span className="card-icon">🎨</span>
              <h3 className="card-title">{identity.logoTitle}</h3>
            </div>
            <span className="card-badge optional">اختياري</span>
          </div>
          <p className="card-desc">{identity.logoDesc}</p>

          <div className="logo-upload-box">
            {storeLogo ? (
              <div className="logo-preview-wrapper">
                <img src={storeLogo} alt="شعار المتجر" className="logo-img-preview" />
                <div className="logo-actions">
                  <span className="logo-status-tag">✓ جاهز للاستخدام</span>
                  <button type="button" className="btn-text-danger" onClick={handleRemoveLogo}>
                    إزالة الشعار
                  </button>
                </div>
              </div>
            ) : (
              <div
                className="logo-dropzone"
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
                tabIndex={0}
                role="button"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
                  style={{ display: 'none' }}
                  onChange={handleLogoSelect}
                />
                <div className="dropzone-inner">
                  <div className="upload-icon-circle">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                  </div>
                  <div className="upload-text-group">
                    <span className="upload-main-text">اضغط لرفع الشعار أو اسحبه هنا</span>
                    <span className="upload-hint-text">PNG, JPG, SVG بحد أقصى 5MB (يمكنك التخطي الآن)</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Working Hours Card */}
        <div className="catalog-section-card hours-card">
          <div className="card-header-line">
            <div className="card-title-group">
              <span className="card-icon">⏰</span>
              <h3 className="card-title">مواعيد العمل واستقبال الطلبات</h3>
            </div>
          </div>
          <p className="card-desc">أوقات فتح وإغلاق النشاط ومواعيد استقبال العملاء</p>

          <div className="working-hours-inputs">
            <div className="time-row">
              <div className="time-field">
                <label>وقت بدء العمل</label>
                <input
                  type="time"
                  value={workingHours.open_time}
                  onChange={(e) => setWorkingHours((prev) => ({ ...prev, open_time: e.target.value }))}
                  className="time-input"
                />
              </div>
              <div className="time-separator">إلى</div>
              <div className="time-field">
                <label>وقت الإغلاق</label>
                <input
                  type="time"
                  value={workingHours.close_time}
                  onChange={(e) => setWorkingHours((prev) => ({ ...prev, close_time: e.target.value }))}
                  className="time-input"
                />
              </div>
            </div>

            <div className="days-badge-container">
              <span className="days-label">أيام العمل:</span>
              <div className="days-pills">
                {workingHours.days.map((day) => (
                  <span key={day} className="day-pill active">
                    {day}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Categories / Specialties */}
      <div className="catalog-section-card">
        <div className="card-header-line">
          <div className="card-title-group">
            <span className="card-icon">📂</span>
            <h3 className="card-title">{identity.categoriesTitle}</h3>
            <span className="count-badge">{categories.length}</span>
          </div>
          <button
            type="button"
            className="btn-outline-small"
            onClick={() => setShowAddCategory(!showAddCategory)}
          >
            {showAddCategory ? 'إلغاء' : identity.addCategoryBtn}
          </button>
        </div>

        {showAddCategory && (
          <form className="inline-add-form" onSubmit={handleAddCategorySubmit}>
            <input
              type="text"
              placeholder={identity.categoryPlaceholder}
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              className="inline-input"
              autoFocus
            />
            <input
              type="text"
              placeholder={identity.categoryStationPlaceholder}
              value={newCatStation}
              onChange={(e) => setNewCatStation(e.target.value)}
              className="inline-input"
            />
            <button type="submit" className="btn-submit-small">
              إضافة
            </button>
          </form>
        )}

        <div className="categories-chips-wrap">
          {categories.map((cat, idx) => {
            const name = typeof cat === 'string' ? cat : cat.name;
            const station = typeof cat === 'object' ? cat.station : null;
            return (
              <div key={idx} className="category-chip">
                <span className="cat-name">{name}</span>
                {station && <span className="station-sub-tag">📍 {station}</span>}
                <button
                  type="button"
                  className="chip-delete-btn"
                  title="حذف"
                  onClick={() => handleDeleteCategory(name)}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Optional Addons */}
      {(addons.length > 0 || showAddAddon) && (
        <div className="catalog-section-card">
          <div className="card-header-line">
            <div className="card-title-group">
              <span className="card-icon">✨</span>
              <h3 className="card-title">{identity.addonsTitle}</h3>
              <span className="count-badge">{addons.length}</span>
            </div>
            <button
              type="button"
              className="btn-outline-small"
              onClick={() => setShowAddAddon(!showAddAddon)}
            >
              {showAddAddon ? 'إلغاء' : identity.addAddonBtn}
            </button>
          </div>

          {showAddAddon && (
            <form className="inline-add-form" onSubmit={handleAddAddonSubmit}>
              <input
                type="text"
                placeholder={identity.newAddonPlaceholder}
                value={newAddonName}
                onChange={(e) => setNewAddonName(e.target.value)}
                className="inline-input"
                autoFocus
              />
              <input
                type="number"
                step="0.5"
                placeholder="القيمة الإضافية ج.م"
                value={newAddonPrice}
                onChange={(e) => setNewAddonPrice(e.target.value)}
                className="inline-input price-input"
              />
              <button type="submit" className="btn-submit-small">
                حفظ
              </button>
            </form>
          )}

          <div className="addons-chips-wrap">
            {addons.map((ad, idx) => (
              <div key={idx} className="addon-chip">
                <span className="addon-name">{ad.name}</span>
                <span className="addon-price">+{ad.price} ج.م</span>
                <button
                  type="button"
                  className="chip-delete-btn"
                  title="حذف"
                  onClick={() => handleDeleteAddon(idx)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Items Table & Pricing Customization */}
      <div className="catalog-section-card products-table-card">
        <div className="table-top-bar">
          <div className="table-title-group">
            <div className="card-title-group">
              <span className="card-icon">🏷️</span>
              <h3 className="card-title">{identity.itemsTitle}</h3>
            </div>
            <p className="card-desc">{identity.itemsDesc}</p>
          </div>

          <div className="table-actions-group">
            <div className="table-search-box">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="search-icon">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                placeholder={identity.searchPlaceholder}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="table-search-input"
              />
            </div>

            <select
              value={selectedCategoryFilter}
              onChange={(e) => setSelectedCategoryFilter(e.target.value)}
              className="table-filter-select"
            >
              <option value="all">{identity.filterAllText} ({products.length})</option>
              {categories.map((c, i) => {
                const cName = typeof c === 'string' ? c : c.name;
                return (
                  <option key={i} value={cName}>
                    {cName}
                  </option>
                );
              })}
            </select>

            <button
              type="button"
              className="btn-outline-small highlight"
              onClick={() => setShowAddProduct(!showAddProduct)}
            >
              {showAddProduct ? 'إلغاء' : identity.addItemBtn}
            </button>
          </div>
        </div>

        {/* Add Item Inline Form */}
        {showAddProduct && (
          <form className="inline-add-product-form" onSubmit={handleAddProductSubmit}>
            <div className="form-row">
              <input
                type="text"
                placeholder={identity.newItemPlaceholder}
                value={newProdName}
                onChange={(e) => setNewProdName(e.target.value)}
                className="prod-form-input name-col"
                required
              />
              <select
                value={newProdCategory}
                onChange={(e) => setNewProdCategory(e.target.value)}
                className="prod-form-input"
              >
                <option value="">{`اختر ${identity.categoryColHeader}`}</option>
                {categories.map((c, i) => {
                  const cName = typeof c === 'string' ? c : c.name;
                  return (
                    <option key={i} value={cName}>
                      {cName}
                    </option>
                  );
                })}
              </select>
              <input
                type="number"
                step="0.5"
                placeholder={identity.newCostPlaceholder}
                value={newProdBuyPrice}
                onChange={(e) => setNewProdBuyPrice(e.target.value)}
                className="prod-form-input"
              />
              <input
                type="number"
                step="0.5"
                placeholder={identity.newPricePlaceholder}
                value={newProdSellPrice}
                onChange={(e) => setNewProdSellPrice(e.target.value)}
                className="prod-form-input"
                required
              />
              {!identity.isService && (
                <input
                  type="number"
                  placeholder="كمية المخزون"
                  value={newProdStock}
                  onChange={(e) => setNewProdStock(e.target.value)}
                  className="prod-form-input"
                />
              )}
              <button type="submit" className="btn-submit-small">
                إضافة للقائمة
              </button>
            </div>
          </form>
        )}

        {/* Responsive Table */}
        <div className="table-responsive-wrapper">
          <table className="onboarding-table">
            <thead>
              <tr>
                <th style={{ width: '32%' }}>{identity.itemColHeader}</th>
                <th style={{ width: '18%' }}>{identity.categoryColHeader}</th>
                <th style={{ width: '14%' }}>{identity.costColHeader}</th>
                <th style={{ width: '14%' }}>{identity.priceColHeader}</th>
                <th style={{ width: '10%' }}>{identity.stockColHeader}</th>
                <th style={{ width: '8%' }}>{identity.profitColHeader}</th>
                <th style={{ width: '4%' }}>حذف</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="empty-table-cell">
                    {identity.emptyMessage}
                  </td>
                </tr>
              ) : (
                filteredProducts.map((p, idx) => {
                  const realIndex = products.indexOf(p);
                  const isServiceItem = identity.isService || p.is_service || Number(p.stock_quantity) === 0;
                  const margin = p.selling_price > 0
                    ? (((p.selling_price - p.purchase_price) / p.selling_price) * 100).toFixed(0)
                    : 0;
                  return (
                    <tr key={idx}>
                      <td>
                        <div className="prod-cell">
                          <span className="prod-title onboarding-item-name">{p.name}</span>
                          {p.description && <span className="prod-meta onboarding-item-desc">{p.description}</span>}
                        </div>
                      </td>
                      <td>
                        <span className="category-pill-tag">{p.category_name}</span>
                      </td>
                      <td>
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          value={p.purchase_price}
                          onChange={(e) => handleProductPriceChange(realIndex, 'purchase_price', e.target.value)}
                          className="table-editable-input"
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          value={p.selling_price}
                          onChange={(e) => handleProductPriceChange(realIndex, 'selling_price', e.target.value)}
                          className="table-editable-input highlight"
                        />
                      </td>
                      <td>
                        {isServiceItem ? (
                          <span className="service-stock-badge">
                            {identity.serviceBadgeText || 'خدمة'}
                          </span>
                        ) : (
                          <input
                            type="number"
                            min="0"
                            value={p.stock_quantity ?? 10}
                            onChange={(e) => handleProductStockChange(realIndex, e.target.value)}
                            className="table-editable-input"
                          />
                        )}
                      </td>
                      <td>
                        <span className={`profit-badge ${margin > 30 ? 'high' : margin > 15 ? 'mid' : 'low'}`}>
                          {margin}%
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="table-row-del-btn"
                          title="حذف هذا البند"
                          onClick={() => handleDeleteProduct(realIndex)}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bottom Sticky Action Bar */}
      <div className="catalog-bottom-nav">
        <button type="button" className="onboarding-back-btn" onClick={onBack}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="back-arrow-icon">
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
          </svg>
          <span>تغيير النشاط</span>
        </button>

        <div className="bottom-summary-preview">
          <span>{identity.footerReadyText(products.length, categories.length, kpis.totalCost.toLocaleString())}</span>
        </div>

        <button
          type="button"
          className="onboarding-primary-btn"
          onClick={handleConfirmAndProceed}
          disabled={products.length === 0}
        >
          <span>تأكيد والبدء بالإنشاء السريع 🚀</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="btn-arrow-icon">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
        </button>
      </div>
    </div>
  );
}
