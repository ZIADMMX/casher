import { useState, useEffect, useMemo, useCallback } from 'react';

function useProducts() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const data = await window.electronAPI.getAllProductsWithVariants();
      setProducts(data);
    } catch (err) {
      setError(err.message || 'حدث خطأ أثناء تحميل المنتجات');
    } finally {
      setLoading(false);
    }
  }, []);

  async function addProduct(data) {
    setError('');
    try {
      await window.electronAPI.addProductWithVariant(data);
      await fetchProducts();
      return true;
    } catch (err) {
      setError(err.message || 'حدث خطأ أثناء إضافة المنتج');
      return false;
    }
  }

  async function addVariant(productId, variant) {
    setError('');
    try {
      await window.electronAPI.addVariantToProduct(productId, variant);
      await fetchProducts();
      return true;
    } catch (err) {
      setError(err.message || 'حدث خطأ أثناء إضافة المتغير');
      return false;
    }
  }

  async function editProduct(productId, data) {
    setError('');
    try {
      await window.electronAPI.updateProduct(productId, data);
      await fetchProducts();
      return true;
    } catch (err) {
      setError(err.message || 'حدث خطأ أثناء تعديل المنتج');
      return false;
    }
  }

  async function removeProduct(productId) {
    setError('');
    try {
      await window.electronAPI.deleteProduct(productId);
      await fetchProducts();
      return true;
    } catch (err) {
      setError(err.message || 'حدث خطأ أثناء حذف المنتج');
      return false;
    }
  }

  async function editVariant(variantId, data) {
    setError('');
    try {
      await window.electronAPI.updateVariant(variantId, data);
      await fetchProducts();
      return true;
    } catch (err) {
      setError(err.message || 'حدث خطأ أثناء تعديل المتغير');
      return false;
    }
  }

  async function removeVariant(variantId) {
    setError('');
    try {
      await window.electronAPI.deleteVariant(variantId);
      await fetchProducts();
      return true;
    } catch (err) {
      setError(err.message || 'حدث خطأ أثناء حذف المتغير');
      return false;
    }
  }

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const stats = useMemo(() => {
    let totalPieces = 0;
    let inventoryValue = 0;
    let estimatedSaleValue = 0;
    let lowStockCount = 0;

    products.forEach((product) => {
      product.variants.forEach((v) => {
        totalPieces += v.stock_quantity;
        inventoryValue += v.stock_quantity * v.purchase_price;
        estimatedSaleValue += v.stock_quantity * v.selling_price;
        if (v.stock_quantity <= v.low_stock_threshold) lowStockCount += 1;
      });
    });

    return {
      totalProducts: products.length,
      totalPieces,
      inventoryValue: Math.round(inventoryValue),
      estimatedSaleValue: Math.round(estimatedSaleValue),
      lowStockCount,
    };
  }, [products]);

  return {
    products, loading, error, stats,
    addProduct, addVariant,
    editProduct, removeProduct,
    editVariant, removeVariant,
    refresh: fetchProducts,
  };
}

export default useProducts;
