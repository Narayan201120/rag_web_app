import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';

const API = process.env.REACT_APP_API_URL || 'http://127.0.0.1:8000/api';

function Signup({ onSwitch }) {
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const googleButtonRef = useRef(null);

    const handleGoogleResponse = useCallback(async (response) => {
        try {
            await axios.post(`${API}/auth/social/`, {
                provider: 'google',
                token: response.credential
            }, { withCredentials: true });
            setMessage('Account created/linked via Google. You can now sign in.');
            setError('');
        } catch (err) {
            setError(err.response?.data?.error || 'Google sign-up failed.');
            setMessage('');
        }
    }, [setMessage, setError]);

    useEffect(() => {
        // Initialize Google Sign-In when script loads
        const checkGoogle = setInterval(() => {
            if (window.google?.accounts?.id) {
                clearInterval(checkGoogle);
                window.google.accounts.id.initialize({
                    client_id: process.env.REACT_APP_GOOGLE_CLIENT_ID || '',
                    callback: handleGoogleResponse
                });
                if (googleButtonRef.current) {
                    window.google.accounts.id.renderButton(
                        googleButtonRef.current,
                        { theme: 'outline', size: 'large', type: 'standard', width: 300, shape: 'pill', text: 'signup_with' }
                    );
                }
            }
        }, 100);
        return () => clearInterval(checkGoogle);
    }, [handleGoogleResponse]);

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
            
            <div className="auth-divider">
                <span>OR</span>
            </div>
            
            <div className="social-auth">
                <div ref={googleButtonRef} className="google-btn-wrapper"></div>
            </div>

            <p className="switch">
                Already have an account? <span onClick={onSwitch}>Sign In</span>
            </p>
        </div>
    );
}

export default Signup;
