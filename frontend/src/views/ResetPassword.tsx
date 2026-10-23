import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { AuthFrame } from './auth/AuthFrame';

export function ResetPassword() {
  const [params] = useSearchParams();
  const uid = params.get('uid') ?? '';
  const token = params.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const linkBroken = !uid || !token;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await api.auth.resetPassword(uid, token, password);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reset the password.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthFrame>
      <h1>Set a new password</h1>

      {linkBroken ? (
        <>
          <p className="auth-lede">
            This reset link is incomplete. Request a fresh one and open it from your email.
          </p>
          <Link className="btn btn-primary" to="/forgot-password" style={{ marginTop: 8 }}>
            Request a new link
          </Link>
        </>
      ) : done ? (
        <>
          <p className="auth-lede">Your password is updated. Sign in with the new one.</p>
          <Link className="btn btn-primary" to="/login" style={{ marginTop: 8 }}>
            Go to sign in
          </Link>
        </>
      ) : (
        <form onSubmit={submit} style={{ marginTop: 18 }}>
          {error && (
            <div className="form-error" role="alert" style={{ marginBottom: 14 }}>
              {error}
            </div>
          )}
          <div className="field">
            <label htmlFor="rp-password">New password</label>
            <input
              id="rp-password"
              className="input"
              type="password"
              autoComplete="new-password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
            <span className="field-hint">At least 8 characters.</span>
          </div>
          <div className="field" style={{ marginTop: 14 }}>
            <label htmlFor="rp-confirm">Confirm password</label>
            <input
              id="rp-confirm"
              className="input"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
          </div>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={busy}
            style={{ width: '100%', marginTop: 16, height: 42 }}
          >
            {busy ? <span className="spinner on-dark" /> : 'Set new password'}
          </button>
        </form>
      )}

      <div className="auth-alt">
        <Link to="/login">Back to sign in</Link>
      </div>
    </AuthFrame>
  );
}
