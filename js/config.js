// Application configuration.
//
// dataSource
//   'mock' (default): every service uses the local mock implementation.
//   'api': services call the Flask backend at apiBaseUrl instead. Nothing in
//   the pages or components needs to change; see docs/integration.md.
//
// You can override any value without editing this file by defining
// window.TRADELAB_CONFIG before js/app.js loads, for example:
//   <script>window.TRADELAB_CONFIG = { dataSource: 'api' };</script>

const defaults = {
  appName: 'TradeLab',
  version: '0.1.0',
  dataSource: 'mock',
  apiBaseUrl: '/api',
  apiTimeoutMs: 15000,
  tutorTimeoutMs: 120000,
  storageKey: 'tradelab:v1',
  defaultStartingCash: 10000,
  startingCashOptions: [10000, 25000, 100000],
  /** Artificial delay for mock tutor replies, so the loading state is visible. */
  mockTutorDelayMs: [500, 900],
  /** Small delay for mock orders and market moves, mimicking a network round trip. */
  mockLatencyMs: 180,
};

const overrides = typeof window !== 'undefined' && window.TRADELAB_CONFIG ? window.TRADELAB_CONFIG : {};

export const config = Object.freeze({ ...defaults, ...overrides });

export const isMock = () => config.dataSource !== 'api';
