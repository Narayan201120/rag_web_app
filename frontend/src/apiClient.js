import axios from 'axios';

export const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://127.0.0.1:8000/api';

export const apiClient = axios.create({
    baseURL: API_BASE_URL,
});

export function hasAccessToken() {
    return !!localStorage.getItem('access');
}

export function getAuthHeaders() {
    const token = localStorage.getItem('access');
    return token ? { Authorization: `Bearer ${token}` } : {};
}

export function setAccessToken(accessToken) {
    if (accessToken) {
        localStorage.setItem('access', accessToken);
    }
}

export function clearAccessToken() {
    localStorage.removeItem('access');
}

export async function requestWithRefresh(requestFn, options = {}) {
    try {
        return await requestFn(getAuthHeaders());
    } catch (err) {
        if (err.response?.status !== 401) {
            throw err;
        }

        try {
            const refreshRes = await apiClient.post('/token/refresh/', {}, { withCredentials: true });
            setAccessToken(refreshRes.data.access);
            return await requestFn(getAuthHeaders());
        } catch (refreshErr) {
            clearAccessToken();
            options.onUnauthorized?.(refreshErr);
            throw refreshErr;
        }
    }
}

async function tryRefreshToken() {
    try {
        const refreshRes = await apiClient.post('/token/refresh/', {}, { withCredentials: true });
        setAccessToken(refreshRes.data.access);
        return true;
    } catch {
        clearAccessToken();
        return false;
    }
}

export async function* streamChatEvents(body) {
    const url = `${API_BASE_URL}/chat/stream/`;
    let headers = getAuthHeaders();
    headers['Content-Type'] = 'application/json';

    let response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });

    if (response.status === 401) {
        const refreshed = await tryRefreshToken();
        if (!refreshed) throw new Error('Session expired.');
        headers = { ...getAuthHeaders(), 'Content-Type': 'application/json' };
        response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    }

    if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody.error || `Request failed (${response.status})`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
            if (line.startsWith('data: ')) {
                yield JSON.parse(line.slice(6));
            }
        }
    }
}
