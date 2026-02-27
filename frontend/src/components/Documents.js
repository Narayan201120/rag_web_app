import { useState, useEffect, useRef } from 'react';
import axios from 'axios';

const API = 'http://127.0.0.1:8000/api';

function Documents() {
    const [documents, setDocuments] = useState([]);
    const [file, setFile] = useState(null);
    const [url, setUrl] = useState('');
    const [message, setMessage] = useState('');
    const [taskInfo, setTaskInfo] = useState(null);
    const [previewDoc, setPreviewDoc] = useState(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const pollRef = useRef(null);

    const authHeaders = () => {
        const token = localStorage.getItem('access');
        return token ? { Authorization: `Bearer ${token}` } : {};
    };

    const requestWithRefresh = async (requestFn) => {
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
    };

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

    const fetchDocs = async () => {
        try {
            const res = await requestWithRefresh((headers) => axios.get(`${API}/documents/`, { headers }));
            setDocuments(res.data.documents);
        } catch (err) {
            setDocuments([]);
            setMessage(err.response?.data?.error || 'Failed to load documents. Please sign in again.');
        }
    };

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
    }, []);

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
                                    <pre>{previewDoc?.content || 'No text extracted from this document.'}</pre>
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
