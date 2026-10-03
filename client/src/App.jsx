import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Layout from './components/Layout.jsx';
import HomePage from './pages/HomePage.jsx';
import DispatchesPage from './pages/DispatchesPage.jsx';
import FacilitiesPage from './pages/FacilitiesPage.jsx';
import AdminApprovalsPage from './pages/AdminApprovalsPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Layout />}>
            {/* Operational Pages - Strictly Protected */}
            <Route
              index
              element={
                <ProtectedRoute>
                  <HomePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="dispatches"
              element={
                <ProtectedRoute>
                  <DispatchesPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="facilities"
              element={
                <ProtectedRoute>
                  <FacilitiesPage />
                </ProtectedRoute>
              }
            />
            {/* Admin Only Routes */}
            <Route
              path="admin/users"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <AdminApprovalsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="admin/approvals"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <AdminApprovalsPage />
                </ProtectedRoute>
              }
            />
            {/* Public Authentication Pages */}
            <Route path="login" element={<LoginPage />} />
            <Route path="register" element={<RegisterPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
