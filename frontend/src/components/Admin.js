import { useState, useEffect } from 'react';
import { apiClient, requestWithRefresh } from '../apiClient';

function Admin() {
    const [usage, setUsage] = useState(null);
    const [vectors, setVectors] = useState(null);
    const [status, setStatus] = useState(null);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchAll = async () => {
            try {
                const [usageRes, vectorsRes, statusRes] = await Promise.all([
                    requestWithRefresh((headers) => apiClient.get('/admin/usage/', { headers })),
                    requestWithRefresh((headers) => apiClient.get('/admin/vectors/', { headers })),
                    requestWithRefresh((headers) => apiClient.get('/status/', { headers })),
                ]);
                setUsage(usageRes.data);
                setVectors(vectorsRes.data);
                setStatus(statusRes.data);
            } catch (err) {
                setError(err.response?.data?.error || 'Admin access required');
            }
        };
        fetchAll();
    }, []);

    if (error) return <div className="admin-container"><h2>Admin</h2><p className="error">{error}</p></div>;

    return (
        <div className="admin-container">
            <h2>Admin Dashboard</h2>

            {status && (
                <div className="admin-card">
                    <h3>System Status</h3>
                    <p>Status: <strong>{status.status}</strong></p>
                    <p>Server: {status.server}</p>
                    <p>Vector DB Connected: {status.vector_database?.connected ? 'Yes' : 'No'}</p>
                    <p>Total Chunks: {status.vector_database?.total_chunks}</p>
                    <p>Embedding Dim: {status.vector_database?.embedding_dimension}</p>
                </div>
            )}

            {vectors && (
                <div className="admin-card">
                    <h3>Vector Database</h3>
                    <p>Total Vectors: {vectors.total_vectors}</p>
                    <p>Total Documents: {vectors.total_documents}</p>
                </div>
            )}

            {usage && (
                <div className="admin-card">
                    <h3>API Usage ({usage.period})</h3>
                    <p>Total Calls: {usage.total_calls}</p>
                    <h4>Per User:</h4>
                    {usage.per_user?.map((u, i) => (
                        <p key={i}>{u.user__username}: {u.call_count} calls</p>
                    ))}
                    <h4>Top Endpoints:</h4>
                    {usage.top_endpoints?.map((e, i) => (
                        <p key={i}>{e.endpoint}: {e.call_count} calls</p>
                    ))}
                </div>
            )}
        </div>
    );
}

export default Admin;
