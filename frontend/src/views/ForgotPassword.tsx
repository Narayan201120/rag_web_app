import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { AuthFrame } from './auth/AuthFrame';

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setBusy(true);
      setError(null);
      try {
        await api.auth.forgotPassword(email.trim());
        setSent(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not send the reset link.');
      } finally {
        setBusy(false);
      }
    },
    [email],
  );

  return (
    <AuthFrame>
      <h1>Reset your password</h1>
      <p className="auth-lede">
        Enter the email on your account and we'll send a reset link.
      </p>

      {sent ? (
        <div className="test-result">
          <div className="head ok">
            Check your inbox
          </div>
          <p className="reply">
            If an account exists for <span className="mono">{email}</span>, a reset link is on its
            way. The link expires after a while, so use it soon.
          </p>
        </div>
      ) : (
        <form onSubmit={submit} style={{ marginTop: 18 }}>
          {error && (
            <div className="form-error" role="alert" style={{ marginBottom: 14 }}>
              {error}
            </div>
          )}
          <div className="field">
            <label htmlFor="fp-email">Email</label>
            <input
              id="fp-email"
              className="input"
              type="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={busy}
            style={{ width: '100%', marginTop: 16, height: 42 }}
          >
            {busy ? <span className="spinner on-dark" /> : 'Send reset link'}
          </button>
        </form>
      )}

      <div className="auth-alt">
        Remembered it? <Link to="/login">Sign in</Link>
      </div>
    </AuthFrame>
  );
}
