// Trading journal entries: create, update, delete.
// Validation lives in core/journal.js so the backend can reuse the same rules.
//
// FLASK: implement these endpoints to switch to the remote adapter
//   GET    /api/journal          -> { entries: JournalEntry[] }
//   POST   /api/journal  {...}   -> { entry }
//   PUT    /api/journal/:id {...} -> { entry }
//   DELETE /api/journal/:id      -> 204

import { isMock } from '../config.js';
import { api, ApiError, simulateLatency, localId } from './apiClient.js';
import { getState, updateSlice } from '../state.js';
import { validateJournalEntry } from '../core/journal.js';
import { reserveGuestJournalEntry } from './accountService.js';

export class ValidationError extends Error {
  constructor(errors) {
    super('Some fields need attention.');
    this.name = 'ValidationError';
    this.errors = errors;
  }
}

export class GuestLimitError extends Error {
  constructor(message) {
    super(message);
    this.name = 'GuestLimitError';
    this.code = 'guest_journal_limit';
  }
}

const mock = {
  async create(value) {
    await simulateLatency(120);
    const now = Date.now();
    return { entry: { ...value, id: localId('journal'), entryDay: getState().market.day, createdAt: now, updatedAt: now } };
  },

  async update(id, value) {
    await simulateLatency(120);
    const existing = getState().journal.entries.find((entry) => entry.id === id);
    if (!existing) throw new Error('That journal entry no longer exists.');
    return { entry: { ...existing, ...value, id, updatedAt: Date.now() } };
  },

  async remove() {
    await simulateLatency(80);
    return null;
  },
};

// A 400 from the backend becomes a ValidationError so the form shows the
// message next to the field. Accepts one field (error.field) or several
// (error.details.fields: { field: message }).
async function withFieldErrors(promise) {
  try {
    return await promise;
  } catch (error) {
    if (error instanceof ApiError && error.status === 400) {
      const fields = error.details?.fields;
      if (fields && typeof fields === 'object' && Object.keys(fields).length) throw new ValidationError(fields);
      if (error.field) throw new ValidationError({ [error.field]: error.message });
    }
    throw error;
  }
}

const remote = {
  list: () => api.get('/journal'),
  create: (value) => withFieldErrors(api.post('/journal', value)),
  update: (id, value) => withFieldErrors(api.put(`/journal/${encodeURIComponent(id)}`, value)),
  remove: (id) => api.delete(`/journal/${encodeURIComponent(id)}`),
};

const adapter = isMock() ? mock : remote;

/** Loads journal entries from the backend at startup (no-op in mock mode). */
export async function loadEntries() {
  if (isMock()) return;
  const { entries } = await remote.list();
  updateSlice('journal', (journal) => ({ ...journal, entries: entries || [] }), 'journal/loaded');
}

function knownSymbols() {
  return getState().runtime.instruments.map((instrument) => instrument.symbol);
}

/** Validates and saves a new entry. Throws ValidationError with field messages. */
export async function createEntry(input, { transactionId } = {}) {
  const result = validateJournalEntry(input, { knownSymbols: knownSymbols() });
  if (!result.ok) throw new ValidationError(result.errors);
  try {
    await reserveGuestJournalEntry();
  } catch (error) {
    if (error instanceof ApiError && error.code === 'guest_journal_limit') throw new GuestLimitError(error.message);
    throw error;
  }
  const { entry } = await adapter.create({ ...result.value, ...(transactionId ? { transactionId } : {}) });
  updateSlice('journal', (journal) => ({ ...journal, entries: [entry, ...journal.entries] }), 'journal/created');
  return entry;
}

export async function updateEntry(id, input) {
  const result = validateJournalEntry(input, { knownSymbols: knownSymbols() });
  if (!result.ok) throw new ValidationError(result.errors);
  const { entry } = await adapter.update(id, result.value);
  updateSlice(
    'journal',
    (journal) => ({ ...journal, entries: journal.entries.map((item) => (item.id === id ? entry : item)) }),
    'journal/updated',
  );
  return entry;
}

export async function deleteEntry(id) {
  await adapter.remove(id);
  updateSlice('journal', (journal) => ({ ...journal, entries: journal.entries.filter((item) => item.id !== id) }), 'journal/deleted');
}

export function entryById(id) {
  return getState().journal.entries.find((entry) => entry.id === id) || null;
}
