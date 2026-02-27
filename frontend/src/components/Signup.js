import { useState } from 'react';
import axios from 'axios';

const API = 'http://127.0.0.1:8000/api';

function Signup({ onSwitch }) {
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            await axios.post(`${API}/sign-up/`, { username, email, password });
            setMessage('Account created. You can now sign in.');
            setError('');
        } catch (err) {
            setError(err.response?.data?.error || 'Signup failed');
            setMessage('');
        }
    };

    return (
        <div className="auth-container">
            <h1>RAG / DOCUMENT AI</h1>
            <form onSubmit={handleSubmit}>
                <input
                    type="text"
                    placeholder="Username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                />
                <input
                    type="email"
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                />
                <input
                    type="password"
                    placeholder="Password (min 8 characters)"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                />
                {error && <p className="error">{error}</p>}
                {message && <p className="success">{message}</p>}
                <button type="submit">Sign Up</button>
            </form>
            <p className="switch">
                Already have an account? <span onClick={onSwitch}>Sign In</span>
            </p>
        </div>
    );
}

export default Signup;
