// Paper trading: placing simulated orders, resetting the account and
// computing performance. All money is virtual.
//
// The order rules live in core/orders.js (pure functions). The mock adapter
// runs them locally against the simulated price; a Flask backend should run
// the same rules server-side and return the same error codes.
//
// FLASK: implement these endpoints to switch to the remote adapter
//   GET  /api/account                     -> { startingCash, transactions: Transaction[] }
//   POST /api/orders  { symbol, side, quantity, type: 'market' }
//                                         -> { transaction } | 400 { error: { code, message, field } }
//   POST /api/account/reset { startingCash } -> { startingCash, transactions: [], clock }
//   GET  /api/portfolio/performance       -> { points: [{ day, date, equity }] }

import { isMock } from '../config.js';
import { api, ApiError, simulateLatency, localId } from './apiClient.js';
import { getState, setState, selectAccount, selectValuation } from '../state.js';
import { executeMarketOrder } from '../core/orders.js';
import { equityCurve, positionQuantity } from '../core/portfolio.js';
import { latestTradingDay, localTodayISO } from '../core/calendar.js';
import { closeOnDay, dateOfDay, refreshQuotes } from './marketDataService.js';

export class OrderError extends Error {
  constructor(errors) {
    super(errors[0]?.message || 'The order could not be placed.');
    this.name = 'OrderError';
    this.errors = errors;
  }
}

// ---------------------------------------------------------------------------
// Mock adapter: the ledger in the store acts as the "server" database.
const mock = {
  async placeOrder(order) {
    await simulateLatency();
    const state = getState();
    const quote = state.runtime.quotes[order.symbol];
    const account = selectAccount(state);
    const valuation = selectValuation(state);
    const result = executeMarketOrder({
      order,
      price: quote?.price,
      cash: account.cash,
      positionQuantity: positionQuantity(account, order.symbol),
      equity: valuation.equity,
      day: state.market.day,
      id: localId('tx'),
    });
    if (!result.ok) throw new OrderError(result.errors);
    return { transaction: result.transaction };
  },

  async resetAccount({ startingCash }) {
    await simulateLatency();
    return {
      startingCash,
      transactions: [],
      clock: { startDate: latestTradingDay(localTodayISO()), day: 0 },
    };
  },

  async getPerformance() {
    const state = getState();
    const { day } = state.market;
    const points = equityCurve({
      startingCash: state.account.startingCash,
      transactions: state.account.transactions,
      fromDay: 0,
      toDay: day,
      closeOf: closeOnDay,
    });
    return { points: points.map((point) => ({ ...point, date: dateOfDay(point.day) })) };
  },
};

// ---------------------------------------------------------------------------
// Remote adapter
const remote = {
  getAccount: () => api.get('/account'),

  async placeOrder(order) {
    try {
      return await api.post('/orders', order);
    } catch (error) {
      if (error instanceof ApiError && error.status === 400) {
        throw new OrderError([{ field: error.field || 'quantity', code: error.code, message: error.message }]);
      }
      throw error;
    }
  },
  resetAccount: (body) => api.post('/account/reset', body),
  getPerformance: () => api.get('/portfolio/performance'),
};

const adapter = isMock() ? mock : remote;

// ---------------------------------------------------------------------------
// Public API

/**
 * Loads the ledger from the backend at startup. In mock mode the ledger
 * already lives in the store, so there is nothing to load.
 */
export async function loadAccount() {
  if (isMock()) return;
  const account = await remote.getAccount();
  setState(
    (state) => ({
      ...state,
      account: { ...state.account, startingCash: account.startingCash, transactions: account.transactions || [] },
    }),
    'account/loaded',
  );
}

/**
 * Places a simulated market order and records the fill in the ledger.
 * @param {{symbol:string, side:'buy'|'sell', quantity:number}} order
 * @returns {Promise<object>} the transaction
 * @throws {OrderError} when the order breaks a rule (not enough cash or shares)
 */
export async function placeOrder(order) {
  const { transaction } = await adapter.placeOrder({ ...order, type: 'market' });
  setState(
    (state) => ({
      ...state,
      account: { ...state.account, transactions: [...state.account.transactions, transaction] },
    }),
    'account/orderFilled',
  );
  return transaction;
}

/**
 * Starts an empty account with the chosen virtual balance. Example journal
 * entries (which describe the example trades) are removed; the learner's own
 * entries, lessons and preferences are kept.
 */
export async function resetAccount(startingCash) {
  const result = await adapter.resetAccount({ startingCash });
  setState(
    (state) => ({
      ...state,
      meta: { ...state.meta, exampleData: false },
      market: { startDate: result.clock.startDate, day: result.clock.day },
      account: { startingCash: result.startingCash, transactions: result.transactions, createdAt: Date.now() },
      journal: { ...state.journal, entries: state.journal.entries.filter((entry) => !entry.example) },
    }),
    'account/reset',
  );
  await refreshQuotes();
}

/** Account value at each simulated day's close since the account opened. */
export async function getPerformance() {
  return adapter.getPerformance();
}

export function transactionById(id) {
  return getState().account.transactions.find((tx) => tx.id === id) || null;
}
