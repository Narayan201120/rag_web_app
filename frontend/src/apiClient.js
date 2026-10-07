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

function isAbortError(err) {
    return err?.name === 'AbortError';
}

// Aborting throws at the caller. The default AbortController reason is already a
// DOMException named "AbortError", so it passes straight through. A custom reason
// that is not an Error gets wrapped, because callers check err.name.
function abortError(signal, fallback) {
    const reason = signal?.reason ?? fallback;
    if (reason instanceof Error) return reason;
    const err = new Error('The stream was aborted.');
    err.name = 'AbortError';
    if (reason !== undefined) err.cause = reason;
    return err;
}

function throwIfAborted(signal) {
    if (signal?.aborted) throw abortError(signal);
}

// streamChatEvents(body, options) yields one parsed payload per SSE data line.
// options.signal is an optional AbortSignal. On abort the reader is cancelled and
// the generator throws an AbortError (err.name === 'AbortError'), so a cancel is
// never confused with a stream or network error. No retry happens on abort.
export async function* streamChatEvents(body, options = {}) {
    const { signal } = options;
    const url = `${API_BASE_URL}/chat/stream/`;
    let headers = getAuthHeaders();
    headers['Content-Type'] = 'application/json';

    throwIfAborted(signal);

    let response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal });

    if (response.status === 401) {
        const refreshed = await tryRefreshToken();
        if (!refreshed) throw new Error('Session expired.');
        throwIfAborted(signal);
        headers = { ...getAuthHeaders(), 'Content-Type': 'application/json' };
        response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal });
    }

    if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody.error || `Request failed (${response.status})`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finished = false;

    try {
        while (true) {
            // Covers an abort that lands while the consumer sits between yields.
            throwIfAborted(signal);

            let result;
            try {
                result = await reader.read();
            } catch (err) {
                if (signal?.aborted || isAbortError(err)) {
                    await reader.cancel().catch(() => {});
                    finished = true;
                    throw abortError(signal, err);
                }
                throw err;
            }

            const { done, value } = result;
            if (done) { finished = true; break; }
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    yield JSON.parse(line.slice(6));
                }
            }
        }
    } finally {
        // Also covers a consumer that breaks out of the for-await loop early.
        if (!finished) await reader.cancel().catch(() => {});
    }
}
