import { useState, useEffect, useRef, useCallback } from 'react';
import { apiClient, requestWithRefresh } from '../apiClient';

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


const EXT_ICONS = {
    '.pdf':  { icon: '\u{1F4C4}', label: 'PDF' },
    '.md':   { icon: '\u{1F4DD}', label: 'Markdown' },
    '.txt':  { icon: '\u{1F4C3}', label: 'Text' },
    '.docx': { icon: '\u{1F4C5}', label: 'Word' },
};

function docIcon(filename) {
    const ext = (filename.match(/\.[^.]+$/) || [''])[0].toLowerCase();
    return EXT_ICONS[ext] || { icon: '\u{1F4C4}', label: 'Document' };
}

function Documents({ onCollectionsChange }) {
    const [documents, setDocuments] = useState([]);
    const [file, setFile] = useState(null);
    const [url, setUrl] = useState('');
    const [message, setMessage] = useState('');
    const [taskInfo, setTaskInfo] = useState(null);
    const [previewDoc, setPreviewDoc] = useState(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [collections, setCollections] = useState([]);
    const [confirmDelete, setConfirmDelete] = useState(null);
    const [renaming, setRenaming] = useState(null);
    const [renameValue, setRenameValue] = useState('');
    const renameRef = useRef(null);
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
            const res = await requestWithRefresh((headers) => apiClient.get('/documents/', { headers }));
            setDocuments(res.data.documents);
        } catch (err) {
            setDocuments([]);
            setMessage(err.response?.data?.error || 'Failed to load documents. Please sign in again.');
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
                const res = await requestWithRefresh((headers) => apiClient.get(`/tasks/${taskId}/`, { headers }));
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
        fetchCollections();
        return () => stopPolling();
    }, [fetchDocs, fetchCollections]);

    const handleUpload = async (e) => {
        e.preventDefault();
        if (!file) return;
        const formData = new FormData();
        formData.append('document', file);
        try {
            const res = await requestWithRefresh((headers) => apiClient.post('/upload/', formData, {
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
            const res = await requestWithRefresh((headers) => apiClient.post('/upload-url/', { url: normalizedUrl }, { headers }));
            setMessage(res.data.message || 'URL ingestion task queued.');
            setUrl('');
            startPollingTask(res.data.task_id);
        } catch (err) {
            setMessage(err.response?.data?.error || 'URL upload failed');
        }
    };

    const handleDelete = async (filename) => {
        setConfirmDelete(null);
        try {
            await requestWithRefresh((headers) => apiClient.delete(`/documents/${encodeURIComponent(filename)}/`, { headers }));
            setMessage(`"${filename}" deleted.`);
            fetchDocs();
        } catch (err) {
            setMessage(err.response?.data?.error || 'Delete failed');
        }
    };

    const handleRenameStart = (filename) => {
        setRenaming(filename);
        setRenameValue(filename);
        setTimeout(() => renameRef.current?.select(), 50);
    };

    const handleRenameSubmit = async (filename) => {
        const newName = renameValue.trim();
        if (!newName || newName === filename) {
            setRenaming(null);
            return;
        }
        try {
            await requestWithRefresh((headers) => apiClient.patch(`/documents/${encodeURIComponent(filename)}/rename/`, { new_name: newName }, { headers }));
            setMessage(`Renamed to "${newName}".`);
            setRenaming(null);
            fetchDocs();
        } catch (err) {
            setMessage(err.response?.data?.error || 'Rename failed');
            setRenaming(null);
        }
    };

    const handleRenameKeyDown = (e, filename) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleRenameSubmit(filename);
        } else if (e.key === 'Escape') {
            setRenaming(null);
        }
    };

    const handleMoveToCollection = async (filename, collectionId) => {
        try {
            const res = await requestWithRefresh((headers) => apiClient.put(`/documents/${encodeURIComponent(filename)}/move/`, { collection_id: collectionId }, { headers }));
            const colName = res.data.collection;
            setMessage(colName ? `"${filename}" moved to ${colName}.` : `"${filename}" removed from collection.`);
            fetchDocs();
            onCollectionsChange?.();
        } catch (err) {
            setMessage(err.response?.data?.error || 'Move failed');
        }
    };

    const handleOpen = async (filename) => {
        setPreviewLoading(true);
        try {
            const res = await requestWithRefresh((headers) => apiClient.get(`/documents/${encodeURIComponent(filename)}/`, { headers }));
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
                {documents.map((doc, i) => {
                    const info = docIcon(doc.name);
                    return (
                        <div key={i} className="doc-item">
                            <div className="doc-info">
                                <span className="doc-icon" title={info.label}>{info.icon}</span>
                                <div className="doc-name-col">
                                    {renaming === doc.name ? (
                                        <input
                                            ref={renameRef}
                                            className="doc-rename-input"
                                            value={renameValue}
                                            onChange={(e) => setRenameValue(e.target.value)}
                                            onBlur={() => handleRenameSubmit(doc.name)}
                                            onKeyDown={(e) => handleRenameKeyDown(e, doc.name)}
                                            autoFocus
                                        />
                                    ) : (
                                        <span
                                            className="doc-name"
                                            onClick={() => handleRenameStart(doc.name)}
                                            title="Click to rename"
                                        >
                                            {doc.name}
                                        </span>
                                    )}
                                    <span className="doc-size">{(doc.size_bytes / 1024).toFixed(1)} KB</span>
                                </div>
                            </div>
                            <div className="doc-actions">
                                <select
                                    className="doc-collection-select"
                                    value=""
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        if (val) handleMoveToCollection(doc.name, parseInt(val, 10));
                                        else handleMoveToCollection(doc.name, null);
                                    }}
                                >
                                    <option value="">Move to...</option>
                                    {collections.map((c) => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
                                <button onClick={() => handleOpen(doc.name)} className="open-btn">Open</button>
                                <button onClick={() => setConfirmDelete(doc.name)} className="delete-btn">Delete</button>
                            </div>
                        </div>
                    );
                })}
                {documents.length === 0 && (
                    <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-subtle)', marginTop: '16px', fontFamily: 'var(--font-mono)' }}>
                        No documents indexed yet.
                    </p>
                )}
            </div>

            {confirmDelete && (
                <div className="doc-confirm-overlay" onClick={() => setConfirmDelete(null)}>
                    <div className="doc-confirm-modal" onClick={(e) => e.stopPropagation()}>
                        <p>Delete <strong>{confirmDelete}</strong>?</p>
                        <p className="doc-confirm-sub">This will remove the document and rebuild the index.</p>
                        <div className="doc-confirm-actions">
                            <button className="cancel-btn" onClick={() => setConfirmDelete(null)}>Cancel</button>
                            <button className="delete-btn" onClick={() => handleDelete(confirmDelete)}>Delete</button>
                        </div>
                    </div>
                </div>
            )}

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
