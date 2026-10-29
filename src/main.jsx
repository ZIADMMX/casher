import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource/cairo/400.css';
import '@fontsource/cairo/600.css';
import '@fontsource/cairo/700.css';
import '@fontsource/cairo/800.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/700.css';
import App from './App.jsx';
import './styles/index.css';
// Redux & TanStack Query providers
import { Provider } from 'react-redux';
import { store } from './app/store';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './queryClient';

import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

ReactDOM.createRoot(document.getElementById('app')).render(
  <React.StrictMode>
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <App />
        <ReactQueryDevtools initialIsOpen={false} />
      </QueryClientProvider>
    </Provider>
  </React.StrictMode>
);