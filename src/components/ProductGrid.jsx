import { useEffect, useMemo, useState } from 'react';
import { formatProductImageUrl } from '../utils/media.js';
import { useBusinessProfile } from '../contexts/BusinessProfileContext.jsx';
import { PlusIcon, ProductLineIcon, SearchIcon } from './icons/PosIcons.jsx';

const EMPTY_PRODUCTS = [];
const POS_PRODUCTS_PAGE_SIZE = 50;

export function getCategoryIcon(catName = '', prodName = '', sectorKey = 'retail') {
  const text = `${catName} ${prodName}`.toLowerCase().replace(/[إأآا]/g, 'ا');

  if (sectorKey === 'salon_barbershop') {
    if (text.includes('بشرة') || text.includes('هيدرا') || text.includes('مساج')) return '💆';
    if (text.includes('صبغ') || text.includes('بروتين') || text.includes('معالج')) return '🧴';
    if (text.includes('باقة') || text.includes('بكج')) return '💈';
    return '✂️';
  }
  
  // المطاعم والكافيهات
  if (sectorKey === 'cafe_restaurant' || text.includes('قهوة') || text.includes('برجر') || text.includes('بيتزا') || text.includes('شاورما') || text.includes('عصير') || text.includes('كفتة') || text.includes('مشوي') || text.includes('طاووق') || text.includes('فراخ') || text.includes('دجاج') || text.includes('ملوخية') || text.includes('كشري') || text.includes('سلطة') || text.includes('طحينة') || text.includes('حلو') || text.includes('ام علي') || text.includes('مشروب')) {
    if (text.includes('عصير') || text.includes('مشروب') || text.includes('بيبسي') || text.includes('كولا') || text.includes('مياه') || text.includes('بارد')) return '🥤';
    if (text.includes('قهوة') || text.includes('شاي') || text.includes('لاتيه') || text.includes('اسبريسو') || text.includes('كابتشينو') || text.includes('ساخن')) return '☕';
    if (text.includes('بيتزا')) return '🍕';
    if (text.includes('برجر') || text.includes('ساندوتش')) return '🍔';
    if (text.includes('كفتة') || text.includes('مشوي') || text.includes('طاووق') || text.includes('لحم') || text.includes('كباب')) return '🥩';
    if (text.includes('فراخ') || text.includes('دجاج')) return '🍗';
    if (text.includes('ملوخية') || text.includes('كشري') || text.includes('ارز') || text.includes('شوربة')) return '🍲';
    if (text.includes('سلطة') || text.includes('طحينة')) return '🥗';
    if (text.includes('حلو') || text.includes('كيك') || text.includes('سينابون') || text.includes('ام علي') || text.includes('قشطة')) return '🍰';
    if (text.includes('جبن') || text.includes('رومي')) return '🧀';
    return '🍽️';
  }

  // سوبر ماركت وبقالة
  if (sectorKey === 'grocery' || text.includes('لبن') || text.includes('جبن') || text.includes('شيبسي') || text.includes('زيت') || text.includes('ارز')) {
    if (text.includes('لبن') || text.includes('حليب') || text.includes('زبادي')) return '🥛';
    if (text.includes('جبن') || text.includes('رومي')) return '🧀';
    if (text.includes('تفاح') || text.includes('موز') || text.includes('طماطم') || text.includes('خضار')) return '🍎';
    if (text.includes('مياه') || text.includes('عصير') || text.includes('مشروب')) return '🥤';
    if (text.includes('معلبات') || text.includes('تونة') || text.includes('صلصة')) return '🥫';
    if (text.includes('منظف') || text.includes('مسحوق') || text.includes('صابون')) return '🧴';
    if (text.includes('ارز') || text.includes('مكرونة') || text.includes('زيت') || text.includes('دقيق')) return '🍚';
    if (text.includes('شوكولاتة') || text.includes('بسكويت') || text.includes('شيبسي')) return '🍫';
    return '🛒';
  }

  // إلكترونيات
  if (sectorKey === 'electronics' || text.includes('هاتف') || text.includes('ايفون') || text.includes('سامسونج') || text.includes('شاحن') || text.includes('سماعة')) {
    if (text.includes('هاتف') || text.includes('موبايل') || text.includes('phone')) return '📱';
    if (text.includes('سماعة') || text.includes('ايربودز') || text.includes('headphone')) return '🎧';
    if (text.includes('شاحن') || text.includes('كابل') || text.includes('cable')) return '🔌';
    if (text.includes('لاب') || text.includes('كمبيوتر') || text.includes('شاشة')) return '💻';
    return '📱';
  }

  // ورش وصيانة
  if (sectorKey === 'maintenance' || text.includes('صيانة') || text.includes('تصليح') || text.includes('شاشة مكسورة') || text.includes('بطارية')) {
    if (text.includes('بطارية')) return '🔋';
    if (text.includes('شاشة')) return '🖥️';
    return '🔧';
  }

  // صالات رياضية وجيم
  if (sectorKey === 'subscriptions_gym' || text.includes('جيم') || text.includes('اشتراك') || text.includes('بروتين') || text.includes('كرياتين') || text.includes('حصة')) {
    if (text.includes('بروتين') || text.includes('مكمل') || text.includes('كرياتين')) return '🥤';
    if (text.includes('حصة') || text.includes('تدريب') || text.includes('pt')) return '🏆';
    return '🏋️‍♂️';
  }

  // التجزئة والملابس الافتراضي
  if (text.includes('بنطلون') || text.includes('جينز') || text.includes('pant') || text.includes('jeans')) return '👖';
  if (text.includes('حذاء') || text.includes('كوتش') || text.includes('شوز') || text.includes('shoe')) return '👟';
  if (text.includes('بدلة') || text.includes('قميص') || text.includes('suit') || text.includes('shirt')) return '👔';
  if (text.includes('جاكت') || text.includes('سويت') || text.includes('هودي') || text.includes('jacket') || text.includes('hoodie')) return '🧥';
  if (text.includes('فستان') || text.includes('عباية') || text.includes('dress')) return '👗';
  if (text.includes('كاب') || text.includes('طاقية') || text.includes('cap') || text.includes('hat')) return '🧢';
  if (text.includes('شنطة') || text.includes('حقيبة') || text.includes('bag')) return '🎒';
  return sectorKey === 'cafe_restaurant' ? '🍽️' : '👕';
}


// مكون صورة المنتج مع fallback آمن بدون تعديل مباشر على الـ DOM
function ProductImage({ product, sectorKey }) {
  const [hasError, setHasError] = useState(false);

  if (hasError || !product?.image_path) {
    return (
      <span className="prod-emoji-fallback">
        <ProductLineIcon emoji={getCategoryIcon(product?.categoryName, product?.name, sectorKey)} size={40} />
      </span>
    );
  }

  return (
    <img
      src={formatProductImageUrl(product.image_path)}
      alt={product.name}
      className="prod-img"
      loading="lazy"
      decoding="async"
      onError={() => setHasError(true)}
    />
  );
}

function ProductGrid({ products = EMPTY_PRODUCTS, selectedVariant = {}, pickVariant, addToCart, getStockBadge, cart = [], sectorConfig }) {
  const { attributes } = useBusinessProfile();
  const sectorKey = sectorConfig?.key || 'retail';
  const productList = Array.isArray(products) ? products : EMPTY_PRODUCTS;
  const [currentPage, setCurrentPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(productList.length / POS_PRODUCTS_PAGE_SIZE));
  const visiblePage = Math.min(currentPage, pageCount);

  useEffect(() => {
    setCurrentPage(1);
  }, [productList]);

  useEffect(() => {
    if (currentPage > pageCount) setCurrentPage(pageCount);
  }, [currentPage, pageCount]);

  const visibleProducts = useMemo(() => {
    const startIndex = (visiblePage - 1) * POS_PRODUCTS_PAGE_SIZE;
    return productList.slice(startIndex, startIndex + POS_PRODUCTS_PAGE_SIZE);
  }, [productList, visiblePage]);

  if (productList.length === 0) {
    return (
      <div className="pos-no-products">
        <div className="no-prod-icon"><SearchIcon size={40} /></div>
        <h3>لا توجد عناصر مطابقة للبحث</h3>
        <p>جرب البحث بكلمة أخرى أو اختر تصنيفاً مختلفاً من الأعلى</p>
      </div>
    );
  }


  return (
    <>
      <div className="pos-grid-container">
      {visibleProducts.map((product) => {
        const activeVariantId = selectedVariant[product.id] || product.variants[0]?.id;
        const activeVariant = product.variants.find((v) => v.id === activeVariantId) || product.variants[0];
        const isService = Boolean(product.is_service);
        const badge = isService ? null : getStockBadge(product);

        // حساب عدد القطع في السلة لهذا المنتج
        const inCartCount = cart
          .filter((item) => product.variants.some((v) => v.id === item.variantId))
          .reduce((sum, item) => sum + item.quantity, 0);

        const isOutOfStock = !activeVariant || (!isService && !activeVariant.has_recipe && activeVariant.stock_quantity === 0);

        return (
          <div key={product.id} className={`pos-product-card ${isOutOfStock ? 'is-out-of-stock' : ''}`}>
            {/* Visual tile: category tag, in-cart count, line icon / photo */}
            <div className="pos-card-visual" onClick={() => !isOutOfStock && addToCart(product)}>
              <ProductImage product={product} sectorKey={sectorKey} />
              {product.categoryName && (
                <span className="prod-cat-tag">{product.categoryName}</span>
              )}
              {inCartCount > 0 && (
                <span className="prod-in-cart-indicator" title="الكمية في السلة الحالية">
                  {inCartCount}
                </span>
              )}
              {badge && (
                <span className={`prod-stock-badge badge-${badge.type}`}>
                  {badge.text}
                </span>
              )}
            </div>

            {/* Product Info */}
            <div className="pos-card-body">
              <h4 className="pos-prod-name" title={product.name}>
                {product.name}
              </h4>

              <div className="pos-prod-code-line">
                {isService
                  ? 'خدمة · لا تحتاج مخزون'
                  : [
                      activeVariant?.barcode || activeVariant?.sku ? `كود ${activeVariant.barcode || activeVariant.sku}` : null,
                      activeVariant ? `المتاح ${activeVariant.stock_quantity}` : null,
                    ].filter(Boolean).join(' · ')}
              </div>

              {/* Variant Chips Selector */}
              {product.variants.length > 1 ? (
                <div className="pos-variants-chip-list">
                  {product.variants.map((v) => {
                    const isSelected = v.id === activeVariantId;
                    const disabled = !isService && v.stock_quantity === 0;
                    const customValue = attributes
                      .map((attribute) => (
                        attribute.attribute_key === 'size'
                          ? v.size
                          : attribute.attribute_key === 'color'
                            ? v.color
                            : v.attributes?.find((value) => value.attribute_id === attribute.id)?.value
                      ))
                      .find(Boolean);
                    return (
                      <button
                        key={v.id}
                        type="button"
                        className={`variant-chip ${isSelected ? 'active' : ''} ${disabled ? 'disabled' : ''}`}
                        aria-pressed={isSelected}
                        onClick={(e) => {
                          e.stopPropagation();
                          pickVariant(product.id, v.id);
                        }}
                        disabled={disabled}
                        title={isService ? 'خدمة' : `المتاح: ${v.stock_quantity} قطعة`}
                      >
                        {v.size || v.color || customValue || 'متغير'}
                      </button>
                    );
                  })}
                </div>
              ) : (
                (() => {
                  const variantText = [
                    ...attributes.map((attribute) => {
                      const value = attribute.attribute_key === 'size'
                        ? activeVariant?.size
                        : attribute.attribute_key === 'color'
                          ? activeVariant?.color
                          : activeVariant?.attributes?.find((item) => item.attribute_id === attribute.id)?.value;
                      return value ? `${attribute.attribute_name}: ${value}` : null;
                    }),
                    activeVariant?.size && !attributes.some((attribute) => attribute.attribute_key === 'size')
                      ? activeVariant.size
                      : null,
                    activeVariant?.color && !attributes.some((attribute) => attribute.attribute_key === 'color')
                      ? activeVariant.color
                      : null,
                  ].filter(Boolean).join(' · ');
                  return variantText ? <div className="pos-single-variant-tag">{variantText}</div> : null;
                })()
              )}
            </div>

            {/* Price & Add Action */}
            <div className="pos-card-bottom-bar">
              <div className="pos-price-display">
                <span className="price-num">{activeVariant?.selling_price || 0}</span>
                <span className="price-curr">ج.م</span>
              </div>

              <button
                type="button"
                className="pos-card-add-btn"
                disabled={isOutOfStock}
                onClick={() => addToCart(product)}
                title={isOutOfStock ? 'نفذ من المخزون' : 'إضافة للسلة'}
                aria-label={isOutOfStock ? `${product.name} نفذ من المخزون` : `إضافة ${product.name} للسلة`}
              >
                {isOutOfStock ? 'نفذ' : <PlusIcon size={20} strokeWidth={2.4} />}
              </button>
            </div>
          </div>
        );
      })}
      </div>
      {productList.length > POS_PRODUCTS_PAGE_SIZE && (
        <nav className="pos-products-pagination" aria-label="صفحات منتجات البيع">
          <button
            type="button"
            className="secondary-btn"
            onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
            disabled={visiblePage === 1}
            aria-label="منتجات البيع السابقة"
          >
            السابقة
          </button>
          <span aria-live="polite">
            {`عرض ${(visiblePage - 1) * POS_PRODUCTS_PAGE_SIZE + 1} - ${Math.min(visiblePage * POS_PRODUCTS_PAGE_SIZE, productList.length)} من ${productList.length} منتج`}
          </span>
          <button
            type="button"
            className="secondary-btn"
            onClick={() => setCurrentPage((page) => Math.min(pageCount, page + 1))}
            disabled={visiblePage === pageCount}
            aria-label="منتجات البيع التالية"
          >
            التالية
          </button>
        </nav>
      )}
    </>
  );
}

export default ProductGrid;
