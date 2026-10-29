// tests/unit/ProductsPage.test.jsx
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Provider } from 'react-redux';
import { store } from '../../src/app/store.js';
import ProductsPage from '../../src/pages/ProductsPage.jsx';

// Mock useProducts hook
vi.mock('../../src/hooks/useProducts.js', () => ({
  default: vi.fn(() => ({
    products: [],
    loading: false,
    error: null,
    stats: null,
    addProduct: vi.fn(),
    addVariant: vi.fn(),
    editProduct: vi.fn(),
    removeProduct: vi.fn(),
    editVariant: vi.fn(),
    removeVariant: vi.fn(),
    refresh: vi.fn(),
  })),
}));

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
  test('renders empty state message', async () => {
    renderWithProviders(<ProductsPage />);
    await waitFor(() => {
      const emptyMsg = screen.queryByText(/لا يوجد منتجات/i);
      expect(emptyMsg).toBeInTheDocument();
    });
  });
});
