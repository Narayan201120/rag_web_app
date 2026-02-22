import { useState, useEffect } from 'react';
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
    const token = localStorage.getItem('access');
    const headers = { Authorization: `Bearer ${token}` };

    // Preferences (stored in localStorage)
    const [resultsCount, setResultsCount] = useState(
        localStorage.getItem('pref_results') || '5'
    );
    const [searchMode, setSearchMode] = useState(
        localStorage.getItem('pref_searchMode') || 'search'
    );
    const [apiKey, setApiKey] = useState('');
    const [apiKeyDisplay, setApiKeyDisplay] = useState('');

    const savePreferences = () => {
        localStorage.setItem('pref_results', resultsCount);
        localStorage.setItem('pref_searchMode', searchMode);
        setMessage('Preferences saved.');
        setTimeout(() => setMessage(''), 2000);
    };

    // Load existing API key (masked)
    useEffect(() => {
        axios.get(`${API}/settings/api-key/`, { headers })
            .then(res => setApiKeyDisplay(res.data.api_key))
            .catch(err => console.error(err));
    }, []);

    const handleSaveApiKey = async () => {
        try {
            await axios.post(`${API}/settings/api-key/`, { api_key: apiKey }, { headers });
            setMessage('API key saved.');
            setApiKey('');
            const res = await axios.get(`${API}/settings/api-key/`, { headers });
            setApiKeyDisplay(res.data.api_key);
            setTimeout(() => setMessage(''), 2000);
        } catch (err) {
            setError('Failed to save API key');
        }
    };

    // Fetch account info
    useEffect(() => {
        if (section === 'account') {
            axios.get(`${API}/account/`, { headers })
                .then(res => setAccount(res.data))
                .catch(err => console.error(err));
        }
    }, [section]);

    // Fetch admin data
    useEffect(() => {
        if (section === 'admin') {
            Promise.all([
                axios.get(`${API}/admin/usage/`, { headers }),
                axios.get(`${API}/admin/vectors/`, { headers }),
                axios.get(`${API}/status/`, { headers }),
            ])
                .then(([usageRes, vectorsRes, statusRes]) => {
                    setUsage(usageRes.data);
                    setVectors(vectorsRes.data);
                    setSysStatus(statusRes.data);
                    setError('');
                })
                .catch(err => {
                    setError(err.response?.data?.error || 'Admin access required');
                });
        }
    }, [section]);

    const handleDeleteAccount = async () => {
        if (!window.confirm('Are you sure? This cannot be undone!')) return;
        try {
            await axios.delete(`${API}/account/delete/`, {
                headers,
                data: { password: deletePassword },
            });
            alert('Account deleted.');
            onLogout();
        } catch (err) {
            setError(err.response?.data?.error || 'Delete failed');
        }
    };

    return (
        <div className="settings-container">
            <h2>⚙️ Settings</h2>

            <div className="settings-layout">
                <div className="settings-sidebar">
                    <button
                        className={section === 'preferences' ? 'active' : ''}
                        onClick={() => setSection('preferences')}
                    >Preferences</button>
                    <button
                        className={section === 'account' ? 'active' : ''}
                        onClick={() => setSection('account')}
                    >Account</button>
                    <button
                        className={section === 'admin' ? 'active' : ''}
                        onClick={() => setSection('admin')}
                    >Admin</button>
                    <div className="sidebar-spacer"></div>
                    <button className="logout-btn" onClick={onLogout}>Logout</button>
                </div>

                <div className="settings-content">
                    {message && <p className="success">{message}</p>}

                    {/* PREFERENCES */}
                    {section === 'preferences' && (
                        <div className="settings-section">
                            <h3>Preferences</h3>
                            <div className="setting-row">
                                <label>Search results count</label>
                                <select
                                    value={resultsCount}
                                    onChange={(e) => setResultsCount(e.target.value)}
                                >
                                    <option value="3">3</option>
                                    <option value="5">5</option>
                                    <option value="10">10</option>
                                    <option value="20">20</option>
                                </select>
                            </div>
                            <div className="setting-row">
                                <label>Default search mode</label>
                                <select
                                    value={searchMode}
                                    onChange={(e) => setSearchMode(e.target.value)}
                                >
                                    <option value="search">Fast Search</option>
                                    <option value="rerank">Reranked Search</option>
                                </select>
                            </div>
                            <button className="save-btn" onClick={savePreferences}>Save Preferences</button>

                            <div style={{ marginTop: '32px', paddingTop: '24px', borderTop: '1px solid #3F3F46' }}>
                                <h4 style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#E4E4E7', marginBottom: '16px' }}>Gemini API Key</h4>
                                <p style={{ fontSize: '0.75rem', color: '#A1A1AA', marginBottom: '12px' }}>
                                    Current: {apiKeyDisplay || 'Not set (using server default)'}
                                </p>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <input
                                        type="password"
                                        placeholder="Enter new API key..."
                                        value={apiKey}
                                        onChange={(e) => setApiKey(e.target.value)}
                                        style={{
                                            flex: 1,
                                            padding: '10px 16px',
                                            backgroundColor: '#27272A',
                                            color: '#E4E4E7',
                                            border: '1px solid #3F3F46',
                                            borderRadius: '2px',
                                            fontSize: '0.875rem',
                                            outline: 'none',
                                        }}
                                    />
                                    <button className="save-btn" onClick={handleSaveApiKey}>Save Key</button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ACCOUNT */}
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
                                <h4>⚠️ Danger Zone</h4>
                                <p>Delete your account permanently:</p>
                                <input
                                    type="password"
                                    placeholder="Enter password to confirm"
                                    value={deletePassword}
                                    onChange={(e) => setDeletePassword(e.target.value)}
                                />
                                {error && <p className="error">{error}</p>}
                                <button className="delete-btn" onClick={handleDeleteAccount}>
                                    Delete Account
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ADMIN */}
                    {section === 'admin' && (
                        <div className="settings-section">
                            <h3>Admin Dashboard</h3>
                            {error && <p className="error">{error}</p>}

                            {sysStatus && (
                                <div className="admin-card">
                                    <h4>System Status</h4>
                                    <p>Status: <strong>{sysStatus.status}</strong></p>
                                    <p>Server: {sysStatus.server}</p>
                                    <p>Vector DB: {sysStatus.vector_database?.connected ? '✅ Connected' : '❌ Disconnected'}</p>
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
                                    <h4>Per User:</h4>
                                    {usage.per_user?.map((u, i) => (
                                        <p key={i}>{u.user__username}: {u.call_count} calls</p>
                                    ))}
                                    <h4>Top Endpoints:</h4>
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
