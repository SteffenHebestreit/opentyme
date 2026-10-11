import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import { installCrossTabSync } from './lib/dataSync';
import { router } from './routes';
import { AppProvider } from './store/AppContext';
import { AuthProvider } from './contexts/AuthContext';
import { SlotProvider } from './plugins/slots';
import { frontendPluginLoader } from './plugins/plugin-loader';
import './i18n/config'; // Initialize i18n
import './index.css';

// Load all frontend plugins before rendering
// Non-fatal: app still runs if plugin loading fails
frontendPluginLoader.loadAll().catch((err) => {
  console.error('[Plugin] Failed to load plugins:', err);
});

installCrossTabSync();

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element with id "root" not found');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AppProvider>
        <AuthProvider>
          <SlotProvider>
            {/* fallbackElement is not in this react-router version's prop types */}
            <RouterProvider router={router} />
          </SlotProvider>
        </AuthProvider>
      </AppProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
