import { useState, useEffect } from 'react';
import { apiClient, requestWithRefresh } from '../apiClient';

function Account({ onLogout }) {
    const [account, setAccount] = useState(null);
    const [password, setPassword] = useState('');
    const [message, setMessage] = useState('');

    useEffect(() => {
        const fetchAccount = async () => {
            try {
                const res = await requestWithRefresh(
                    (headers) => apiClient.get('/account/', { headers }),
                    { onUnauthorized: onLogout }
                );
                setAccount(res.data);
            } catch (err) {
                console.error(err);
            }
        };
        fetchAccount();
    }, [onLogout]);

    const handleDelete = async () => {
        if (!window.confirm('Are you sure? This cannot be undone!')) return;
        try {
            await requestWithRefresh(
                (headers) => apiClient.delete('/account/delete/', {
                    headers,
                    data: { password },
                }),
                { onUnauthorized: onLogout }
            );
            alert('Account deleted.');
            onLogout();
        } catch (err) {
            setMessage(err.response?.data?.error || 'Delete failed');
        }
    };

    return (
        <div className="account-container">
            <h2>Account</h2>
            {account && (
                <div className="account-info">
                    <p><strong>Username:</strong> {account.username}</p>
                    <p><strong>Email:</strong> {account.email}</p>
                </div>
            )}
            <div className="danger-zone">
                <h3>Danger Zone</h3>
                <p>Delete your account permanently:</p>
                <input
                    type="password"
                    placeholder="Enter password to confirm"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                />
                {message && <p className="error">{message}</p>}
                <button onClick={handleDelete} className="delete-btn">Delete Account</button>
            </div>
        </div>
    );
}

export default Account;
