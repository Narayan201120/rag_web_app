import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const API = 'http://127.0.0.1:8000/api';

function Settings({ onLogout }) {
    const [section, setSection] = useState('preferences');
    const [account, setAccount] = useState(null);
    const [usage, setUsage] = useState(null);
    const [vectors, setVectors] = useState(null);
    const [sysStatus, setSysStatus] = useState(null);
    const [deletePassword, setDeletePassword] = useState('');
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    const [resultsCount, setResultsCount] = useState(localStorage.getItem('pref_results') || '5');
    const [searchMode, setSearchMode] = useState(localStorage.getItem('pref_searchMode') || 'search');
    const [apiKey, setApiKey] = useState('');
    const [apiKeyDisplay, setApiKeyDisplay] = useState('');
    const [provider, setProvider] = useState('google-gemini');
    const [model, setModel] = useState('gemini-2.5-flash');
    const [providerOptions, setProviderOptions] = useState([]);
    const [providerModels, setProviderModels] = useState({});
    const [connectionStatus, setConnectionStatus] = useState('');
    const [testingConnection, setTestingConnection] = useState(false);

    const authHeaders = useCallback(() => {
        const token = localStorage.getItem('access');
        return token ? { Authorization: `Bearer ${token}` } : {};
    }, []);

    const requestWithRefresh = useCallback(async (requestFn) => {
        try {
            return await requestFn(authHeaders());
        } catch (err) {
            if (err.response?.status !== 401) throw err;
            const refresh = localStorage.getItem('refresh');
            if (!refresh) {
                onLogout();
                throw err;
            }
            try {
                const refreshRes = await axios.post(`${API}/token/refresh/`, { refresh });
                localStorage.setItem('access', refreshRes.data.access);
                return await requestFn(authHeaders());
            } catch (refreshErr) {
                localStorage.removeItem('access');
                localStorage.removeItem('refresh');
                onLogout();
                throw refreshErr;
            }
        }
    }, [authHeaders, onLogout]);

    const fetchApiKeySettings = useCallback(async () => {
        try {
            const res = await requestWithRefresh((headers) => axios.get(`${API}/settings/api-key/`, { headers }));
            setApiKeyDisplay(res.data.api_key || '');
            setProvider(res.data.provider || 'google-gemini');
            setModel(res.data.model || 'gemini-2.5-flash');
            setProviderOptions(res.data.supported_providers || []);
            setProviderModels(res.data.provider_models || {});
            setError('');
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to load provider settings');
        }
    }, [requestWithRefresh]);

    const savePreferences = () => {
        localStorage.setItem('pref_results', resultsCount);
        localStorage.setItem('pref_searchMode', searchMode);
        setMessage('Preferences saved.');
        setTimeout(() => setMessage(''), 2000);
    };

    useEffect(() => {
        fetchApiKeySettings();
    }, [fetchApiKeySettings]);

    useEffect(() => {
        const models = providerModels[provider] || [];
        if (models.length > 0 && !models.includes(model)) {
            setModel(models[0]);
        }
    }, [provider, providerModels, model]);

    const handleSaveApiKey = async () => {
        try {
            await requestWithRefresh((headers) => axios.post(`${API}/settings/api-key/`, { provider, model, api_key: apiKey }, { headers }));
            setMessage('Provider, model, and API key saved.');
            setError('');
            setConnectionStatus('');
            setApiKey('');
            await fetchApiKeySettings();
            setTimeout(() => setMessage(''), 2000);
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to save provider/API key');
        }
    };

    const handleTestConnection = async () => {
        setTestingConnection(true);
        setConnectionStatus('');
        setError('');
        try {
            const res = await requestWithRefresh((headers) => axios.post(
                `${API}/settings/api-key/test/`,
                { provider, model, api_key: apiKey },
                { headers }
            ));
            const excerpt = res.data.reply_excerpt ? ` Response: ${res.data.reply_excerpt}` : '';
            setConnectionStatus(`Connection successful.${excerpt}`);
        } catch (err) {
            setError(err.response?.data?.error || 'Connection test failed');
        } finally {
            setTestingConnection(false);
        }
    };

    useEffect(() => {
        if (section === 'account') {
            requestWithRefresh((headers) => axios.get(`${API}/account/`, { headers }))
                .then((res) => setAccount(res.data))
                .catch((err) => console.error(err));
        }
    }, [section, requestWithRefresh]);

    useEffect(() => {
        if (section === 'admin') {
            Promise.all([
                requestWithRefresh((headers) => axios.get(`${API}/admin/usage/`, { headers })),
                requestWithRefresh((headers) => axios.get(`${API}/admin/vectors/`, { headers })),
                requestWithRefresh((headers) => axios.get(`${API}/status/`, { headers })),
            ])
                .then(([usageRes, vectorsRes, statusRes]) => {
                    setUsage(usageRes.data);
                    setVectors(vectorsRes.data);
                    setSysStatus(statusRes.data);
                    setError('');
                })
                .catch((err) => {
                    setError(err.response?.data?.error || 'Admin access required');
                });
        }
    }, [section, requestWithRefresh]);

    const handleDeleteAccount = async () => {
        if (!window.confirm('Are you sure? This cannot be undone!')) return;
        try {
            await requestWithRefresh((headers) => axios.delete(`${API}/account/delete/`, {
                headers,
                data: { password: deletePassword },
            }));
            alert('Account deleted.');
            onLogout();
        } catch (err) {
            setError(err.response?.data?.error || 'Delete failed');
        }
    };

    return (
        <div className="settings-container">
            <h2>Settings</h2>
            <div className="settings-layout">
                <div className="settings-sidebar">
                    <button className={section === 'preferences' ? 'active' : ''} onClick={() => setSection('preferences')}>Preferences</button>
                    <button className={section === 'account' ? 'active' : ''} onClick={() => setSection('account')}>Account</button>
                    <button className={section === 'admin' ? 'active' : ''} onClick={() => setSection('admin')}>Admin</button>
                    <div className="sidebar-spacer"></div>
                    <button className="logout-btn" onClick={onLogout}>Logout</button>
                </div>

                <div className="settings-content">
                    {message && <p className="success">{message}</p>}

                    {section === 'preferences' && (
                        <div className="settings-section">
                            <h3>Preferences</h3>
                            <div className="setting-row">
                                <label>Search results count</label>
                                <select value={resultsCount} onChange={(e) => setResultsCount(e.target.value)}>
                                    <option value="3">3</option>
                                    <option value="5">5</option>
                                    <option value="10">10</option>
                                    <option value="20">20</option>
                                </select>
                            </div>
                            <div className="setting-row">
                                <label>Default search mode</label>
                                <select value={searchMode} onChange={(e) => setSearchMode(e.target.value)}>
                                    <option value="search">Fast Search</option>
                                    <option value="rerank">Reranked Search</option>
                                </select>
                            </div>
                            <button className="save-btn" onClick={savePreferences}>Save Preferences</button>

                            <div style={{ marginTop: '32px', paddingTop: '24px', borderTop: '1px solid #2f3036' }}>
                                <h4 style={{ marginBottom: '14px' }}>LLM Provider & API Key</h4>
                                <p style={{ marginBottom: '12px', fontSize: '0.8rem' }}>
                                    Current Key: {apiKeyDisplay || 'Not set'}
                                </p>
                                <div className="setting-row" style={{ marginBottom: '12px' }}>
                                    <label>Provider</label>
                                    <select value={provider} onChange={(e) => setProvider(e.target.value)}>
                                        {(providerOptions.length ? providerOptions : [
                                            'google-gemini',
                                            'openai',
                                            'anthropic',
                                            'mistral',
                                            'xai',
                                            'qwen',
                                            'minimax',
                                            'meta-llama',
                                            'other',
                                        ]).map((p) => (
                                            <option key={p} value={p}>{p}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="setting-row" style={{ marginBottom: '12px' }}>
                                    <label>Model</label>
                                    <select value={model} onChange={(e) => setModel(e.target.value)}>
                                        {(providerModels[provider] || ['custom-model']).map((m) => (
                                            <option key={m} value={m}>{m}</option>
                                        ))}
                                    </select>
                                </div>
                                <p style={{ marginBottom: '12px', fontSize: '0.8rem' }}>
                                    If your key does not have access to a selected model, the provider error will be shown in chat.
                                </p>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <input
                                        type="password"
                                        placeholder="Enter provider API key..."
                                        value={apiKey}
                                        onChange={(e) => setApiKey(e.target.value)}
                                        style={{
                                            flex: 1,
                                            padding: '10px 14px',
                                            borderRadius: '12px',
                                            border: '1px solid #2f3036',
                                            backgroundColor: '#11141f',
                                            color: '#f1efe8',
                                            outline: 'none',
                                        }}
                                    />
                                    <button className="save-btn" onClick={handleSaveApiKey}>Save Key</button>
                                    <button
                                        className="save-btn"
                                        onClick={handleTestConnection}
                                        disabled={testingConnection}
                                    >
                                        {testingConnection ? 'Testing...' : 'Test Connection'}
                                    </button>
                                </div>
                                {connectionStatus && <p className="success">{connectionStatus}</p>}
                                {error && <p className="error">{error}</p>}
                            </div>
                        </div>
                    )}

                    {section === 'account' && (
                        <div className="settings-section">
                            <h3>Account</h3>
                            {account && (
                                <div className="account-info">
                                    <p><strong>Username:</strong> {account.username}</p>
                                    <p><strong>Email:</strong> {account.email}</p>
                                </div>
                            )}
                            <div className="danger-zone">
                                <h4>Danger Zone</h4>
                                <p>Delete your account permanently:</p>
                                <input
                                    type="password"
                                    placeholder="Enter password to confirm"
                                    value={deletePassword}
                                    onChange={(e) => setDeletePassword(e.target.value)}
                                />
                                {error && <p className="error">{error}</p>}
                                <button className="delete-btn" onClick={handleDeleteAccount}>Delete Account</button>
                            </div>
                        </div>
                    )}

                    {section === 'admin' && (
                        <div className="settings-section">
                            <h3>Admin Dashboard</h3>
                            {error && <p className="error">{error}</p>}

                            {sysStatus && (
                                <div className="admin-card">
                                    <h4>System Status</h4>
                                    <p>Status: <strong>{sysStatus.status}</strong></p>
                                    <p>Server: {sysStatus.server}</p>
                                    <p>Vector DB: {sysStatus.vector_database?.connected ? 'Connected' : 'Disconnected'}</p>
                                    <p>Total Chunks: {sysStatus.vector_database?.total_chunks}</p>
                                </div>
                            )}

                            {vectors && (
                                <div className="admin-card">
                                    <h4>Vector Database</h4>
                                    <p>Total Vectors: {vectors.total_vectors}</p>
                                    <p>Total Documents: {vectors.total_documents}</p>
                                </div>
                            )}

                            {usage && (
                                <div className="admin-card">
                                    <h4>API Usage ({usage.period})</h4>
                                    <p>Total Calls: {usage.total_calls}</p>
                                    <h4>Per User</h4>
                                    {usage.per_user?.map((u, i) => (
                                        <p key={i}>{u.user__username}: {u.call_count} calls</p>
                                    ))}
                                    <h4>Top Endpoints</h4>
                                    {usage.top_endpoints?.map((e, i) => (
                                        <p key={i}>{e.endpoint}: {e.call_count} calls</p>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default Settings;
