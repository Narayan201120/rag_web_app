import { useState } from 'react';
import Login from './components/Login';
import Signup from './components/Signup';
import Chat from './components/Chat';
import Documents from './components/Documents';
import Search from './components/Search';
import Settings from './components/Settings';
import './App.css';

function App() {
    const [loggedIn, setLoggedIn] = useState(
        !!localStorage.getItem('access')
    );
    const [showSignup, setShowSignup] = useState(false);
    const [page, setPage] = useState('chat');

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
        <div className="App">
            {/* Permanent Left Sidebar */}
            <nav className="app-sidebar">
                <div className="sidebar-brand">
                    <span className="brand-name">RAG</span>
                    <span className="brand-tag">DOCUMENT AI</span>
                </div>

                <div className="sidebar-nav">
                    <button
                        className={page === 'chat' ? 'active' : ''}
                        onClick={() => setPage('chat')}
                    >
                        <span className="nav-icon">⌘</span>
                        <span>Chat</span>
                    </button>
                    <button
                        className={page === 'documents' ? 'active' : ''}
                        onClick={() => setPage('documents')}
                    >
                        <span className="nav-icon">◆</span>
                        <span>Documents</span>
                    </button>
                    <button
                        className={page === 'search' ? 'active' : ''}
                        onClick={() => setPage('search')}
                    >
                        <span className="nav-icon">⊙</span>
                        <span>Search</span>
                    </button>
                    <button
                        className={page === 'settings' ? 'active' : ''}
                        onClick={() => setPage('settings')}
                    >
                        <span className="nav-icon">⚙</span>
                        <span>Settings</span>
                    </button>
                </div>

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

            {/* Main Content */}
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