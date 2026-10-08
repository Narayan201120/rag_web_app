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

// Same selector DocumentPreview uses for its dialog. Duplicated on purpose: the
// confirm lives in this file and importing it would mean editing that one.
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Focus sentinel for a collection id that no longer exists.
const SECTION_FOCUS = '__section__';

function isAuthPath(pathname) {
    return AUTH_PATHS.includes(pathname);
}

// Collection names are compared the way a person reads them, so "Notes" and
// "notes " collide before the request goes out.
function normalizeCollectionName(name) {
    return String(name || '').trim().toLowerCase();
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
    const [collectionMenuId, setCollectionMenuId] = useState(null);
    const [renamingCollectionId, setRenamingCollectionId] = useState(null);
    const [renamingCollectionName, setRenamingCollectionName] = useState('');
    const [collectionRenameError, setCollectionRenameError] = useState('');
    const [deletingCollectionId, setDeletingCollectionId] = useState(null);
    const [collectionDeleteBusy, setCollectionDeleteBusy] = useState(false);
    const [focusCollectionTarget, setFocusCollectionTarget] = useState(null);

    const collectionInputRef = useRef(null);
    const menuRef = useRef(null);
    const renameInputRef = useRef(null);
    const sidebarMenuRef = useRef(null);
    const collectionMenuRef = useRef(null);
    const collectionRenameRef = useRef(null);
    const collectionConfirmRef = useRef(null);
    const collectionConfirmCancelRef = useRef(null);
    const collectionActionRefs = useRef({});
    const collectionsSectionActionRef = useRef(null);
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

    // Rename input takes the whole row, so select the old name to type over it.
    useEffect(() => {
        if (renamingCollectionId === null) return;
        collectionRenameRef.current?.focus();
        collectionRenameRef.current?.select();
    }, [renamingCollectionId]);

    // Focus lands on Cancel, the safe answer, so a stray Enter cannot delete.
    useEffect(() => {
        if (deletingCollectionId === null) return;
        collectionConfirmCancelRef.current?.focus();
    }, [deletingCollectionId]);

    // Focus goes back where it came from. Deferred to an effect because the row
    // button only exists again after the dialog unmounts. A deleted row never
    // comes back, so that case names the section action instead.
    useEffect(() => {
        if (focusCollectionTarget === null) return;
        if (focusCollectionTarget === SECTION_FOCUS) {
            collectionsSectionActionRef.current?.focus();
        } else {
            const toggle = collectionActionRefs.current[focusCollectionTarget];
            if (toggle && document.contains(toggle)) {
                toggle.focus();
            } else {
                collectionsSectionActionRef.current?.focus();
            }
        }
        setFocusCollectionTarget(null);
    }, [focusCollectionTarget]);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) {
                setMenuOpenConvId(null);
            }
            if (sidebarMenuRef.current && !sidebarMenuRef.current.contains(e.target)) {
                setSidebarDocMenu(null);
            }
            if (collectionMenuRef.current && !collectionMenuRef.current.contains(e.target)) {
                setCollectionMenuId(null);
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
        setCollectionMenuId(null);
        setRenamingCollectionId(null);
        setCollectionRenameError('');
        setDeletingCollectionId(null);
        setCollectionDeleteBusy(false);
    };

    const handleNavClick = () => {
        setMobileMenuOpen(false);
        setMenuOpenConvId(null);
        setSidebarDocMenu(null);
        setCollectionMenuId(null);
        setRenamingCollectionId(null);
        setCollectionRenameError('');
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

    // One menu at a time across the whole sidebar, so the two rail menus cannot
    // sit open on top of each other.
    const openCollectionMenu = (colId) => {
        setCollectionMenuId(prev => (prev === colId ? null : colId));
        setRenamingCollectionId(null);
        setCollectionRenameError('');
        setSidebarDocMenu(null);
    };

    const openSidebarDocMenu = (next) => {
        setSidebarDocMenu(next);
        setCollectionMenuId(null);
    };

    // Tapping the row itself is also a dismissal, so the row menu does not hang
    // around while the documents expand.
    const toggleCollectionRow = (colId) => {
        setCollectionMenuId(null);
        handleToggleCollection(colId);
    };

    const startCollectionRename = (col) => {
        setCollectionMenuId(null);
        setSidebarDocMenu(null);
        setRenamingCollectionId(col.id);
        setRenamingCollectionName(col.name || '');
        setCollectionRenameError('');
    };

    const cancelCollectionRename = () => {
        const id = renamingCollectionId;
        setRenamingCollectionId(null);
        setCollectionRenameError('');
        if (id !== null) setFocusCollectionTarget(id);
    };

    const handleRenameCollection = async (colId) => {
        // Blur and submit can both land here, and a row that already left rename
        // mode must not write its stale name into the list.
        if (renamingCollectionId !== colId) return;
        const name = renamingCollectionName.trim();
        if (!name) {
            setCollectionRenameError('Name cannot be empty.');
            collectionRenameRef.current?.focus();
            return;
        }
        // Duplicates are checked here so a known clash never costs a round trip.
        const taken = collections.some(
            (c) => c.id !== colId && normalizeCollectionName(c.name) === normalizeCollectionName(name)
        );
        if (taken) {
            setCollectionRenameError(`"${name}" is already taken.`);
            collectionRenameRef.current?.focus();
            collectionRenameRef.current?.select();
            return;
        }
        try {
            const res = await requestWithRefresh((headers) => apiClient.patch(`/collections/${colId}/`, { name }, { headers }));
            const nextName = res?.data?.name || name;
            setCollections(prev => prev.map((c) => (c.id === colId
                ? { ...c, ...res?.data, name: nextName }
                : c)));
            setRenamingCollectionId(null);
            setCollectionRenameError('');
            setFocusCollectionTarget(colId);
        } catch (err) {
            console.error('Rename collection failed:', err);
        }
    };

    const openCollectionDelete = (col) => {
        setCollectionMenuId(null);
        setSidebarDocMenu(null);
        setRenamingCollectionId(null);
        setCollectionRenameError('');
        setDeletingCollectionId(col.id);
        setCollectionDeleteBusy(false);
    };

    const closeCollectionDelete = () => {
        const id = deletingCollectionId;
        setDeletingCollectionId(null);
        setCollectionDeleteBusy(false);
        setCollectionMenuId(null);
        if (id !== null) setFocusCollectionTarget(id);
    };

    const handleDeleteCollection = async (colId) => {
        try {
            await requestWithRefresh((headers) => apiClient.delete(`/collections/${colId}/`, { headers }));
            // The documents outlive the collection, so only the cached doc list
            // for this id goes.
            setCollectionDocs(prev => {
                if (!(colId in prev)) return prev;
                const next = { ...prev };
                delete next[colId];
                return next;
            });
            if (expandedColId === colId) setExpandedColId(null);
            setDeletingCollectionId(null);
            setCollectionDeleteBusy(false);
            // The row is about to disappear, so focus names the section action.
            setFocusCollectionTarget(SECTION_FOCUS);
            fetchCollections();
        } catch (err) {
            console.error('Delete collection failed:', err);
            setCollectionDeleteBusy(false);
        }
    };

    // Escape and Tab stay inside the dialog while it is open.
    const handleCollectionConfirmKeys = (e) => {
        if (e.key === 'Escape') {
            e.stopPropagation();
            closeCollectionDelete();
            return;
        }
        if (e.key !== 'Tab') return;
        const nodes = collectionConfirmRef.current?.querySelectorAll(FOCUSABLE);
        if (!nodes || nodes.length === 0) {
            e.preventDefault();
            return;
        }
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && active === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && active === last) {
            e.preventDefault();
            first.focus();
        }
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
                                ref={collectionsSectionActionRef}
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
                            <ul className="app-collection-list" ref={collectionMenuRef}>
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
                                    const isRenaming = renamingCollectionId === col.id;
                                    const menuOpen = collectionMenuId === col.id;
                                    const docCount = col.document_count ?? 0;
                                    return (
                                        <li
                                            key={col.id}
                                            className={`app-collection-item${isExpanded ? ' is-expanded' : ''}`}
                                        >
                                            {isRenaming ? (
                                                <form
                                                    className="app-collection-rename"
                                                    onSubmit={(e) => {
                                                        e.preventDefault();
                                                        handleRenameCollection(col.id);
                                                    }}
                                                >
                                                    <input
                                                        ref={collectionRenameRef}
                                                        className="app-rename-input app-collection-rename-input"
                                                        aria-label={`Rename ${col.name}`}
                                                        value={renamingCollectionName}
                                                        onChange={(e) => {
                                                            setRenamingCollectionName(e.target.value);
                                                            if (collectionRenameError) setCollectionRenameError('');
                                                        }}
                                                        onBlur={() => handleRenameCollection(col.id)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Escape') {
                                                                e.preventDefault();
                                                                cancelCollectionRename();
                                                            }
                                                        }}
                                                    />
                                                    {collectionRenameError && (
                                                        <span className="app-collection-rename-error" role="alert">
                                                            {collectionRenameError}
                                                        </span>
                                                    )}
                                                </form>
                                            ) : (
                                                <>
                                                    <button
                                                        type="button"
                                                        className="app-collection-main"
                                                        onClick={() => toggleCollectionRow(col.id)}
                                                        aria-expanded={isExpanded}
                                                        ref={(node) => {
                                                            if (node) collectionActionRefs.current[col.id] = node;
                                                            else delete collectionActionRefs.current[col.id];
                                                        }}
                                                    >
                                                        <span className="material-symbols-outlined" aria-hidden="true">
                                                            {isExpanded ? 'expand_more' : 'chevron_right'}
                                                        </span>
                                                        <span className="app-collection-icon material-symbols-outlined" aria-hidden="true">folder</span>
                                                        <span className="app-collection-title">{col.name}</span>
                                                        <span className="app-collection-count">{docCount}</span>
                                                    </button>

                                                    <div className="app-collection-actions">
                                                        <button
                                                            type="button"
                                                            className="app-icon-button"
                                                            onClick={() => openCollectionMenu(col.id)}
                                                            aria-label={`More actions for ${col.name}`}
                                                            aria-haspopup="menu"
                                                            aria-expanded={menuOpen}
                                                            title="More"
                                                        >
                                                            <span className="material-symbols-outlined" aria-hidden="true">more_horiz</span>
                                                        </button>
                                                    </div>

                                                    {menuOpen && (
                                                        <div
                                                            className="app-menu app-collection-row-menu"
                                                            role="menu"
                                                            onClick={(e) => e.stopPropagation()}
                                                        >
                                                            <button
                                                                type="button"
                                                                role="menuitem"
                                                                className="app-menu-item"
                                                                onClick={() => startCollectionRename(col)}
                                                            >
                                                                <span className="material-symbols-outlined" aria-hidden="true">edit</span>
                                                                Rename
                                                            </button>
                                                            <button
                                                                type="button"
                                                                role="menuitem"
                                                                className="app-menu-item app-menu-item-danger"
                                                                onClick={() => openCollectionDelete(col)}
                                                            >
                                                                <span className="material-symbols-outlined" aria-hidden="true">delete</span>
                                                                Delete
                                                            </button>
                                                        </div>
                                                    )}
                                                </>
                                            )}

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
                                                                        onClick={() => openSidebarDocMenu(docMenuOpenFor(doc.name) ? null : { colId: col.id, docName: doc.name })}
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

            {deletingCollectionId !== null && (() => {
                const target = collections.find((c) => c.id === deletingCollectionId);
                const name = target?.name || 'this collection';
                const docCount = target?.document_count ?? 0;
                return (
                    <div
                        className="dm-modal-overlay app-collection-confirm-overlay"
                        onClick={closeCollectionDelete}
                        onKeyDown={handleCollectionConfirmKeys}
                    >
                        <div
                            ref={collectionConfirmRef}
                            className="dm-modal app-collection-confirm"
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="app-collection-confirm-title"
                            aria-describedby="app-collection-confirm-body"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="dm-modal-header">
                                <h3 id="app-collection-confirm-title" className="app-collection-confirm-title">
                                    Delete {name}?
                                </h3>
                            </div>
                            <div className="dm-modal-body">
                                <p id="app-collection-confirm-body" className="app-collection-confirm-body">
                                    {docCount === 0 ? (
                                        <>This collection is empty. Nothing is lost.</>
                                    ) : (
                                        <>
                                            Its {docCount} {docCount === 1 ? 'document survives and becomes' : 'documents survive and become'}{' '}
                                            unfiled. You can move them into a new collection at any time.
                                        </>
                                    )}
                                </p>
                            </div>
                            <div className="dm-modal-actions">
                                <button
                                    ref={collectionConfirmCancelRef}
                                    type="button"
                                    className="dm-btn dm-btn-secondary"
                                    onClick={closeCollectionDelete}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    className="dm-btn dm-btn-danger"
                                    onClick={() => handleDeleteCollection(deletingCollectionId)}
                                    disabled={collectionDeleteBusy}
                                >
                                    {collectionDeleteBusy ? 'Deleting…' : 'Delete collection'}
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}
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