import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiFetch, clearAccessToken, extractErrorMessage } from './api';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  clearAccessToken();
  vi.restoreAllMocks();
});

describe('extractErrorMessage', () => {
  it('reads {error} payloads', () => {
    expect(extractErrorMessage({ error: 'Invalid credentials.' })).toBe('Invalid credentials.');
  });

  it('reads DRF {detail} payloads', () => {
    expect(extractErrorMessage({ detail: 'Not authenticated.' })).toBe('Not authenticated.');
  });

  it('reads field-error dicts from the sign-up serializer', () => {
    expect(
      extractErrorMessage({ email: ['a user with this email already exists.'] }),
    ).toBe('a user with this email already exists.');
  });

  it('returns null for unknown shapes', () => {
    expect(extractErrorMessage(null)).toBeNull();
  });
});

describe('apiFetch refresh-on-401', () => {
  it('refreshes once and retries the original request', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const auth = (init?.headers as Record<string, string>)?.Authorization;
      if (url.includes('/token/refresh/')) {
        return jsonResponse({ access: 'fresh-token' });
      }
      if (auth === 'Bearer fresh-token') {
        return jsonResponse({ ok: true, saw: 'fresh' });
      }
      return jsonResponse({ detail: 'Authentication credentials were not provided.' }, 401);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await apiFetch<{ ok: boolean; saw: string }>('/account/');
    expect(result).toEqual({ ok: true, saw: 'fresh' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('throws an ApiError carrying the server message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ error: 'Invalid credentials.' }, 401)),
    );
    // no valid refresh path: refresh also 401s
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/token/refresh/')) {
          return jsonResponse({ error: 'Invalid or expired refresh token.' }, 401);
        }
        return jsonResponse({ error: 'Invalid credentials.' }, 401);
      }),
    );

    await expect(apiFetch('/sign-in/', { method: 'POST', body: {} })).rejects.toMatchObject({
      name: 'ApiError',
      status: 401,
      message: 'Invalid credentials.',
    });
  });

  it('parses throttled DRF detail messages', async () => {
    const err = new ApiError(429, { detail: 'Request was throttled.' });
    expect(err.message).toBe('Request was throttled.');
    expect(err.status).toBe(429);
  });
});
