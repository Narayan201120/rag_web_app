import { useState, useEffect, useRef, useCallback } from 'react';
import { apiClient, setAccessToken } from '../apiClient';

function Login({ onLogin, onSwitch }) {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const googleButtonRef = useRef(null);

    const handleGoogleResponse = useCallback(async (response) => {
        try {
            const res = await apiClient.post('/auth/social/', {
                provider: 'google',
                token: response.credential
            }, { withCredentials: true });
            setAccessToken(res.data.tokens.access);
            onLogin();
        } catch (err) {
            setError(err.response?.data?.error || 'Google sign-in failed.');
        }
    }, [onLogin]);

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
                        { theme: 'outline', size: 'large', type: 'standard', width: 300, shape: 'pill' }
                    );
                }
            }
        }, 100);
        return () => clearInterval(checkGoogle);
    }, [handleGoogleResponse]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const res = await apiClient.post('/sign-in/', { username, password }, { withCredentials: true });
            setAccessToken(res.data.tokens.access);
            onLogin();
        } catch (err) {
            setError('Invalid username or password.');
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
                    type="password"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                />
                {error && <p className="error">{error}</p>}
                <button type="submit">Sign In</button>
            </form>
            
            <div className="auth-divider">
                <span>OR</span>
            </div>
            
            <div className="social-auth">
                <div ref={googleButtonRef} className="google-btn-wrapper"></div>
            </div>

            <p className="switch">
                Don&apos;t have an account? <span onClick={onSwitch}>Sign Up</span>
            </p>
        </div>
    );
}

export default Login;
