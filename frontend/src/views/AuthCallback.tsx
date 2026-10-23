import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../state/auth';
import { AuthFrame } from './auth/AuthFrame';

const PROVIDERS = new Set(['microsoft', 'github']);

export function AuthCallback() {
  const { provider } = useParams<{ provider: string }>();
  const [params] = useSearchParams();
  const { social } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    if (!provider || !PROVIDERS.has(provider)) {
      setError(`Unsupported sign-in provider: ${provider ?? 'none'}`);
      return;
    }
    const code = params.get('code');
    if (!code) {
      setError('The provider did not return an authorization code.');
      return;
    }

    social({
      provider,
      code,
      redirect_uri: `${window.location.origin}/auth/callback/${provider}`,
    })
      .then(() => navigate('/chat', { replace: true }))
      .catch((err: Error) => setError(err.message));
  }, [provider, params, social, navigate]);

  return (
    <AuthFrame>
      <h1>Signing you in</h1>
      {error ? (
        <>
          <p className="auth-lede">{error}</p>
          <Link className="btn btn-primary" to="/login" style={{ marginTop: 8 }}>
            Back to sign in
          </Link>
        </>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
          <span className="spinner" />
          <span className="muted">Finishing {provider} sign-in…</span>
        </div>
      )}
    </AuthFrame>
  );
}
