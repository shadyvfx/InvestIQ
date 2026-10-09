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

import { config, isMock } from './config.js';
import { readJSON, writeJSON, removeKey, storageAvailable } from './storage.js';
import { latestTradingDay, localTodayISO } from './core/calendar.js';
import { deriveAccount, valueAccount, dayChange } from './core/portfolio.js';
import { createExampleData } from './data/exampleAccount.js';

export const SCHEMA_VERSION = 1;

const PERSISTED_SLICES = ['meta', 'market', 'account', 'watchlist', 'learning', 'journal', 'tutor', 'notifications', 'preferences', 'ui'];
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

function sanitize(saved, defaults) {
  const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value);
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

/** Loads persisted state (or creates a new account) and returns it. */
export function initStore() {
  const saved = readJSON(config.storageKey);
  const defaults = createInitialState({ examples: false });
  if (saved && saved.schemaVersion === SCHEMA_VERSION && saved.state) {
    state = sanitize(saved.state, defaults);
  } else {
    state = createInitialState();
  }
  state.runtime = freshRuntime();
  persistNow();

  // Save immediately when the tab is hidden or closed. Other platforms (a
  // React Native app, say) can call persistNow() from their own lifecycle hooks.
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    window.addEventListener('pagehide', persistNow);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') persistNow();
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

function snapshot() {
  const out = {};
  for (const slice of PERSISTED_SLICES) out[slice] = state[slice];
  return { schemaVersion: SCHEMA_VERSION, savedAt: Date.now(), state: out };
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persistNow, 150);
}

/** Writes the persisted slices now instead of waiting for the debounce. */
export function persistNow() {
  clearTimeout(saveTimer);
  saveTimer = null;
  if (!state) return;
  const ok = writeJSON(config.storageKey, snapshot());
  if (!ok && !state.runtime.saveFailed) {
    state = { ...state, runtime: { ...state.runtime, saveFailed: true } };
    if (typeof window !== 'undefined' && typeof CustomEvent === 'function') {
      window.dispatchEvent(new CustomEvent('tradelab:storage-unavailable'));
    }
  }
}

/** Removes everything TradeLab stored and starts over with example data. */
export function clearAllData() {
  removeKey(config.storageKey);
  const runtime = state?.runtime;
  setState(() => ({ ...createInitialState(), runtime: { ...freshRuntime(), instruments: runtime?.instruments ?? [] } }), 'app/clear');
  persistNow();
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
