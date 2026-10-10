// HTTP client for Flask APIs. Domain services use it in global API mode;
// the tutor uses it independently when config.tutorApiEnabled is true.
//
// Error contract expected from the backend (any non-2xx response):
//   { "error": { "code": "insufficient_cash", "message": "Readable text", "field": "quantity" } }

import { config } from '../config.js';

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'error', field = null, details = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.field = field;
    this.details = details;
  }
}

function dispatchSseEvent(eventName, dataLines, { metadata, content, completed, onChunk, onMeta }) {
  if (!dataLines.length) return { metadata, content, completed };
  let payload;
  try {
    payload = JSON.parse(dataLines.join('\n'));
  } catch {
    throw new ApiError('The tutor server sent an invalid response stream.', { code: 'invalid_stream' });
  }
  if (eventName === 'meta' || eventName === 'done') {
    metadata = { ...metadata, ...payload };
    if (eventName === 'meta') onMeta(metadata);
    if (eventName === 'done') completed = true;
  } else if (eventName === 'token') {
    if (typeof payload.content === 'string' && payload.content) {
      content += payload.content;
      onChunk(payload.content);
    }
  } else if (eventName === 'error') {
    throw new ApiError(payload.message || 'The tutor could not finish its response.', {
      code: payload.code || 'stream_error',
      details: payload,
    });
  }
  return { metadata, content, completed };
}

export async function request(method, path, { body, query, signal, timeoutMs = config.apiTimeoutMs } = {}) {
  const base = config.apiBaseUrl.replace(/\/$/, '');
  // Relative bases ('/api') resolve against the page; apps without a page
  // (React Native, say) need an absolute apiBaseUrl.
  const url = new URL(`${base}${path}`, globalThis.location?.href);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const abortFromCaller = () => controller.abort();
  signal?.addEventListener('abort', abortFromCaller, { once: true });

  try {
    const response = await fetch(url, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json; charset=utf-8' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
      signal: controller.signal,
    });
    const data = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) {
      const error = data?.error || {};
      throw new ApiError(error.message || `The server responded with status ${response.status}.`, {
        status: response.status,
        code: error.code,
        field: error.field,
        details: error.details,
      });
    }
    return data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error?.name === 'AbortError') {
      if (signal?.aborted) throw error;
      throw new ApiError('The TradeLab server took too long to respond. Try again in a moment.', { code: 'timeout' });
    }
    throw new ApiError('Could not reach the TradeLab server. Check that the backend is running.', { code: 'network' });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abortFromCaller);
  }
}

export async function postStream(
  path,
  body,
  { signal, timeoutMs = config.apiTimeoutMs, onChunk = () => {}, onMeta = () => {} } = {},
) {
  const base = config.apiBaseUrl.replace(/\/$/, '');
  const url = new URL(`${base}${path}`, globalThis.location?.href);
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const abortFromCaller = () => controller.abort();
  signal?.addEventListener('abort', abortFromCaller, { once: true });

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'text/event-stream; charset=utf-8',
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify(body),
      credentials: 'same-origin',
      signal: controller.signal,
    });
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      const error = data?.error || {};
      throw new ApiError(error.message || `The server responded with status ${response.status}.`, {
        status: response.status,
        code: error.code,
        field: error.field,
        details: error.details,
      });
    }
    if (!response.body) {
      throw new ApiError('The tutor server did not provide a response stream.', { code: 'stream_unavailable' });
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let buffer = '';
    let eventName = 'message';
    let dataLines = [];
    let metadata = { source: 'llm', model: null };
    let content = '';
    let completed = false;

    const dispatch = () => {
      ({ metadata, content, completed } = dispatchSseEvent(eventName, dataLines, {
        metadata,
        content,
        completed,
        onChunk,
        onMeta,
      }));
      eventName = 'message';
      dataLines = [];
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        try {
          buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        } catch {
          throw new ApiError('The tutor server sent text that was not valid UTF-8.', { code: 'invalid_encoding' });
        }
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const rawLine of lines) {
          const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
          if (line === '') {
            dispatch();
          } else if (line.startsWith('event:')) {
            eventName = line.slice(6).trim();
          } else if (line.startsWith('data:')) {
            dataLines.push(line.slice(5).trimStart());
          }
        }
        if (done) break;
      }
      if (buffer) {
        const finalLines = buffer.split('\n');
        for (const rawLine of finalLines) {
          const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
          if (line === '') {
            dispatch();
          } else if (line.startsWith('event:')) {
            eventName = line.slice(6).trim();
          } else if (line.startsWith('data:')) {
            dataLines.push(line.slice(5).trimStart());
          }
        }
        if (dataLines.length) dispatch();
      }
    } finally {
      if (!completed) await reader.cancel().catch(() => {});
      reader.releaseLock();
    }

    if (!completed) {
      throw new ApiError('The tutor response ended before generation completed.', { code: 'incomplete_stream' });
    }
    if (!content.trim()) {
      throw new ApiError('The tutor returned an empty response. Please try again.', { code: 'empty_response' });
    }
    return { reply: { content, source: metadata.source, model: metadata.model }, streamed: content.length > 0 };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error?.name === 'AbortError') {
      if (signal?.aborted) throw error;
      throw new ApiError(
        timedOut ? 'The TradeLab server took too long to respond. Try again in a moment.' : 'The tutor response was stopped.',
        { code: timedOut ? 'timeout' : 'aborted' },
      );
    }
    throw new ApiError('Could not reach the TradeLab server. Check that the backend is running.', { code: 'network' });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abortFromCaller);
  }
}

export const api = {
  get: (path, options) => request('GET', path, options),
  post: (path, body, options) => request('POST', path, { ...options, body }),
  put: (path, body, options) => request('PUT', path, { ...options, body }),
  delete: (path, options) => request('DELETE', path, options),
};

/** Mock adapters await this so loading states behave like a real request. */
export function simulateLatency(ms = config.mockLatencyMs) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let idCounter = 0;
/** Locally generated ids for mock records. A backend would assign its own. */
export function localId(prefix) {
  idCounter += 1;
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${idCounter}${random}`;
}
