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
