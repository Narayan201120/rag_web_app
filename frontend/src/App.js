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
            const refresh = localStorage.getItem('refresh');
            if (!refresh) throw err;
            try {
                const refreshRes = await axios.post(`${API}/token/refresh/`, { refresh });
                localStorage.setItem('access', refreshRes.data.access);
                return await requestFn(authHeaders());
            } catch (refreshErr) {
                localStorage.removeItem('access');
                localStorage.removeItem('refresh');
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

    const handleLogout = () => {
        localStorage.removeItem('access');
        localStorage.removeItem('refresh');
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
        <div className="App dark-theme">
            {/* Mobile Header */}
            <div className="mobile-header">
                <button
                    className="hamburger-btn"
                    onClick={() => setMobileMenuOpen(true)}
                    aria-label="Open Menu"
                >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="3" y1="12" x2="21" y2="12"></line>
                        <line x1="3" y1="6" x2="21" y2="6"></line>
                        <line x1="3" y1="18" x2="21" y2="18"></line>
                    </svg>
                </button>
                <div className="mobile-brand">RAG</div>
            </div>

            {/* Sidebar */}
            <div className={`sidebar-overlay ${mobileMenuOpen ? 'open' : ''}`} onClick={() => setMobileMenuOpen(false)}></div>
            <nav className={`app-sidebar ${mobileMenuOpen ? 'mobile-open' : ''}`}>
                <div className="sidebar-brand">
                    <span className="brand-name">RAG</span>
                    <span className="brand-tag">Document Intelligence</span>
                    <button className="mobile-close-btn" onClick={() => setMobileMenuOpen(false)}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>

                <div className="sidebar-nav">
                    <button className={page === 'chat' ? 'active' : ''} onClick={() => handleNavClick('chat')}>
                        <span className="nav-icon">CH</span>
                        <span>Chat</span>
                    </button>
                    <button className={page === 'documents' ? 'active' : ''} onClick={() => handleNavClick('documents')}>
                        <span className="nav-icon">DOC</span>
                        <span>Documents</span>
                    </button>
                    <button className={page === 'search' ? 'active' : ''} onClick={() => handleNavClick('search')}>
                        <span className="nav-icon">SRC</span>
                        <span>Search</span>
                    </button>
                    <button className={page === 'settings' ? 'active' : ''} onClick={() => handleNavClick('settings')}>
                        <span className="nav-icon">CFG</span>
                        <span>Settings</span>
                    </button>
                </div>

                {/* Chat History — visible when on chat page */}
                {page === 'chat' && (
                    <div className="sidebar-history">
                        <div className="sidebar-history-header">
                            <span className="sidebar-history-label">History</span>
                            <button className="new-chat-sidebar-btn" onClick={handleNewConversation}>
                                + New
                            </button>
                        </div>
                        <div className="sidebar-conversation-list">
                            {conversations.map((conv) => (
                                <div
                                    key={conv.id}
                                    className={`sidebar-conv-item ${conv.id === conversationId ? 'active' : ''}`}
                                    onClick={() => handleLoadConversation(conv.id)}
                                >
                                    <span className="sidebar-conv-title">{conv.title}</span>
                                    <span className="sidebar-conv-meta">{conv.message_count} msgs</span>
                                </div>
                            ))}
                            {conversations.length === 0 && (
                                <p className="sidebar-conv-empty">No conversations yet</p>
                            )}
                        </div>
                    </div>
                )}

                <div className="sidebar-footer">
                    <div className="sidebar-status">
                        <span className="status-dot online"></span>
                        <span>SYSTEM ONLINE</span>
                    </div>
                    <button className="sidebar-logout" onClick={handleLogout}>
                        Sign Out
                    </button>
                </div>
            </nav>

            <main className="app-main">
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
