import type {
  Account,
  AuthResponse,
  CitationsResponse,
  Collection,
  CollectionList,
  ConversationDetail,
  ConversationList,
  DocumentList,
  DocumentPreview,
  EvalResult,
  FeedbackResponse,
  HardQuery,
  SearchResponse,
  SettingsInfo,
  StatusInfo,
  SuggestResponse,
  TaskInfo,
  TestConnectionResponse,
  UsageResponse,
  VectorsResponse,
} from '../types';

export const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000/api';

/* ------------------------------------------------------------------ */
/* access token lives in memory only; the refresh token is an          */
/* HttpOnly cookie, so a page load recovers the session via refresh.   */
/* ------------------------------------------------------------------ */

let accessToken: string | null = null;
const unauthorizedListeners = new Set<() => void>();

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string): void {
  accessToken = token;
}

export function clearAccessToken(): void {
  accessToken = null;
}

export function onUnauthorized(fn: () => void): () => void {
  unauthorizedListeners.add(fn);
  return () => unauthorizedListeners.delete(fn);
}

/** Called when a request (or stream) cannot recover from a 401. */
export function notifyUnauthorized(): void {
  unauthorizedListeners.forEach((fn) => fn());
}

/* ------------------------------------------------------------------ */
/* errors                                                              */
/* ------------------------------------------------------------------ */

export class ApiError extends Error {
  status: number;
  payload: unknown;

  constructor(status: number, payload: unknown) {
    super(extractErrorMessage(payload) ?? `Request failed (${status})`);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

/** Handles `{error}`, DRF `{detail}`, and field-error dicts alike. */
export function extractErrorMessage(payload: unknown): string | null {
  if (payload == null) return null;
  if (typeof payload === 'string') return payload;
  if (Array.isArray(payload)) {
    const first = payload[0];
    return typeof first === 'string' ? first : null;
  }
  if (typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    if (typeof record.error === 'string') return record.error;
    if (typeof record.detail === 'string') return record.detail;
    for (const value of Object.values(record)) {
      const nested = extractErrorMessage(value);
      if (nested) return nested;
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* core request with one silent refresh on 401                         */
/* ------------------------------------------------------------------ */

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  formData?: FormData;
  signal?: AbortSignal;
}

let refreshInFlight: Promise<boolean> | null = null;

export async function tryRefreshToken(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const res = await fetch(`${API_URL}/token/refresh/`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) return false;
      const data = (await res.json()) as { access?: string };
      if (!data.access) return false;
      accessToken = data.access;
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

async function errorFrom(res: Response): Promise<ApiError> {
  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }
  return new ApiError(res.status, payload);
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, formData, signal } = options;

  const send = (token: string | null) => {
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    return fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: formData ?? (body !== undefined ? JSON.stringify(body) : undefined),
      credentials: 'include',
      signal,
    });
  };

  let res = await send(accessToken);
  if (res.status === 401) {
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      res = await send(accessToken);
    } else {
      notifyUnauthorized();
    }
  }

  if (!res.ok) throw await errorFrom(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Raw response, for file downloads. */
export async function apiRaw(path: string, signal?: AbortSignal): Promise<Response> {
  const headers: Record<string, string> = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const res = await fetch(`${API_URL}${path}`, { headers, credentials: 'include', signal });
  if (res.status === 401) {
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
      return fetch(`${API_URL}${path}`, { headers, credentials: 'include', signal });
    }
    notifyUnauthorized();
  }
  if (!res.ok) throw await errorFrom(res);
  return res;
}

/* ------------------------------------------------------------------ */
/* endpoints                                                           */
/* ------------------------------------------------------------------ */

function encodeName(name: string): string {
  return encodeURIComponent(name);
}

export const api = {
  auth: {
    signIn: (username: string, password: string) =>
      apiFetch<AuthResponse>('/sign-in/', { method: 'POST', body: { username, password } }),
    signUp: (username: string, email: string, password: string) =>
      apiFetch<AuthResponse>('/sign-up/', { method: 'POST', body: { username, email, password } }),
    social: (payload: { provider: string; token?: string; code?: string; redirect_uri?: string }) =>
      apiFetch<AuthResponse>('/auth/social/', { method: 'POST', body: payload }),
    logout: () => apiFetch<{ message: string }>('/logout/', { method: 'POST' }),
    forgotPassword: (email: string) =>
      apiFetch<{ message: string }>('/forgot-password/', { method: 'POST', body: { email } }),
    resetPassword: (uid: string, token: string, new_password: string) =>
      apiFetch<{ message: string }>('/reset-password/', {
        method: 'POST',
        body: { uid, token, new_password },
      }),
  },

  account: {
    get: () => apiFetch<Account>('/account/'),
    delete: (password: string) =>
      apiFetch<{ message: string }>('/account/delete/', { method: 'DELETE', body: { password } }),
  },

  status: {
    get: () => apiFetch<StatusInfo>('/status/'),
  },

  chat: {
    history: () => apiFetch<ConversationList>('/chat/history/'),
    conversation: (id: number) =>
      apiFetch<ConversationDetail>(`/chat/conversations/${id}/`),
    updateConversation: (id: number, patch: { title?: string; pinned?: boolean }) =>
      apiFetch<{ id: number; title: string; pinned: boolean }>(`/chat/conversations/${id}/`, {
        method: 'PATCH',
        body: patch,
      }),
    deleteConversation: (id: number) =>
      apiFetch<{ message: string }>(`/chat/conversations/${id}/`, { method: 'DELETE' }),
    feedback: (chatId: number, rating: 'up' | 'down', comment = '', failure_tag = '') =>
      apiFetch<FeedbackResponse>(`/chat/${chatId}/feedback/`, {
        method: 'POST',
        body: { rating, comment, failure_tag },
      }),
    citations: (chatId: number) => apiFetch<CitationsResponse>(`/chat/${chatId}/citations/`),
    export: async (chatId: number, format: 'json' | 'markdown'): Promise<Blob> => {
      const res = await apiRaw(`/chat/${chatId}/export/?export_format=${format}`);
      return res.blob();
    },
  },

  documents: {
    list: () => apiFetch<DocumentList>('/documents/'),
    upload: (file: File, signal?: AbortSignal) => {
      const formData = new FormData();
      formData.append('document', file);
      return apiFetch<{ task_id: string; message: string }>('/upload/', {
        method: 'POST',
        formData,
        signal,
      });
    },
    preview: (name: string) => apiFetch<DocumentPreview>(`/documents/${encodeName(name)}/`),
    remove: (name: string) =>
      apiFetch<{ message: string }>(`/documents/${encodeName(name)}/`, { method: 'DELETE' }),
    move: (name: string, collectionId: number | null) =>
      apiFetch<{ message: string; collection: string | null }>(
        `/documents/${encodeName(name)}/move/`,
        { method: 'PUT', body: { collection_id: collectionId } },
      ),
    rename: (name: string, newName: string) =>
      apiFetch<{ message: string; new_name: string }>(`/documents/${encodeName(name)}/rename/`, {
        method: 'PATCH',
        body: { new_name: newName },
      }),
  },

  ingest: () => apiFetch<{ task_id: string; message: string }>('/ingest/', { method: 'POST' }),
  ingestUrl: (url: string) =>
    apiFetch<{ task_id: string; message: string }>('/upload-url/', {
      method: 'POST',
      body: { url },
    }),

  collections: {
    list: () => apiFetch<CollectionList>('/collections/'),
    create: (name: string, description: string) =>
      apiFetch<{ message: string; id: number }>('/collections/', {
        method: 'POST',
        body: { name, description },
      }),
    update: (id: number, patch: { name?: string; description?: string }) =>
      apiFetch<Collection>(`/collections/${id}/`, { method: 'PATCH', body: patch }),
    remove: (id: number) =>
      apiFetch<{ message: string }>(`/collections/${id}/`, { method: 'DELETE' }),
  },

  search: {
    query: (query: string, top_k: number) =>
      apiFetch<SearchResponse>('/search/', { method: 'POST', body: { query, top_k } }),
    rerank: (query: string, initial_k: number, final_k: number) =>
      apiFetch<SearchResponse>('/search/rerank/', {
        method: 'POST',
        body: { query, initial_k, final_k },
      }),
    suggest: (q: string) => {
      const params = new URLSearchParams({ q });
      return apiFetch<SuggestResponse>(`/search/suggest/?${params}`);
    },
  },

  tasks: {
    get: (taskId: string) => apiFetch<TaskInfo>(`/tasks/${taskId}/`),
    cancel: (taskId: string) =>
      apiFetch<{ message: string }>(`/tasks/${taskId}/cancel/`, { method: 'POST' }),
  },

  settings: {
    get: () => apiFetch<SettingsInfo>('/settings/api-key/'),
    save: (provider: string, model: string, api_key: string) =>
      apiFetch<{ message: string }>('/settings/api-key/', {
        method: 'POST',
        body: { provider, model, api_key },
      }),
    test: (payload: { provider?: string; model?: string; api_key?: string }) =>
      apiFetch<TestConnectionResponse>('/settings/api-key/test/', {
        method: 'POST',
        body: payload,
      }),
  },

  admin: {
    usage: () => apiFetch<UsageResponse>('/admin/usage/'),
    vectors: () => apiFetch<VectorsResponse>('/admin/vectors/'),
  },

  evaluate: {
    generate: (num_questions: number) =>
      apiFetch<{ message: string; count: number }>('/evaluate/generate/', {
        method: 'POST',
        body: { num_questions },
      }),
    run: (dataset_id?: number) =>
      apiFetch<{ message: string; results: EvalResult[] }>('/evaluate/run/', {
        method: 'POST',
        body: dataset_id !== undefined ? { dataset_id } : {},
      }),
    results: () => apiFetch<{ results: EvalResult[] }>('/evaluate/results/'),
    hardQueries: () => apiFetch<{ hard_queries: HardQuery[] }>('/feedback/hard-queries/'),
  },
};
