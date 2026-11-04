// tests/unit/productsSlice.test.js
import { store } from '../../src/app/store.js';
import { setProducts } from '../../src/features/products/productsSlice.js';

test('initial state is empty array', () => {
  const state = store.getState().products;
  expect(state).toEqual([]);
});

test('setProducts updates state', () => {
  const sample = [{ id: 1, name: 'منتج' }];
  store.dispatch(setProducts(sample));
  const state = store.getState().products;
  expect(state).toEqual(sample);
});
