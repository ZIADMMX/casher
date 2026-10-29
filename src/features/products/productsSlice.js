// src/features/products/productsSlice.js
import { createSlice } from '@reduxjs/toolkit';

// Initial state for products
const initialState = {
  items: [], // array of product objects
  status: 'idle', // 'idle' | 'loading' | 'succeeded' | 'failed'
  error: null,
};

const productsSlice = createSlice({
  name: 'products',
  initialState,
  reducers: {
    setProducts(state, action) {
      state.items = action.payload;
      state.status = 'succeeded';
      state.error = null;
    },
    setLoading(state) {
      state.status = 'loading';
    },
    setError(state, action) {
      state.status = 'failed';
      state.error = action.payload;
    },
    clearProducts(state) {
      state.items = [];
      state.status = 'idle';
      state.error = null;
    },
  },
});

export const {
  setProducts,
  setLoading,
  setError,
  clearProducts,
} = productsSlice.actions;

export default productsSlice.reducer;
