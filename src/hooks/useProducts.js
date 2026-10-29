// src/hooks/useProducts.js
import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// ---- Query Keys ----
const PRODUCTS_QUERY_KEY = ['products'];

// ---- API Helpers (electron API) ----
const fetchProducts = async () => {
  // Returns array of products with variants
  return await window.electronAPI.getAllProductsWithVariants();
};

export function useProducts() {
  const queryClient = useQueryClient();

  // Query: fetch products (stale after 15s, refetch on window focus disabled for UI stability)
  const {
    data: products = [],
    isLoading: loading,
    isError,
    error,
    refetch,
  } = useQuery(PRODUCTS_QUERY_KEY, fetchProducts, {
    staleTime: 15 * 1000, // 15 seconds
    refetchOnWindowFocus: false,
  });

  // ----- Mutations -----
  const addProductMutation = useMutation(
    async (newProduct) => {
      await window.electronAPI.addProductWithVariant(newProduct);
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries(PRODUCTS_QUERY_KEY);
      },
    }
  );

  const addVariantMutation = useMutation(
    async ({ productId, variant }) => {
      await window.electronAPI.addVariantToProduct(productId, variant);
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries(PRODUCTS_QUERY_KEY);
      },
    }
  );

  const editProductMutation = useMutation(
    async ({ productId, data }) => {
      await window.electronAPI.updateProduct(productId, data);
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries(PRODUCTS_QUERY_KEY);
      },
    }
  );

  const removeProductMutation = useMutation(
    async (productId) => {
      await window.electronAPI.deleteProduct(productId);
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries(PRODUCTS_QUERY_KEY);
      },
    }
  );

  const editVariantMutation = useMutation(
    async ({ variantId, data }) => {
      await window.electronAPI.updateVariant(variantId, data);
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries(PRODUCTS_QUERY_KEY);
      },
    }
  );

  const removeVariantMutation = useMutation(
    async (variantId) => {
      await window.electronAPI.deleteVariant(variantId);
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries(PRODUCTS_QUERY_KEY);
      },
    }
  );

  // ----- Helper wrappers preserving original API -----
  const addProduct = async (data) => {
    try {
      await addProductMutation.mutateAsync(data);
      return true;
    } catch (err) {
      console.error(err);
      return false;
    }
  };

  const addVariant = async (productId, variant) => {
    try {
      await addVariantMutation.mutateAsync({ productId, variant });
      return true;
    } catch (err) {
      console.error(err);
      return false;
    }
  };

  const editProduct = async (productId, data) => {
    try {
      await editProductMutation.mutateAsync({ productId, data });
      return true;
    } catch (err) {
      console.error(err);
      return false;
    }
  };

  const removeProduct = async (productId) => {
    try {
      await removeProductMutation.mutateAsync(productId);
      return true;
    } catch (err) {
      console.error(err);
      return false;
    }
  };

  const editVariant = async (variantId, data) => {
    try {
      await editVariantMutation.mutateAsync({ variantId, data });
      return true;
    } catch (err) {
      console.error(err);
      return false;
    }
  };

  const removeVariant = async (variantId) => {
    try {
      await removeVariantMutation.mutateAsync(variantId);
      return true;
    } catch (err) {
      console.error(err);
      return false;
    }
  };

  // ----- Stats (derived from products) -----
  const stats = useMemo(() => {
    let totalPieces = 0;
    let inventoryValue = 0;
    let estimatedSaleValue = 0;
    let lowStockCount = 0;
    products.forEach((p) => {
      p.variants?.forEach((v) => {
        const qty = v.stock_quantity || 0;
        totalPieces += qty;
        inventoryValue += qty * (v.purchase_price || 0);
        estimatedSaleValue += qty * (v.selling_price || 0);
        if (qty <= (v.low_stock_threshold || 0)) lowStockCount += 1;
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
    products,
    loading,
    error: isError ? error?.message || 'خطأ في تحميل المنتجات' : '',
    stats,
    addProduct,
    addVariant,
    editProduct,
    removeProduct,
    editVariant,
    removeVariant,
    refresh: refetch,
  };
}

export default useProducts;


