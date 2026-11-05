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

// Developer-only cache inspector (the floating palm-tree button). Loaded only by the
// Vite dev server, so it never ships in the built app users run.
const ReactQueryDevtools = import.meta.env.DEV
  ? React.lazy(() => import('@tanstack/react-query-devtools').then((m) => ({ default: m.ReactQueryDevtools })))
  : null;

ReactDOM.createRoot(document.getElementById('app')).render(
  <React.StrictMode>
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <App />
        {ReactQueryDevtools && (
          <React.Suspense fallback={null}>
            <ReactQueryDevtools initialIsOpen={false} />
          </React.Suspense>
        )}
      </QueryClientProvider>
    </Provider>
  </React.StrictMode>
);