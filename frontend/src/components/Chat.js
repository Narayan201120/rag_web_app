import { useState, useEffect } from 'react';
import axios from 'axios';

const API = 'http://127.0.0.1:8000/api';

function Chat() {
    const [question, setQuestion] = useState('');
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(false);

    const token = localStorage.getItem('access');

    const askQuestion = async (e) => {
        e.preventDefault();
        if (!question.trim()) return;
        setLoading(true);
        try {
            const res = await axios.post(
                `${API}/chat/`,
                { question },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            setMessages([...messages, {
                question: question,
                answer: res.data.answer,
                sources: res.data.sources,
            }]);
            setQuestion('');
        } catch (err) {
            alert('Error: ' + (err.response?.data?.error || 'Something went wrong'));
        }
        setLoading(false);
    };

    return (
        <div className="chat-container">
            <h2>💬 Chat with your documents</h2>
            <div className="messages">
                {messages.map((msg, i) => (
                    <div key={i} className="message">
                        <p className="question">🧑 {msg.question}</p>
                        <p className="answer">🤖 {msg.answer}</p>
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
    );
}

export default Chat;