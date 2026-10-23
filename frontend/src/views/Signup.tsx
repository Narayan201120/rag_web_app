import { useCallback, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ApiError } from '../lib/api';
import { useAuth } from '../state/auth';
import { AuthFrame } from './auth/AuthFrame';

function fieldErrors(payload: unknown): Record<string, string> {
  if (typeof payload !== 'object' || payload === null) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
    if (Array.isArray(value) && typeof value[0] === 'string') out[key] = value[0];
  }
  return out;
}

export function Signup() {
  const { user, booting, signUp } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const submit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setErrors({});
      setBusy(true);
      try {
        await signUp(username.trim(), email.trim(), password);
        navigate('/chat', { replace: true });
      } catch (err) {
        if (err instanceof ApiError) {
          const perField = fieldErrors(err.payload);
          if (Object.keys(perField).length > 0) {
            setErrors(perField);
          } else {
            setError(err.message);
          }
        } else {
          setError(err instanceof Error ? err.message : 'Sign up failed.');
        }
      } finally {
        setBusy(false);
      }
    },
    [signUp, username, email, password, navigate],
  );

  if (!booting && user) return <Navigate to="/chat" replace />;

  return (
    <AuthFrame>
      <h1>Create your account</h1>
      <p className="auth-lede">Your library stays yours. Documents are scoped to your account.</p>

      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}

      <form onSubmit={submit} style={{ marginTop: 18 }}>
        <div className="field">
          <label htmlFor="su-username">Username</label>
          <input
            id="su-username"
            className="input"
            autoComplete="username"
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
          {errors.username && <span className="field-error">{errors.username}</span>}
        </div>

        <div className="field" style={{ marginTop: 14 }}>
          <label htmlFor="su-email">Email</label>
          <input
            id="su-email"
            className="input"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          {errors.email && <span className="field-error">{errors.email}</span>}
        </div>

        <div className="field" style={{ marginTop: 14 }}>
          <label htmlFor="su-password">Password</label>
          <input
            id="su-password"
            className="input"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />
          {errors.password ? (
            <span className="field-error">{errors.password}</span>
          ) : (
            <span className="field-hint">At least 8 characters.</span>
          )}
        </div>

        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? <span className="spinner on-dark" /> : 'Create account'}
        </button>
      </form>

      <div className="auth-alt">
        Already have an account? <Link to="/login">Sign in</Link>
      </div>
    </AuthFrame>
  );
}
