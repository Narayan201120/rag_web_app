import { useState } from 'react';
import Login from './components/Login';
import Signup from './components/Signup';
import Chat from './components/Chat';
import Documents from './components/Documents';
import Search from './components/Search';
import Settings from './components/Settings';
import './App.css';

function App() {
    const [loggedIn, setLoggedIn] = useState(!!localStorage.getItem('access'));
    const [showSignup, setShowSignup] = useState(false);
    const [page, setPage] = useState('chat');
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    const handleNavClick = (newPage) => {
        setPage(newPage);
        setMobileMenuOpen(false); // Close menu on mobile after selection
    };

    const handleLogout = () => {
        localStorage.removeItem('access');
        localStorage.removeItem('refresh');
        setLoggedIn(false);
    };

    if (!loggedIn) {
        if (showSignup) {
            return <Signup onSwitch={() => setShowSignup(false)} />;
        }
        return <Login onLogin={() => setLoggedIn(true)} onSwitch={() => setShowSignup(true)} />;
    }

    return (
        <div className="App dark-theme">
            {/* Mobile Header Overlay */}
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

            {/* Sidebar with mobile toggle classes */}
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
                        <span className="nav-icon">SRCH</span>
                        <span>Search</span>
                    </button>
                    <button className={page === 'settings' ? 'active' : ''} onClick={() => handleNavClick('settings')}>
                        <span className="nav-icon">CFG</span>
                        <span>Settings</span>
                    </button>
                </div>

                <div className="sidebar-footer">
                    <div className="sidebar-status">
                        <span className="status-dot online"></span>
                        <span>System Online</span>
                    </div>
                    <button className="sidebar-logout" onClick={handleLogout}>
                        Sign Out
                    </button>
                </div>
            </nav>

            <main className="app-main">
                {page === 'chat' && <Chat />}
                {page === 'documents' && <Documents />}
                {page === 'search' && <Search />}
                {page === 'settings' && <Settings onLogout={handleLogout} />}
            </main>
        </div>
    );
}

export default App;
