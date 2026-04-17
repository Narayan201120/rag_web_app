import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';

const API = process.env.REACT_APP_API_URL || 'http://127.0.0.1:8000/api';

// Render LaTeX using KaTeX (loaded from CDN in index.html).
// Returns an HTML string on success, or null if KaTeX isn't ready.
function katexRender(latex, display) {
    try {
        if (window.katex) {
            return window.katex.renderToString(latex.trim(), {
                displayMode: display,
                throwOnError: false,
            });
        }
    } catch (e) { /* ignore */ }
    return null;
}

// Render a single text line, turning $...$ into inline KaTeX elements.
function renderLine(text, keyPrefix) {
    const parts = [];
    let rest = text;
    let idx = 0;
    while (rest.length > 0) {
        const s = rest.indexOf('$');
        if (s === -1) { parts.push(<span key={`${keyPrefix}-t${idx}`}>{rest}</span>); break; }
        if (s > 0) parts.push(<span key={`${keyPrefix}-t${idx}`}>{rest.slice(0, s)}</span>);
        const e = rest.indexOf('$', s + 1);
        if (e === -1) { parts.push(<span key={`${keyPrefix}-t${idx}`}>{rest.slice(s)}</span>); break; }
        const latex = rest.slice(s + 1, e);
        const html = katexRender(latex, false);
        if (html) {
            parts.push(<span key={`${keyPrefix}-m${idx}`} dangerouslySetInnerHTML={{ __html: html }} />);
        } else {
            parts.push(<span key={`${keyPrefix}-m${idx}`}><code>{`$${latex}$`}</code></span>);
        }
        rest = rest.slice(e + 1);
        idx++;
    }
    // If no math found, return the raw string for simpler DOM output.
    if (parts.length === 1 && parts[0].props?.children === text) return text;
    return parts;
}

function renderMarkdownContent(content) {
    const text = String(content || '');
    const nodes = [];
    let listBuffer = [];
    let listType = null;
    let pos = 0;

    const flushList = () => {
        if (!listBuffer.length) return;
        const Tag = listType === 'ol' ? 'ol' : 'ul';
        nodes.push(
            <Tag key={`list-${nodes.length}`} className="md-list">
                {listBuffer.map((item, i) => <li key={i}>{renderLine(item, `li-${i}`)}</li>)}
            </Tag>
        );
        listBuffer = [];
        listType = null;
    };

    // First pass: split on $$...$$ display blocks (which may span multiple lines).
    const segments = [];
    while (pos < text.length) {
        const start = text.indexOf('$$', pos);
        if (start === -1) {
            text.slice(pos).split('\n').forEach(l => segments.push({ type: 'line', text: l }));
            break;
        }
        if (start > pos) {
            text.slice(pos, start).split('\n').forEach(l => segments.push({ type: 'line', text: l }));
        }
        const end = text.indexOf('$$', start + 2);
        if (end === -1) {
            text.slice(start).split('\n').forEach(l => segments.push({ type: 'line', text: l }));
            break;
        }
        segments.push({ type: 'display', text: text.slice(start + 2, end).trim() });
        pos = end + 2;
    }

    // Second pass: render each segment.
    segments.forEach((seg, i) => {
        if (seg.type === 'display') {
            flushList();
            const html = katexRender(seg.text, true);
            if (html) {
                nodes.push(<div key={`dm-${i}`} className="md-math-block" dangerouslySetInnerHTML={{ __html: html }} />);
            } else {
                nodes.push(<pre key={`dm-${i}`} className="md-math-block"><code>{seg.text}</code></pre>);
            }
            return;
        }

        const line = seg.text.trim();
        if (!line) { flushList(); return; }

        const heading = line.match(/^(#{1,6})\s+(.*)$/);
        if (heading) {
            flushList();
            const level = heading[1].length;
            const Tag = `h${Math.min(6, level)}`;
            nodes.push(<Tag key={`h-${i}`}>{renderLine(heading[2], `h-${i}`)}</Tag>);
            return;
        }

        const ordered = line.match(/^\d+\.\s+(.*)$/);
        if (ordered) {
            if (listType && listType !== 'ol') flushList();
            listType = 'ol'; listBuffer.push(ordered[1]); return;
        }

        const unordered = line.match(/^[-*]\s+(.*)$/);
        if (unordered) {
            if (listType && listType !== 'ul') flushList();
            listType = 'ul'; listBuffer.push(unordered[1]); return;
        }

        const blockquote = line.match(/^>\s+(.*)/);
        if (blockquote) {
            flushList();
            nodes.push(<blockquote key={`bq-${i}`} className="md-blockquote">{renderLine(blockquote[1], `bq-${i}`)}</blockquote>);
            return;
        }

        flushList();
        nodes.push(<p key={`p-${i}`}>{renderLine(line, `p-${i}`)}</p>);
    });

    flushList();
    return nodes;
}


function Documents() {
    const [documents, setDocuments] = useState([]);
    const [file, setFile] = useState(null);
    const [url, setUrl] = useState('');
    const [message, setMessage] = useState('');
    const [taskInfo, setTaskInfo] = useState(null);
    const [previewDoc, setPreviewDoc] = useState(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const pollRef = useRef(null);
    const previewBodyRef = useRef(null);

    useEffect(() => {
        if (window.MathJax) return;
        window.MathJax = {
            tex: {
                inlineMath: [['$', '$'], ['\\(', '\\)']],
                displayMath: [['$$', '$$'], ['\\[', '\\]']],
            },
            svg: { fontCache: 'global' },
        };
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js';
        script.async = true;
        document.head.appendChild(script);
    }, []);

    useEffect(() => {
        if (!previewDoc || previewDoc.extension !== '.md') return;
        if (!window.MathJax || !previewBodyRef.current) return;
        if (window.MathJax.typesetPromise) {
            window.MathJax.typesetClear?.([previewBodyRef.current]);
            window.MathJax.typesetPromise([previewBodyRef.current]).catch(() => { });
        }
    }, [previewDoc]);

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

    const normalizeHttpUrl = (rawValue) => {
        const trimmed = (rawValue || '').trim();
        if (!trimmed) return null;

        const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

        try {
            const parsed = new URL(withScheme);
            if (!['http:', 'https:'].includes(parsed.protocol)) {
                return null;
            }
            return parsed.toString();
        } catch {
            return null;
        }
    };

    const fetchDocs = useCallback(async () => {
        try {
            const res = await requestWithRefresh((headers) => axios.get(`${API}/documents/`, { headers }));
            setDocuments(res.data.documents);
        } catch (err) {
            setDocuments([]);
            setMessage(err.response?.data?.error || 'Failed to load documents. Please sign in again.');
        }
    }, [requestWithRefresh]);

    const stopPolling = () => {
        if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
        }
    };

    const startPollingTask = (taskId) => {
        stopPolling();
        setTaskInfo({
            id: taskId,
            status: 'pending',
            progress: 0,
            message: 'Task queued...',
            error: '',
        });

        pollRef.current = setInterval(async () => {
            try {
                const res = await requestWithRefresh((headers) => axios.get(`${API}/tasks/${taskId}/`, { headers }));
                const task = res.data;
                setTaskInfo({
                    id: taskId,
                    status: task.status,
                    progress: task.progress ?? 0,
                    message: task.message || '',
                    error: task.error || '',
                });

                if (['completed', 'failed', 'cancelled'].includes(task.status)) {
                    stopPolling();
                    if (task.status === 'completed') {
                        setMessage(task.result?.message || 'Task completed successfully.');
                        fetchDocs();
                    } else {
                        setMessage(task.error || `Task ${task.status}.`);
                    }
                }
            } catch (err) {
                stopPolling();
                setMessage('Failed to fetch task status.');
            }
        }, 1500);
    };

    useEffect(() => {
        fetchDocs();
        return () => stopPolling();
    }, [fetchDocs]);

    const handleUpload = async (e) => {
        e.preventDefault();
        if (!file) return;
        const formData = new FormData();
        formData.append('document', file);
        try {
            const res = await requestWithRefresh((headers) => axios.post(`${API}/upload/`, formData, {
                headers: { ...headers, 'Content-Type': 'multipart/form-data' },
            }));
            setMessage(res.data.message || 'Upload task queued.');
            setFile(null);
            startPollingTask(res.data.task_id);
        } catch (err) {
            setMessage(err.response?.data?.error || 'Upload failed');
        }
    };

    const handleUrlUpload = async (e) => {
        e.preventDefault();
        const normalizedUrl = normalizeHttpUrl(url);
        if (!normalizedUrl) {
            setMessage('Please enter a valid http(s) URL.');
            return;
        }
        try {
            const res = await requestWithRefresh((headers) => axios.post(`${API}/upload-url/`, { url: normalizedUrl }, { headers }));
            setMessage(res.data.message || 'URL ingestion task queued.');
            setUrl('');
            startPollingTask(res.data.task_id);
        } catch (err) {
            setMessage(err.response?.data?.error || 'URL upload failed');
        }
    };

    const handleDelete = async (filename) => {
        if (!window.confirm(`Delete "${filename}"?`)) return;
        try {
            await requestWithRefresh((headers) => axios.delete(`${API}/documents/${encodeURIComponent(filename)}/`, { headers }));
            setMessage(`"${filename}" deleted.`);
            fetchDocs();
        } catch (err) {
            setMessage(err.response?.data?.error || 'Delete failed');
        }
    };

    const handleOpen = async (filename) => {
        setPreviewLoading(true);
        try {
            const res = await requestWithRefresh((headers) => axios.get(`${API}/documents/${encodeURIComponent(filename)}/`, { headers }));
            setPreviewDoc(res.data);
        } catch (err) {
            setMessage(err.response?.data?.error || 'Failed to open document.');
        } finally {
            setPreviewLoading(false);
        }
    };

    const closePreview = () => {
        setPreviewDoc(null);
    };

    return (
        <div className="documents-container">
            <h2>Documents</h2>
            {message && <p className="message">{message}</p>}
            {taskInfo && (
                <div className="message">
                    <div>
                        Task: <strong>{taskInfo.status}</strong> ({taskInfo.progress}%)
                    </div>
                    <div>{taskInfo.message || (taskInfo.error ? `Error: ${taskInfo.error}` : '')}</div>
                </div>
            )}

            <div className="upload-section">
                <form onSubmit={handleUpload}>
                    <input type="file" onChange={(e) => setFile(e.target.files[0])} />
                    <button type="submit">Upload File</button>
                </form>
                <form onSubmit={handleUrlUpload}>
                    <input
                        type="text"
                        placeholder="https://example.com/article"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                    />
                    <button type="submit">Upload URL</button>
                </form>
            </div>

            <div className="doc-list">
                <h3>Your Documents ({documents.length})</h3>
                {documents.map((doc, i) => (
                    <div key={i} className="doc-item">
                        <span>{doc.name} ({(doc.size_bytes / 1024).toFixed(1)} KB)</span>
                        <div className="doc-actions">
                            <button onClick={() => handleOpen(doc.name)} className="open-btn">Open</button>
                            <button onClick={() => handleDelete(doc.name)} className="delete-btn">Delete</button>
                        </div>
                    </div>
                ))}
                {documents.length === 0 && (
                    <p style={{ fontSize: '0.8125rem', color: '#737380', marginTop: '16px', fontFamily: 'JetBrains Mono' }}>
                        No documents indexed yet.
                    </p>
                )}
            </div>

            {(previewLoading || previewDoc) && (
                <div className="doc-preview-overlay" onClick={closePreview}>
                    <div className="doc-preview-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="doc-preview-header">
                            <h3>{previewDoc?.name || 'Opening document...'}</h3>
                            <button className="close-preview-btn" onClick={closePreview}>Close</button>
                        </div>
                        <div className="doc-preview-body">
                            {previewLoading ? (
                                <p>Loading document content...</p>
                            ) : (
                                <>
                                    {previewDoc?.extension === '.md' ? (
                                        <div className="md-preview" ref={previewBodyRef}>
                                            {renderMarkdownContent(previewDoc?.content || '')}
                                        </div>
                                    ) : (
                                        <pre>{previewDoc?.content || 'No text extracted from this document.'}</pre>
                                    )}
                                    {previewDoc?.truncated && (
                                        <p className="preview-note">
                                            Showing first 20,000 characters.
                                        </p>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default Documents;
