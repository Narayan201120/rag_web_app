import { useState, useEffect } from 'react';
import axios from 'axios';

const API = 'http://127.0.0.1:8000/api';

function Chat() {
    const [question, setQuestion] = useState('');
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(false);
    const [conversationId, setConversationId] = useState(null);
    const [conversations, setConversations] = useState([]);
    const [showHistory, setShowHistory] = useState(false);

    const token = localStorage.getItem('access');
    const headers = { Authorization: `Bearer ${token}` };

    // Load conversation list
    const loadConversations = async () => {
        try {
            const res = await axios.get(`${API}/chat/history/`, { headers });
            setConversations(res.data.conversations || []);
        } catch (err) {
            console.error(err);
        }
    };

    useEffect(() => {
        loadConversations();
    }, []);

    // Load a specific conversation
    const loadConversation = async (convId) => {
        try {
            const res = await axios.get(`${API}/chat/conversations/${convId}/`, { headers });
            setConversationId(convId);
            setMessages(
                res.data.messages.map((m) => ({
                    question: m.question,
                    answer: m.answer,
                    sources: m.sources,
                }))
            );
            setShowHistory(false);
        } catch (err) {
            console.error(err);
        }
    };

    const askQuestion = async (e) => {
        e.preventDefault();
        if (!question.trim()) return;
        setLoading(true);
        try {
            const body = { question };
            if (conversationId) {
                body.conversation_id = conversationId;
            }
            const res = await axios.post(`${API}/chat/`, body, { headers });
            if (res.data.conversation_id) {
                setConversationId(res.data.conversation_id);
            }
            setMessages([...messages, {
                question: question,
                answer: res.data.answer,
                sources: res.data.sources,
            }]);
            setQuestion('');
            loadConversations(); // Refresh sidebar
        } catch (err) {
            alert('Error: ' + (err.response?.data?.error || 'Something went wrong'));
        }
        setLoading(false);
    };

    const newConversation = () => {
        setConversationId(null);
        setMessages([]);
    };

    return (
        <div className="chat-page">
            {/* History Sidebar */}
            <div className={`chat-sidebar ${showHistory ? 'open' : ''}`}>
                <div className="sidebar-header">
                    <h3>History</h3>
                    <button onClick={() => setShowHistory(false)} className="close-sidebar">✕</button>
                </div>
                <button className="new-chat-sidebar" onClick={() => { newConversation(); setShowHistory(false); }}>
                    + New Chat
                </button>
                <div className="conversation-list">
                    {conversations.map((conv) => (
                        <div
                            key={conv.id}
                            className={`conversation-item ${conv.id === conversationId ? 'active' : ''}`}
                            onClick={() => loadConversation(conv.id)}
                        >
                            <span className="conv-title">{conv.title}</span>
                            <span className="conv-meta">{conv.message_count} msgs</span>
                        </div>
                    ))}
                    {conversations.length === 0 && (
                        <p style={{ fontSize: '0.75rem', color: '#737380', padding: '16px' }}>No conversations yet</p>
                    )}
                </div>
            </div>

            {/* Main Chat Area */}
            <div className="chat-container">
                <div className="chat-header">
                    <div className="chat-header-left">
                        <button
                            className="history-toggle"
                            onClick={() => { setShowHistory(!showHistory); if (!showHistory) loadConversations(); }}
                        >
                            ☰
                        </button>
                        <h2>Chat with your documents</h2>
                    </div>
                    {messages.length > 0 && (
                        <button className="new-chat-btn" onClick={newConversation}>
                            + New Chat
                        </button>
                    )}
                </div>
                <div className="messages">
                    {messages.map((msg, i) => (
                        <div key={i} className="message">
                            <p className="question">{msg.question}</p>
                            <p className="answer">{msg.answer}</p>
                            <p className="sources">📄 Sources: {msg.sources?.join(', ')}</p>
                        </div>
                    ))}
                    {loading && <p className="loading">Thinking...</p>}
                </div>
                <form onSubmit={askQuestion}>
                    <input
                        type="text"
                        placeholder="Ask a question..."
                        value={question}
                        onChange={(e) => setQuestion(e.target.value)}
                    />
                    <button type="submit" disabled={loading}>Ask</button>
                </form>
            </div>
        </div>
    );
}

export default Chat;