import * as groceryApi from '../../api/grocery.js';
import * as productsApi from '../../api/products.js';
import { CloseIcon, SearchIcon } from '../icons/PosIcons.jsx';

/**
 * SearchBar component for POS page.
 * Props:
 *  - search: current search string
 *  - setSearch: setter for search
 *  - searchInputRef: ref for focusing the input
 *  - filteredProducts: array of filtered products (used for fallback when barcode not found)
 *  - selectedVariant: map of selected variant IDs per product
 *  - addScannedVariantToCart: function to add a scanned variant to the cart
 *  - playErrorBeep: beep function for error feedback
 *  - setMessage: UI message setter
 *  - normalizeBarcodeText: util to clean barcode input
 */
export default function SearchBar({
  search,
  setSearch,
  searchInputRef,
  filteredProducts = [],
  selectedVariant = {},
  addScannedVariantToCart,
  playErrorBeep,
  setMessage,
  normalizeBarcodeText,
  sectorConfig,
}) {
  const handleKeyDown = async (e) => {
    if (e.key !== 'Enter') return;
    const query = normalizeBarcodeText ? normalizeBarcodeText(search.trim()) : search.trim();
    if (!query) return;
    e.preventDefault();
    const allowGroceryBarcode = Boolean(
      sectorConfig?.features?.scaleBarcode ||
      sectorConfig?.features?.batchExpiry ||
      sectorConfig?.features?.speedKeys
    );
    try {
      if (allowGroceryBarcode && groceryApi.resolveGroceryBarcode.isAvailable()) {
        const res = await groceryApi.resolveGroceryBarcode(query);
        if (res && res.resolved && res.variantId) {
          setSearch('');
          addScannedVariantToCart?.(
            {
              id: res.variantId,
              productName: res.productName,
              selling_price: res.unitPrice,
              stock_quantity: res.variant?.stock_quantity ?? 9999,
              sku: res.variant?.sku,
              barcode: res.rawCode,
            },
            {
              quantity: res.quantity,
              unitPrice: res.unitPrice,
              unitName: res.unitName,
              isScale: res.type === 'scale_item',
              unitId: res.unit?.id,
            }
          );
          return;
        }
      }

      if (productsApi.getProductByBarcode.isAvailable()) {
        const variant = await productsApi.getProductByBarcode(query);
        if (variant) {
          setSearch('');
          addScannedVariantToCart?.(variant);
          return;
        }
      }
    } catch (err) {
      console.error('Barcode lookup error:', err);
    }
    if (filteredProducts?.length === 1) {
      const p = filteredProducts[0];
      const v = p.variants?.find((item) => item.id === selectedVariant[p.id]) || p.variants?.[0];
      if (v) {
        setSearch('');
        addScannedVariantToCart?.({ ...v, productName: p.name });
        return;
      }
    }
    playErrorBeep?.();
    setMessage?.({
      type: 'error',
      text: `لم يتم العثور على أي صنف بالباركود أو الاسم "${query}"`,
    });
  };

  const placeholderText = sectorConfig?.searchPlaceholder || 'ابحث باسم المنتج، الكود، أو امسح الباركود مباشرة...';

  return (
    <div className="pos-search-box">
      <span className="search-lens-icon"><SearchIcon size={20} /></span>
      <input
        ref={searchInputRef}
        type="text"
        id="barcode-search-input"
        className="pos-search-input"
        placeholder={placeholderText}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onKeyDown={handleKeyDown}
      />
      {search && (
        <button
          type="button"
          className="pos-search-clear-btn"
          onClick={() => setSearch('')}
          title="مسح البحث"
          aria-label="مسح البحث"
        >
          <CloseIcon size={16} />
        </button>
      )}
      <span className="search-shortcut-badge" title="اختصار التركيز على البحث">F1</span>
    </div>
  );
}

