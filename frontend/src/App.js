import { useState, useEffect, useCallback, useRef } from 'react';
import {
    BrowserRouter,
    Navigate,
    NavLink,
    Route,
    Routes,
    useLocation,
    useMatch,
    useNavigate
} from 'react-router-dom';
import Login from './components/Login';
import Signup from './components/Signup';
import Chat from './components/Chat';
import Documents from './components/Documents';
import Search from './components/Search';
import Settings from './components/Settings';
import { apiClient, clearAccessToken, getAuthHeaders, hasAccessToken, requestWithRefresh } from './apiClient';
import './App.css';

const AUTH_PATHS = ['/login', '/signup'];

// `end` stays false everywhere so "/chat/42" and "/settings/account" keep
// their parent nav item highlighted.
const NAV_ITEMS = [
    { to: '/chat', label: 'Chat', icon: 'chat' },
    { to: '/documents', label: 'Documents', icon: 'description' },
    { to: '/search', label: 'Search', icon: 'search' },
    { to: '/settings', label: 'Settings', icon: 'settings' }
];

function isAuthPath(pathname) {
    return AUTH_PATHS.includes(pathname);
}

function conversationTitle(conv) {
    return (conv.title || '').trim() || 'Untitled chat';
}

function AppShell() {
    const location = useLocation();
    const navigate = useNavigate();
    const chatMatch = useMatch('/chat/:conversationId');
    const activeConversationId = chatMatch ? chatMatch.params.conversationId : null;

    const [loggedIn, setLoggedIn] = useState(hasAccessToken());
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [apiOnline, setApiOnline] = useState(null);

    const [conversations, setConversations] = useState([]);
    const [menuOpenConvId, setMenuOpenConvId] = useState(null);
    const [renamingConvId, setRenamingConvId] = useState(null);
    const [renamingTitle, setRenamingTitle] = useState('');
    const [deleteConfirmId, setDeleteConfirmId] = useState(null);
    const [collections, setCollections] = useState([]);
    const [collectionsOpen, setCollectionsOpen] = useState(true);
    const [creatingCollection, setCreatingCollection] = useState(false);
    const [newCollectionName, setNewCollectionName] = useState('');
    const [expandedColId, setExpandedColId] = useState(null);
    const [collectionDocs, setCollectionDocs] = useState({});
    const [sidebarDocMenu, setSidebarDocMenu] = useState(null);

    const collectionInputRef = useRef(null);
    const menuRef = useRef(null);
    const renameInputRef = useRef(null);
    const sidebarMenuRef = useRef(null);
    const menuToggleRef = useRef(null);
    const sidebarCloseRef = useRef(null);
    const mobileMenuWasOpen = useRef(false);

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

    // Small, honest health probe. The endpoint is public and unthrottled, so it is
    // called without auth headers to keep a stale token from faking an outage.
    useEffect(() => {
        let cancelled = false;
        const checkHealth = async () => {
            try {
                await apiClient.get('/health/', { timeout: 5000 });
                if (!cancelled) setApiOnline(true);
            } catch {
                if (!cancelled) setApiOnline(false);
            }
        };
        checkHealth();
        return () => { cancelled = true; };
    }, []);

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

    // The documents view owns collection state, so refresh the sidebar copy on entry.
    useEffect(() => {
        if (loggedIn && location.pathname.startsWith('/documents')) {
            fetchCollections();
        }
    }, [loggedIn, location.pathname, fetchCollections]);

    // Any route change (including browser back) dismisses the mobile drawer.
    useEffect(() => {
        setMobileMenuOpen(false);
    }, [location.pathname]);

    useEffect(() => {
        if (!mobileMenuOpen) return;
        const handleEscape = (e) => {
            if (e.key === 'Escape') setMobileMenuOpen(false);
        };
        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [mobileMenuOpen]);

    useEffect(() => {
        if (mobileMenuOpen) {
            sidebarCloseRef.current?.focus();
        } else if (mobileMenuWasOpen.current) {
            menuToggleRef.current?.focus();
        }
        mobileMenuWasOpen.current = mobileMenuOpen;
    }, [mobileMenuOpen]);

    const closeTransientUi = () => {
        setMenuOpenConvId(null);
        setSidebarDocMenu(null);
        setDeleteConfirmId(null);
        setRenamingConvId(null);
        setMobileMenuOpen(false);
    };

    const handleNavClick = () => {
        setMobileMenuOpen(false);
        setMenuOpenConvId(null);
        setSidebarDocMenu(null);
    };

    const handleLogin = () => {
        setLoggedIn(true);
        navigate('/chat', { replace: true });
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
        setCollections([]);
        setCollectionDocs({});
        setExpandedColId(null);
        closeTransientUi();
        navigate('/login', { replace: true });
    };

    const handleLoadConversation = (convId) => {
        setMenuOpenConvId(null);
        setDeleteConfirmId(null);
        setRenamingConvId(null);
        setSidebarDocMenu(null);
        setMobileMenuOpen(false);
        navigate(`/chat/${convId}`);
    };

    const handleNewConversation = () => {
        setMenuOpenConvId(null);
        setDeleteConfirmId(null);
        setRenamingConvId(null);
        setSidebarDocMenu(null);
        setMobileMenuOpen(false);
        navigate('/chat');
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
        const wasActive = String(convId) === activeConversationId;
        try {
            await requestWithRefresh((headers) => apiClient.delete(`/chat/conversations/${convId}/`, { headers }));
            if (wasActive) {
                navigate('/chat');
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
            setSidebarDocMenu(null);
            return;
        }
        setExpandedColId(colId);
        setSidebarDocMenu(null);
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

    // ---- Auth gate -------------------------------------------------------
    if (!loggedIn && !isAuthPath(location.pathname)) {
        return <Navigate to="/login" replace />;
    }

    if (loggedIn && isAuthPath(location.pathname)) {
        return <Navigate to="/chat" replace />;
    }

    if (!loggedIn) {
        return (
            <Routes>
                <Route path="/login" element={<Login onLogin={handleLogin} onSwitch={() => navigate('/signup')} />} />
                <Route path="/signup" element={<Signup onSwitch={() => navigate('/login')} />} />
                <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
        );
    }

    // ---- Authenticated app shell ----------------------------------------
    const chatProps = {
        conversations,
        onLoadConversation: handleLoadConversation,
        onNewConversation: handleNewConversation,
        onRefreshConversations: loadConversations
    };

    const statusText = apiOnline === true ? 'Online' : apiOnline === false ? 'Offline' : 'Checking';
    const statusModifier = apiOnline === true ? ' is-online' : apiOnline === false ? ' is-offline' : '';

    return (
        <div className="app-shell">
            <div
                className={`app-sidebar-overlay${mobileMenuOpen ? ' is-open' : ''}`}
                onClick={() => setMobileMenuOpen(false)}
                aria-hidden="true"
            />

            <nav
                id="app-sidebar"
                className={`app-sidebar font-headline${mobileMenuOpen ? ' is-open' : ''}`}
                aria-label="Primary"
            >
                <div className="app-sidebar-header">
                    <div className="app-brand">DocuMind</div>
                    <div className="app-status" role="status" aria-live="polite">
                        <span className={`app-status-dot${statusModifier}`} aria-hidden="true" />
                        <span className="app-status-label">{statusText}</span>
                    </div>
                    <button
                        type="button"
                        ref={sidebarCloseRef}
                        className="app-sidebar-close"
                        onClick={() => setMobileMenuOpen(false)}
                        aria-label="Close menu"
                    >
                        <span className="material-symbols-outlined" aria-hidden="true">close</span>
                    </button>
                </div>

                <div className="app-nav">
                    {NAV_ITEMS.map((item) => (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            className={({ isActive }) => `app-nav-link${isActive ? ' is-active' : ''}`}
                            onClick={handleNavClick}
                        >
                            {({ isActive }) => (
                                <>
                                    <span
                                        className="app-nav-icon material-symbols-outlined"
                                        style={isActive ? { fontVariationSettings: "'FILL' 1" } : undefined}
                                        aria-hidden="true"
                                    >
                                        {item.icon}
                                    </span>
                                    <span className="app-nav-label">{item.label}</span>
                                </>
                            )}
                        </NavLink>
                    ))}
                </div>

                <div className="app-sidebar-body">
                    <section className="app-sidebar-section">
                        <div className="app-sidebar-section-header">
                            <span className="app-sidebar-section-title">Recent Chats</span>
                            <button
                                type="button"
                                className="app-sidebar-section-action"
                                onClick={handleNewConversation}
                                aria-label="New chat"
                                title="New chat"
                            >
                                <span className="material-symbols-outlined" aria-hidden="true">add</span>
                            </button>
                        </div>
                        <ul className="app-conversation-list" ref={menuRef}>
                            {conversations.length > 0 ? (
                                conversations.map((conv) => {
                                    const isActive = String(conv.id) === activeConversationId;
                                    const isRenaming = renamingConvId === conv.id;
                                    const title = conversationTitle(conv);
                                    return (
                                        <li
                                            key={conv.id}
                                            className={`app-conversation-item${isActive ? ' is-active' : ''}`}
                                        >
                                            {isRenaming ? (
                                                <form
                                                    className="app-rename-form"
                                                    onSubmit={(e) => {
                                                        e.preventDefault();
                                                        handleRename(conv.id, renamingTitle);
                                                    }}
                                                >
                                                    <input
                                                        ref={renameInputRef}
                                                        className="app-rename-input"
                                                        aria-label={`Rename ${title}`}
                                                        value={renamingTitle}
                                                        onChange={(e) => setRenamingTitle(e.target.value)}
                                                        onBlur={() => handleRename(conv.id, renamingTitle)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Escape') setRenamingConvId(null);
                                                        }}
                                                    />
                                                </form>
                                            ) : (
                                                <button
                                                    type="button"
                                                    className="app-conversation-main"
                                                    onClick={() => handleLoadConversation(conv.id)}
                                                    title={title}
                                                >
                                                    <span
                                                        className="app-conversation-icon material-symbols-outlined"
                                                        style={conv.pinned ? { fontVariationSettings: "'FILL' 1" } : undefined}
                                                        aria-hidden="true"
                                                    >
                                                        {conv.pinned ? 'push_pin' : 'chat_bubble'}
                                                    </span>
                                                    <span className="app-conversation-title">{title}</span>
                                                </button>
                                            )}

                                            <div className="app-conversation-actions">
                                                <button
                                                    type="button"
                                                    className={`app-icon-button${conv.pinned ? ' is-active' : ''}`}
                                                    onClick={() => handleTogglePin(conv.id, conv.pinned)}
                                                    aria-label={conv.pinned ? `Unpin ${title}` : `Pin ${title}`}
                                                    title={conv.pinned ? 'Unpin' : 'Pin'}
                                                >
                                                    <span
                                                        className="material-symbols-outlined"
                                                        style={{ fontVariationSettings: conv.pinned ? "'FILL' 1" : "'FILL' 0" }}
                                                        aria-hidden="true"
                                                    >
                                                        push_pin
                                                    </span>
                                                </button>
                                                <button
                                                    type="button"
                                                    className="app-icon-button"
                                                    onClick={() => setMenuOpenConvId(menuOpenConvId === conv.id ? null : conv.id)}
                                                    aria-label={`More actions for ${title}`}
                                                    title="More"
                                                >
                                                    <span className="material-symbols-outlined" aria-hidden="true">more_horiz</span>
                                                </button>
                                            </div>

                                            {menuOpenConvId === conv.id && (
                                                <div className="app-menu" onClick={(e) => e.stopPropagation()}>
                                                    {deleteConfirmId === conv.id ? (
                                                        <div className="app-confirm-row" role="group" aria-label="Delete chat?">
                                                            <span className="app-confirm-label">Delete chat?</span>
                                                            <button
                                                                type="button"
                                                                className="app-menu-item app-menu-item-danger"
                                                                onClick={() => handleDelete(conv.id)}
                                                            >
                                                                Delete
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className="app-menu-item"
                                                                onClick={() => setDeleteConfirmId(null)}
                                                            >
                                                                Cancel
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <>
                                                            <button
                                                                type="button"
                                                                className="app-menu-item"
                                                                onClick={() => {
                                                                    setRenamingConvId(conv.id);
                                                                    setRenamingTitle(conv.title);
                                                                    setMenuOpenConvId(null);
                                                                }}
                                                            >
                                                                <span className="material-symbols-outlined" aria-hidden="true">edit</span>
                                                                Rename
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className="app-menu-item app-menu-item-danger"
                                                                onClick={() => setDeleteConfirmId(conv.id)}
                                                            >
                                                                <span className="material-symbols-outlined" aria-hidden="true">delete</span>
                                                                Delete
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            )}
                                        </li>
                                    );
                                })
                            ) : (
                                <li className="app-empty-note">No recent chats</li>
                            )}
                        </ul>
                    </section>

                    <section className="app-sidebar-section">
                        <div className="app-sidebar-section-header">
                            <button
                                type="button"
                                className="app-sidebar-section-toggle"
                                onClick={() => setCollectionsOpen(!collectionsOpen)}
                                aria-expanded={collectionsOpen}
                            >
                                <span className="material-symbols-outlined" aria-hidden="true">
                                    {collectionsOpen ? 'expand_more' : 'chevron_right'}
                                </span>
                                <span className="app-sidebar-section-title">Collections</span>
                            </button>
                            <button
                                type="button"
                                className="app-sidebar-section-action"
                                onClick={() => {
                                    setCollectionsOpen(true);
                                    setCreatingCollection(true);
                                }}
                                aria-label="New collection"
                                title="New collection"
                            >
                                <span className="material-symbols-outlined" aria-hidden="true">add</span>
                            </button>
                        </div>

                        {collectionsOpen && (
                            <ul className="app-collection-list">
                                {creatingCollection && (
                                    <li className="app-collection-item">
                                        <form
                                            className="app-rename-form"
                                            onSubmit={(e) => {
                                                e.preventDefault();
                                                handleCreateCollection();
                                            }}
                                        >
                                            <input
                                                ref={collectionInputRef}
                                                className="app-rename-input"
                                                placeholder="Collection name"
                                                aria-label="Collection name"
                                                value={newCollectionName}
                                                onChange={(e) => setNewCollectionName(e.target.value)}
                                                onBlur={() => { if (!newCollectionName.trim()) setCreatingCollection(false); }}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Escape') {
                                                        setCreatingCollection(false);
                                                        setNewCollectionName('');
                                                    }
                                                }}
                                            />
                                        </form>
                                    </li>
                                )}

                                {collections.map((col) => {
                                    const isExpanded = expandedColId === col.id;
                                    const docs = collectionDocs[col.id];
                                    const docMenuOpenFor = (docName) => (
                                        sidebarDocMenu?.docName === docName && sidebarDocMenu?.colId === col.id
                                    );
                                    return (
                                        <li
                                            key={col.id}
                                            className={`app-collection-item${isExpanded ? ' is-expanded' : ''}`}
                                        >
                                            <button
                                                type="button"
                                                className="app-collection-main"
                                                onClick={() => handleToggleCollection(col.id)}
                                                aria-expanded={isExpanded}
                                            >
                                                <span className="material-symbols-outlined" aria-hidden="true">
                                                    {isExpanded ? 'expand_more' : 'chevron_right'}
                                                </span>
                                                <span className="app-collection-icon material-symbols-outlined" aria-hidden="true">folder</span>
                                                <span className="app-collection-title">{col.name}</span>
                                                <span className="app-collection-count">{col.document_count ?? 0}</span>
                                            </button>

                                            {isExpanded && (
                                                <ul className="app-collection-docs" ref={sidebarMenuRef}>
                                                    {docs?.length > 0 ? (
                                                        docs.map((doc) => (
                                                            <li key={doc.name} className="app-collection-doc">
                                                                <span className="app-collection-doc-name" title={doc.name}>{doc.name}</span>
                                                                <div className="app-collection-doc-actions">
                                                                    <button
                                                                        type="button"
                                                                        className="app-icon-button"
                                                                        onClick={() => setSidebarDocMenu(docMenuOpenFor(doc.name) ? null : { colId: col.id, docName: doc.name })}
                                                                        aria-label={`More actions for ${doc.name}`}
                                                                        title="More"
                                                                    >
                                                                        <span className="material-symbols-outlined" aria-hidden="true">more_horiz</span>
                                                                    </button>
                                                                    {docMenuOpenFor(doc.name) && (
                                                                        <div className="app-collection-menu" onClick={(e) => e.stopPropagation()}>
                                                                            <div className="app-menu-label">Move to...</div>
                                                                            {collections.filter((c) => c.id !== col.id).map((c) => (
                                                                                <button
                                                                                    key={c.id}
                                                                                    type="button"
                                                                                    className="app-menu-item"
                                                                                    onClick={() => handleSidebarDocMove(doc.name, col.id, c.id)}
                                                                                >
                                                                                    <span className="material-symbols-outlined" aria-hidden="true">folder</span>
                                                                                    {c.name}
                                                                                </button>
                                                                            ))}
                                                                            <button
                                                                                type="button"
                                                                                className="app-menu-item app-menu-item-danger"
                                                                                onClick={() => handleSidebarDocRemove(doc.name, col.id)}
                                                                            >
                                                                                <span className="material-symbols-outlined" aria-hidden="true">remove_circle</span>
                                                                                Remove from collection
                                                                            </button>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </li>
                                                        ))
                                                    ) : (
                                                        <li className="app-empty-note">No documents in this collection</li>
                                                    )}
                                                </ul>
                                            )}
                                        </li>
                                    );
                                })}

                                {collections.length === 0 && !creatingCollection && (
                                    <li className="app-empty-note">No collections yet</li>
                                )}
                            </ul>
                        )}
                    </section>
                </div>

                <div className="app-sidebar-footer">
                    <button type="button" className="app-signout" onClick={handleLogout}>
                        <span className="material-symbols-outlined" aria-hidden="true">logout</span>
                        <span className="app-signout-label">Sign Out</span>
                    </button>
                </div>
            </nav>

            <main className="app-main">
                <button
                    type="button"
                    ref={menuToggleRef}
                    className="app-menu-toggle"
                    onClick={() => setMobileMenuOpen(true)}
                    aria-label="Open menu"
                    aria-expanded={mobileMenuOpen}
                    aria-controls="app-sidebar"
                >
                    <span className="material-symbols-outlined" aria-hidden="true">menu_open</span>
                </button>

                <Routes>
                    <Route path="/" element={<Navigate to="/chat" replace />} />
                    <Route path="/chat" element={<Chat {...chatProps} conversationId={null} />} />
                    <Route path="/chat/:conversationId" element={<Chat {...chatProps} conversationId={activeConversationId} />} />
                    <Route path="/documents" element={<Documents onCollectionsChange={fetchCollections} />} />
                    <Route path="/search" element={<Search />} />
                    <Route path="/settings" element={<Settings onLogout={handleLogout} />} />
                    <Route path="/settings/:section" element={<Settings onLogout={handleLogout} />} />
                    <Route path="*" element={<Navigate to="/chat" replace />} />
                </Routes>
            </main>
        </div>
    );
}

function App() {
    return (
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <AppShell />
        </BrowserRouter>
    );
}

export default App;