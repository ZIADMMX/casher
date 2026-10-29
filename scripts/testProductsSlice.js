// scripts/testProductsSlice.js
const { store } = require('../src/app/store.js');
const { setProducts } = require('../src/features/products/productsSlice.js');

function assertEqual(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    console.error('❌', msg, '\n   expected:', e, '\n   got:', a);
    process.exit(1);
  }
}

// initial state should be empty array
assertEqual(store.getState().products, [], 'initial state is empty');

const sample = [{ id: 1, name: 'منتج' }];
store.dispatch(setProducts(sample));
assertEqual(store.getState().products, sample, 'state after setProducts');

console.log('✅ All assertions passed');
process.exit(0);
