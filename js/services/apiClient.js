// HTTP client for the TradeLab server. Accounts and each account's saved
// progress always use it; the market, trading, progress and journal services
// use it only when config.dataSource is 'api' (their mock adapters never touch
// the network).
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

// Browsers refuse keepalive requests with more than 64 KB of body in flight.
const KEEPALIVE_MAX_BYTES = 60 * 1024;

/**
 * Sends a JSON request. `keepalive` lets a save finish while the page is
 * closing; bodies too large for it are sent as ordinary requests.
 */
export async function request(method, path, { body, query, signal, timeoutMs = config.apiTimeoutMs, keepalive = false } = {}) {
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
    const text = body !== undefined ? JSON.stringify(body) : undefined;
    const response = await fetch(url, {
      method,
      headers: { Accept: 'application/json', ...(text !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: text,
      credentials: 'same-origin',
      signal: controller.signal,
      keepalive: keepalive && (text === undefined || new TextEncoder().encode(text).length <= KEEPALIVE_MAX_BYTES),
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
