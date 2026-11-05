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

const LOCKED = { canCreate: false, canEdit: false, canDelete: false, canAdjustStock: false, canSeeCost: false, ownEdit: false, unlock: null };
const OWNER = { canCreate: true, canEdit: true, canDelete: true, canAdjustStock: true, canSeeCost: true, ownEdit: true, unlock: null };

function installBridge(access = LOCKED, overrides = {}) {
  window.electronAPI = {
    getAllCategories: vi.fn().mockResolvedValue([]),
    getGroceryExpirySummary: vi.fn().mockResolvedValue(null),
    getProductEditAccess: vi.fn().mockResolvedValue(access),
    getProductChangeLog: vi.fn().mockResolvedValue([]),
    unlockProductEditing: vi.fn(),
    lockProductEditing: vi.fn().mockResolvedValue({ success: true }),
    ...overrides,
  };
}

describe('ProductsPage', () => {
  beforeEach(() => {
    mockProducts([]);
    installBridge();
  });

  test('renders empty state message', async () => {
    renderWithProviders(<ProductsPage />);
    expect(await screen.findByText(/مفيش المنتجات مطابقة/)).toBeInTheDocument();
  });

  test('paginates the product catalog by 50 and supports 100 products per page', async () => {
    mockProducts(createProducts(121));
    renderWithProviders(<ProductsPage />);

    const editButtons = () => screen.getAllByRole('button', { name: /تعديل السعر والخيارات/ });
    expect(editButtons()).toHaveLength(50);
    expect(screen.getByText('عرض 1 - 50 من 121 منتج')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'الصفحة التالية' }));
    expect(screen.getByText('عرض 51 - 100 من 121 منتج')).toBeInTheDocument();
    expect(editButtons()).toHaveLength(50);

    fireEvent.change(screen.getByLabelText('منتج في الصفحة'), { target: { value: '100' } });
    await waitFor(() => {
      expect(editButtons()).toHaveLength(100);
      expect(screen.getByText('عرض 1 - 100 من 121 منتج')).toBeInTheDocument();
    });
  });

  test('a locked user sees the lock banner and editing asks for the manager code', async () => {
    mockProducts(createProducts(1));
    renderWithProviders(<ProductsPage />);

    expect(await screen.findByText(/مقفولة — وضع العرض فقط/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /تعديل السعر والخيارات/ }));
    expect(await screen.findByRole('dialog', { name: 'فتح التعديل بكود المدير' })).toBeInTheDocument();
  });

  test('the manager code is sent to the server and the edit continues after unlocking', async () => {
    mockProducts(createProducts(1));
    const unlocked = { ...LOCKED, canEdit: true, canCreate: true, canDelete: true, unlock: { managerName: 'owner', grantedAt: new Date().toISOString(), permissions: [] } };
    const getAccess = vi.fn().mockResolvedValueOnce(LOCKED).mockResolvedValue(unlocked);
    installBridge(LOCKED, {
      getProductEditAccess: getAccess,
      unlockProductEditing: vi.fn().mockResolvedValue(unlocked.unlock),
    });
    renderWithProviders(<ProductsPage />);

    fireEvent.click(await screen.findByRole('button', { name: /فتح التعديل بكود المدير/ }));
    fireEvent.change(screen.getByLabelText('اسم دخول المدير'), { target: { value: 'owner' } });
    fireEvent.change(screen.getByLabelText('كلمة سر المدير'), { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: 'فتح التعديل' }));

    await waitFor(() => expect(window.electronAPI.unlockProductEditing).toHaveBeenCalledWith({ username: 'owner', password: 'secret' }));
    expect(await screen.findByText(/التعديل مفتوح بموافقة owner/)).toBeInTheDocument();
  });

  test('a wrong code shows the server message', async () => {
    installBridge(LOCKED, { unlockProductEditing: vi.fn().mockRejectedValue(new Error('اسم المدير أو كلمة السر غير صحيحة')) });
    renderWithProviders(<ProductsPage />);

    fireEvent.click(await screen.findByRole('button', { name: /فتح التعديل بكود المدير/ }));
    fireEvent.change(screen.getByLabelText('اسم دخول المدير'), { target: { value: 'owner' } });
    fireEvent.change(screen.getByLabelText('كلمة سر المدير'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: 'فتح التعديل' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('اسم المدير أو كلمة السر غير صحيحة');
  });

  test('a user with edit rights sees no lock banner', async () => {
    installBridge(OWNER);
    mockProducts(createProducts(1));
    renderWithProviders(<ProductsPage />);
    await waitFor(() => expect(window.electronAPI.getProductEditAccess).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText(/مقفولة — وضع العرض فقط/)).not.toBeInTheDocument());
  });
});
