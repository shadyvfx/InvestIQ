// Loads the data every page needs. Used at startup and after Settings clears
// the data stored in this browser.
//
// Mock mode: only the simulated market loads. The account, lesson progress
// and journal already live in the store (persisted in localStorage).
// API mode: all four come from the backend; the store acts as a cache.
// Either way, the TradeLab server is asked who is signed in first, so a
// signed-in account's own progress (and simulated day) is in the store before
// anything renders. If the server isn't running, the app starts with this
// browser's guest data and the Account page explains how to start it.

import { initMarket } from './marketDataService.js';
import { loadAccount } from './tradingService.js';
import { loadProgress } from './progressService.js';
import { loadEntries } from './journalService.js';
import { loadAccountSession } from './accountService.js';

export async function loadAppData() {
  await loadAccountSession();
  await Promise.all([initMarket(), loadAccount(), loadProgress(), loadEntries()]);
}
