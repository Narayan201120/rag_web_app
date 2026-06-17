import { useState, useEffect, useCallback, useRef } from 'react';
import Login from './components/Login';
import Signup from './components/Signup';
import Chat from './components/Chat';
import Documents from './components/Documents';
import Search from './components/Search';
import Settings from './components/Settings';
import { apiClient, clearAccessToken, getAuthHeaders, hasAccessToken, requestWithRefresh } from './apiClient';
import './App.css';

function App() {
    const [loggedIn, setLoggedIn] = useState(hasAccessToken());
    const [showSignup, setShowSignup] = useState(false);
    const [page, setPage] = useState('chat');
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    const [conversations, setConversations] = useState([]);
    const [conversationId, setConversationId] = useState(null);
    const [menuOpenConvId, setMenuOpenConvId] = useState(null);
    const [renamingConvId, setRenamingConvId] = useState(null);
    const [renamingTitle, setRenamingTitle] = useState('');
    const [deleteConfirmId, setDeleteConfirmId] = useState(null);
    const menuRef = useRef(null);
    const renameInputRef = useRef(null);

    const loadConversations = useCallback(async () => {
        try {
            const res = await requestWithRefresh((headers) => apiClient.get('/chat/history/', { headers }));
            setConversations(res.data.conversations || []);
        } catch (err) {
            console.error(err);
        }
    }, []);

    useEffect(() => {
        if (loggedIn) {
            loadConversations();
        }
    }, [loggedIn, loadConversations]);

    useEffect(() => {
        if (renamingConvId) {
            renameInputRef.current?.focus();
            renameInputRef.current?.select();
        }
    }, [renamingConvId]);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) {
                setMenuOpenConvId(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleNavClick = (newPage) => {
        setPage(newPage);
        setMobileMenuOpen(false);
    };

    const handleLogout = async () => {
        try {
            await apiClient.post('/logout/', {}, {
                headers: getAuthHeaders(),
                withCredentials: true
            });
        } catch (e) {}
        clearAccessToken();
        setLoggedIn(false);
        setConversations([]);
        setConversationId(null);
    };

    const handleLoadConversation = (convId) => {
        setConversationId(convId);
        if (page !== 'chat') setPage('chat');
        setMobileMenuOpen(false);
    };

    const handleNewConversation = () => {
        setConversationId(null);
        if (page !== 'chat') setPage('chat');
        setMobileMenuOpen(false);
    };

    const handleTogglePin = async (convId, currentlyPinned) => {
        try {
            await requestWithRefresh((headers) => apiClient.patch(`/chat/conversations/${convId}/`, { pinned: !currentlyPinned }, { headers }));
            loadConversations();
        } catch (err) {
            console.error('Pin failed:', err);
        }
        setMenuOpenConvId(null);
    };

    const handleRename = async (convId, newTitle) => {
        if (!newTitle.trim()) {
            setRenamingConvId(null);
            return;
        }
        try {
            await requestWithRefresh((headers) => apiClient.patch(`/chat/conversations/${convId}/`, { title: newTitle.trim() }, { headers }));
            loadConversations();
        } catch (err) {
            console.error('Rename failed:', err);
        }
        setRenamingConvId(null);
        setMenuOpenConvId(null);
    };

    const handleDelete = async (convId) => {
        try {
            await requestWithRefresh((headers) => apiClient.delete(`/chat/conversations/${convId}/`, { headers }));
            if (conversationId === convId) {
                setConversationId(null);
            }
            loadConversations();
        } catch (err) {
            console.error('Delete failed:', err);
        }
        setDeleteConfirmId(null);
        setMenuOpenConvId(null);
    };

    if (!loggedIn) {
        if (showSignup) {
            return <Signup onSwitch={() => setShowSignup(false)} />;
        }
        return <Login onLogin={() => setLoggedIn(true)} onSwitch={() => setShowSignup(true)} />;
    }

    return (
        <div style={{ display: 'flex', width: '100%', height: '100%' }}>
            <div className={`sidebar-overlay ${mobileMenuOpen ? 'open' : ''}`} onClick={() => setMobileMenuOpen(false)}></div>
            
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
                        <div className="conversations-list" ref={menuRef}>
                            {conversations && conversations.length > 0 ? (
                                conversations.map(conv => (
                                    <div
                                        key={conv.id}
                                        className={`conv-item-wrapper ${conversationId === conv.id ? 'active' : ''}`}
                                    >
                                        <button
                                            className="conv-item"
                                            onClick={() => handleLoadConversation(conv.id)}
                                        >
                                            <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>
                                                {conv.pinned ? 'push_pin' : 'chat_bubble'}
                                            </span>
                                            {renamingConvId === conv.id ? (
                                                <input
                                                    ref={renameInputRef}
                                                    className="conv-rename-input"
                                                    value={renamingTitle}
                                                    onChange={(e) => setRenamingTitle(e.target.value)}
                                                    onBlur={() => handleRename(conv.id, renamingTitle)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') handleRename(conv.id, renamingTitle);
                                                        if (e.key === 'Escape') setRenamingConvId(null);
                                                    }}
                                                    onClick={(e) => e.stopPropagation()}
                                                />
                                            ) : (
                                                <span className="conv-title">{conv.title || `Chat ${String(conv.id).substring(0, 8)}`}</span>
                                            )}
                                        </button>
                                        <div className="conv-actions">
                                            <button
                                                className="conv-action-btn"
                                                onClick={(e) => { e.stopPropagation(); handleTogglePin(conv.id, conv.pinned); }}
                                                title={conv.pinned ? 'Unpin' : 'Pin'}
                                            >
                                                <span className="material-symbols-outlined conv-action-icon">
                                                    {conv.pinned ? 'push_pin' : 'push_pin'}
                                                </span>
                                            </button>
                                            <button
                                                className="conv-action-btn"
                                                onClick={(e) => { e.stopPropagation(); setMenuOpenConvId(menuOpenConvId === conv.id ? null : conv.id); }}
                                                title="More"
                                            >
                                                <span className="material-symbols-outlined conv-action-icon">more_horiz</span>
                                            </button>
                                        </div>
                                        {menuOpenConvId === conv.id && (
                                            <div className="conv-dropdown" onClick={(e) => e.stopPropagation()}>
                                                <button
                                                    className="conv-dropdown-item"
                                                    onClick={() => { setRenamingConvId(conv.id); setRenamingTitle(conv.title); setMenuOpenConvId(null); }}
                                                >
                                                    <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>edit</span>
                                                    Rename
                                                </button>
                                                {deleteConfirmId === conv.id ? (
                                                    <div className="conv-delete-confirm">
                                                        <span>Delete?</span>
                                                        <button className="conv-delete-yes" onClick={() => handleDelete(conv.id)}>Yes</button>
                                                        <button className="conv-delete-no" onClick={() => setDeleteConfirmId(null)}>No</button>
                                                    </div>
                                                ) : (
                                                    <button
                                                        className="conv-dropdown-item conv-dropdown-danger"
                                                        onClick={() => setDeleteConfirmId(conv.id)}
                                                    >
                                                        <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>delete</span>
                                                        Delete
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>
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
