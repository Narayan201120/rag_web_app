import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import type { SettingsInfo, TestConnectionResponse } from '../types';
import { useAuth } from '../state/auth';
import { useToast } from '../state/toast';
import { getTheme, setTheme } from '../state/theme';
import type { Theme } from '../state/theme';
import { Modal } from '../components/Modal';
import { Icon } from '../components/Icon';

const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
];

function AppearancePanel() {
  const [theme, setThemeState] = useState<Theme>(getTheme);

  const pick = (next: Theme) => {
    setTheme(next);
    setThemeState(next);
  };

  return (
    <div className="panel">
      <h2>Appearance</h2>
      <p className="panel-sub">DocuMind ships dark; switch to paper-light if you prefer.</p>
      <div className="seg" role="radiogroup" aria-label="Color theme">
        {THEME_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={theme === option.value}
            className={`seg-opt${theme === option.value ? ' selected' : ''}`}
            onClick={() => pick(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Settings() {
  const { user, signOut } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [settings, setSettings] = useState<SettingsInfo | null>(null);
  const [provider, setProvider] = useState('');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<
    { ok: boolean; text: string; reply?: string } | null
  >(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleting, setDeleting] = useState(false);

  const loadSettings = useCallback(async () => {
    try {
      const info = await api.settings.get();
      setSettings(info);
      setProvider(info.provider || info.supported_providers[0] || '');
      setModel(info.model || '');
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Could not load settings.', 'error');
    }
  }, [toast]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const modelsForProvider = settings?.provider_models[provider] ?? [];

  const onProviderChange = (next: string) => {
    setProvider(next);
    const models = settings?.provider_models[next] ?? [];
    setModel(models[0] ?? '');
  };

  const save = useCallback(async () => {
    if (!apiKey.trim()) {
      toast.push('Paste your API key first.', 'error');
      return;
    }
    setSaving(true);
    try {
      await api.settings.save(provider, model, apiKey.trim());
      setApiKey('');
      await loadSettings();
      toast.push('Provider and key saved.', 'success');
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Could not save settings.', 'error');
    } finally {
      setSaving(false);
    }
  }, [provider, model, apiKey, loadSettings, toast]);

  const testConnection = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res: TestConnectionResponse = await api.settings.test({
        provider,
        model,
        ...(apiKey.trim() ? { api_key: apiKey.trim() } : {}),
      });
      setTestResult({ ok: true, text: res.message, reply: res.reply_excerpt });
    } catch (err) {
      setTestResult({
        ok: false,
        text: err instanceof Error ? err.message : 'Connection test failed.',
      });
    } finally {
      setTesting(false);
    }
  }, [provider, model, apiKey]);

  const submitDelete = useCallback(async () => {
    setDeleting(true);
    try {
      await api.account.delete(deletePassword);
      setDeleteOpen(false);
      await signOut();
      navigate('/login');
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Could not delete the account.', 'error');
    } finally {
      setDeleting(false);
    }
  }, [deletePassword, signOut, navigate, toast]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p className="page-sub">
            Chat runs on the provider and model you configure here. Your key is stored encrypted on
            the server.
          </p>
        </div>
      </div>

      <div className="work">
        <AppearancePanel />

        <div className="panel">
          <h2>Model provider</h2>
          <p className="panel-sub">
            {settings?.api_key
              ? `A key is saved (${settings.api_key}). Replace it any time.`
              : 'No API key saved yet. Chat needs one before it can answer.'}
          </p>

          <div className="form-grid">
            <div className="inline">
              <div className="field">
                <label htmlFor="set-provider">Provider</label>
                <select
                  id="set-provider"
                  className="input"
                  value={provider}
                  onChange={(e) => onProviderChange(e.target.value)}
                >
                  {(settings?.supported_providers ?? []).map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="set-model">Model</label>
                <select
                  id="set-model"
                  className="input"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                >
                  {modelsForProvider.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="field">
              <label htmlFor="set-key">API key</label>
              <input
                id="set-key"
                className="input"
                type="password"
                autoComplete="off"
                placeholder={
                  settings?.api_key ? `Current key ${settings.api_key}` : 'Paste your key'
                }
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={saving}>
                {saving ? <span className="spinner on-dark" /> : 'Save provider and key'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => void testConnection()} disabled={testing}>
                {testing ? <span className="spinner" /> : <Icon name="check" size={15} />}
                Test connection
              </button>
            </div>

            {testResult && (
              <div className="test-result">
                <div className={`head ${testResult.ok ? 'ok' : 'bad'}`}>
                  {testResult.ok ? 'Connection works' : 'Connection failed'}
                </div>
                <p className="reply">{testResult.text}</p>
                {testResult.reply && (
                  <div className="quote">
                    {testResult.reply}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="panel">
          <h2>Account</h2>
          <p className="panel-sub">Signed in as {user?.username}.</p>
          <div className="panel-row">
            <span className="label">Username</span>
            <span className="value">{user?.username}</span>
          </div>
          <div className="panel-row">
            <span className="label">Email</span>
            <span className="value">{user?.email}</span>
          </div>
          <div className="panel-row">
            <span className="label">Role</span>
            <span className="value">{user?.is_staff ? 'Administrator' : 'Member'}</span>
          </div>
          <div style={{ marginTop: 18 }}>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={async () => {
                await signOut();
                navigate('/login');
              }}
            >
              <Icon name="logout" size={15} />
              Sign out
            </button>
          </div>
        </div>

        <div className="danger-zone">
          <h2>Delete account</h2>
          <p>
            Removes your account, every document, and the search index built from them. This cannot
            be undone.
          </p>
          <button type="button" className="btn btn-danger" onClick={() => setDeleteOpen(true)}>
            Delete my account
          </button>
        </div>
      </div>

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete your account?"
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setDeleteOpen(false)}>
              Keep my account
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => void submitDelete()}
              disabled={deleting || !deletePassword}
            >
              Delete forever
            </button>
          </>
        }
      >
        <p className="modal-body">
          Confirm with your password. All documents, conversations, and index data will be removed.
        </p>
        <div className="field">
          <label htmlFor="del-password">Your password</label>
          <input
            id="del-password"
            className="input"
            type="password"
            autoComplete="current-password"
            value={deletePassword}
            autoFocus
            onChange={(e) => setDeletePassword(e.target.value)}
          />
        </div>
      </Modal>
    </div>
  );
}
