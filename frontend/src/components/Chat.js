import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';

const API = process.env.REACT_APP_API_URL || 'http://127.0.0.1:8000/api';

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

function Chat({ conversations, conversationId, onLoadConversation, onNewConversation, onRefreshConversations }) {
    const [question, setQuestion] = useState('');
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(false);
    const [feedbackState, setFeedbackState] = useState({});
    const fileInputRef = useRef(null);

    const authHeaders = useCallback(() => {
        const token = localStorage.getItem('access');
        return token ? { Authorization: `Bearer ${token}` } : {};
    }, []);

    const requestWithRefresh = useCallback(async (requestFn) => {
        try {
            return await requestFn(authHeaders());
        } catch (err) {
            if (err.response?.status !== 401) throw err;
            try {
                const refreshRes = await axios.post(`${API}/token/refresh/`, {}, { withCredentials: true });
                localStorage.setItem('access', refreshRes.data.access);
                return await requestFn(authHeaders());
            } catch (refreshErr) {
                localStorage.removeItem('access');
                throw refreshErr;
            }
        }
    }, [authHeaders]);

    // Load conversation messages when conversationId changes from parent
    useEffect(() => {
        if (!conversationId) {
            setMessages([]);
            setFeedbackState({});
            return;
        }
        const loadMessages = async () => {
            try {
                const res = await requestWithRefresh((headers) => axios.get(`${API}/chat/conversations/${conversationId}/`, { headers }));
                setMessages(
                    res.data.messages.map((m) => ({
                        question: m.question,
                        answer: m.answer,
                        sources: m.sources,
                    }))
                );
            } catch (err) {
                console.error(err);
            }
        };
        loadMessages();
    }, [conversationId, requestWithRefresh]);

    const askQuestion = async (e) => {
        e.preventDefault();
        if (!question.trim()) return;
        setLoading(true);

        try {
            const body = { question };
            if (conversationId) {
                body.conversation_id = conversationId;
            }
            const res = await requestWithRefresh((headers) => axios.post(`${API}/chat/`, body, { headers }));

            if (res.data.conversation_id) {
                onLoadConversation(res.data.conversation_id, false); // update parent's conversationId without reloading messages
            }

            setMessages((prev) => [
                ...prev,
                {
                    id: res.data.id,
                    question,
                    answer: res.data.answer,
                    sources: res.data.sources,
                },
            ]);
            setQuestion('');
            onRefreshConversations();
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
            const res = await requestWithRefresh((headers) => axios.post(`${API}/upload/`, formData, {
                headers: { ...headers, 'Content-Type': 'multipart/form-data' },
            }));
            alert(res.data.message || `Queued upload for "${selectedFile.name}".`);
        } catch (err) {
            alert(`Upload failed: ${err.response?.data?.error || 'Something went wrong'}`);
        } finally {
            e.target.value = '';
        }
    };

    const submitFeedback = async (chatId, rating) => {
        try {
            await requestWithRefresh((headers) => axios.post(`${API}/chat/${chatId}/feedback/`, { rating }, { headers }));
            setFeedbackState((prev) => ({ ...prev, [chatId]: rating }));
        } catch (err) {
            console.error('Feedback failed:', err);
        }
    };

    return (
        <>
            <header className="top-nav">
                <div className="top-nav-title-container">
                    <h2 className="top-nav-title">Synthesize Your Knowledge</h2>
                </div>
                {messages.length > 0 && (
                    <button className="new-chat-btn" onClick={onNewConversation}>
                        <span className="material-symbols-outlined" style={{ fontSize: '0.875rem' }}>add</span>
                        + New Chat
                    </button>
                )}
            </header>

            <div className="chat-area">
                {messages.map((msg, i) => (
                    <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                        <div className="message-container user-message-wrapper">
                            <div className="user-message">
                                <p>{msg.question}</p>
                            </div>
                        </div>

                        <div className="message-container ai-message-wrapper">
                            <div className="ai-avatar">
                                <span className="material-symbols-outlined ai-avatar-icon">smart_toy</span>
                            </div>
                            <div className="ai-message">
                                {renderAnswerMarkdown(msg.answer)}
                                
                                {msg.sources && msg.sources.length > 0 && (
                                    <div className="citations">
                                        {msg.sources.map((s, sidx) => (
                                            <span key={sidx} className="citation-chip">
                                                <span className="material-symbols-outlined citation-icon">description</span>
                                                [{sidx + 1}] {s}
                                            </span>
                                        ))}
                                    </div>
                                )}

                                {msg.id && (
                                    <div className="ai-actions always-visible">
                                        <button 
                                            className={`ai-action-btn ${feedbackState[msg.id] === 'up' ? 'active-primary' : 'hover-primary'}`} 
                                            onClick={() => submitFeedback(msg.id, 'up')}
                                        >
                                            <span className="material-symbols-outlined" style={{ fontSize: '0.875rem' }}>thumb_up</span>
                                        </button>
                                        <button 
                                            className={`ai-action-btn ${feedbackState[msg.id] === 'down' ? 'active-error' : 'hover-error'}`} 
                                            onClick={() => submitFeedback(msg.id, 'down')}
                                        >
                                            <span className="material-symbols-outlined" style={{ fontSize: '0.875rem' }}>thumb_down</span>
                                        </button>
                                        <button 
                                            className="ai-action-btn hover-on-surface ai-action-copy"
                                            onClick={() => navigator.clipboard.writeText(msg.answer)}
                                        >
                                            <span className="material-symbols-outlined" style={{ fontSize: '0.875rem' }}>content_copy</span> Copy
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
                
                {loading && (
                    <div className="message-container ai-message-wrapper" style={{ marginTop: '2rem' }}>
                        <div className="ai-avatar">
                            <span className="material-symbols-outlined ai-avatar-icon animate-pulse">smart_toy</span>
                        </div>
                        <div className="ai-message">
                            <p className="animate-pulse">Analyzing context...</p>
                        </div>
                    </div>
                )}
            </div>

            <div className="compose-area">
                <form className="compose-container" onSubmit={askQuestion}>
                    <div className="compose-box">
                        <input
                            ref={fileInputRef}
                            type="file"
                            onChange={handleChatFileUpload}
                            style={{ display: 'none' }}
                        />
                        <button type="button" className="attach-btn" onClick={handleComposePlus} title="Upload Document">
                            <span className="material-symbols-outlined">add_circle</span>
                        </button>
                        <div className="input-wrapper">
                            <textarea
                                className="compose-input"
                                placeholder="Ask about your documents..."
                                rows="1"
                                value={question}
                                onChange={(e) => setQuestion(e.target.value)}
                                onKeyDown={(e) => {
                                    if(e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        askQuestion(e);
                                    }
                                }}
                            ></textarea>
                        </div>
                        <button type="submit" className="send-btn" disabled={loading} title="Send Message">
                            <span className="material-symbols-outlined" style={{ fontSize: '1.125rem', fontVariationSettings: "'FILL' 1" }}>arrow_upward</span>
                        </button>
                    </div>
                    <div className="footer-text">
                        <span>AI responses can be inaccurate. Please verify critical information.</span>
                    </div>
                </form>
            </div>
        </>
    );
}

export default Chat;
