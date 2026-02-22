import { useState } from 'react';
import axios from 'axios';

const API = 'http://127.0.0.1:8000/api';

function Login({ onLogin, onSwitch }) {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const res = await axios.post(`${API}/sign-in/`, {
                username,
                password,
            });
            localStorage.setItem('access', res.data.tokens.access);
            localStorage.setItem('refresh', res.data.tokens.refresh);
            onLogin();
        } catch (err) {
            setError('Invalid Username or Password');
        }
    };
    
    return (
        <div className="auth-container">
            <h1>🔐 RAG Web App</h1>
            <form onSubmit={handleSubmit}>
                <input
                    type="text"
                    placeholder="Username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    />
                <input
                    type="password"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    />
                {error && <p className="error">{error}</p>}
                <button type="submit">Sign In</button>
            </form>
            <p className="switch">
                Don't have an account?{' '}
                <span onClick={onSwitch}>Sign Up</span>
            </p>
        </div>
    );
}

export default Login;
