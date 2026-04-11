import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { MainLayout } from './layouts/MainLayout';
import { Home } from './pages/Home';
import { Assistant } from './pages/Assistant';
import { LoginPage } from './pages/LoginPage';
import { AdminDashboard } from './pages/AdminDashboard';
import { CurriculumPage } from './pages/CurriculumPage';
import { useTheme } from './hooks/useTheme';

// Simple Route Guard
const ProtectedRoute = ({ children, role }: { children: React.ReactNode, role?: string }) => {
  const userStr = localStorage.getItem('eduzyniq_user');
  if (!userStr) return <Navigate to="/login" replace />;

  try {
    const user = JSON.parse(userStr);
    if (!user || (role && user.role !== role)) {
      return <Navigate to="/" replace />;
    }
  } catch (e) {
    localStorage.removeItem('eduzyniq_user');
    return <Navigate to="/login" replace />;
  }

  return children;
};

function App() {
  // Initialize theme from localStorage on every mount — applies data-theme to <html>
  useTheme();
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route element={<MainLayout />}>
          <Route path="/" element={<Home />} />

          <Route path="/assistant" element={
            <ProtectedRoute role="student">
              <Assistant />
            </ProtectedRoute>
          } />

          <Route path="/admin" element={
            <ProtectedRoute role="admin">
              <AdminDashboard />
            </ProtectedRoute>
          } />

          <Route path="/curriculum" element={<CurriculumPage />} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
