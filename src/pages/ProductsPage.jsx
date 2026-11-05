import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDispatch } from 'react-redux';
import useProducts from '../hooks/useProducts.js';
import { useDebounce } from '../hooks/useDebounce.js';
import useBarcodeScanner, { normalizeBarcodeText } from '../hooks/useBarcodeScanner.js';
import ImportExcelModal from '../components/ImportExcelModal.jsx';
import { playSuccessBeep } from '../utils/beep.js';
import { formatProductImageUrl } from '../utils/media.js';
import { hasPermission } from '../utils/accessControl.js';
import { useBusinessProfile } from '../contexts/BusinessProfileContext.jsx';
import { useUser } from '../contexts/UserContext.jsx';
import BundlePromotionsPanel from '../components/products/BundlePromotionsPanel.jsx';
import ProductUnitsModal from '../components/products/ProductUnitsModal.jsx';
import ExpiryManagerModal from '../components/products/ExpiryManagerModal.jsx';
import {
  AddProductDialog, ArchiveDialog, ArchiveGlyph, Dialog, ProductDetailsDialog, UnlockDialog,
} from '../components/products/ProductDialogs.jsx';
import { getCategoryIcon } from '../components/ProductGrid.jsx';
import {
  AlertIcon, EyeIcon, GiftIcon, KeyIcon, LockIcon, PencilIcon, PlusIcon, ProductLineIcon, SearchIcon,
  SheetIcon, ShieldIcon,
} from '../components/icons/PosIcons.jsx';
import { setProducts } from '../features/products/productsSlice';
import * as groceryApi from '../api/grocery.js';
import * as printingApi from '../api/printing.js';
import * as productsApi from '../api/products.js';
import '../styles/products.css';

const ALL = '__all__';
const TONES = ['primary', 'danger', 'success', 'info', 'highlight', 'warning'];
const LOCKED_ACCESS = { canCreate: false, canEdit: false, canDelete: false, canAdjustStock: false, canSeeCost: false, ownEdit: false, unlock: null };

// Who may do what. Mirrors the server rules in products.service / permissions.js.
const RULES = [
  { action: 'عرض المنتجات', cashier: 'نعم', manager: 'نعم', tone: 'ok' },
  { action: 'تعديل السعر', cashier: 'لا', manager: 'بسبب', tone: 'ok' },
  { action: 'إضافة / استيراد', cashier: 'لا', manager: 'نعم', tone: 'ok' },
  { action: 'أرشفة منتج', cashier: 'لا', manager: 'بتأكيد', tone: 'ok' },
];

/* ---------- small formatting helpers ---------- */
function parseDbDate(value) {
  if (!value) return null;
  const text = String(value);
  const date = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(text) ? text : `${text.replace(' ', 'T')}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function relativeDay(value) {
  const date = parseDbDate(value);
  if (!date) return '—';
  const days = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86400000);
  if (days <= 0) return 'النهارده';
  if (days === 1) return 'امبارح';
  if (days === 2) return 'من يومين';
  if (days < 7) return `من ${days} أيام`;
  if (days < 14) return 'من أسبوع';
  if (days < 21) return 'من أسبوعين';
  if (days < 31) return `من ${Math.floor(days / 7)} أسابيع`;
  if (days < 60) return 'من شهر';
  return `من ${Math.floor(days / 30)} شهور`;
}

function clock(value) {
  const date = parseDbDate(value);
  if (!date) return '';
  return date.toLocaleTimeString('ar-EG-u-nu-latn', { hour: 'numeric', minute: '2-digit' });
}

function when(value) {
  return `${relativeDay(value)} ${clock(value)}`.trim();
}

function money(value) {
  const number = Number(value) || 0;
  return number.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function productCode(id) {
  return `P-${String(id).padStart(3, '0')}`;
}

function priceRange(product) {
  const prices = (product.variants || []).map((variant) => Number(variant.selling_price) || 0);
  if (!prices.length) return '—';
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return min === max ? money(min) : `${money(min)} - ${money(max)}`;
}

/* ---------- change history rendering ---------- */
function logTone(entry) {
  if (entry.action === 'price') return 'primary';
  if (['denied', 'unlock_denied', 'archive'].includes(entry.action)) return 'danger';
  if (entry.action === 'unlock') return 'warning';
  return 'muted';
}

const FIELD_NAMES = { name: 'الاسم', category: 'التصنيف', description: 'الوصف', image: 'الصورة', size: 'المقاس', color: 'اللون', barcode: 'الباركود' };

function LogText({ entry }) {
  const name = entry.productName ? <strong>{entry.productName}</strong> : null;
  switch (entry.action) {
    case 'price':
      return (
        <>
          {entry.field === 'purchase_price' ? 'تكلفة' : 'سعر'} {name}
          {entry.oldValue != null && <> من {money(entry.oldValue)} ← {money(entry.newValue)} ج.م</>}
        </>
      );
    case 'create': return <>إضافة منتج {name}</>;
    case 'variant_add': return <>إضافة خيار «{entry.newValue}» لـ {name}</>;
    case 'variant_update': return <>تعديل {FIELD_NAMES[entry.field] || 'خيار'} في {name}</>;
    case 'variant_delete': return <>حذف خيار «{entry.oldValue}» من {name}</>;
    case 'update': return <>تعديل {FIELD_NAMES[entry.field] || 'بيانات'} {name}</>;
    case 'archive': return <>أرشفة {name || <strong>{entry.oldValue}</strong>}</>;
    case 'unlock': return <>فتح التعديل بكود المدير</>;
    case 'unlock_denied': return <>محاولة فتح تعديل مرفوضة</>;
    case 'denied': return <>محاولة تعديل مرفوضة {name}</>;
    default: return entry.actionLabel;
  }
}

function LogMeta({ entry }) {
  const parts = [entry.approvedByName ? `${entry.username} بموافقة ${entry.approvedByName}` : entry.username, when(entry.createdAt)];
  if (entry.reason) parts.push(entry.action === 'price' ? `السبب: ${entry.reason}` : entry.reason);
  return <span className="prd-log__meta">{parts.join(' · ')}</span>;
}

function LogList({ entries }) {
  if (!entries.length) return <p className="prd-muted">لسه مفيش تعديلات مسجلة.</p>;
  return (
    <ul className="prd-log">
      {entries.map((entry) => (
        <li key={entry.id} className="prd-log__item">
          <span className={`prd-log__dot prd-log__dot--${logTone(entry)}`} aria-hidden="true" />
          <div>
            <p className="prd-log__text"><LogText entry={entry} /></p>
            <LogMeta entry={entry} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ======================================================================== */

function ProductsPage({ onNavigate }) {
  const { attributes, configuration, getTerm } = useBusinessProfile();
  const { currentUser } = useUser();
  const dispatch = useDispatch();
  const sectorKey = configuration?.profile?.key
    || configuration?.settings?.business_type
    || configuration?.settings?.onboarding_sector
    || 'retail';
  const isGrocery = sectorKey === 'grocery';
  const quantityLabel = isGrocery ? 'وحدة' : 'قطعة';
  const termProducts = getTerm('product', 'المنتجات');
  const termProduct = getTerm('product', 'منتج');

  const configuredAttributeKeys = new Set((configuration?.settings?.attributes || []).map(String));
  for (const attribute of attributes) configuredAttributeKeys.add(attribute.attribute_key);
  const hasSize = configuredAttributeKeys.has('size');
  const hasColor = configuredAttributeKeys.has('color');
  const customAttributes = attributes.filter((attribute) => !['size', 'color'].includes(attribute.attribute_key));

  const {
    products, loading, error, addProduct, addVariant, editProduct, removeProduct, editVariant, removeVariant, refresh,
  } = useProducts();

  useEffect(() => {
    if (products) dispatch(setProducts(products));
  }, [products, dispatch]);

  /* ---- access (server decides; the UI only mirrors it) ---- */
  // Until (or if) the main process answers, mirror the signed-in user's own rights.
  // The main process still checks every write, so this only decides what is shown;
  // it stops an owner from seeing a locked screen when the access call fails.
  const accessFromUser = useMemo(() => ({
    ...LOCKED_ACCESS,
    canCreate: hasPermission(currentUser, 'products.create'),
    canEdit: hasPermission(currentUser, 'products.edit'),
    canDelete: hasPermission(currentUser, 'products.delete'),
    canAdjustStock: hasPermission(currentUser, 'inventory.adjust'),
    ownEdit: hasPermission(currentUser, 'products.edit'),
  }), [currentUser]);
  const [serverAccess, setServerAccess] = useState(null);
  const access = serverAccess || accessFromUser;
  const [log, setLog] = useState([]);

  const loadAccess = useCallback(async () => {
    try {
      setServerAccess(await productsApi.getProductEditAccess());
    } catch (err) {
      console.error('تعذر تحميل صلاحيات المنتجات:', err);
      setServerAccess(null);
    }
  }, []);

  const loadLog = useCallback(async () => {
    try {
      setLog(await productsApi.getProductChangeLog({ limit: 50 }));
    } catch {
      setLog([]);
    }
  }, []);

  useEffect(() => {
    loadAccess();
    loadLog();
  }, [loadAccess, loadLog]);

  const isLocked = !access.canEdit;

  /* ---- data ---- */
  const [categories, setCategories] = useState([]);
  const [expirySummary, setExpirySummary] = useState(null);

  const loadExpirySummary = useCallback(async () => {
    if (!isGrocery || !groceryApi.getGroceryExpirySummary.isAvailable()) return;
    try {
      setExpirySummary(await groceryApi.getGroceryExpirySummary(30));
    } catch (err) {
      console.error('فشل جلب ملخص الصلاحيات:', err);
    }
  }, [isGrocery]);

  useEffect(() => {
    let cancelled = false;
    productsApi.getAllCategories()
      .then((list) => { if (!cancelled) setCategories(list || []); })
      .catch((err) => console.error('فشل جلب التصنيفات:', err));
    loadExpirySummary();
    return () => { cancelled = true; };
  }, [products, loadExpirySummary]);

  /* ---- filters ---- */
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 150);
  const [activeCategory, setActiveCategory] = useState(ALL);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const categoryTabs = useMemo(() => {
    const counts = new Map();
    for (const product of products) {
      if (product.categoryName) counts.set(product.categoryName, (counts.get(product.categoryName) || 0) + 1);
    }
    const names = [...new Set([...categories.map((c) => c.name), ...counts.keys()])].filter(Boolean);
    return names.map((name) => ({ name, count: counts.get(name) || 0 }));
  }, [categories, products]);

  const toneOf = useMemo(() => {
    const map = new Map(categoryTabs.map((tab, index) => [tab.name, TONES[index % TONES.length]]));
    return (name) => map.get(name) || 'primary';
  }, [categoryTabs]);

  const filteredProducts = useMemo(() => {
    const term = debouncedSearch.trim().toLowerCase();
    return products.filter((product) => {
      if (activeCategory !== ALL && product.categoryName !== activeCategory) return false;
      if (!term) return true;
      return product.name.toLowerCase().includes(term)
        || productCode(product.id).toLowerCase().includes(term)
        || product.variants?.some((variant) => (
          (variant.barcode && variant.barcode.toLowerCase().includes(term))
          || (variant.sku && variant.sku.toLowerCase().includes(term))
        ));
    });
  }, [products, debouncedSearch, activeCategory]);

  useEffect(() => { setCurrentPage(1); }, [debouncedSearch, activeCategory, pageSize]);
  const pageCount = Math.max(1, Math.ceil(filteredProducts.length / pageSize));
  const visiblePage = Math.min(currentPage, pageCount);
  const pagedProducts = useMemo(() => {
    const start = (visiblePage - 1) * pageSize;
    return filteredProducts.slice(start, start + pageSize);
  }, [filteredProducts, pageSize, visiblePage]);

  /* ---- KPIs ---- */
  const kpis = useMemo(() => {
    const prices = products.flatMap((product) => (product.variants || []).map((v) => Number(v.selling_price) || 0));
    const optionCount = products.reduce((sum, product) => sum + (product.variants?.length || 0), 0);
    return {
      products: products.length,
      options: optionCount,
      categories: categoryTabs.filter((tab) => tab.count > 0).length,
      categoryNames: categoryTabs.filter((tab) => tab.count > 0).map((tab) => tab.name).join(' · '),
      avg: prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : 0,
      min: prices.length ? Math.min(...prices) : 0,
      max: prices.length ? Math.max(...prices) : 0,
    };
  }, [products, categoryTabs]);

  const lastChange = useMemo(
    () => log.find((entry) => ['price', 'update', 'create', 'variant_add', 'variant_update', 'archive', 'variant_delete'].includes(entry.action)),
    [log]
  );

  /* ---- dialogs ---- */
  const [dialog, setDialog] = useState(null); // { type, productId?, after? }
  const [scannedBarcode, setScannedBarcode] = useState('');
  const [unitsTarget, setUnitsTarget] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [showExpiry, setShowExpiry] = useState(false);
  const [showBundles, setShowBundles] = useState(false);
  const [showFullLog, setShowFullLog] = useState(false);
  const [notice, setNotice] = useState('');

  const openProduct = dialog?.productId ? products.find((product) => product.id === dialog.productId) : null;

  // A locked action opens the unlock dialog first, then continues to what was asked.
  function requireEdit(next) {
    if (!isLocked) {
      setDialog(next);
      return;
    }
    setDialog({ type: 'unlock', after: next });
  }

  async function afterWrite() {
    await Promise.all([refresh(), loadLog(), loadAccess()]);
  }

  async function withRefresh(action) {
    try {
      await action();
    } finally {
      await afterWrite();
    }
  }

  useBarcodeScanner((code) => {
    const clean = normalizeBarcodeText(code);
    if (!clean) return;
    playSuccessBeep();
    if (dialog?.type === 'add') setScannedBarcode(clean);
    else if (!dialog) setSearch(clean);
  });

  async function handlePrint(variant, productName, labelType) {
    try {
      await printingApi.printBarcodeLabel({ ...variant, productName, labelType });
    } catch (err) {
      setNotice(`فشلت الطباعة: ${err.message}`);
    }
  }

  async function lockNow() {
    try {
      await productsApi.lockProductEditing();
    } finally {
      await Promise.all([loadAccess(), loadLog()]);
    }
  }

  const canManageRoles = hasPermission(currentUser, 'roles.manage');
  const roleName = currentUser?.role === 'admin' ? 'مدير' : (currentUser?.roleName || 'كاشير');

  /* ======================================================================== */
  return (
    <div className="prd-page">
      {/* ---------- Header ---------- */}
      <header className="prd-header">
        <div>
          <h1 className="prd-title">إدارة {termProducts}</h1>
          <p className="prd-subtitle">
            {kpis.products} {termProducts} · {kpis.categories} تصنيفات · الأسعار والخيارات فقط — الكميات في{' '}
            <button type="button" className="prd-link-btn" onClick={() => onNavigate?.('branches')}>قسم المخزون</button>
          </p>
        </div>
        <div className="prd-header__actions">
          {currentUser?.role === 'admin' && (
            <button type="button" className="prd-btn prd-btn--outline" onClick={() => setShowBundles((v) => !v)} aria-pressed={showBundles}>
              <GiftIcon size={18} /> العروض المركبة
            </button>
          )}
          <button
            type="button"
            className="prd-btn prd-btn--outline"
            onClick={() => (canManageRoles ? onNavigate?.('roles') : document.getElementById('prd-rules')?.scrollIntoView({ behavior: 'smooth' }))}
          >
            <ShieldIcon size={18} /> الصلاحيات والأدوار
          </button>
          {isGrocery && (
            <button type="button" className="prd-btn prd-btn--outline" onClick={() => setShowExpiry(true)}>
              <AlertIcon size={18} /> الصلاحيات والموازين
              {(expirySummary?.expiredCount > 0 || expirySummary?.expiringCount > 0) && (
                <span className="prd-count prd-count--warning">{(expirySummary.expiredCount || 0) + (expirySummary.expiringCount || 0)}</span>
              )}
            </button>
          )}
          <button
            type="button"
            className="prd-btn prd-btn--soft"
            onClick={() => (access.canCreate ? setShowImport(true) : requireEdit({ type: 'import' }))}
            aria-disabled={!access.canCreate}
          >
            <SheetIcon size={18} /> استيراد من Excel
          </button>
          <button
            type="button"
            className={`prd-btn ${access.canCreate ? 'prd-btn--primary' : 'prd-btn--muted'}`}
            onClick={() => (access.canCreate ? setDialog({ type: 'add' }) : requireEdit({ type: 'add' }))}
            aria-disabled={!access.canCreate}
          >
            <PlusIcon size={18} /> إضافة {termProduct}
          </button>
        </div>
      </header>

      {showBundles && currentUser?.role === 'admin' && (
        <BundlePromotionsPanel products={products} onClose={() => setShowBundles(false)} />
      )}

      {/* ---------- Lock banner ---------- */}
      {isLocked ? (
        <section className="prd-lock" aria-live="polite">
          <span className="prd-lock__icon"><LockIcon size={22} /></span>
          <div className="prd-lock__text">
            <h2>{termProducts} مقفولة — وضع العرض فقط</h2>
            <p>
              أنت مسجل كـ <strong>{roleName}</strong>. تعديل الأسعار أو الحذف يحتاج كود المدير، وكل تغيير بيتسجل باسم صاحبه.
            </p>
          </div>
          <button type="button" className="prd-btn prd-btn--dark" onClick={() => setDialog({ type: 'unlock' })}>
            <KeyIcon size={18} /> فتح التعديل بكود المدير
          </button>
        </section>
      ) : access.unlock && !access.ownEdit ? (
        <section className="prd-lock prd-lock--open" aria-live="polite">
          <span className="prd-lock__icon"><KeyIcon size={22} /></span>
          <div className="prd-lock__text">
            <h2>التعديل مفتوح بموافقة {access.unlock.managerName}</h2>
            <p>يفضل مفتوح لحد ما تدوس «اقفل دلوقتي» أو تسجل خروج. كل تعديل بيتسجل باسمك واسم المدير.</p>
          </div>
          <button type="button" className="prd-btn prd-btn--outline" onClick={lockNow}>
            <LockIcon size={18} /> اقفل دلوقتي
          </button>
        </section>
      ) : null}

      {notice && (
        <p className="prd-notice" role="alert">
          {notice}
          <button type="button" className="prd-link-btn" onClick={() => setNotice('')}>إخفاء</button>
        </p>
      )}

      {/* ---------- KPIs ---------- */}
      <section className="prd-kpis" aria-label="ملخص المنتجات">
        <article className="prd-kpi">
          <span className="prd-kpi__label">{termProducts} النشطة</span>
          <strong className="prd-kpi__value">{kpis.products}</strong>
          <span className="prd-kpi__sub">{kpis.options} خيار سعر إجمالاً</span>
        </article>
        <article className="prd-kpi">
          <span className="prd-kpi__label">التصنيفات</span>
          <strong className="prd-kpi__value">{kpis.categories}</strong>
          <span className="prd-kpi__sub" title={kpis.categoryNames}>{kpis.categoryNames || 'لا توجد تصنيفات'}</span>
        </article>
        <article className="prd-kpi">
          <span className="prd-kpi__label">متوسط سعر البيع</span>
          <strong className="prd-kpi__value">{money(kpis.avg)} <small>ج.م</small></strong>
          <span className="prd-kpi__sub">من {money(kpis.min)} إلى {money(kpis.max)} ج.م</span>
        </article>
        <article className="prd-kpi">
          <span className="prd-kpi__label">آخر تعديل</span>
          <strong className="prd-kpi__value prd-kpi__value--text">
            {lastChange ? (
              <>{lastChange.action === 'price' ? 'سعر ' : ''}{lastChange.productName || lastChange.actionLabel}</>
            ) : '—'}
          </strong>
          <span className="prd-kpi__sub">{lastChange ? `${lastChange.username} · ${when(lastChange.createdAt)}` : 'لا توجد تعديلات بعد'}</span>
        </article>
      </section>

      {/* ---------- Body: catalog + side column ---------- */}
      <div className="prd-body">
        <div className="prd-main">
          <label className="prd-search">
            <SearchIcon size={20} />
            <input
              type="search"
              placeholder="ابحث باسم المنتج أو الكود..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="بحث في المنتجات"
            />
          </label>

          <div className="prd-tabs" role="tablist" aria-label="التصنيفات">
            <button type="button" role="tab" aria-selected={activeCategory === ALL} className={`prd-tab ${activeCategory === ALL ? 'is-active' : ''}`} onClick={() => setActiveCategory(ALL)}>
              الكل <span className="prd-tab__count">{products.length}</span>
            </button>
            {categoryTabs.map((tab) => (
              <button
                key={tab.name}
                type="button"
                role="tab"
                aria-selected={activeCategory === tab.name}
                className={`prd-tab ${activeCategory === tab.name ? 'is-active' : ''}`}
                onClick={() => setActiveCategory(tab.name)}
              >
                {tab.name} <span className="prd-tab__count">{tab.count}</span>
              </button>
            ))}
          </div>

          {error && <p className="prd-notice" role="alert">{error}</p>}

          {loading ? (
            <div className="prd-grid" aria-busy="true">
              {[0, 1, 2].map((item) => <div key={item} className="prd-card prd-card--skeleton" />)}
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="prd-empty">
              <ProductLineIcon emoji={getCategoryIcon('', '', sectorKey)} size={36} />
              <strong>مفيش {termProducts} مطابقة</strong>
              <p>جرّب كلمة بحث تانية أو تصنيف تاني.</p>
            </div>
          ) : (
            <div className="prd-grid">
              {pagedProducts.map((product) => {
                const tone = toneOf(product.categoryName);
                const emoji = getCategoryIcon(product.categoryName, product.name, sectorKey);
                const optionCount = product.variants?.length || 0;
                return (
                  <article key={product.id} className={`prd-card prd-card--${tone}`}>
                    <div className="prd-card__top">
                      <span className="prd-card__cat">{product.categoryName || 'بدون تصنيف'}</span>
                      <span className="prd-card__code">{productCode(product.id)}</span>
                      <span className="prd-card__tile">
                        {product.image_path ? (
                          <img src={formatProductImageUrl(product.image_path)} alt="" loading="lazy" decoding="async" />
                        ) : (
                          <ProductLineIcon emoji={emoji} size={30} />
                        )}
                      </span>
                    </div>
                    <div className="prd-card__body">
                      <div className="prd-card__title-row">
                        <h3 className="prd-card__name">{product.name}</h3>
                        <span className="prd-card__price">{priceRange(product)} <small>ج.م</small></span>
                      </div>
                      <dl className="prd-card__facts">
                        <div>
                          <dt>الخيارات</dt>
                          <dd>{optionCount <= 1 ? 'متغير واحد' : `${optionCount} خيارات`}</dd>
                        </div>
                        <div>
                          <dt>آخر تعديل</dt>
                          <dd>{relativeDay(product.lastChangedAt || product.created_at)}</dd>
                        </div>
                      </dl>
                      <div className="prd-card__actions">
                        <button
                          type="button"
                          className={`prd-btn prd-btn--card ${isLocked ? 'is-locked' : ''}`}
                          onClick={() => requireEdit({ type: 'details', productId: product.id })}
                          title={isLocked ? 'يحتاج كود المدير' : undefined}
                        >
                          <PencilIcon size={16} /> تعديل السعر والخيارات
                        </button>
                        <button
                          type="button"
                          className="prd-icon-btn prd-icon-btn--card"
                          onClick={() => setDialog({ type: 'details', productId: product.id })}
                          title="عرض التفاصيل"
                          aria-label={`عرض تفاصيل ${product.name}`}
                        >
                          <EyeIcon size={18} />
                        </button>
                        <button
                          type="button"
                          className={`prd-icon-btn prd-icon-btn--card ${access.canDelete ? '' : 'is-locked'}`}
                          onClick={() => (access.canDelete
                            ? setDialog({ type: 'archive', productId: product.id })
                            : requireEdit({ type: 'archive', productId: product.id }))}
                          title={access.canDelete ? 'أرشفة المنتج' : 'الأرشفة تحتاج كود المدير'}
                          aria-label={`أرشفة ${product.name}`}
                        >
                          <ArchiveGlyph size={18} />
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {!loading && filteredProducts.length > pageSize && (
            <nav className="prd-pager" aria-label="صفحات المنتجات">
              <span>
                عرض {(visiblePage - 1) * pageSize + 1} - {Math.min(visiblePage * pageSize, filteredProducts.length)} من {filteredProducts.length} {termProduct}
              </span>
              <div className="prd-pager__controls">
                <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))} aria-label="منتج في الصفحة">
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
                <button type="button" className="prd-btn prd-btn--outline" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={visiblePage === 1} aria-label="الصفحة السابقة">السابقة</button>
                <span aria-live="polite">{visiblePage} / {pageCount}</span>
                <button type="button" className="prd-btn prd-btn--outline" onClick={() => setCurrentPage((p) => Math.min(pageCount, p + 1))} disabled={visiblePage === pageCount} aria-label="الصفحة التالية">التالية</button>
              </div>
            </nav>
          )}
        </div>

        <aside className="prd-side">
          <section className="prd-panel">
            <header className="prd-panel__head">
              <h2>سجل التعديلات</h2>
              {log.length > 3 && <button type="button" className="prd-link-btn" onClick={() => setShowFullLog(true)}>عرض الكل</button>}
            </header>
            <LogList entries={log.slice(0, 3)} />
          </section>

          <section className="prd-panel" id="prd-rules">
            <header className="prd-panel__head"><h2>مين يقدر يعمل إيه</h2></header>
            <table className="prd-rules">
              <thead>
                <tr><th scope="col">الإجراء</th><th scope="col">كاشير</th><th scope="col">مدير / مدير فرع</th></tr>
              </thead>
              <tbody>
                {RULES.map((rule) => (
                  <tr key={rule.action}>
                    <th scope="row">{rule.action}</th>
                    <td className={rule.cashier === 'لا' ? 'is-no' : 'is-yes'}>{rule.cashier}</td>
                    <td className="is-yes">{rule.manager}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="prd-muted prd-rules__note">مفيش حذف نهائي — الأرشفة بتخفي المنتج وتحافظ على الفواتير القديمة.</p>
          </section>
        </aside>
      </div>

      {/* ---------- Dialogs ---------- */}
      {dialog?.type === 'unlock' && (
        <UnlockDialog
          onClose={() => setDialog(null)}
          onUnlocked={async () => {
            const next = dialog.after || null;
            await Promise.all([loadAccess(), loadLog()]);
            if (next?.type === 'import') {
              setDialog(null);
              setShowImport(true);
            } else {
              setDialog(next);
            }
          }}
        />
      )}

      {dialog?.type === 'add' && (
        <AddProductDialog
          categories={categories}
          hasSize={hasSize}
          hasColor={hasColor}
          customAttributes={customAttributes}
          canAdjustStock={access.canAdjustStock}
          termProduct={termProduct}
          scannedBarcode={scannedBarcode}
          onClose={() => { setDialog(null); setScannedBarcode(''); }}
          onSave={async (data) => {
            await withRefresh(() => addProduct(data));
            setDialog(null);
            setScannedBarcode('');
          }}
        />
      )}

      {dialog?.type === 'details' && openProduct && (
        <ProductDetailsDialog
          product={openProduct}
          code={productCode(openProduct.id)}
          emoji={getCategoryIcon(openProduct.categoryName, openProduct.name, sectorKey)}
          attributes={attributes}
          categories={categories}
          access={access}
          quantityLabel={quantityLabel}
          onClose={() => setDialog(null)}
          onEditProduct={(id, data) => withRefresh(() => editProduct(id, data))}
          onAddVariant={(id, data) => withRefresh(() => addVariant(id, data))}
          onEditVariant={(id, data) => withRefresh(() => editVariant(id, data))}
          onDeleteVariant={(id) => withRefresh(() => removeVariant(id))}
          onPrintBarcode={(variant) => handlePrint(variant, openProduct.name, 'barcode')}
          onPrintPriceTag={(variant) => handlePrint(variant, openProduct.name, 'hangTag')}
          onOpenUnits={(variant) => setUnitsTarget({ variant, productName: openProduct.name })}
        />
      )}

      {dialog?.type === 'archive' && openProduct && (
        <ArchiveDialog
          product={openProduct}
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            await withRefresh(() => removeProduct(openProduct.id));
            setDialog(null);
          }}
        />
      )}

      {showFullLog && (
        <Dialog title="سجل تعديلات المنتجات" subtitle="آخر 50 تعديل. السجل ده مينفعش يتعدل ولا يتمسح." onClose={() => setShowFullLog(false)} size="md">
          <div className="prd-dialog__body prd-dialog__body--scroll">
            <LogList entries={log} />
          </div>
        </Dialog>
      )}

      {unitsTarget && (
        <ProductUnitsModal
          isOpen
          onClose={() => setUnitsTarget(null)}
          productVariant={unitsTarget.variant}
          productName={unitsTarget.productName}
        />
      )}

      {isGrocery && (
        <ExpiryManagerModal
          isOpen={showExpiry}
          onClose={() => { setShowExpiry(false); loadExpirySummary(); }}
          products={products}
        />
      )}

      <ImportExcelModal
        isOpen={showImport}
        onClose={() => setShowImport(false)}
        type="products"
        onSuccess={() => afterWrite()}
      />
    </div>
  );
}

export default ProductsPage;
