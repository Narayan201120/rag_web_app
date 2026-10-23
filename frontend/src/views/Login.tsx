import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../state/auth';
import { AuthFrame } from './auth/AuthFrame';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const MICROSOFT_CLIENT_ID = import.meta.env.VITE_MICROSOFT_CLIENT_ID as string | undefined;
const GITHUB_CLIENT_ID = import.meta.env.VITE_GITHUB_CLIENT_ID as string | undefined;

interface GoogleCredentialResponse {
  credential: string;
}

interface GoogleIdApi {
  accounts: {
    id: {
      initialize(config: {
        client_id: string;
        callback: (response: GoogleCredentialResponse) => void;
      }): void;
      renderButton(el: HTMLElement, options: Record<string, string | number>): void;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleIdApi;
  }
}

function oauthRedirectUri(provider: string): string {
  return `${window.location.origin}/auth/callback/${provider}`;
}

export function Login() {
  const { user, booting, signIn, social } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const googleBtnRef = useRef<HTMLDivElement>(null);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const from = (location.state as { from?: string } | null)?.from ?? '/chat';

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => {
      if (!window.google || !googleBtnRef.current) return;
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (response) => {
          setError(null);
          setBusy(true);
          social({ provider: 'google', token: response.credential })
            .then(() => navigate('/chat', { replace: true }))
            .catch((err: Error) => setError(err.message))
            .finally(() => setBusy(false));
        },
      });
      window.google.accounts.id.renderButton(googleBtnRef.current, {
        theme: 'outline',
        size: 'large',
        width: 356,
        shape: 'pill',
      });
    };
    document.head.appendChild(script);
    return () => {
      script.remove();
    };
  }, [social, navigate]);

  const submit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setBusy(true);
      try {
        await signIn(username.trim(), password);
        navigate(from, { replace: true });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Sign in failed.');
      } finally {
        setBusy(false);
      }
    },
    [signIn, username, password, navigate, from],
  );

  if (!booting && user) return <Navigate to="/chat" replace />;

  return (
    <AuthFrame>
      <h1>Sign in</h1>
      <p className="auth-lede">Pick up where your library left off.</p>

      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}

      <form onSubmit={submit} style={{ marginTop: 18 }}>
        <div className="field">
          <label htmlFor="login-username">Username</label>
          <input
            id="login-username"
            className="input"
            autoComplete="username"
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </div>
        <div className="field" style={{ marginTop: 14 }}>
          <label htmlFor="login-password">Password</label>
          <input
            id="login-password"
            className="input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? <span className="spinner on-dark" /> : 'Sign in'}
        </button>
      </form>

      <div className="auth-alt">
        <Link to="/forgot-password">Forgot your password?</Link>
      </div>

      {(GOOGLE_CLIENT_ID || MICROSOFT_CLIENT_ID || GITHUB_CLIENT_ID) && (
        <>
          <div className="auth-divider">or continue with</div>
          <div className="socials">
            {GOOGLE_CLIENT_ID && <div ref={googleBtnRef} className="social-google" />}
            {MICROSOFT_CLIENT_ID && (
              <a className="btn btn-ghost social-btn" href={microsoftAuthorizeUrl()}>
                <MicrosoftGlyph />
                Continue with Microsoft
              </a>
            )}
            {GITHUB_CLIENT_ID && (
              <a className="btn btn-ghost social-btn" href={githubAuthorizeUrl()}>
                <GitHubGlyph />
                Continue with GitHub
              </a>
            )}
          </div>
        </>
      )}

      <div className="auth-alt">
        New here? <Link to="/signup">Create an account</Link>
      </div>
    </AuthFrame>
  );
}

function microsoftAuthorizeUrl(): string {
  const params = new URLSearchParams({
    client_id: MICROSOFT_CLIENT_ID!,
    response_type: 'code',
    redirect_uri: oauthRedirectUri('microsoft'),
    response_mode: 'query',
    scope: 'openid email profile',
  });
  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}`;
}

function githubAuthorizeUrl(): string {
  const params = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID!,
    redirect_uri: oauthRedirectUri('github'),
    scope: 'read:user user:email',
  });
  return `https://github.com/login/oauth/authorize?${params}`;
}

function MicrosoftGlyph() {
  return (
    <svg viewBox="0 0 21 21" aria-hidden="true">
      <rect x="0" y="0" width="10" height="10" fill="#f25022" />
      <rect x="11" y="0" width="10" height="10" fill="#7fba00" />
      <rect x="0" y="11" width="10" height="10" fill="#00a4ef" />
      <rect x="11" y="11" width="10" height="10" fill="#ffb900" />
    </svg>
  );
}

function GitHubGlyph() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}
