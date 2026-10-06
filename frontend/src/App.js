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
    const [collections, setCollections] = useState([]);
    const [projectsOpen, setProjectsOpen] = useState(true);
    const [creatingCollection, setCreatingCollection] = useState(false);
    const [newCollectionName, setNewCollectionName] = useState('');
    const [expandedColId, setExpandedColId] = useState(null);
    const [collectionDocs, setCollectionDocs] = useState({});
    const [sidebarDocMenu, setSidebarDocMenu] = useState(null);
    const collectionInputRef = useRef(null);
    const menuRef = useRef(null);
    const renameInputRef = useRef(null);
    const sidebarMenuRef = useRef(null);

    const loadConversations = useCallback(async () => {
        try {
            const res = await requestWithRefresh((headers) => apiClient.get('/chat/history/', { headers }));
            setConversations(res.data.conversations || []);
        } catch (err) {
            console.error(err);
        }
    }, []);

    const fetchCollections = useCallback(async () => {
        try {
            const res = await requestWithRefresh((headers) => apiClient.get('/collections/', { headers }));
            setCollections(res.data.collections || []);
        } catch {
            setCollections([]);
        }
    }, []);

    useEffect(() => {
        if (loggedIn) {
            loadConversations();
            fetchCollections();
        }
    }, [loggedIn, loadConversations, fetchCollections]);

    useEffect(() => {
        if (renamingConvId) {
            renameInputRef.current?.focus();
            renameInputRef.current?.select();
        }
    }, [renamingConvId]);

    useEffect(() => {
        if (creatingCollection) {
            collectionInputRef.current?.focus();
        }
    }, [creatingCollection]);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) {
                setMenuOpenConvId(null);
            }
            if (sidebarMenuRef.current && !sidebarMenuRef.current.contains(e.target)) {
                setSidebarDocMenu(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleNavClick = (newPage) => {
        setPage(newPage);
        setMobileMenuOpen(false);
        if (newPage === 'documents') fetchCollections();
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

    const handleCreateCollection = async () => {
        const name = newCollectionName.trim();
        if (!name) return;
        try {
            await requestWithRefresh((headers) => apiClient.post('/collections/', { name }, { headers }));
            setNewCollectionName('');
            setCreatingCollection(false);
            fetchCollections();
        } catch (err) {
            console.error('Create collection failed:', err);
        }
    };

    const handleToggleCollection = async (colId) => {
        if (expandedColId === colId) {
            setExpandedColId(null);
            return;
        }
        setExpandedColId(colId);
        try {
            const res = await requestWithRefresh((headers) => apiClient.get(`/collections/${colId}/`, { headers }));
            setCollectionDocs(prev => ({ ...prev, [colId]: res.data.documents }));
        } catch (err) {
            console.error('Failed to fetch collection docs:', err);
        }
    };

    const handleSidebarDocMove = async (docName, fromColId, toColId) => {
        try {
            await requestWithRefresh((headers) => apiClient.put(`/documents/${encodeURIComponent(docName)}/move/`, { collection_id: toColId }, { headers }));
            fetchCollections();
            const res = await requestWithRefresh((headers) => apiClient.get(`/collections/${fromColId}/`, { headers }));
            setCollectionDocs(prev => ({ ...prev, [fromColId]: res.data.documents }));
            if (toColId) {
                const res2 = await requestWithRefresh((headers) => apiClient.get(`/collections/${toColId}/`, { headers }));
                setCollectionDocs(prev => ({ ...prev, [toColId]: res2.data.documents }));
            }
        } catch (err) {
            console.error('Move failed:', err);
        }
        setSidebarDocMenu(null);
    };

    const handleSidebarDocRemove = async (docName, colId) => {
        try {
            await requestWithRefresh((headers) => apiClient.put(`/documents/${encodeURIComponent(docName)}/move/`, { collection_id: null }, { headers }));
            fetchCollections();
            const res = await requestWithRefresh((headers) => apiClient.get(`/collections/${colId}/`, { headers }));
            setCollectionDocs(prev => ({ ...prev, [colId]: res.data.documents }));
        } catch (err) {
            console.error('Remove failed:', err);
        }
        setSidebarDocMenu(null);
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

                    <div className="projects-section">
                        <div className="projects-header">
                            <button className="projects-toggle" onClick={() => setProjectsOpen(!projectsOpen)}>
                                <span className="material-symbols-outlined projects-arrow" style={{ fontSize: '1rem' }}>
                                    {projectsOpen ? 'expand_more' : 'chevron_right'}
                                </span>
                                <span className="sidebar-section-title projects-title">Projects</span>
                            </button>
                            <button
                                className="projects-add-btn"
                                onClick={() => setCreatingCollection(true)}
                                title="New collection"
                            >
                                <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>add</span>
                            </button>
                        </div>
                        {projectsOpen && (
                            <div className="projects-list">
                                {creatingCollection && (
                                    <div className="conv-item-wrapper">
                                        <div className="conv-item" style={{ padding: '0.25rem 0.5rem 0.25rem 2.5rem' }}>
                                            <input
                                                ref={collectionInputRef}
                                                className="conv-rename-input"
                                                placeholder="Collection name"
                                                value={newCollectionName}
                                                onChange={(e) => setNewCollectionName(e.target.value)}
                                                onBlur={() => { if (!newCollectionName.trim()) setCreatingCollection(false); }}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') handleCreateCollection();
                                                    if (e.key === 'Escape') { setCreatingCollection(false); setNewCollectionName(''); }
                                                }}
                                                onClick={(e) => e.stopPropagation()}
                                            />
                                        </div>
                                    </div>
                                )}
                                {collections.map((col) => (
                                    <div key={col.id} className="projects-col-wrapper">
                                        <button
                                            className="conv-item projects-item"
                                            onClick={() => handleToggleCollection(col.id)}
                                        >
                                            <span className="material-symbols-outlined projects-arrow-col" style={{ fontSize: '1rem' }}>
                                                {expandedColId === col.id ? 'expand_more' : 'chevron_right'}
                                            </span>
                                            <span className="material-symbols-outlined" style={{ fontSize: '1rem', color: 'var(--primary)' }}>folder</span>
                                            <span className="conv-title">{col.name}</span>
                                            <span className="projects-doc-count">{col.document_count}</span>
                                        </button>
                                        {expandedColId === col.id && (
                                            <div className="projects-col-docs" ref={sidebarMenuRef}>
                                                {collectionDocs[col.id]?.length > 0 ? (
                                                    collectionDocs[col.id].map((doc) => (
                                                        <div key={doc.name} className={`projects-doc-item${sidebarDocMenu?.docName === doc.name && sidebarDocMenu?.colId === col.id ? ' menu-open' : ''}`}>
                                                            <span className="projects-doc-name">{doc.name}</span>
                                                            <div className="projects-doc-actions">
                                                                <button
                                                                    className="conv-action-btn"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setSidebarDocMenu(sidebarDocMenu?.docName === doc.name && sidebarDocMenu?.colId === col.id ? null : { colId: col.id, docName: doc.name });
                                                                    }}
                                                                >
                                                                    <span className="material-symbols-outlined" style={{ fontSize: '0.875rem' }}>more_horiz</span>
                                                                </button>
                                                                {sidebarDocMenu?.docName === doc.name && sidebarDocMenu?.colId === col.id && (
                                                                    <div className="conv-dropdown projects-doc-dropdown" onClick={(e) => e.stopPropagation()}>
                                                                        <div className="conv-dropdown-item" style={{ fontSize: '0.75rem', color: 'var(--outline)', cursor: 'default' }}>
                                                                            Move to...
                                                                        </div>
                                                                        {collections.filter(c => c.id !== col.id).map(c => (
                                                                            <button
                                                                                key={c.id}
                                                                                className="conv-dropdown-item"
                                                                                onClick={() => handleSidebarDocMove(doc.name, col.id, c.id)}
                                                                            >
                                                                                <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>folder</span>
                                                                                {c.name}
                                                                            </button>
                                                                        ))}
                                                                        <button
                                                                            className="conv-dropdown-item conv-dropdown-danger"
                                                                            onClick={() => handleSidebarDocRemove(doc.name, col.id)}
                                                                        >
                                                                            <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>remove_circle</span>
                                                                            Remove from collection
                                                                        </button>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ))
                                                ) : (
                                                    <div className="projects-empty" style={{ paddingLeft: '2.5rem' }}>
                                                        No documents in this collection
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))}
                                {collections.length === 0 && !creatingCollection && (
                                    <div className="projects-empty">
                                        No collections yet
                                    </div>
                                )}
                            </div>
                        )}
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
                {page === 'documents' && <Documents onCollectionsChange={fetchCollections} />}
                {page === 'search' && <Search />}
                {page === 'settings' && <Settings onLogout={handleLogout} />}
            </main>
        </div>
    );
}

export default App;
