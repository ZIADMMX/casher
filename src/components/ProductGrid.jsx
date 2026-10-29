import { useState } from 'react';
import { formatProductImageUrl } from '../utils/media.js';
import { useBusinessProfile } from '../contexts/BusinessProfileContext.jsx';

function getCategoryIcon(catName = '', prodName = '', sectorKey = 'retail') {
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
  if (sectorKey === 'grocery' || text.includes('لبن') || text.includes('جبن') || text.includes('شيبسي') || text.includes('زيت') || text.includes('أرز')) {
    if (text.includes('لبن') || text.includes('حليب') || text.includes('زبادي')) return '🥛';
    if (text.includes('جبن') || text.includes('رومي')) return '🧀';
    if (text.includes('تفاح') || text.includes('موز') || text.includes('طماطم') || text.includes('خضار')) return '🍎';
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
        {getCategoryIcon(product?.categoryName, product?.name, sectorKey)}
      </span>
    );
  }

  return (
    <img
      src={formatProductImageUrl(product.image_path)}
      alt={product.name}
      className="prod-img"
      onError={() => setHasError(true)}
    />
  );
}

function ProductGrid({ products = [], selectedVariant = {}, pickVariant, addToCart, getStockBadge, cart = [], sectorConfig }) {
  const { attributes } = useBusinessProfile();
  const sectorKey = sectorConfig?.key || 'retail';

  if (!products || products.length === 0) {
    return (
      <div className="pos-no-products">
        <div className="no-prod-icon">🔍</div>
        <h3>لا توجد عناصر مطابقة للبحث</h3>
        <p>جرب البحث بكلمة أخرى أو اختر تصنيفاً مختلفاً من الأعلى</p>
      </div>
    );
  }


  return (
    <div className="pos-grid-container">
      {products.map((product) => {
        const activeVariantId = selectedVariant[product.id] || product.variants[0]?.id;
        const activeVariant = product.variants.find((v) => v.id === activeVariantId) || product.variants[0];
        const isService = Boolean(product.is_service);
        const badge = isService ? null : getStockBadge(product);

        // حساب عدد القطع في السلة لهذا المنتج
        const inCartCount = cart
          .filter((item) => product.variants.some((v) => v.id === item.variantId))
          .reduce((sum, item) => sum + item.quantity, 0);

        const isOutOfStock = !activeVariant || (!isService && activeVariant.stock_quantity === 0);

        return (
          <div key={product.id} className={`pos-product-card ${isOutOfStock ? 'is-out-of-stock' : ''}`}>
            {/* Top Badges Row */}
            <div className="prod-card-top-tags">
              {product.categoryName && (
                <span className="prod-cat-tag">{product.categoryName}</span>
              )}

              {badge && (
                <span className={`prod-stock-badge badge-${badge.type}`}>
                  {badge.text}
                </span>
              )}

              {inCartCount > 0 && (
                <span className="prod-in-cart-indicator" title="الكمية في السلة الحالية">
                  🛒 {inCartCount}
                </span>
              )}
            </div>

            {/* Visual Image / Hero Area */}
            <div className="pos-card-visual" onClick={() => !isOutOfStock && addToCart(product)}>
              <ProductImage product={product} sectorKey={sectorKey} />
              
              {/* Quick Hover Add Overlay */}
              {!isOutOfStock && (
                <div className="card-quick-add-overlay">
                  <span>+ إضافة للسلة</span>
                </div>
              )}
            </div>

            {/* Product Info */}
            <div className="pos-card-body">
              <h4 className="pos-prod-name" title={product.name}>
                {product.name}
              </h4>

              <div className="pos-prod-code-line">
                <span className="pos-code-badge">
                  {isService ? 'خدمة' : (activeVariant?.barcode || activeVariant?.sku || 'بدون باركود')}
                </span>
                <span className="pos-variant-stock-hint">
                  {activeVariant ? (isService ? 'لا تحتاج مخزون' : `المتاح: ${activeVariant.stock_quantity}`) : ''}
                </span>
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
                <div className="pos-single-variant-tag">
                  {[
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
                  ].filter(Boolean).join(' · ')}
                </div>
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
                title="إضافة للسلة"
              >
                {isOutOfStock ? 'نفذ' : '+ إضافة'}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default ProductGrid;
