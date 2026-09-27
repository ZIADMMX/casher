import { useState } from 'react';
import { formatProductImageUrl } from '../utils/media.js';
import { useBusinessProfile } from '../contexts/BusinessProfileContext.jsx';

function getCategoryIcon(catName = '', prodName = '') {
  const text = `${catName} ${prodName}`.toLowerCase();
  if (text.includes('بنطلون') || text.includes('جينز') || text.includes('pant') || text.includes('jeans')) return '👖';
  if (text.includes('حذاء') || text.includes('كوتش') || text.includes('شوز') || text.includes('shoe')) return '👟';
  if (text.includes('بدلة') || text.includes('قميص') || text.includes('suit') || text.includes('shirt')) return '👔';
  if (text.includes('جاكت') || text.includes('سويت') || text.includes('هودي') || text.includes('jacket') || text.includes('hoodie')) return '🧥';
  if (text.includes('فستان') || text.includes('عباية') || text.includes('dress')) return '👗';
  if (text.includes('كاب') || text.includes('طاقية') || text.includes('cap') || text.includes('hat')) return '🧢';
  if (text.includes('شنطة') || text.includes('حقيبة') || text.includes('bag')) return '🎒';
  return '👕';
}

// مكون صورة المنتج مع fallback آمن بدون تعديل مباشر على الـ DOM
function ProductImage({ product }) {
  const [hasError, setHasError] = useState(false);

  if (hasError || !product.image_path) {
    return (
      <span className="prod-emoji-fallback">
        {getCategoryIcon(product.categoryName, product.name)}
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

function ProductGrid({ products, selectedVariant, pickVariant, addToCart, getStockBadge, cart = [] }) {
  const { attributes } = useBusinessProfile();
  if (!products || products.length === 0) {
    return (
      <div className="pos-no-products">
        <div className="no-prod-icon">🔍</div>
        <h3>لا توجد منتجات مطابقة للبحث</h3>
        <p>جرب البحث بكلمة أخرى أو اختر تصنيفاً مختلفاً من الأعلى</p>
      </div>
    );
  }

  return (
    <div className="pos-grid-container">
      {products.map((product) => {
        const activeVariantId = selectedVariant[product.id] || product.variants[0]?.id;
        const activeVariant = product.variants.find((v) => v.id === activeVariantId) || product.variants[0];
        const badge = getStockBadge(product);

        // حساب عدد القطع في السلة لهذا المنتج
        const inCartCount = cart
          .filter((item) => product.variants.some((v) => v.id === item.variantId))
          .reduce((sum, item) => sum + item.quantity, 0);

        const isOutOfStock = !activeVariant || activeVariant.stock_quantity === 0;

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
              <ProductImage product={product} />
              
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
                  {activeVariant?.barcode || activeVariant?.sku || 'بدون باركود'}
                </span>
                <span className="pos-variant-stock-hint">
                  {activeVariant ? `المتاح: ${activeVariant.stock_quantity}` : ''}
                </span>
              </div>

              {/* Variant Chips Selector */}
              {product.variants.length > 1 ? (
                <div className="pos-variants-chip-list">
                  {product.variants.map((v) => {
                    const isSelected = v.id === activeVariantId;
                    const disabled = v.stock_quantity === 0;
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
                        title={`المتاح: ${v.stock_quantity} قطعة`}
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
