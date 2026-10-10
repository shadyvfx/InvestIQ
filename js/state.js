// Central application state.
//
// One store holds everything the UI renders: the simulated market clock, the
// account ledger, lesson progress, journal entries, the tutor conversation,
// notifications and preferences. Pages read from it and subscribe to changes;
// only services (js/services) write domain data into it.
//
// Account balances and holdings are never stored. They are derived from the
// transaction ledger by core/portfolio.js, so there is exactly one source of
// truth and no copy can drift out of sync.
//
// Whose data is in the store: signed out, it's this browser's guest data,
// saved in localStorage. Signed in, it's that account's data, which
// services/accountService.js saves to the server and loads at the next
// sign-in. Signing in or out swaps the personal slices, so one person's
// progress never shows for another. Only `ui` belongs to the device.

import { config, isMock } from './config.js';
import { readJSON, writeJSON, storageAvailable } from './storage.js';
import { latestTradingDay, localTodayISO } from './core/calendar.js';
import { deriveAccount, valueAccount, dayChange } from './core/portfolio.js';
import { createExampleData } from './data/exampleAccount.js';

export const SCHEMA_VERSION = 1;

/** Everything that belongs to the person using TradeLab (the guest or a signed-in account). */
export const PERSONAL_SLICES = ['meta', 'market', 'account', 'watchlist', 'learning', 'journal', 'tutor', 'notifications', 'preferences'];
const PERSISTED_SLICES = [...PERSONAL_SLICES, 'ui'];
/** The device's own settings: the sidebar, and the last display settings for the loading screen. */
const DEVICE_KEY = `${config.storageKey}:device`;
const MAX_TUTOR_MESSAGES = 120;
const MAX_NOTIFICATIONS = 40;

export const DEFAULT_WATCHLIST = ['HLCN', 'MRDH', 'BRMB', 'TLMX'];

export function defaultPreferences() {
  return {
    theme: 'dark', // 'dark' | 'light' | 'system'
    movement: 'green-red', // 'green-red' | 'blue-orange'
    density: 'comfortable', // 'comfortable' | 'compact'
    motion: 'system', // 'system' | 'reduce'
    chartStyle: 'line', // 'line' | 'candles'
    defaultRange: '3M',
    difficulty: 'beginner', // 'beginner' | 'intermediate' | 'advanced'
  };
}

/** A fresh account. With `examples`, it starts with labeled example trades and journal entries. */
export function createInitialState({ examples = isMock(), startingCash = config.defaultStartingCash } = {}) {
  const now = Date.now();
  const state = {
    meta: { schemaVersion: SCHEMA_VERSION, createdAt: now, exampleData: false, welcomeDismissed: false },
    market: { startDate: latestTradingDay(localTodayISO()), day: 0 },
    account: { startingCash, transactions: [], createdAt: now },
    watchlist: [...DEFAULT_WATCHLIST],
    learning: { lessons: {} },
    journal: { entries: [] },
    tutor: { messages: [] },
    notifications: { items: [] },
    preferences: defaultPreferences(),
    ui: { sidebarCollapsed: false },
    runtime: freshRuntime(),
  };

  if (examples) {
    const example = createExampleData(now);
    state.market = example.market;
    state.account.transactions = example.transactions;
    state.journal.entries = example.journal;
    state.watchlist = example.watchlist;
    state.meta.exampleData = true;
  }

  return state;
}

function freshRuntime() {
  return {
    instruments: [],
    quotes: {},
    marketStatus: 'idle', // 'idle' | 'loading' | 'ready' | 'error'
    marketError: null,
    maxDay: null, // last simulated day the market can advance to (from the clock)
    // The signed-in TradeLab account. It lives on the server (session cookie),
    // so it isn't saved here: GET /api/session restores it on every start.
    user: null,
    userStatus: 'checking', // 'checking' | 'signed-in' | 'signed-out' | 'unavailable'
    // Saving the signed-in account's progress to the server.
    sync: { status: 'idle', savedAt: null }, // status: 'idle' | 'saving' | 'saved' | 'error'
    tutorPending: false,
    storageAvailable: storageAvailable(),
    saveFailed: false,
  };
}

// ---------------------------------------------------------------------------
// Store

let state = null;
const listeners = new Set();
let saveTimer = null;
let owner = { kind: 'guest', id: null };
let remoteSave = null; // (snapshot, { immediate }) => void, while an account is signed in

const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value);

function sanitize(saved, defaults) {
  const next = { ...defaults };
  next.meta = { ...defaults.meta, ...(isObject(saved.meta) ? saved.meta : {}) };
  next.preferences = { ...defaults.preferences, ...(isObject(saved.preferences) ? saved.preferences : {}) };
  next.ui = { ...defaults.ui, ...(isObject(saved.ui) ? saved.ui : {}) };
  if (isObject(saved.market) && typeof saved.market.startDate === 'string' && Number.isInteger(saved.market.day)) {
    next.market = { startDate: saved.market.startDate, day: Math.max(0, saved.market.day) };
  }
  if (isObject(saved.account) && Array.isArray(saved.account.transactions) && Number(saved.account.startingCash) > 0) {
    next.account = {
      startingCash: Number(saved.account.startingCash),
      transactions: saved.account.transactions.filter((tx) => tx && tx.symbol && tx.side && tx.quantity > 0 && tx.price > 0),
      createdAt: saved.account.createdAt ?? defaults.account.createdAt,
    };
  }
  if (Array.isArray(saved.watchlist)) next.watchlist = saved.watchlist.filter((symbol) => typeof symbol === 'string');
  if (isObject(saved.learning) && isObject(saved.learning.lessons)) next.learning = { lessons: saved.learning.lessons };
  if (isObject(saved.journal) && Array.isArray(saved.journal.entries)) next.journal = { entries: saved.journal.entries };
  if (isObject(saved.tutor) && Array.isArray(saved.tutor.messages)) next.tutor = { messages: saved.tutor.messages.slice(-MAX_TUTOR_MESSAGES) };
  if (isObject(saved.notifications) && Array.isArray(saved.notifications.items)) {
    next.notifications = { items: saved.notifications.items.slice(0, MAX_NOTIFICATIONS) };
  }
  return next;
}

function pick(source, slices) {
  const out = {};
  for (const slice of slices) out[slice] = source[slice];
  return out;
}

/** Store slices from saved personal data (localStorage or the server), or a fresh start. */
function personalSlicesFrom(saved, { examples = isMock() } = {}) {
  const valid = isObject(saved) && saved.schemaVersion === SCHEMA_VERSION && isObject(saved.state);
  const next = valid ? sanitize(saved.state, createInitialState({ examples: false })) : createInitialState({ examples });
  return pick(next, PERSONAL_SLICES);
}

/** Loads the guest data saved in this browser (or creates the example account) and returns the state. */
export function initStore() {
  const saved = readJSON(config.storageKey);
  const device = readJSON(DEVICE_KEY);
  const ui = device?.ui ?? saved?.state?.ui; // older versions kept ui with the rest
  state = { ...personalSlicesFrom(saved), ui: { sidebarCollapsed: false, ...(isObject(ui) ? ui : {}) }, runtime: freshRuntime() };
  owner = { kind: 'guest', id: null };
  remoteSave = null;
  persistNow();

  // Save immediately when the tab is hidden or closed. Other platforms (a
  // React Native app, say) can call persistNow() from their own lifecycle hooks.
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    window.addEventListener('pagehide', () => persistNow({ immediate: true }));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') persistNow({ immediate: true });
    });
  }
  return state;
}

export function getState() {
  return state;
}

/**
 * Replaces state with updater(state). Updaters must return new objects for
 * the slices they change (never mutate), so subscribers can compare by
 * reference.
 */
export function setState(updater, action = 'update') {
  const previous = state;
  const next = typeof updater === 'function' ? updater(previous) : { ...previous, ...updater };
  if (!next || next === previous) return;
  state = next;
  if (PERSISTED_SLICES.some((slice) => next[slice] !== previous[slice])) scheduleSave();
  for (const listener of [...listeners]) {
    try {
      listener(state, previous, action);
    } catch (error) {
      console.error(`State listener failed after "${action}"`, error);
    }
  }
}

/** Updates one slice: updateSlice('journal', (journal) => ({ ...journal, entries })). */
export function updateSlice(slice, updater, action = `${slice}/update`) {
  setState((current) => ({ ...current, [slice]: updater(current[slice]) }), action);
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Calls `callback(value, previous)` whenever selector(state) changes
 * (compared by reference). Returns an unsubscribe function.
 */
export function watch(selector, callback) {
  let last = selector(state);
  return subscribe((current) => {
    const value = selector(current);
    if (value !== last) {
      const previous = last;
      last = value;
      callback(value, previous);
    }
  });
}

// ---------------------------------------------------------------------------
// Persistence

/** The current person's data, in the shape saved to localStorage and to the server. */
export function personalSnapshot(current = state) {
  return { schemaVersion: SCHEMA_VERSION, savedAt: Date.now(), state: pick(current, PERSONAL_SLICES) };
}

function deviceSnapshot() {
  const { theme, movement, density, motion } = state.preferences;
  return { ui: state.ui, display: { theme, movement, density, motion } };
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persistNow, 150);
}

/**
 * Saves now instead of waiting for the debounce: the device's settings to
 * localStorage, and personal data to whoever owns it (the guest's localStorage,
 * or the signed-in account through the account service).
 */
export function persistNow({ immediate = false } = {}) {
  clearTimeout(saveTimer);
  saveTimer = null;
  if (!state) return;
  writeJSON(DEVICE_KEY, deviceSnapshot());
  if (owner.kind === 'user') {
    remoteSave?.(personalSnapshot(), { immediate });
    return;
  }
  const ok = writeJSON(config.storageKey, personalSnapshot());
  if (!ok && !state.runtime.saveFailed) {
    state = { ...state, runtime: { ...state.runtime, saveFailed: true } };
    if (typeof window !== 'undefined' && typeof CustomEvent === 'function') {
      window.dispatchEvent(new CustomEvent('tradelab:storage-unavailable'));
    }
  }
}

/**
 * Starts the current person over with the example account: the guest in this
 * browser, or the signed-in account (saved to the server). The device's
 * sidebar setting and the sign-in itself are kept.
 */
export function clearAllData() {
  const fresh = createInitialState();
  setState(
    (current) => ({
      ...current,
      ...pick(fresh, PERSONAL_SLICES),
      runtime: {
        ...freshRuntime(),
        instruments: current.runtime.instruments,
        user: current.runtime.user,
        userStatus: current.runtime.userStatus,
        sync: current.runtime.sync,
      },
    }),
    'app/clear',
  );
  persistNow();
}

// ---------------------------------------------------------------------------
// Owner: whose data the store holds (see the note at the top)

export function getOwner() {
  return owner;
}

/**
 * Switches whose data the store holds.
 * - `data`: the new owner's saved personal data (null for a fresh start). Leave
 *   it out to keep what's in the store, when an account takes over the
 *   progress made in this browser.
 * - `save`: for an account, the function that saves its data to the server.
 * - `flush`: save the previous owner's pending changes first (default true).
 */
export function switchOwner(next, { data, save = null, flush = true } = {}) {
  if (flush) persistNow({ immediate: true });
  owner = next.kind === 'user' ? { kind: 'user', id: next.id } : { kind: 'guest', id: null };
  remoteSave = owner.kind === 'user' ? save : null;
  if (data !== undefined) {
    const slices = personalSlicesFrom(data);
    setState((current) => ({ ...current, ...slices }), 'owner/switch');
    // The data just came from its owner's storage; no need to save it straight back.
    clearTimeout(saveTimer);
    saveTimer = null;
  }
}

/** The guest data saved in this browser (null if there is none). */
export function readGuestData() {
  return readJSON(config.storageKey);
}

/** Gives this browser a fresh guest start, after an account has taken over its progress. */
export function resetGuestData() {
  writeJSON(config.storageKey, { schemaVersion: SCHEMA_VERSION, savedAt: Date.now(), state: personalSlicesFrom(null) });
}

// ---------------------------------------------------------------------------
// Derived selectors (memoized by input references)

let accountMemo = { transactions: null, startingCash: null, value: null };
let valuationMemo = { account: null, quotes: null, value: null };
let dayChangeMemo = { account: null, quotes: null, day: null, value: null };

/** Cash, holdings and realized P/L derived from the ledger. */
export function selectAccount(current = state) {
  const { transactions, startingCash } = current.account;
  if (accountMemo.transactions !== transactions || accountMemo.startingCash !== startingCash) {
    accountMemo = { transactions, startingCash, value: deriveAccount(startingCash, transactions) };
  }
  return accountMemo.value;
}

/** Account valued at the current simulated quotes. */
export function selectValuation(current = state) {
  const account = selectAccount(current);
  const { quotes } = current.runtime;
  if (valuationMemo.account !== account || valuationMemo.quotes !== quotes) {
    valuationMemo = { account, quotes, value: valueAccount(account, quotes) };
  }
  return valuationMemo.value;
}

export function selectDayChange(current = state) {
  const account = selectAccount(current);
  const { quotes } = current.runtime;
  const { day } = current.market;
  if (dayChangeMemo.account !== account || dayChangeMemo.quotes !== quotes || dayChangeMemo.day !== day) {
    dayChangeMemo = { account, quotes, day, value: dayChange(account, quotes, day) };
  }
  return dayChangeMemo.value;
}

export function selectInstrument(symbol, current = state) {
  return current.runtime.instruments.find((instrument) => instrument.symbol === symbol) || null;
}

export const LIMITS = { MAX_TUTOR_MESSAGES, MAX_NOTIFICATIONS };
