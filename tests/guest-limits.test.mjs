import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = {
  dispatchEvent: () => true,
  TRADELAB_CONFIG: {
    dataSource: 'mock',
    apiBaseUrl: '/api',
    mockLatencyMs: 0,
  },
};
globalThis.location = { href: 'http://127.0.0.1:5000/' };

let creations = 0;
let reservations = 0;
globalThis.fetch = async (_url, options) => {
  assert.equal(options.method, 'POST');
  reservations += 1;
  if (creations >= 2) {
    return new Response(JSON.stringify({
      error: {
        code: 'guest_journal_limit',
        message: "You've reached the guest journal limit. Create an account to add more entries.",
      },
    }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  }
  creations += 1;
  return new Response(JSON.stringify({
    authenticated: false,
    limits: {
      journalEntriesCreated: creations,
      journalEntriesRemaining: 2 - creations,
    },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

const { getState, initStore, setState } = await import('../js/state.js');
const { createEntry, deleteEntry, GuestLimitError } = await import('../js/services/journalService.js');
const { advanceMarket } = await import('../js/services/marketDataService.js');
const {
  reserveGuestJournalEntry,
  reserveGuestSimulationDays,
  syncGuestSimulationClock,
} = await import('../js/services/accountService.js');

const validEntry = (symbol) => ({
  symbol,
  entryPrice: '100',
  stopPrice: '90',
  targetPrice: '120',
  thesis: 'A complete sentence explaining the simulated trade thesis.',
  risks: 'A complete sentence explaining the main risk.',
});

test('journal creations use server reservations and deletion does not restore a guest slot', async () => {
  initStore();
  setState((state) => ({
    ...state,
    runtime: {
      ...state.runtime,
      userStatus: 'signed-out',
      instruments: [{ symbol: 'HLCN' }, { symbol: 'MRDH' }, { symbol: 'BRMB' }],
      guestLimits: { journalEntriesRemaining: 2 },
    },
  }), 'test/guest-session');

  await createEntry(validEntry('HLCN'));
  await createEntry(validEntry('MRDH'));
  assert.equal(getState().runtime.guestLimits.journalEntriesRemaining, 0);

  const secondEntry = getState().journal.entries.find((entry) => entry.symbol === 'MRDH');
  await deleteEntry(secondEntry.id);

  setState((state) => ({
    ...state,
    runtime: { ...state.runtime, guestLimits: { journalEntriesRemaining: 200 } },
  }), 'test/tamper-client-limit');
  await assert.rejects(
    createEntry(validEntry('BRMB')),
    (error) => error instanceof GuestLimitError && error.code === 'guest_journal_limit',
  );
  assert.equal(reservations, 3);
  assert.equal(creations, 2);
  assert.equal(getState().runtime.guestLimits.journalEntriesRemaining, 0);
  assert.equal(getState().journal.entries.some((entry) => entry.symbol === 'BRMB'), false);
});

test('quota bypass decisions are made by the server, not the client sign-in flag', async () => {
  let authenticatedChecks = 0;
  globalThis.fetch = async () => {
    authenticatedChecks += 1;
    return new Response(JSON.stringify({ authenticated: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  initStore();
  setState((state) => ({
    ...state,
    runtime: { ...state.runtime, userStatus: 'signed-in' },
  }), 'test/claimed-sign-in');

  await reserveGuestSimulationDays(1);
  await reserveGuestJournalEntry();

  assert.equal(authenticatedChecks, 2);
});

test('server-owned simulation time replaces a manipulated guest clock before trading', async () => {
  globalThis.fetch = async (_url, options) => {
    assert.equal(options.method, 'GET');
    return new Response(JSON.stringify({
      authenticated: false,
      limits: {
        simulationDaysUsed: 3,
        simulationDaysRemaining: 18,
        simulationDay: 18,
        journalEntriesCreated: 0,
        journalEntriesRemaining: 2,
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  initStore();
  setState((state) => ({
    ...state,
    market: { ...state.market, day: 200 },
    runtime: {
      ...state.runtime,
      userStatus: 'signed-in',
      instruments: [],
      guestLimits: { simulationDay: 200 },
    },
  }), 'test/manipulated-clock');

  await syncGuestSimulationClock();

  assert.equal(getState().market.day, 18);
  assert.equal(getState().runtime.guestLimits.simulationDaysRemaining, 18);
});

test('changing the local sign-in flag cannot bypass the server simulation quota', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({
    error: {
      code: 'guest_simulation_limit',
      message: "You've reached the guest simulation limit. Create an account to continue using TradeLab.",
    },
  }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  initStore();
  setState((state) => ({
    ...state,
    market: { ...state.market, day: 36 },
    runtime: { ...state.runtime, userStatus: 'signed-in' },
  }), 'test/tampered-authenticated-flag');

  await assert.rejects(
    advanceMarket(1),
    (error) => error.code === 'guest_simulation_limit',
  );
  assert.equal(getState().market.day, 36);
});
