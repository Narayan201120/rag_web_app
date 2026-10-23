import { describe, expect, it } from 'vitest';
import { parseSseBlock } from './stream';

describe('parseSseBlock', () => {
  it('returns no events when no complete event boundary exists', () => {
    const { events, rest } = parseSseBlock('data: {"token":"hel');
    expect(events).toEqual([]);
    expect(rest).toBe('data: {"token":"hel');
  });

  it('parses a complete token event and keeps the incomplete tail', () => {
    const buffer = 'data: {"token":"hello"}\n\ndata: {"token":" wor';
    const { events, rest } = parseSseBlock(buffer);
    expect(events).toEqual([{ token: 'hello' }]);
    expect(rest).toBe('data: {"token":" wor');
  });

  it('parses error and done events', () => {
    const buffer =
      'data: {"error":"No indexed documents found."}\n\n' +
      'data: {"done":true,"id":7,"conversation_id":2,"answer":"done text","sources":["a.pdf"]}\n\n';
    const { events } = parseSseBlock(buffer);
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ error: 'No indexed documents found.' });
    expect(events[1]).toMatchObject({ done: true, id: 7, conversation_id: 2 });
  });

  it('ignores malformed data lines without throwing', () => {
    const buffer = 'data: {broken json}\n\ndata: {"token":"ok"}\n\n';
    const { events } = parseSseBlock(buffer);
    expect(events).toEqual([{ token: 'ok' }]);
  });

  it('handles CRLF line endings from intermediaries', () => {
    const buffer = 'data: {"token":"a"}\r\n\r\ndata: {"token":"b"}\r\n\r\n';
    const { events } = parseSseBlock(buffer);
    expect(events).toEqual([{ token: 'a' }, { token: 'b' }]);
  });
});
