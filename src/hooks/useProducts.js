// src/hooks/useProducts.js
import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as productsApi from '../api/products.js';

// ---- Query Keys ----
const PRODUCTS_QUERY_KEY = ['products'];

// ---- API Helpers (electron API) ----
const fetchProducts = async () => {
  // Returns array of products with variants
  return await productsApi.getAllProductsWithVariants();
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
  } = useQuery({
    queryKey: PRODUCTS_QUERY_KEY,
    queryFn: fetchProducts,
    staleTime: 15 * 1000, // 15 seconds
    refetchOnWindowFocus: false,
  });

  // ----- Mutations -----
  const addProductMutation = useMutation({
    mutationFn: async (newProduct) => {
      await productsApi.addProductWithVariant(newProduct);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PRODUCTS_QUERY_KEY });
    },
  });

  const addVariantMutation = useMutation({
    mutationFn: async ({ productId, variant }) => {
      await productsApi.addVariantToProduct(productId, variant);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PRODUCTS_QUERY_KEY });
    },
  });

  const editProductMutation = useMutation({
    mutationFn: async ({ productId, data }) => {
      await productsApi.updateProduct(productId, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PRODUCTS_QUERY_KEY });
    },
  });

  const removeProductMutation = useMutation({
    mutationFn: async (productId) => {
      await productsApi.deleteProduct(productId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PRODUCTS_QUERY_KEY });
    },
  });

  const editVariantMutation = useMutation({
    mutationFn: async ({ variantId, data }) => {
      await productsApi.updateVariant(variantId, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PRODUCTS_QUERY_KEY });
    },
  });

  const removeVariantMutation = useMutation({
    mutationFn: async (variantId) => {
      await productsApi.deleteVariant(variantId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PRODUCTS_QUERY_KEY });
    },
  });

  // ----- Write helpers -----
  // They throw the server message (e.g. "no permission", "reason required") so the
  // screen can show it; a swallowed error looked like a save that silently failed.
  const addProduct = async (data) => {
    await addProductMutation.mutateAsync(data);
    return true;
  };

  const addVariant = async (productId, variant) => {
    await addVariantMutation.mutateAsync({ productId, variant });
    return true;
  };

  const editProduct = async (productId, data) => {
    await editProductMutation.mutateAsync({ productId, data });
    return true;
  };

  const removeProduct = async (productId) => {
    await removeProductMutation.mutateAsync(productId);
    return true;
  };

  const editVariant = async (variantId, data) => {
    await editVariantMutation.mutateAsync({ variantId, data });
    return true;
  };

  const removeVariant = async (variantId) => {
    await removeVariantMutation.mutateAsync(variantId);
    return true;
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


