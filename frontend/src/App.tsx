import { Suspense, lazy } from 'react';
import type { ReactElement } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './state/auth';
import { Logo } from './components/Logo';

/* The sign-in form is the entry point for new visitors, so it stays in the
   first chunk. Everything else is split per route and fetched on demand. */
import { Login } from './views/Login';

const Signup = lazy(async () => ({ default: (await import('./views/Signup')).Signup }));
const ForgotPassword = lazy(async () => ({
  default: (await import('./views/ForgotPassword')).ForgotPassword,
}));
const ResetPassword = lazy(async () => ({
  default: (await import('./views/ResetPassword')).ResetPassword,
}));
const AuthCallback = lazy(async () => ({
  default: (await import('./views/AuthCallback')).AuthCallback,
}));
const Shell = lazy(async () => ({ default: (await import('./views/Shell')).Shell }));
const Chat = lazy(async () => ({ default: (await import('./views/Chat')).Chat }));
const Documents = lazy(async () => ({ default: (await import('./views/Documents')).Documents }));
const SearchView = lazy(async () => ({ default: (await import('./views/Search')).SearchView }));
const Evaluation = lazy(async () => ({
  default: (await import('./views/Evaluation')).Evaluation,
}));
const Settings = lazy(async () => ({ default: (await import('./views/Settings')).Settings }));
const Admin = lazy(async () => ({ default: (await import('./views/Admin')).Admin }));
const NotFound = lazy(async () => ({ default: (await import('./views/NotFound')).NotFound }));

function Booting() {
  return (
    <div className="boot-screen">
      <div>
        <Logo size={38} />
        <span className="spinner" style={{ borderTopColor: 'var(--pine)' }} />
      </div>
    </div>
  );
}

/* Keeps the shell and its sidebar on screen while a page chunk arrives. */
function Page({ children }: { children: ReactElement }) {
  return (
    <Suspense
      fallback={
        <div className="page-loading">
          <span className="spinner" />
        </div>
      }
    >
      {children}
    </Suspense>
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
    <Suspense fallback={<Booting />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Page><Signup /></Page>} />
        <Route path="/forgot-password" element={<Page><ForgotPassword /></Page>} />
        <Route path="/reset-password" element={<Page><ResetPassword /></Page>} />
        <Route path="/auth/callback/:provider" element={<Page><AuthCallback /></Page>} />

        <Route
          element={
            <RequireAuth>
              <Shell />
            </RequireAuth>
          }
        >
          <Route index element={<Navigate to="/chat" replace />} />
          <Route path="/chat/:conversationId?" element={<Page><Chat /></Page>} />
          <Route path="/documents" element={<Page><Documents /></Page>} />
          <Route path="/search" element={<Page><SearchView /></Page>} />
          <Route path="/evaluation" element={<Page><Evaluation /></Page>} />
          <Route path="/settings" element={<Page><Settings /></Page>} />
          <Route path="/admin" element={<Page><Admin /></Page>} />
        </Route>

        <Route path="*" element={<Page><NotFound /></Page>} />
      </Routes>
    </Suspense>
  );
}
