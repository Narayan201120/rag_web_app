import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';

const API = 'http://127.0.0.1:8000/api';

function renderMarkdownContent(content) {
    const lines = String(content || '').split('\n');
    const nodes = [];
    let listBuffer = [];
    let listType = null;

    const flushList = () => {
        if (!listBuffer.length) return;
        const ListTag = listType === 'ol' ? 'ol' : 'ul';
        nodes.push(
            <ListTag key={`list-${nodes.length}`} className="md-list">
                {listBuffer.map((item, i) => <li key={i}>{item}</li>)}
            </ListTag>
        );
        listBuffer = [];
        listType = null;
    };

    lines.forEach((raw, i) => {
        const line = raw.trim();
        if (!line) {
            flushList();
            return;
        }

        const heading = line.match(/^(#{1,6})\s+(.*)$/);
        if (heading) {
            flushList();
            const level = heading[1].length;
            const text = heading[2];
            if (level === 1) nodes.push(<h1 key={`h1-${i}`}>{text}</h1>);
            else if (level === 2) nodes.push(<h2 key={`h2-${i}`}>{text}</h2>);
            else if (level === 3) nodes.push(<h3 key={`h3-${i}`}>{text}</h3>);
            else if (level === 4) nodes.push(<h4 key={`h4-${i}`}>{text}</h4>);
            else if (level === 5) nodes.push(<h5 key={`h5-${i}`}>{text}</h5>);
            else nodes.push(<h6 key={`h6-${i}`}>{text}</h6>);
            return;
        }

        const ordered = line.match(/^\d+\.\s+(.*)$/);
        if (ordered) {
            if (listType && listType !== 'ol') flushList();
            listType = 'ol';
            listBuffer.push(ordered[1]);
            return;
        }

        const unordered = line.match(/^[-*]\s+(.*)$/);
        if (unordered) {
            if (listType && listType !== 'ul') flushList();
            listType = 'ul';
            listBuffer.push(unordered[1]);
            return;
        }

        flushList();
        nodes.push(<p key={`p-${i}`}>{line}</p>);
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
            window.MathJax.typesetPromise([previewBodyRef.current]).catch(() => {});
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
            const refresh = localStorage.getItem('refresh');
            if (!refresh) {
                throw err;
            }
            try {
                const refreshRes = await axios.post(`${API}/token/refresh/`, { refresh });
                localStorage.setItem('access', refreshRes.data.access);
                return await requestFn(authHeaders());
            } catch (refreshErr) {
                localStorage.removeItem('access');
                localStorage.removeItem('refresh');
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
