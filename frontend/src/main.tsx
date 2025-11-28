import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { router } from './routes';
import { AppProvider } from './store/AppContext';
import { AuthProvider } from './contexts/AuthContext';
import './i18n/config'; // Initialize i18n
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnMount: false, // Don't refetch when component mounts if data exists
      staleTime: 2 * 60 * 1000, // Consider data fresh for 2 minutes (shorter than token expiry)
      gcTime: 5 * 60 * 1000, // Keep unused data in cache for 5 minutes (renamed from cacheTime in v5)
      retry: 1, // Only retry once on failure
      retryDelay: 1000, // Wait 1 second before retry
    },
  },
});

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element with id "root" not found');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AppProvider>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </AppProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
