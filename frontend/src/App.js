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
            <nav>
                <span>🔍 RAG Web App</span>
                <div>
                    <button onClick={() => setPage('chat')}>Chat</button>
                    <button onClick={() => setPage('documents')}>Documents</button>
                    <button onClick={() => setPage('search')}>Search</button>
                    <button onClick={() => setPage('settings')}>Settings</button>
                </div>
            </nav>
            {page === 'chat' && <Chat />}
            {page === 'documents' && <Documents />}
            {page === 'search' && <Search />}
            {page === 'settings' && <Settings onLogout={handleLogout} />}
        </div>
    );
}

export default App;