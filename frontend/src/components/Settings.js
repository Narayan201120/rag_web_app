import { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient, requestWithRefresh } from '../apiClient';

const FOCUSABLE =
    'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

const SUCCESS_MS = 3000;

const PROVIDER_LABELS = {
    'google-gemini': 'Google Gemini',
    openai: 'OpenAI',
    anthropic: 'Anthropic',
    mistral: 'Mistral',
    xai: 'xAI',
    qwen: 'Qwen',
    minimax: 'MiniMax',
    'meta-llama': 'Meta Llama',
    other: 'Other',
};

const DEFAULT_PROVIDERS = [
    'google-gemini',
    'openai',
    'anthropic',
    'mistral',
    'xai',
    'qwen',
    'minimax',
    'meta-llama',
    'other',
];

function providerLabel(id) {
    return PROVIDER_LABELS[id] || id;
}

function Settings({ onLogout }) {
    const [section, setSection] = useState('preferences');
    const [account, setAccount] = useState(null);
    const [usage, setUsage] = useState(null);
    const [vectors, setVectors] = useState(null);
    const [sysStatus, setSysStatus] = useState(null);
    const [adminStatus, setAdminStatus] = useState('idle'); // idle | loading | ready | error
    const [adminError, setAdminError] = useState('');

    /* One notice channel per section. Errors persist; successes clear on a
       timer. Because they are keyed by section, switching tabs never shows a
       stale message from another panel. */
    const [notices, setNotices] = useState({ preferences: null, account: null, admin: null });
    const noticeTimers = useRef({});

    const pushNotice = useCallback((scope, tone, text) => {
        setNotices((current) => ({ ...current, [scope]: { tone, text } }));
        if (noticeTimers.current[scope]) {
            clearTimeout(noticeTimers.current[scope]);
            noticeTimers.current[scope] = undefined;
        }
        if (tone === 'success') {
            noticeTimers.current[scope] = setTimeout(() => {
                setNotices((current) => ({ ...current, [scope]: null }));
                noticeTimers.current[scope] = undefined;
            }, SUCCESS_MS);
        }
    }, []);

    const clearNotice = useCallback((scope) => {
        if (noticeTimers.current[scope]) {
            clearTimeout(noticeTimers.current[scope]);
            noticeTimers.current[scope] = undefined;
        }
        setNotices((current) => ({ ...current, [scope]: null }));
    }, []);

    const [resultsCount, setResultsCount] = useState(localStorage.getItem('pref_results') || '5');
    const [searchMode, setSearchMode] = useState(localStorage.getItem('pref_searchMode') || 'search');
    const [apiKey, setApiKey] = useState('');
    const [apiKeyDisplay, setApiKeyDisplay] = useState('');
    const [showStoredKey, setShowStoredKey] = useState(false);
    const [showEnteredKey, setShowEnteredKey] = useState(false);
    const [provider, setProvider] = useState('google-gemini');
    const [model, setModel] = useState('gemini-3.8-flash');
    const [providerOptions, setProviderOptions] = useState([]);
    const [providerModels, setProviderModels] = useState({});
    const [keyStatus, setKeyStatus] = useState(null); // { tone, text } for the provider card
    const [testingConnection, setTestingConnection] = useState(false);

    const [deletePassword, setDeletePassword] = useState('');
    const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
    const [deletingAccount, setDeletingAccount] = useState(false);

    const tabRefs = useRef({});
    const dialogRef = useRef(null);
    const cancelRef = useRef(null);
    const deleteTriggerRef = useRef(null);

    const authenticatedRequest = useCallback((requestFn) => (
        requestWithRefresh(requestFn, { onUnauthorized: onLogout })
    ), [onLogout]);

    /* Account is fetched on mount so the Admin tab gate (is_staff) is known
       immediately, not only after the Account tab opens. */
    useEffect(() => {
        authenticatedRequest((headers) => apiClient.get('/account/', { headers }))
            .then((res) => setAccount(res.data))
            .catch(() => setAccount(null));
    }, [authenticatedRequest]);

    const isStaff = account?.is_staff === true;

    /* If the account load says this user is not staff, never leave them
       stranded on the Admin panel. */
    useEffect(() => {
        if (account && !isStaff && section === 'admin') {
            setSection('preferences');
        }
    }, [account, isStaff, section]);

    const fetchApiKeySettings = useCallback(async () => {
        try {
            const res = await authenticatedRequest((headers) => apiClient.get('/settings/api-key/', { headers }));
            setApiKeyDisplay(res.data.api_key || '');
            setProvider(res.data.provider || 'google-gemini');
            setModel(res.data.model || 'gemini-3.8-flash');
            setProviderOptions(res.data.supported_providers || []);
            setProviderModels(res.data.provider_models || {});
        } catch (err) {
            pushNotice('preferences', 'error', err.response?.data?.error || 'Failed to load provider settings');
        }
    }, [authenticatedRequest, pushNotice]);

    useEffect(() => {
        fetchApiKeySettings();
    }, [fetchApiKeySettings]);

    useEffect(() => {
        const models = providerModels[provider] || [];
        if (models.length > 0 && !models.includes(model)) {
            setModel(models[0]);
        }
    }, [provider, providerModels, model]);

    const savePreferences = () => {
        localStorage.setItem('pref_results', resultsCount);
        localStorage.setItem('pref_searchMode', searchMode);
        pushNotice('preferences', 'success', 'Preferences saved.');
    };

    const keyStatusTimer = useRef(undefined);
    const setKeyStatusTimed = useCallback((tone, text) => {
        if (keyStatusTimer.current) clearTimeout(keyStatusTimer.current);
        setKeyStatus({ tone, text });
        if (tone === 'success') {
            keyStatusTimer.current = setTimeout(() => setKeyStatus(null), SUCCESS_MS);
        }
    }, []);

    const handleSaveApiKey = async () => {
        try {
            await authenticatedRequest((headers) => apiClient.post('/settings/api-key/', { provider, model, api_key: apiKey }, { headers }));
            setApiKey('');
            setKeyStatusTimed('success', 'Provider, model, and API key saved.');
            await fetchApiKeySettings();
        } catch (err) {
            setKeyStatus({ tone: 'error', text: err.response?.data?.error || 'Failed to save provider/API key' });
        }
    };

    const handleTestConnection = async () => {
        setTestingConnection(true);
        setKeyStatus(null);
        try {
            await authenticatedRequest((headers) => apiClient.post(
                '/settings/api-key/test/',
                { provider, model, api_key: apiKey },
                { headers }
            ));
            setKeyStatusTimed('success', 'Connection successful.');
        } catch (err) {
            setKeyStatus({ tone: 'error', text: err.response?.data?.error || 'Connection test failed' });
        } finally {
            setTestingConnection(false);
        }
    };

    useEffect(() => {
        if (section !== 'admin' || !isStaff) return undefined;
        let cancelled = false;
        setAdminStatus('loading');
        setAdminError('');
        Promise.all([
            authenticatedRequest((headers) => apiClient.get('/admin/usage/', { headers })),
            authenticatedRequest((headers) => apiClient.get('/admin/vectors/', { headers })),
            authenticatedRequest((headers) => apiClient.get('/status/', { headers })),
        ])
            .then(([usageRes, vectorsRes, statusRes]) => {
                if (cancelled) return;
                setUsage(usageRes.data);
                setVectors(vectorsRes.data);
                setSysStatus(statusRes.data);
                setAdminStatus('ready');
            })
            .catch((err) => {
                if (cancelled) return;
                setAdminError(err.response?.data?.error || 'Admin access required');
                setAdminStatus('error');
            });
        return () => { cancelled = true; };
    }, [section, isStaff, authenticatedRequest]);

    /* ---------- Account deletion modal ---------- */

    const openDeleteDialog = () => {
        setConfirmDeleteOpen(true);
    };

    const closeDeleteDialog = useCallback(() => {
        if (deletingAccount) return;
        setConfirmDeleteOpen(false);
        setDeletePassword('');
        deleteTriggerRef.current?.focus();
    }, [deletingAccount]);

    const handleDeleteAccount = async () => {
        if (!deletePassword || deletingAccount) return;
        setDeletingAccount(true);
        try {
            await authenticatedRequest((headers) => apiClient.delete('/account/delete/', {
                headers,
                data: { password: deletePassword },
            }));
            setDeletingAccount(false);
            setConfirmDeleteOpen(false);
            setDeletePassword('');
            onLogout();
        } catch (err) {
            setDeletingAccount(false);
            setConfirmDeleteOpen(false);
            setDeletePassword('');
            deleteTriggerRef.current?.focus();
            pushNotice('account', 'error', err.response?.data?.error || 'Delete failed');
        }
    };

    useEffect(() => {
        if (!confirmDeleteOpen) return undefined;
        cancelRef.current?.focus();

        const onKeyDown = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                closeDeleteDialog();
                return;
            }
            if (event.key !== 'Tab') return;

            const nodes = dialogRef.current?.querySelectorAll(FOCUSABLE);
            if (!nodes || nodes.length === 0) {
                event.preventDefault();
                return;
            }
            const first = nodes[0];
            const last = nodes[nodes.length - 1];
            if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };

        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [confirmDeleteOpen, closeDeleteDialog]);

    /* ---------- Tabs ---------- */

    const tabs = [
        { id: 'preferences', label: 'Preferences' },
        { id: 'account', label: 'Account' },
        ...(isStaff ? [{ id: 'admin', label: 'Admin' }] : []),
    ];

    const onTabKeyDown = (event, index) => {
        const horizontal = event.key === 'ArrowLeft' || event.key === 'ArrowRight';
        const vertical = event.key === 'ArrowUp' || event.key === 'ArrowDown';
        if (!horizontal && !vertical && event.key !== 'Home' && event.key !== 'End') return;
        event.preventDefault();
        let next = index;
        if (event.key === 'ArrowDown' || event.key === 'ArrowRight') next = (index + 1) % tabs.length;
        if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
        if (event.key === 'Home') next = 0;
        if (event.key === 'End') next = tabs.length - 1;
        const target = tabs[next];
        setSection(target.id);
        tabRefs.current[target.id]?.focus();
    };

    const notice = notices[section];

    return (
        <div className="set-page">
            <header className="set-page-header">
                <h2 className="set-page-title">Settings</h2>
                <p className="set-page-subtitle">Tune search, manage your account, and administer the workspace.</p>
            </header>

            <div className="set-body">
                <div className="set-rail" role="tablist" aria-label="Settings sections" aria-orientation="vertical">
                    {tabs.map((tab, index) => (
                        <button
                            key={tab.id}
                            ref={(el) => { tabRefs.current[tab.id] = el; }}
                            type="button"
                            role="tab"
                            id={`set-tab-${tab.id}`}
                            aria-selected={section === tab.id}
                            aria-controls={`set-panel-${tab.id}`}
                            tabIndex={section === tab.id ? 0 : -1}
                            className={`set-tab${section === tab.id ? ' is-active' : ''}`}
                            onClick={() => setSection(tab.id)}
                            onKeyDown={(event) => onTabKeyDown(event, index)}
                        >
                            {tab.label}
                        </button>
                    ))}
                    <div className="set-rail-spacer" />
                    <button type="button" className="set-tab set-tab-logout" onClick={onLogout}>Logout</button>
                </div>

                <div className="set-panel-wrap">
                    {notice && (
                        <p
                            className={`set-notice dm-toast dm-toast-${notice.tone}`}
                            role={notice.tone === 'error' ? 'alert' : 'status'}
                        >
                            <span className="set-notice-text">{notice.text}</span>
                            <button
                                type="button"
                                className="dm-btn dm-btn-ghost dm-btn-sm dm-btn-icon set-notice-dismiss"
                                aria-label="Dismiss message"
                                onClick={() => clearNotice(section)}
                            >
                                <span className="material-symbols-outlined" aria-hidden="true">close</span>
                            </button>
                        </p>
                    )}

                    {section === 'preferences' && (
                        <section
                            className="set-panel"
                            role="tabpanel"
                            id="set-panel-preferences"
                            aria-labelledby="set-tab-preferences"
                        >
                            <h3 className="set-panel-title">Preferences</h3>

                            <div className="set-card dm-card">
                                <div className="dm-field">
                                    <label className="dm-label" htmlFor="set-results-count">Search results count</label>
                                    <select
                                        id="set-results-count"
                                        className="dm-select"
                                        value={resultsCount}
                                        onChange={(e) => setResultsCount(e.target.value)}
                                    >
                                        <option value="3">3</option>
                                        <option value="5">5</option>
                                        <option value="10">10</option>
                                        <option value="20">20</option>
                                    </select>
                                    <p className="dm-help">How many source chunks the search step returns per query.</p>
                                </div>

                                <div className="dm-field">
                                    <label className="dm-label" htmlFor="set-search-mode">Default search mode</label>
                                    <select
                                        id="set-search-mode"
                                        className="dm-select"
                                        value={searchMode}
                                        onChange={(e) => setSearchMode(e.target.value)}
                                    >
                                        <option value="search">Fast Search</option>
                                        <option value="rerank">Reranked Search</option>
                                    </select>
                                    <p className="dm-help">
                                        Search mode picks the retrieval pass. Fast Search returns the closest chunks immediately.
                                        Reranked Search reorders them with a heavier model, which is slower but usually more relevant.
                                    </p>
                                </div>

                                <div className="set-card-actions">
                                    <button type="button" className="dm-btn dm-btn-primary" onClick={savePreferences}>Save Preferences</button>
                                </div>
                            </div>

                            <div className="set-card dm-card">
                                <h4 className="set-card-title">LLM Provider &amp; API Key</h4>
                                <p className="dm-help">
                                    The provider and model route chat. If your key does not have access to a selected model,
                                    the provider error is shown in chat.
                                </p>

                                <p className="set-current-key">
                                    <span className="dm-label">Current key:</span>{' '}
                                    <code className="set-key-value">
                                        {apiKeyDisplay ? (showStoredKey ? apiKeyDisplay : '••••••••••••') : 'Not set'}
                                    </code>
                                    {apiKeyDisplay && (
                                        <button
                                            type="button"
                                            className="dm-btn dm-btn-ghost dm-btn-sm"
                                            aria-label={showStoredKey ? 'Hide stored API key' : 'Show stored API key'}
                                            aria-pressed={showStoredKey}
                                            onClick={() => setShowStoredKey((v) => !v)}
                                        >
                                            {showStoredKey ? 'Hide' : 'Show'}
                                        </button>
                                    )}
                                </p>

                                <div className="dm-field">
                                    <label className="dm-label" htmlFor="set-provider">Provider</label>
                                    <select
                                        id="set-provider"
                                        className="dm-select"
                                        value={provider}
                                        onChange={(e) => setProvider(e.target.value)}
                                    >
                                        {(providerOptions.length ? providerOptions : DEFAULT_PROVIDERS).map((p) => (
                                            <option key={p} value={p}>{providerLabel(p)}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="dm-field">
                                    <label className="dm-label" htmlFor="set-model">Model</label>
                                    <select
                                        id="set-model"
                                        className="dm-select"
                                        value={model}
                                        onChange={(e) => setModel(e.target.value)}
                                    >
                                        {(providerModels[provider] || ['custom-model']).map((m) => (
                                            <option key={m} value={m}>{m}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="dm-field">
                                    <label className="dm-label" htmlFor="set-api-key">New API key</label>
                                    <div className="set-key-input">
                                        <input
                                            id="set-api-key"
                                            className="dm-input"
                                            type={showEnteredKey ? 'text' : 'password'}
                                            placeholder="Enter provider API key..."
                                            value={apiKey}
                                            autoComplete="off"
                                            onChange={(e) => setApiKey(e.target.value)}
                                        />
                                        <button
                                            type="button"
                                            className="dm-btn dm-btn-ghost dm-btn-sm"
                                            aria-label={showEnteredKey ? 'Hide API key' : 'Show API key'}
                                            aria-pressed={showEnteredKey}
                                            onClick={() => setShowEnteredKey((v) => !v)}
                                        >
                                            {showEnteredKey ? 'Hide' : 'Show'}
                                        </button>
                                    </div>
                                    <p className="dm-help">The key is stored only when you save it. Leaving it blank keeps the current key.</p>
                                </div>

                                <div className="set-card-actions">
                                    <button type="button" className="dm-btn dm-btn-primary" onClick={handleSaveApiKey}>Save Key</button>
                                    <button
                                        type="button"
                                        className="dm-btn dm-btn-secondary"
                                        onClick={handleTestConnection}
                                        disabled={testingConnection}
                                    >
                                        {testingConnection ? 'Testing...' : 'Test Connection'}
                                    </button>
                                </div>

                                {keyStatus && (
                                    <p
                                        className={`set-status-line set-status-line--${keyStatus.tone}`}
                                        role={keyStatus.tone === 'error' ? 'alert' : 'status'}
                                    >
                                        {keyStatus.text}
                                    </p>
                                )}
                            </div>
                        </section>
                    )}

                    {section === 'account' && (
                        <section
                            className="set-panel"
                            role="tabpanel"
                            id="set-panel-account"
                            aria-labelledby="set-tab-account"
                        >
                            <h3 className="set-panel-title">Account</h3>

                            {account && (
                                <div className="set-card dm-card">
                                    <dl className="set-dl">
                                        <div className="set-dl-row">
                                            <dt className="set-dl-term">Username</dt>
                                            <dd className="set-dl-value">{account.username}</dd>
                                        </div>
                                        <div className="set-dl-row">
                                            <dt className="set-dl-term">Email</dt>
                                            <dd className="set-dl-value">{account.email}</dd>
                                        </div>
                                    </dl>
                                </div>
                            )}

                            <div className="set-card dm-card set-danger-card">
                                <h4 className="set-card-title">Delete account</h4>
                                <p className="dm-help">
                                    Deleting removes everything tied to this account. This cannot be undone.
                                </p>
                                <div className="dm-field">
                                    <label className="dm-label" htmlFor="set-delete-password">Password</label>
                                    <input
                                        id="set-delete-password"
                                        className="dm-input"
                                        type="password"
                                        placeholder="Enter your password"
                                        autoComplete="current-password"
                                        value={deletePassword}
                                        onChange={(e) => setDeletePassword(e.target.value)}
                                    />
                                </div>
                                <div className="set-card-actions">
                                    <button
                                        ref={deleteTriggerRef}
                                        type="button"
                                        className="dm-btn dm-btn-danger"
                                        disabled={!deletePassword}
                                        onClick={openDeleteDialog}
                                    >
                                        Delete Account
                                    </button>
                                </div>
                            </div>
                        </section>
                    )}

                    {section === 'admin' && isStaff && (
                        <section
                            className="set-panel"
                            role="tabpanel"
                            id="set-panel-admin"
                            aria-labelledby="set-tab-admin"
                        >
                            <h3 className="set-panel-title">Admin Dashboard</h3>

                            {adminStatus === 'error' && (
                                <p className="set-error-banner dm-error-text" role="alert">{adminError}</p>
                            )}

                            {adminStatus === 'loading' && (
                                <div className="set-card-stack" aria-busy="true">
                                    <div className="dm-card">
                                        <div className="dm-skeleton set-skeleton-heading" />
                                        <div className="dm-skeleton set-skeleton-line" />
                                        <div className="dm-skeleton set-skeleton-line" />
                                    </div>
                                    <div className="dm-card">
                                        <div className="dm-skeleton set-skeleton-heading" />
                                        <div className="dm-skeleton set-skeleton-line" />
                                        <div className="dm-skeleton set-skeleton-line" />
                                    </div>
                                    <div className="dm-card">
                                        <div className="dm-skeleton set-skeleton-heading" />
                                        <div className="dm-skeleton set-skeleton-line" />
                                        <div className="dm-skeleton set-skeleton-line" />
                                    </div>
                                </div>
                            )}

                            {adminStatus === 'ready' && (
                                <div className="set-card-stack">
                                    {sysStatus && (
                                        <div className="set-card dm-card">
                                            <h4 className="set-card-title">System Status</h4>
                                            <dl className="set-dl">
                                                <div className="set-dl-row">
                                                    <dt className="set-dl-term">Status</dt>
                                                    <dd className="set-dl-value">{sysStatus.status}</dd>
                                                </div>
                                                <div className="set-dl-row">
                                                    <dt className="set-dl-term">Server</dt>
                                                    <dd className="set-dl-value">{sysStatus.server}</dd>
                                                </div>
                                                <div className="set-dl-row">
                                                    <dt className="set-dl-term">Vector DB</dt>
                                                    <dd className="set-dl-value">{sysStatus.vector_database?.connected ? 'Connected' : 'Disconnected'}</dd>
                                                </div>
                                                <div className="set-dl-row">
                                                    <dt className="set-dl-term">Total Chunks</dt>
                                                    <dd className="set-dl-value">{sysStatus.vector_database?.total_chunks}</dd>
                                                </div>
                                            </dl>
                                        </div>
                                    )}

                                    {vectors && (
                                        <div className="set-card dm-card">
                                            <h4 className="set-card-title">Vector Database</h4>
                                            <dl className="set-dl">
                                                <div className="set-dl-row">
                                                    <dt className="set-dl-term">Total Vectors</dt>
                                                    <dd className="set-dl-value">{vectors.total_vectors}</dd>
                                                </div>
                                                <div className="set-dl-row">
                                                    <dt className="set-dl-term">Total Documents</dt>
                                                    <dd className="set-dl-value">{vectors.total_documents}</dd>
                                                </div>
                                            </dl>
                                        </div>
                                    )}

                                    {usage && (
                                        <div className="set-card dm-card">
                                            <h4 className="set-card-title">API Usage ({usage.period})</h4>
                                            <dl className="set-dl">
                                                <div className="set-dl-row">
                                                    <dt className="set-dl-term">Total Calls</dt>
                                                    <dd className="set-dl-value">{usage.total_calls}</dd>
                                                </div>
                                            </dl>

                                            <h5 className="set-subheading">Per User</h5>
                                            {usage.per_user && usage.per_user.length > 0 ? (
                                                <table className="set-table">
                                                    <thead>
                                                        <tr><th scope="col">User</th><th scope="col">Calls</th></tr>
                                                    </thead>
                                                    <tbody>
                                                        {usage.per_user.map((u, i) => (
                                                            <tr key={`${u.user__username}-${i}`}>
                                                                <td>{u.user__username}</td>
                                                                <td>{u.call_count}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            ) : (
                                                <p className="dm-help">No calls recorded.</p>
                                            )}

                                            <h5 className="set-subheading">Top Endpoints</h5>
                                            {usage.top_endpoints && usage.top_endpoints.length > 0 ? (
                                                <table className="set-table">
                                                    <thead>
                                                        <tr><th scope="col">Endpoint</th><th scope="col">Calls</th></tr>
                                                    </thead>
                                                    <tbody>
                                                        {usage.top_endpoints.map((e, i) => (
                                                            <tr key={`${e.endpoint}-${i}`}>
                                                                <td>{e.endpoint}</td>
                                                                <td>{e.call_count}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            ) : (
                                                <p className="dm-help">No endpoints recorded.</p>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </section>
                    )}
                </div>
            </div>

            {confirmDeleteOpen && (
                <div
                    className="dm-modal-overlay"
                    onClick={closeDeleteDialog}
                    role="presentation"
                >
                    <div
                        ref={dialogRef}
                        className="dm-modal set-delete-dialog"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="set-delete-title"
                        aria-describedby="set-delete-consequence"
                        tabIndex={-1}
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="dm-modal-header">
                            <h3 className="set-modal-title" id="set-delete-title">Delete your account?</h3>
                            <button
                                type="button"
                                className="dm-btn dm-btn-ghost dm-btn-sm dm-btn-icon"
                                aria-label="Close"
                                disabled={deletingAccount}
                                onClick={closeDeleteDialog}
                            >
                                <span className="material-symbols-outlined" aria-hidden="true">close</span>
                            </button>
                        </div>

                        <div className="dm-modal-body">
                            <p id="set-delete-consequence" className="set-delete-consequence">
                                This permanently deletes your documents and conversations. This cannot be undone.
                            </p>
                            <div className="dm-field">
                                <label className="dm-label" htmlFor="set-delete-confirm-password">Password</label>
                                <input
                                    id="set-delete-confirm-password"
                                    className="dm-input"
                                    type="password"
                                    autoComplete="current-password"
                                    value={deletePassword}
                                    onChange={(e) => setDeletePassword(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="dm-modal-actions">
                            <button
                                ref={cancelRef}
                                type="button"
                                className="dm-btn dm-btn-secondary"
                                onClick={closeDeleteDialog}
                                disabled={deletingAccount}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="dm-btn dm-btn-danger"
                                onClick={handleDeleteAccount}
                                disabled={deletingAccount || !deletePassword}
                            >
                                {deletingAccount
                                    ? <><span className="dm-spinner" aria-hidden="true" /> Deleting</>
                                    : 'Delete Account'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default Settings;
