import { configureStore } from '@reduxjs/toolkit';
import productsReducer, { setProducts } from '../../src/features/products/productsSlice.js';

function makeStore() {
  return configureStore({ reducer: { products: productsReducer } });
}

test('initial state is empty and idle', () => {
  const state = makeStore().getState().products;
  expect(state).toEqual({ items: [], status: 'idle', error: null });
});

test('setProducts stores the items and marks them loaded', () => {
  const store = makeStore();
  const sample = [{ id: 1, name: 'منتج' }];
  store.dispatch(setProducts(sample));
  expect(store.getState().products).toEqual({ items: sample, status: 'succeeded', error: null });
});
