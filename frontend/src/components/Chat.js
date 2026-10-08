import { useState, useEffect, useRef, useCallback } from 'react';
import { apiClient, requestWithRefresh, streamChatEvents } from '../apiClient';
import DocumentPreview from './DocumentPreview';

const EXAMPLE_PROMPTS = [
    'Which documents cover our refund policy, and what deadline do they set?',
    'Summarise the onboarding steps my documents describe.',
    'Where do my documents disagree about data retention?'
];

/* display math first, then inline math. Without the \n guard a stray dollar sign
   can swallow the rest of a line. */
const INLINE_MD_RE = /(\$\$[^$]+\$\$|\$[^$\n]+\$|\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`]+`)/g;
const HEADING_RE = /^#{1,6}\s+/;
const BULLET_RE = /^[-*]\s+/;
const ORDERED_RE = /^\d+[.)]\s+/;
const BLOCKQUOTE_RE = /^>\s?/;
const DISPLAY_MATH_RE = /^\$\$([\s\S]+)\$\$$/;

/* KaTeX ships from index.html, so it is usually but not always there yet. Every
   call is guarded and falls back to the ASCII substitution. */
function renderKatex(tex, displayMode) {
    const katex = typeof window !== 'undefined' ? window.katex : null;
    if (!katex || typeof katex.renderToString !== 'function') return null;
    try {
        /* `trust` stays off (the default) and `strict` is relaxed so unknown
           commands render in red instead of throwing. That is what makes
           innerHTML safe here. */
        return katex.renderToString(tex, {
            displayMode,
            throwOnError: false,
            output: 'html',
            strict: 'ignore'
        });
    } catch {
        return null;
    }
}

function renderMath(tex, displayMode) {
    const html = renderKatex(tex, displayMode);
    if (html !== null) {
        return (
            <span
                className={displayMode ? 'chat-math-display' : 'chat-math-inline'}
                /* KaTeX HTML, escaped by KaTeX itself. See renderKatex. */
                dangerouslySetInnerHTML={{ __html: html }}
            />
        );
    }
    return <span className={displayMode ? 'chat-math-display' : 'chat-math-inline'}>{renderMathAscii(tex)}</span>;
}

function renderMathAscii(mathText) {
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
    return String(text || '').split(INLINE_MD_RE).map((part, idx) => {
        if (!part) return null;
        const key = `${idx}`;

        if (part.startsWith('$$') && part.endsWith('$$')) {
            return renderMath(part.slice(2, -2).trim(), false);
        }
        if (part.startsWith('$') && part.endsWith('$') && part.length > 2) {
            return renderMath(part.slice(1, -1).trim(), false);
        }
        if (part.startsWith('**') && part.endsWith('**')) {
            return <strong key={key}>{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith('*') && part.endsWith('*')) {
            return <em key={key}>{part.slice(1, -1)}</em>;
        }
        if (part.startsWith('`') && part.endsWith('`')) {
            return <code key={key}>{part.slice(1, -1)}</code>;
        }
        return <span key={key}>{part}</span>;
    });
}

/* Model output is untrusted, so heading depth is clamped: `#`, `##` and `####`
   all render as h3 and the answer can never outrank the page chrome. */
function renderAnswerMarkdown(answer) {
    const lines = String(answer || '').split('\n');
    const blocks = [];

    for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i].trim();
        if (!line) continue;

        const displayMath = line.match(DISPLAY_MATH_RE);
        if (displayMath) {
            blocks.push(<div key={`math-${i}`}>{renderMath(displayMath[1].trim(), true)}</div>);
            continue;
        }

        if (HEADING_RE.test(line)) {
            blocks.push(<h3 key={`h3-${i}`}>{renderInlineMarkdown(line.replace(HEADING_RE, ''))}</h3>);
            continue;
        }

        if (BULLET_RE.test(line) || ORDERED_RE.test(line)) {
            const ordered = ORDERED_RE.test(line);
            const strip = ordered ? ORDERED_RE : BULLET_RE;
            const items = [line.replace(strip, '')];
            let j = i + 1;
            while (j < lines.length && strip.test(lines[j].trim())) {
                items.push(lines[j].trim().replace(strip, ''));
                j += 1;
            }
            const children = items.map((item, idx) => (
                <li key={`li-${i}-${idx}`}>{renderInlineMarkdown(item)}</li>
            ));
            blocks.push(ordered ? <ol key={`ol-${i}`}>{children}</ol> : <ul key={`ul-${i}`}>{children}</ul>);
            i = j - 1;
            continue;
        }

        if (BLOCKQUOTE_RE.test(line)) {
            blocks.push(<blockquote key={`bq-${i}`}>{renderInlineMarkdown(line.replace(BLOCKQUOTE_RE, ''))}</blockquote>);
            continue;
        }

        blocks.push(<p key={`p-${i}`}>{renderInlineMarkdown(line)}</p>);
    }

    return blocks;
}

/* source_statuses arrives after sources. Without it (older backend, or a live
   stream) every source counts as available. */
function isSourceStale(message, index) {
    const status = message.source_statuses?.[index];
    return Boolean(status) && status.available === false;
}

function errorText(err) {
    return err?.response?.data?.error || err?.message || 'Something went wrong';
}

function isAbortError(err) {
    return err?.name === 'AbortError' || err?.code === 20;
}

function Chat({ conversations, conversationId, onLoadConversation, onNewConversation, onRefreshConversations }) {
    const [question, setQuestion] = useState('');
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(false);
    /* 'thinking' until the first token lands, 'answering' while tokens flow. */
    const [streamStatus, setStreamStatus] = useState('idle');
    const [streamingAnswer, setStreamingAnswer] = useState(null);
    const [feedbackState, setFeedbackState] = useState({});
    const [askError, setAskError] = useState(null);
    const [uploadNote, setUploadNote] = useState(null);
    const [previewName, setPreviewName] = useState(null);
    const [announcement, setAnnouncement] = useState('');

    const fileInputRef = useRef(null);
    const composerRef = useRef(null);
    const chatEndRef = useRef(null);
    const abortRef = useRef(null);

    const activeConversation = conversationId
        ? (conversations || []).find((c) => String(c.id) === String(conversationId))
        : null;
    const conversationTitle = (activeConversation?.title || '').trim() || 'New chat';

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, streamingAnswer]);

    // Leaving the page mid-stream must not leave the request running.
    useEffect(() => () => abortRef.current?.abort(), []);

    useEffect(() => {
        const onKeyDown = (e) => {
            if (e.key === 'Escape' && previewName) setPreviewName(null);
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [previewName]);

    // Load conversation messages when conversationId changes from parent
    useEffect(() => {
        if (!conversationId) {
            setMessages([]);
            setFeedbackState({});
            return;
        }
        const loadMessages = async () => {
            try {
                const res = await requestWithRefresh((headers) => apiClient.get(`/chat/conversations/${conversationId}/`, { headers }));
                setMessages(
                    res.data.messages.map((m) => ({
                        id: m.id,
                        question: m.question,
                        answer: m.answer,
                        sources: m.sources,
                        source_statuses: m.source_statuses,
                    }))
                );
            } catch (err) {
                console.error(err);
            }
        };
        loadMessages();
    }, [conversationId]);

    const askQuestion = useCallback(
        async (askedQuestion) => {
            const trimmed = String(askedQuestion || '').trim();
            if (!trimmed || loading) return;

            setLoading(true);
            setAskError(null);
            setUploadNote(null);
            setStreamStatus('thinking');
            setStreamingAnswer({ question: trimmed, answer: '', sources: [], id: null, conversationId: null });

            const controller = new AbortController();
            abortRef.current = controller;
            let sawToken = false;

            try {
                const body = { question: trimmed };
                if (conversationId) {
                    body.conversation_id = conversationId;
                }

                for await (const event of streamChatEvents(body, { signal: controller.signal })) {
                    if (event.error) {
                        throw new Error(event.error);
                    }
                    if (event.token) {
                        if (!sawToken) {
                            sawToken = true;
                            setStreamStatus('answering');
                        }
                        setStreamingAnswer((prev) => (prev ? { ...prev, answer: prev.answer + event.token } : null));
                    }
                    if (event.done) {
                        setMessages((prev) => [
                            ...prev,
                            {
                                id: event.id,
                                conversationId: event.conversation_id,
                                question: trimmed,
                                answer: event.answer,
                                sources: event.sources || [],
                                source_statuses: event.source_statuses,
                            }
                        ]);
                        setStreamingAnswer(null);
                        setStreamStatus('idle');
                        setAnnouncement('Answer ready.');
                        if (event.conversation_id) {
                            onLoadConversation(event.conversation_id);
                        }
                    }
                }
                onRefreshConversations();
            } catch (err) {
                setStreamingAnswer(null);
                setStreamStatus('idle');

                /* The stop button is not a failure, so an abort is silent. The
                   question goes back in the composer either way: nothing was
                   lost and resending is one keypress. */
                if (isAbortError(err) || controller.signal.aborted) {
                    setQuestion(trimmed);
                } else {
                    setQuestion(trimmed);
                    setAskError({ message: errorText(err), question: trimmed });
                    setAnnouncement(`Error: ${errorText(err)}`);
                }
            } finally {
                if (abortRef.current === controller) abortRef.current = null;
                setLoading(false);
            }
        },
        [conversationId, loading, onLoadConversation, onRefreshConversations]
    );

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!question.trim() || loading) return;
        const asked = question;
        setQuestion('');
        askQuestion(asked);
    };

    const handleStop = () => {
        abortRef.current?.abort();
    };

    const handleRetry = () => {
        const failed = askError?.question;
        if (!failed) return;
        setQuestion('');
        setAskError(null);
        askQuestion(failed);
    };

    const applyExample = (prompt) => {
        setQuestion(prompt);
        composerRef.current?.focus();
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
            const res = await requestWithRefresh((headers) =>
                apiClient.post('/upload/', formData, {
                    headers: { ...headers, 'Content-Type': 'multipart/form-data' }
                })
            );
            setUploadNote({
                tone: 'ok',
                text: res.data.message || `Queued "${selectedFile.name}" for indexing.`
            });
        } catch (err) {
            setUploadNote({ tone: 'error', text: `Upload failed: ${errorText(err)}` });
        } finally {
            e.target.value = '';
        }
    };

    const submitFeedback = async (chatId, rating) => {
        try {
            await requestWithRefresh((headers) => apiClient.post(`/chat/${chatId}/feedback/`, { rating }, { headers }));
            setFeedbackState((prev) => ({ ...prev, [chatId]: rating }));
        } catch (err) {
            console.error('Feedback failed:', err);
        }
    };

    /* Chips live inside the answer bubble. */
    const renderChips = (message, keyPrefix) => (
        <div className="chat-chips">
            {message.sources.map((source, sidx) => {
                const stale = isSourceStale(message, sidx);
                return (
                    <button
                        type="button"
                        key={`${keyPrefix}-chip-${sidx}`}
                        className={`chat-chip${stale ? ' chat-chip-stale' : ''}`}
                        onClick={() => setPreviewName(source)}
                        title={stale ? 'No longer indexed' : `Open ${source}`}
                    >
                        <span className="material-symbols-outlined chat-chip-icon" aria-hidden="true">description</span>
                        [{sidx + 1}] {source}
                    </button>
                );
            })}
        </div>
    );

    /* The rail is a sibling of the answer, not a child, so the grid can put it
       in the margin column. */
    const renderRail = (message, keyPrefix) => (
        <aside className="chat-citation-rail" aria-label="Sources for this answer">
            {message.sources.map((source, sidx) => {
                const stale = isSourceStale(message, sidx);
                return (
                    <button
                        type="button"
                        key={`${keyPrefix}-rail-${sidx}`}
                        className={`chat-citation-card${stale ? ' chat-citation-card-stale' : ''}`}
                        onClick={() => setPreviewName(source)}
                        aria-label={`Open source ${sidx + 1}: ${source}`}
                    >
                        <span className="chat-citation-index" aria-hidden="true">{sidx + 1}</span>
                        <span className="chat-citation-text">
                            <span className="chat-citation-name">{source}</span>
                            <span className="chat-citation-state">
                                <span className={`chat-citation-dot${stale ? ' chat-citation-dot-stale' : ''}`} aria-hidden="true" />
                                {stale ? 'Missing from index' : 'Available'}
                            </span>
                        </span>
                    </button>
                );
            })}
        </aside>
    );

    const showEmptyState = messages.length === 0 && !streamingAnswer;

    return (
        <>
            <header className="chat-header">
                <div className="chat-header-leading">
                    <h2 className="chat-header-title">{conversationTitle}</h2>
                </div>
                {(messages.length > 0 || conversationId) && (
                    <button type="button" className="dm-btn dm-btn-secondary dm-btn-sm" onClick={onNewConversation}>
                        <span className="material-symbols-outlined chat-header-new-icon" aria-hidden="true">add</span>
                        New chat
                    </button>
                )}
            </header>

            <div className="chat-thread" role="log" aria-label="Conversation" aria-live="off">
                {messages.map((msg, i) => (
                    <div key={msg.id ?? i} className="chat-turn">
                        <div className="chat-part chat-part-user">
                            <div className="chat-user-message">
                                <p>{msg.question}</p>
                            </div>
                        </div>

                        <div className="chat-part chat-part-answer">
                            <span className="chat-avatar" aria-hidden="true">
                                <span className="material-symbols-outlined chat-avatar-icon">smart_toy</span>
                            </span>
                            <div className="chat-answer">
                                {renderAnswerMarkdown(msg.answer)}

                                {msg.sources && msg.sources.length > 0 && renderChips(msg, `m${i}`)}

                                {msg.id && (
                                    <div className="chat-actions">
                                        <button
                                            type="button"
                                            className={`chat-action-btn ${feedbackState[msg.id] === 'up' ? 'chat-action-picked' : 'chat-action-hovers'}`}
                                            onClick={() => submitFeedback(msg.id, 'up')}
                                            aria-label="Good answer"
                                            aria-pressed={feedbackState[msg.id] === 'up'}
                                            title="Good answer"
                                        >
                                            <span className="material-symbols-outlined chat-action-icon" aria-hidden="true">thumb_up</span>
                                        </button>
                                        <button
                                            type="button"
                                            className={`chat-action-btn ${feedbackState[msg.id] === 'down' ? 'chat-action-picked chat-action-picked-bad' : 'chat-action-hovers chat-action-hovers-bad'}`}
                                            onClick={() => submitFeedback(msg.id, 'down')}
                                            aria-label="Bad answer"
                                            aria-pressed={feedbackState[msg.id] === 'down'}
                                            title="Bad answer"
                                        >
                                            <span className="material-symbols-outlined chat-action-icon" aria-hidden="true">thumb_down</span>
                                        </button>
                                        <button
                                            type="button"
                                            className="chat-action-btn chat-action-hovers chat-action-copy"
                                            onClick={() => navigator.clipboard.writeText(msg.answer)}
                                            aria-label="Copy answer"
                                            title="Copy answer"
                                        >
                                            <span className="material-symbols-outlined chat-action-icon" aria-hidden="true">content_copy</span>
                                            Copy
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        {msg.sources && msg.sources.length > 0 && renderRail(msg, `m${i}`)}
                    </div>
                ))}

                {streamingAnswer && (
                    <div className="chat-turn chat-turn-norail">
                        <div className="chat-part chat-part-user">
                            <div className="chat-user-message">
                                <p>{streamingAnswer.question}</p>
                            </div>
                        </div>
                        <div className="chat-part chat-part-answer">
                            <span className="chat-avatar" aria-hidden="true">
                                <span className="material-symbols-outlined chat-avatar-icon">smart_toy</span>
                            </span>
                            <div className="chat-answer">
                                <p className="chat-stream-status">
                                    <span className="dm-spinner" aria-hidden="true" />
                                    {streamStatus === 'thinking' ? 'Thinking' : 'Answering'}
                                </p>
                                {streamingAnswer.answer ? renderAnswerMarkdown(streamingAnswer.answer) : null}
                            </div>
                        </div>
                    </div>
                )}

                {showEmptyState && (
                    <div className="chat-empty">
                        <h3 className="chat-empty-title">Ask your documents</h3>
                        <p className="chat-empty-body">
                            Answers come from the files you indexed. Pick a question to start, or write your own.
                        </p>
                        <ul className="chat-empty-prompts">
                            {EXAMPLE_PROMPTS.map((prompt) => (
                                <li key={prompt}>
                                    <button type="button" className="chat-empty-prompt" onClick={() => applyExample(prompt)}>
                                        <span className="material-symbols-outlined chat-empty-prompt-icon" aria-hidden="true">north_east</span>
                                        {prompt}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                <div ref={chatEndRef} />
            </div>

            <span className="chat-sr-only" role="status" aria-live="polite">{announcement}</span>

            <div className="chat-composer">
                <form className="chat-compose-form" onSubmit={handleSubmit}>
                    {askError && (
                        <div className="chat-inline-error" role="alert">
                            <span className="material-symbols-outlined" aria-hidden="true">error</span>
                            <span className="chat-inline-error-text">{askError.message}</span>
                            <button type="button" className="dm-btn dm-btn-primary dm-btn-sm chat-inline-retry" onClick={handleRetry}>
                                Retry
                            </button>
                        </div>
                    )}

                    {uploadNote && (
                        <div className={`chat-upload-note${uploadNote.tone === 'error' ? ' chat-upload-note-error' : ''}`} role="status">
                            {uploadNote.text}
                        </div>
                    )}

                    <div className="chat-compose-box">
                        <input
                            ref={fileInputRef}
                            type="file"
                            onChange={handleChatFileUpload}
                            style={{ display: 'none' }}
                        />
                        <button
                            type="button"
                            className="dm-btn dm-btn-ghost dm-btn-icon chat-attach-btn"
                            onClick={handleComposePlus}
                            aria-label="Upload a document"
                            title="Upload document"
                        >
                            <span className="material-symbols-outlined" aria-hidden="true">add_circle</span>
                        </button>
                        <div className="chat-input-wrap">
                            <textarea
                                ref={composerRef}
                                className="chat-compose-input"
                                aria-label="Ask a question about your documents"
                                placeholder="Ask about your documents..."
                                rows="1"
                                value={question}
                                onChange={(e) => setQuestion(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSubmit(e);
                                    }
                                }}
                            ></textarea>
                        </div>
                        {loading ? (
                            <button type="button" className="dm-btn dm-btn-primary dm-btn-icon dm-btn-lg chat-send-btn chat-stop-btn" onClick={handleStop} aria-label="Stop generating" title="Stop generating">
                                <span
                                    className="material-symbols-outlined chat-send-icon"
                                    aria-hidden="true"
                                >
                                    stop
                                </span>
                            </button>
                        ) : (
                            <button type="submit" className="dm-btn dm-btn-primary dm-btn-icon dm-btn-lg chat-send-btn" disabled={!question.trim()} aria-label="Send message" title="Send message">
                                <span
                                    className="material-symbols-outlined chat-send-icon"
                                    aria-hidden="true"
                                >
                                    arrow_upward
                                </span>
                            </button>
                        )}
                    </div>
                    <div className="chat-compose-note">
                        <span>AI responses can be inaccurate. Please verify critical information.</span>
                    </div>
                </form>
            </div>

            {previewName && <DocumentPreview name={previewName} onClose={() => setPreviewName(null)} />}
        </>
    );
}

export default Chat;