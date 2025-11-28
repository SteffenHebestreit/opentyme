import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

// Direct Access Grant Auth (Keycloak via API)
import { AuthProvider } from '@/contexts/AuthContext.tsx';
import AuthGuard from '@/components/auth/AuthGuard.tsx';

// Layout
import Layout from '@/components/common/Layout.tsx';

// Auth pages
import Login from '@/pages/auth/Login.tsx';
import Register from '@/pages/auth/Register.tsx';
import ForgotPassword from '@/pages/auth/ForgotPassword.tsx';
import ResetPasswordPage from '@/pages/auth/ResetPassword.tsx';
import LandingPage from '@/pages/LandingPage.tsx';

// Main pages
import Dashboard from '@/components/dashboard/Dashboard.tsx';
import ProfilePage from '@/pages/profile/ProfilePage.tsx';
import ClientList from '@/components/business/clients/ClientList.tsx';
import ProjectList from '@/components/business/projects/ProjectList.tsx';
import TimeEntryList from '@/components/business/time-tracking/TimeEntryList.tsx';

// Finance & Admin pages
import FinancesPage from '@/pages/finances/FinancesPage.tsx';
import AdminPage from '@/pages/admin/AdminPage.tsx';

const App: React.FC = () => (
  <AuthProvider>
    <Layout>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route
          path="/profile"
          element={(
            <AuthGuard>
              <ProfilePage />
            </AuthGuard>
          )}
        />
        <Route
          path="/dashboard"
          element={(
            <AuthGuard>
              <Dashboard />
            </AuthGuard>
          )}
        />
        <Route
          path="/clients"
          element={(
            <AuthGuard>
              <ClientList />
            </AuthGuard>
          )}
        />
        <Route
          path="/projects"
          element={(
            <AuthGuard>
              <ProjectList />
            </AuthGuard>
          )}
        />
        <Route
          path="/time-entries"
          element={(
            <AuthGuard>
              <TimeEntryList />
            </AuthGuard>
          )}
        />
        <Route
          path="/finances"
          element={(
            <AuthGuard>
              <FinancesPage />
            </AuthGuard>
          )}
        />
        {/* Backward compatibility redirects */}
        <Route path="/invoices" element={<Navigate to="/finances" replace />} />
        <Route path="/payments" element={<Navigate to="/finances" replace />} />
        <Route
          path="/config"
          element={(
            <AuthGuard>
              <AdminPage />
            </AuthGuard>
          )}
        />
        <Route path="*" element={<div className="p-8">404 Not Found</div>} />
      </Routes>
    </Layout>
  </AuthProvider>
);

export default App;
