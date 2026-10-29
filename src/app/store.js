// src/app/store.js
import { configureStore } from '@reduxjs/toolkit';
import productsReducer from '../features/products/productsSlice'; // corrected path

export const store = configureStore({
  reducer: {
    products: productsReducer,
  },
  devTools: import.meta.env ? Boolean(import.meta.env.DEV) : true,
});
