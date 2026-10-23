import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { ReactElement } from 'react';
import { useAuth } from './state/auth';
import { Logo } from './components/Logo';
import { Shell } from './views/Shell';
import { Login } from './views/Login';
import { Signup } from './views/Signup';
import { ForgotPassword } from './views/ForgotPassword';
import { ResetPassword } from './views/ResetPassword';
import { AuthCallback } from './views/AuthCallback';
import { Chat } from './views/Chat';
import { Documents } from './views/Documents';
import { SearchView } from './views/Search';
import { Evaluation } from './views/Evaluation';
import { Settings } from './views/Settings';
import { Admin } from './views/Admin';
import { NotFound } from './views/NotFound';

function Booting() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        gap: 14,
        background: 'var(--paper)',
      }}
    >
      <div style={{ display: 'grid', justifyItems: 'center', gap: 14 }}>
        <Logo size={38} />
        <span className="spinner" style={{ borderTopColor: 'var(--pine)' }} />
      </div>
    </div>
  );
}

function RequireAuth({ children }: { children: ReactElement }) {
  const { user, booting } = useAuth();
  const location = useLocation();
  if (booting) return <Booting />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/auth/callback/:provider" element={<AuthCallback />} />

      <Route
        element={
          <RequireAuth>
            <Shell />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="/chat" replace />} />
        <Route path="/chat/:conversationId?" element={<Chat />} />
        <Route path="/documents" element={<Documents />} />
        <Route path="/search" element={<SearchView />} />
        <Route path="/evaluation" element={<Evaluation />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/admin" element={<Admin />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
