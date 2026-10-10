// Application configuration.
//
// dataSource
//   'mock' (default): non-tutor services use their local mock implementations.
//   'api': all services use the Flask backend at apiBaseUrl instead; enable
//   this only after those endpoints exist.
// tutorApiEnabled
//   true: only the tutor calls the local Flask API; other services still use
//   dataSource. Set false to use the prewritten mock tutor.
//
// You can override any value without editing this file by defining
// window.TRADELAB_CONFIG before js/app.js loads, for example:
//   <script>window.TRADELAB_CONFIG = { tutorApiEnabled: false };</script>

const defaults = {
  appName: 'TradeLab',
  version: '0.1.0',
  dataSource: 'mock',
  tutorApiEnabled: true,
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
