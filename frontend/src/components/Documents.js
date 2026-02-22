import { useState, useEffect } from 'react';
import axios from 'axios';

const API = 'http://127.0.0.1:8000/api';

function Documents() {
    const [documents, setDocuments] = useState([]);
    const [file, setFile] = useState(null);
    const [url, setUrl] = useState('');
    const [message, setMessage] = useState('');
    const token = localStorage.getItem('access');
    const headers = { Authorization: `Bearer ${token}` };

    const fetchDocs = async () => {
        try {
            const res = await axios.get(`${API}/documents/`, { headers });
            setDocuments(res.data.documents);
        } catch (err) {
            console.error(err);
        }
    };

    useEffect(() => { fetchDocs(); }, []);

    const handleUpload = async (e) => {
        e.preventDefault();
        if (!file) return;
        const formData = new FormData();
        formData.append('file', file);
        try {
            const res = await axios.post(`${API}/upload/`, formData, {
                headers: { ...headers, 'Content-Type': 'multipart/form-data' },
            });
            setMessage(res.data.message);
            setFile(null);
            fetchDocs();
        } catch (err) {
            setMessage(err.response?.data?.error || 'Upload failed');
        }
    };

    const handleUrlUpload = async (e) => {
        e.preventDefault();
        if (!url.trim()) return;
        try {
            const res = await axios.post(`${API}/upload-url/`, { url }, { headers });
            setMessage(res.data.message);
            setUrl('');
            fetchDocs();
        } catch (err) {
            setMessage(err.response?.data?.error || 'URL upload failed');
        }
    };

    const handleDelete = async (filename) => {
        if (!window.confirm(`Delete "${filename}"?`)) return;
        try {
            await axios.delete(`${API}/documents/${filename}/`, { headers });
            setMessage(`"${filename}" deleted.`);
            fetchDocs();
        } catch (err) {
            setMessage(err.response?.data?.error || 'Delete failed');
        }
    };

    return (
        <div className="documents-container">
            <h2>📁 Documents</h2>
            {message && <p className="message">{message}</p>}

            <div className="upload-section">
                <form onSubmit={handleUpload}>
                    <input type="file" onChange={(e) => setFile(e.target.files[0])} />
                    <button type="submit">Upload File</button>
                </form>
                <form onSubmit={handleUrlUpload}>
                    <input
                        type="text"
                        placeholder="Enter URL to scrape..."
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
                        <span>📄 {doc.filename} ({doc.size})</span>
                        <button onClick={() => handleDelete(doc.filename)} className="delete-btn">🗑️</button>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default Documents;