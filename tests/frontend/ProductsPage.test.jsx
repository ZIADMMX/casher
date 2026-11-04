// tests/unit/ProductsPage.test.jsx
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Provider } from 'react-redux';
import { store } from '../../src/app/store.js';
import ProductsPage from '../../src/pages/ProductsPage.jsx';
import useProducts from '../../src/hooks/useProducts.js';

// Mock useProducts hook
vi.mock('../../src/hooks/useProducts.js', () => ({ default: vi.fn() }));
vi.mock('../../src/contexts/BusinessProfileContext.jsx', () => ({
  useBusinessProfile: () => ({ attributes: [], configuration: {}, getTerm: (_key, fallback) => fallback }),
}));
vi.mock('../../src/contexts/UserContext.jsx', () => ({
  useUser: () => ({ currentUser: null }),
}));

function createProducts(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    name: `Product ${index + 1}`,
    categoryName: 'Category',
    image_path: null,
    variants: [{
      id: index + 1,
      size: 'M',
      color: 'Black',
      selling_price: 10,
      stock_quantity: 5,
      low_stock_threshold: 1,
      attributes: [],
    }],
  }));
}

function mockProducts(products) {
  vi.mocked(useProducts).mockReturnValue({
    products,
    loading: false,
    error: '',
    stats: {
      totalProducts: products.length,
      totalPieces: products.length * 5,
      estimatedSaleValue: products.length * 50,
      inventoryValue: products.length * 25,
      lowStockCount: 0,
    },
    addProduct: vi.fn(),
    addVariant: vi.fn(),
    editProduct: vi.fn(),
    removeProduct: vi.fn(),
    editVariant: vi.fn(),
    removeVariant: vi.fn(),
    refresh: vi.fn(),
  });
}

function renderWithProviders(ui) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
    </Provider>
  );
}

describe('ProductsPage integration with TanStack Query', () => {
  beforeEach(() => {
    mockProducts([]);
    window.electronAPI = {
      getAllCategories: vi.fn().mockResolvedValue([]),
      getGroceryExpirySummary: vi.fn().mockResolvedValue(null),
    };
  });

  test('renders empty state message', async () => {
    renderWithProviders(<ProductsPage />);
    await waitFor(() => {
      const emptyMsg = screen.queryByText(/لا توجد منتجات/i);
      expect(emptyMsg).toBeInTheDocument();
    });
  });

  test('paginates the product catalog by 50 and supports 100 products per page', async () => {
    const products = createProducts(121);
    mockProducts(products);

    renderWithProviders(<ProductsPage />);

    const productCards = screen.getAllByRole('button', { name: /إدارة الخيارات والأسعار/ });
    expect(productCards).toHaveLength(50);
    expect(screen.getByText('عرض 1 - 50 من 121 منتج')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'الصفحة التالية' }));
    expect(screen.getByText('عرض 51 - 100 من 121 منتج')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /إدارة الخيارات والأسعار/ })).toHaveLength(50);

    fireEvent.change(screen.getByLabelText('منتج في الصفحة'), { target: { value: '100' } });
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /إدارة الخيارات والأسعار/ })).toHaveLength(100);
      expect(screen.getByText('عرض 1 - 100 من 121 منتج')).toBeInTheDocument();
    });
  });
});
