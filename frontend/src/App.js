import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import Login from './components/Login';
import Signup from './components/Signup';
import Chat from './components/Chat';
import Documents from './components/Documents';
import Search from './components/Search';
import Settings from './components/Settings';
import './App.css';

const API = process.env.REACT_APP_API_URL || 'http://127.0.0.1:8000/api';

function App() {
    const [loggedIn, setLoggedIn] = useState(!!localStorage.getItem('access'));
    const [showSignup, setShowSignup] = useState(false);
    const [page, setPage] = useState('chat');
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    // Conversation state (owned here, passed to Chat)
    const [conversations, setConversations] = useState([]);
    const [conversationId, setConversationId] = useState(null);

    const authHeaders = useCallback(() => {
        const token = localStorage.getItem('access');
        return token ? { Authorization: `Bearer ${token}` } : {};
    }, []);

    const requestWithRefresh = useCallback(async (requestFn) => {
        try {
            return await requestFn(authHeaders());
        } catch (err) {
            if (err.response?.status !== 401) throw err;
            try {
                // Refresh token is in an HttpOnly cookie — sent automatically.
                const refreshRes = await axios.post(`${API}/token/refresh/`, {}, { withCredentials: true });
                localStorage.setItem('access', refreshRes.data.access);
                return await requestFn(authHeaders());
            } catch (refreshErr) {
                localStorage.removeItem('access');
                throw refreshErr;
            }
        }
    }, [authHeaders]);

    const loadConversations = useCallback(async () => {
        try {
            const res = await requestWithRefresh((headers) => axios.get(`${API}/chat/history/`, { headers }));
            setConversations(res.data.conversations || []);
        } catch (err) {
            console.error(err);
        }
    }, [requestWithRefresh]);

    useEffect(() => {
        if (loggedIn) {
            loadConversations();
        }
    }, [loggedIn, loadConversations]);

    const handleNavClick = (newPage) => {
        setPage(newPage);
        setMobileMenuOpen(false);
    };

    const handleLogout = async () => {
        try {
            const token = localStorage.getItem('access');
            await axios.post(`${API}/logout/`, {}, {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
                withCredentials: true
            });
        } catch (e) {
            // Best-effort — clear local state regardless.
        }
        localStorage.removeItem('access');
        setLoggedIn(false);
        setConversations([]);
        setConversationId(null);
    };

    const handleLoadConversation = (convId, shouldReload = true) => {
        setConversationId(convId);
        if (page !== 'chat') setPage('chat');
        setMobileMenuOpen(false);
    };

    const handleNewConversation = () => {
        setConversationId(null);
        if (page !== 'chat') setPage('chat');
        setMobileMenuOpen(false);
    };

    if (!loggedIn) {
        if (showSignup) {
            return <Signup onSwitch={() => setShowSignup(false)} />;
        }
        return <Login onLogin={() => setLoggedIn(true)} onSwitch={() => setShowSignup(true)} />;
    }

    return (
        <div style={{ display: 'flex', width: '100%', height: '100%' }}>
            {/* Mobile overlay (optional for later) */}
            <div className={`sidebar-overlay ${mobileMenuOpen ? 'open' : ''}`} onClick={() => setMobileMenuOpen(false)}></div>
            
            {/* SideNavBar */}
            <nav className={`sidebar font-headline ${mobileMenuOpen ? 'mobile-open' : ''}`}>
                <div className="sidebar-header">
                    <h1 className="sidebar-title">DocuMind</h1>
                    <div className="status-indicator-container">
                        <span aria-label="System Status Indicator" className="status-dot online"></span>
                        <span className="status-text">SYSTEM ONLINE</span>
                    </div>
                </div>

                <div className="nav-tabs">
                    <button className={`nav-tab ${page === 'chat' ? 'nav-tab-active' : 'nav-tab-inactive'}`} onClick={() => handleNavClick('chat')}>
                        <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1", fontSize: "1.25rem" }}>chat</span>
                        <span className="font-label nav-tab-label">Chat</span>
                    </button>
                    <button className={`nav-tab ${page === 'documents' ? 'nav-tab-active' : 'nav-tab-inactive'}`} onClick={() => handleNavClick('documents')}>
                        <span className="material-symbols-outlined" style={{ fontSize: "1.25rem" }}>description</span>
                        <span className="font-label nav-tab-label">Documents</span>
                    </button>
                    <button className={`nav-tab ${page === 'search' ? 'nav-tab-active' : 'nav-tab-inactive'}`} onClick={() => handleNavClick('search')}>
                        <span className="material-symbols-outlined" style={{ fontSize: "1.25rem" }}>search</span>
                        <span className="font-label nav-tab-label">Search</span>
                    </button>
                    <button className={`nav-tab ${page === 'settings' ? 'nav-tab-active' : 'nav-tab-inactive'}`} onClick={() => handleNavClick('settings')}>
                        <span className="material-symbols-outlined" style={{ fontSize: "1.25rem" }}>settings</span>
                        <span className="font-label nav-tab-label">Settings</span>
                    </button>

                    <div className="conversations-section">
                        <h3 className="sidebar-section-title">Recent Chats</h3>
                        <div className="conversations-list">
                            {conversations && conversations.length > 0 ? (
                                conversations.map(conv => (
                                    <button 
                                        key={conv.id} 
                                        className={`conv-item ${conversationId === conv.id ? 'active' : ''}`}
                                        onClick={() => handleLoadConversation(conv.id)}
                                    >
                                        <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>chat_bubble</span>
                                        <span className="conv-title">{conv.title || `Chat ${String(conv.id).substring(0, 8)}`}</span>
                                    </button>
                                ))
                            ) : (
                                <div style={{ paddingLeft: '1rem', marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--outline)', fontFamily: "'Manrope', sans-serif" }}>
                                    No recent chats
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="sidebar-footer">
                    <button className="nav-tab nav-tab-inactive" onClick={handleLogout}>
                        <span className="material-symbols-outlined" style={{ fontSize: "1.25rem" }}>logout</span>
                        <span className="font-label nav-tab-label">Sign Out</span>
                    </button>
                </div>
            </nav>

            {/* Main Content Canvas */}
            <main className="main-content">
                <button 
                    className="mobile-menu-toggle" 
                    onClick={() => setMobileMenuOpen(true)}
                    aria-label="Open Menu"
                >
                    <span className="material-symbols-outlined">menu_open</span>
                </button>
                {page === 'chat' && (
                    <Chat
                        conversations={conversations}
                        conversationId={conversationId}
                        onLoadConversation={handleLoadConversation}
                        onNewConversation={handleNewConversation}
                        onRefreshConversations={loadConversations}
                    />
                )}
                {page === 'documents' && <Documents />}
                {page === 'search' && <Search />}
                {page === 'settings' && <Settings onLogout={handleLogout} />}
            </main>
        </div>
    );
}

export default App;
