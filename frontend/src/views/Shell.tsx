import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../state/auth';
import { useToast } from '../state/toast';
import { Icon } from '../components/Icon';
import type { IconName } from '../components/Icon';
import { Logo } from '../components/Logo';
import { formatNumber, initials } from '../lib/format';
import type { StatusInfo } from '../types';

const NAV: { to: string; label: string; icon: IconName; adminOnly?: boolean }[] = [
  { to: '/chat', label: 'Chat', icon: 'chat' },
  { to: '/documents', label: 'Documents', icon: 'doc' },
  { to: '/search', label: 'Search', icon: 'search' },
  { to: '/evaluation', label: 'Evaluation', icon: 'flask' },
  { to: '/settings', label: 'Settings', icon: 'gear' },
  { to: '/admin', label: 'Admin', icon: 'shield', adminOnly: true },
];

export function Shell() {
  const { user, signOut } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [status, setStatus] = useState<StatusInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.status
      .get()
      .then((info) => {
        if (!cancelled) setStatus(info);
      })
      .catch(() => {
        if (!cancelled) setStatus(null);
      });
    return () => {
      cancelled = true;
    };
  }, [location.pathname]);

  if (!user) return null;

  const handleSignOut = async () => {
    await signOut();
    toast.push('Signed out.', 'info');
    navigate('/login');
  };

  return (
    <div className="shell">
      <nav className="rail" aria-label="Primary">
        <NavLink to="/chat" className="rail-brand" title="DocuMind">
          <Logo size={26} />
          <span className="brand-name">DocuMind</span>
        </NavLink>

        <div className="rail-nav">
          {NAV.filter((item) => !item.adminOnly || user.is_staff).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `rail-link${isActive ? ' active' : ''}`}
              title={item.label}
            >
              <Icon name={item.icon} size={17} />
              <span className="rail-label">{item.label}</span>
            </NavLink>
          ))}
        </div>

        <div className="rail-footer">
          {status && (
            <div className="rail-stats" title="Your vector index">
              <span>
                <strong>{formatNumber(status.vector_database.total_chunks)}</strong> chunks indexed
              </span>
              <span>
                <strong>{formatNumber(status.vector_database.total_documents)}</strong> documents
              </span>
            </div>
          )}
          <div className="rail-user">
            <span className="avatar">{initials(user.username)}</span>
            <span className="who">
              <span className="name">{user.username}</span>
              <span className="mail">{user.email}</span>
            </span>
            <button
              type="button"
              className="btn-icon"
              onClick={handleSignOut}
              aria-label="Sign out"
              title="Sign out"
            >
              <Icon name="logout" size={16} />
            </button>
          </div>
        </div>
      </nav>

      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
