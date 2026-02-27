import { useState, useEffect, useRef } from 'react';
import axios from 'axios';

const API = 'http://127.0.0.1:8000/api';

const INLINE_MD_RE = /(\$[^$]+\$|\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;

function renderMathInline(mathText) {
    const bbMap = { Z: 'Z', R: 'R', Q: 'Q', N: 'N', C: 'C' };
    let out = String(mathText || '');

    out = out.replace(/\\mathbb\{([A-Za-z])\}/g, (_, ch) => bbMap[ch] || ch);
    out = out.replace(/\\mathfrak\{([A-Za-z])\}/g, '$1');
    out = out.replace(/\\textsf\{([^}]*)\}/g, '$1');
    out = out.replace(/\\times/g, ' x ');
    out = out.replace(/\\cdot/g, ' * ');
    out = out.replace(/\\leq/g, '<=');
    out = out.replace(/\\geq/g, '>=');
    out = out.replace(/\\neq/g, '!=');
    out = out.replace(/\\to/g, ' -> ');
    out = out.replace(/\\mapsto/g, ' |-> ');
    out = out.replace(/\\_/g, '_');
    out = out.replace(/\\\//g, '/');
    out = out.replace(/\\([(){}[\]])/g, '$1');
    out = out.replace(/\{([^}]*)\}/g, '$1');
    out = out.replace(/\s+/g, ' ').trim();

    return out;
}

function renderInlineMarkdown(text) {
    return text.split(INLINE_MD_RE).map((part, idx) => {
        if (!part) return null;
        if (part.startsWith('$') && part.endsWith('$')) {
            const math = renderMathInline(part.slice(1, -1));
            return <span key={idx} className="math-inline">{math}</span>;
        }
        if (part.startsWith('**') && part.endsWith('**')) {
            return <strong key={idx}>{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith('*') && part.endsWith('*')) {
            return <em key={idx}>{part.slice(1, -1)}</em>;
        }
        if (part.startsWith('`') && part.endsWith('`')) {
            return <code key={idx}>{part.slice(1, -1)}</code>;
        }
        return <span key={idx}>{part}</span>;
    });
}

function renderAnswerMarkdown(answer) {
    const lines = String(answer || '').split('\n');
    const blocks = [];

    for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i].trim();
        if (!line) continue;

        if (/^###\s+/.test(line)) {
            blocks.push(<h3 key={`h3-${i}`}>{renderInlineMarkdown(line.replace(/^###\s+/, ''))}</h3>);
            continue;
        }
        if (/^##\s+/.test(line)) {
            blocks.push(<h2 key={`h2-${i}`}>{renderInlineMarkdown(line.replace(/^##\s+/, ''))}</h2>);
            continue;
        }
        if (/^#\s+/.test(line)) {
            blocks.push(<h1 key={`h1-${i}`}>{renderInlineMarkdown(line.replace(/^#\s+/, ''))}</h1>);
            continue;
        }

        if (/^[-*]\s+/.test(line)) {
            const items = [line.replace(/^[-*]\s+/, '')];
            let j = i + 1;
            while (j < lines.length && /^[-*]\s+/.test(lines[j].trim())) {
                items.push(lines[j].trim().replace(/^[-*]\s+/, ''));
                j += 1;
            }
            blocks.push(
                <ul key={`ul-${i}`}>
                    {items.map((item, idx) => <li key={`li-${i}-${idx}`}>{renderInlineMarkdown(item)}</li>)}
                </ul>
            );
            i = j - 1;
            continue;
        }

        blocks.push(<p key={`p-${i}`}>{renderInlineMarkdown(line)}</p>);
    }

    return blocks;
}

function Chat() {
    const [question, setQuestion] = useState('');
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(false);
    const [conversationId, setConversationId] = useState(null);
    const [conversations, setConversations] = useState([]);
    const [showHistory, setShowHistory] = useState(false);
    const fileInputRef = useRef(null);

    const token = localStorage.getItem('access');
    const headers = { Authorization: `Bearer ${token}` };

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

            setMessages((prev) => [
                ...prev,
                {
                    question,
                    answer: res.data.answer,
                    sources: res.data.sources,
                },
            ]);
            setQuestion('');
            loadConversations();
        } catch (err) {
            alert(`Error: ${err.response?.data?.error || 'Something went wrong'}`);
        }

        setLoading(false);
    };

    const handleComposePlus = () => {
        fileInputRef.current?.click();
    };

    const handleChatFileUpload = async (e) => {
        const selectedFile = e.target.files?.[0];
        if (!selectedFile) return;

        const formData = new FormData();
        formData.append('document', selectedFile);

        try {
            const res = await axios.post(`${API}/upload/`, formData, {
                headers: { ...headers, 'Content-Type': 'multipart/form-data' },
            });
            alert(res.data.message || `Queued upload for "${selectedFile.name}".`);
        } catch (err) {
            alert(`Upload failed: ${err.response?.data?.error || 'Something went wrong'}`);
        } finally {
            e.target.value = '';
        }
    };

    const newConversation = () => {
        setConversationId(null);
        setMessages([]);
    };

    return (
        <div className={`chat-page ${showHistory ? 'history-open' : ''}`}>
            <div className={`chat-sidebar ${showHistory ? 'open' : ''}`}>
                <div className="sidebar-header">
                    <h3>History</h3>
                    <button onClick={() => setShowHistory(false)} className="close-sidebar">X</button>
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
                        <p style={{ fontSize: '0.75rem', color: '#6A6B75', padding: '16px' }}>No conversations yet</p>
                    )}
                </div>
            </div>

            <div className="chat-container">
                <div className="chat-header">
                    <div className="chat-header-left">
                        <button
                            className="history-toggle"
                            onClick={() => { setShowHistory(!showHistory); if (!showHistory) loadConversations(); }}
                        >
                            MENU
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
                            <div className="answer markdown-content">{renderAnswerMarkdown(msg.answer)}</div>
                            <p className="sources">Sources: {msg.sources?.join(', ')}</p>
                        </div>
                    ))}
                    {loading && <p className="loading">Thinking...</p>}
                </div>

                <form onSubmit={askQuestion} className="chat-compose">
                    <input
                        ref={fileInputRef}
                        type="file"
                        onChange={handleChatFileUpload}
                        style={{ display: 'none' }}
                    />
                    <button
                        type="button"
                        className="compose-icon-btn"
                        onClick={handleComposePlus}
                        aria-label="Add attachment"
                        title="Add attachment"
                    >
                        +
                    </button>
                    <input
                        type="text"
                        placeholder="Ask a question..."
                        value={question}
                        onChange={(e) => setQuestion(e.target.value)}
                    />
                    <button type="submit" className="compose-send-btn" disabled={loading} aria-label="Send message">
                        {loading ? '...' : '>'}
                    </button>
                </form>
            </div>
        </div>
    );
}

export default Chat;
