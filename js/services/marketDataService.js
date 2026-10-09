// Market data: instruments, quotes, price history and the simulated clock.
//
// The UI only calls the functions exported at the bottom. Each one delegates
// to an adapter: `mock` runs the local price model, `remote` calls the future
// Flask API. Results are written into the store the same way for both.
//
// FLASK: implement these endpoints to switch to the remote adapter
//   GET  /api/market/instruments                 -> { instruments: Instrument[] }
//   GET  /api/market/clock                       -> { startDate, day, date, maxDay }
//   GET  /api/market/quotes?symbols=HLCN,SKLF    -> { quotes: { [symbol]: Quote } }
//   GET  /api/market/history/HLCN?range=3M       -> History
//   GET  /api/market/sparklines?symbols=..&days=30 -> { sparklines: { [symbol]: number[] } }
//   POST /api/market/advance  { days }           -> { startDate, day, date, maxDay }
// Shapes are documented in docs/integration.md.

import { isMock } from '../config.js';
import { api, simulateLatency } from './apiClient.js';
import { getState, setState, updateSlice } from '../state.js';
import { createDayCalendar } from '../core/calendar.js';
import * as model from '../data/mockMarketData.js';

export const MARKET_SOURCE = model.MARKET_SOURCE;
export const RANGES = model.RANGES;
export const MAX_SIM_DAY = model.MAX_SIM_DAY;

const calendarFor = (startDate) => createDayCalendar(startDate, -model.HISTORY_DAYS, model.MAX_SIM_DAY);

function sessionTimestamp(date, minute) {
  if (minute === undefined) return date;
  const total = 9 * 60 + 30 + minute;
  const h = String(Math.floor(total / 60)).padStart(2, '0');
  const m = String(total % 60).padStart(2, '0');
  return `${date}T${h}:${m}`;
}

// ---------------------------------------------------------------------------
// Mock adapter: the clock lives in the store; prices come from the model.
const mock = {
  async getInstruments() {
    return model.INSTRUMENTS.map(({ symbol, name, sector, kind, description }) => ({ symbol, name, sector, kind, description }));
  },

  async getClock() {
    const { startDate, day } = getState().market;
    return { startDate, day, date: calendarFor(startDate)(day), maxDay: model.MAX_SIM_DAY };
  },

  async getQuotes(symbols) {
    const { day } = getState().market;
    return Object.fromEntries(symbols.map((symbol) => [symbol, model.quoteAt(symbol, day)]));
  },

  async getHistory(symbol, range) {
    const { startDate, day } = getState().market;
    const history = model.historyAt(symbol, range, day);
    const dateOf = calendarFor(startDate);
    return {
      ...history,
      points: history.points.map((point) => ({ ...point, t: sessionTimestamp(dateOf(point.day), point.minute) })),
    };
  },

  async getSparklines(symbols, days) {
    const { day } = getState().market;
    return Object.fromEntries(symbols.map((symbol) => [symbol, model.recentCloses(symbol, day, days)]));
  },

  async advance(days) {
    await simulateLatency();
    const { day } = getState().market;
    const next = Math.min(model.MAX_SIM_DAY, day + days);
    updateSlice('market', (market) => ({ ...market, day: next }), 'market/advanced');
    return mock.getClock();
  },
};

// ---------------------------------------------------------------------------
// Remote adapter: the Flask backend owns the clock and the prices.
const remote = {
  getInstruments: () => api.get('/market/instruments').then((response) => response.instruments),
  getClock: () => api.get('/market/clock'),
  getQuotes: (symbols) => api.get('/market/quotes', { query: { symbols: symbols.join(',') } }).then((response) => response.quotes),
  getHistory: (symbol, range) => api.get(`/market/history/${encodeURIComponent(symbol)}`, { query: { range } }),
  getSparklines: (symbols, days) =>
    api.get('/market/sparklines', { query: { symbols: symbols.join(','), days } }).then((response) => response.sparklines),
  advance: (days) => api.post('/market/advance', { days }),
};

const adapter = isMock() ? mock : remote;

// ---------------------------------------------------------------------------
// Public API used by pages and components

function setRuntime(patch, action) {
  setState((state) => ({ ...state, runtime: { ...state.runtime, ...patch } }), action);
}

function commitClock(clock) {
  const { market, runtime } = getState();
  if (market.startDate !== clock.startDate || market.day !== clock.day) {
    updateSlice('market', () => ({ startDate: clock.startDate, day: clock.day }), 'market/clock');
  }
  if (Number.isFinite(clock.maxDay) && runtime.maxDay !== clock.maxDay) setRuntime({ maxDay: clock.maxDay }, 'market/maxDay');
}

/** Loads instruments, the clock and quotes. Called once at startup. */
export async function initMarket() {
  setRuntime({ marketStatus: 'loading', marketError: null }, 'market/loading');
  try {
    const instruments = await adapter.getInstruments();
    const clock = await adapter.getClock();
    commitClock(clock);
    const quotes = await adapter.getQuotes(instruments.map((instrument) => instrument.symbol));
    setRuntime({ instruments, quotes, marketStatus: 'ready' }, 'market/ready');
  } catch (error) {
    setRuntime({ marketStatus: 'error', marketError: error.message || 'Market data could not be loaded.' }, 'market/error');
    throw error;
  }
}

export async function refreshQuotes() {
  const { instruments } = getState().runtime;
  const quotes = await adapter.getQuotes(instruments.map((instrument) => instrument.symbol));
  setRuntime({ quotes }, 'market/quotes');
  return quotes;
}

/** Moves the simulated market forward. Prices only change when this runs. */
export async function advanceMarket(days = 1) {
  const clock = await adapter.advance(days);
  commitClock(clock);
  await refreshQuotes();
  return clock;
}

export function getHistory(symbol, range) {
  return adapter.getHistory(symbol, range);
}

export function getSparklines(symbols, days = 30) {
  return adapter.getSparklines(symbols, days);
}

/** Closing price for a symbol on a simulated day (mock model only). */
export function closeOnDay(symbol, day) {
  return model.closeAt(symbol, day);
}

/** Calendar date ('YYYY-MM-DD') of a simulated day for the current account. */
export function dateOfDay(day, startDate = getState().market.startDate) {
  return calendarFor(startDate)(day);
}

export function canAdvance(days = 1) {
  const { market, runtime } = getState();
  return market.day + days <= (runtime.maxDay ?? model.MAX_SIM_DAY);
}
