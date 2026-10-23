import { API_URL, ApiError, getAccessToken, notifyUnauthorized, tryRefreshToken } from './api';

/** One parsed SSE payload from the chat stream. */
export interface StreamDoneEvent {
  done: true;
  id?: number;
  conversation_id?: number;
  answer: string;
  sources: string[];
  source_statuses?: { name: string; available: boolean }[];
}

export type StreamEvent = { token: string } | { error: string } | StreamDoneEvent;

/**
 * Pure SSE parsing: given accumulated text, split off complete events
 * (blocks separated by a blank line) and parse their `data:` lines.
 * Returns the parsed payloads plus whatever tail is still incomplete.
 */
export function parseSseBlock(buffer: string): { events: unknown[]; rest: string } {
  // normalize CRLF so intermediaries that rewrite line endings still parse
  const normalized = buffer.replace(/\r\n/g, '\n');
  const boundary = normalized.lastIndexOf('\n\n');
  if (boundary === -1) return { events: [], rest: normalized };
  const block = normalized.slice(0, boundary);
  const rest = normalized.slice(boundary + 2);
  const events: unknown[] = [];
  for (const line of block.split('\n')) {
    if (line.startsWith('data: ')) {
      try {
        events.push(JSON.parse(line.slice(6)));
      } catch {
        // malformed line: ignore
      }
    }
  }
  return { events, rest };
}

async function* sseIterator(
  res: Response,
  signal?: AbortSignal,
): AsyncGenerator<StreamEvent, void, undefined> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : new DOMException('Aborted', 'AbortError');
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const { events, rest } = parseSseBlock(buffer);
      buffer = rest;
      for (const event of events) yield event as StreamEvent;
    }
    const { events } = parseSseBlock(`${buffer}\n\n`);
    for (const event of events) yield event as StreamEvent;
  } finally {
    await reader.cancel().catch(() => {});
  }
}

export interface StreamChatOptions {
  question: string;
  conversationId?: number;
  signal?: AbortSignal;
  onToken?: (token: string) => void;
}

/**
 * Send a question to /chat/stream/ and resolve with the final done payload,
 * invoking onToken for each incremental token. Throws ApiError for pre-stream
 * validation failures, or an Error with the server's message when the stream
 * itself reports an error. AbortError propagates when the caller aborts.
 */
export async function streamChat(options: StreamChatOptions): Promise<StreamDoneEvent> {
  const { question, conversationId, signal, onToken } = options;

  const send = () => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(`${API_URL}/chat/stream/`, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({ question, conversation_id: conversationId }),
      signal,
    });
  };

  let res = await send();
  if (res.status === 401) {
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      res = await send();
    } else {
      notifyUnauthorized();
      throw new ApiError(401, { detail: 'Session expired. Sign in again.' });
    }
  }

  if (!res.ok) throw new ApiError(res.status, await safeJson(res));

  let done: (StreamEvent & { done: true }) | null = null;
  let streamError: string | null = null;

  for await (const event of sseIterator(res, signal)) {
    if ('token' in event) {
      onToken?.(event.token);
    } else if ('error' in event) {
      streamError = event.error;
    } else if ('done' in event) {
      done = event;
    }
  }

  if (streamError) {
    const err = new Error(streamError);
    err.name = 'StreamError';
    throw err;
  }
  if (!done) {
    throw new Error('The answer stream ended without a result.');
  }
  return done;
}

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}
