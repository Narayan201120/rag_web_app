import { useState, useEffect } from 'react';
import axios from 'axios';

const API = 'http://127.0.0.1:8000/api';

function Account({ onLogout }) {
    const [account, setAccount] = useState(null);
    const [password, setPassword] = useState('');
    const [message, setMessage] = useState('');
    const token = localStorage.getItem('access');
    const headers = { Authorization: `Bearer ${token}` };

    useEffect(() => {
        const fetchAccount = async () => {
            try {
                const res = await axios.get(`${API}/account/`, { headers });
                setAccount(res.data);
            } catch (err) {
                console.error(err);
            }
        };
        fetchAccount();
    }, []);

    const handleDelete = async () => {
        if (!window.confirm('Are you sure? This cannot be undone!')) return;
        try {
            await axios.delete(`${API}/account/delete/`, {
                headers,
                data: { password },
            });
            alert('Account deleted.');
            onLogout();
        } catch (err) {
            setMessage(err.response?.data?.error || 'Delete failed');
        }
    };

    return (
        <div className="account-container">
            <h2>👤 Account</h2>
            {account && (
                <div className="account-info">
                    <p><strong>Username:</strong> {account.username}</p>
                    <p><strong>Email:</strong> {account.email}</p>
                </div>
            )}
            <div className="danger-zone">
                <h3>⚠️ Danger Zone</h3>
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