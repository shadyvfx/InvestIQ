// Loads the data every page needs. Used at startup and after Settings clears
// the data stored in this browser.
//
// Mock mode: only the simulated market loads. The account, lesson progress
// and journal already live in the store (persisted in localStorage).
// API mode: all four come from the backend; the store acts as a cache.

import { initMarket } from './marketDataService.js';
import { loadAccount } from './tradingService.js';
import { loadProgress } from './progressService.js';
import { loadEntries } from './journalService.js';

export async function loadAppData() {
  await Promise.all([initMarket(), loadAccount(), loadProgress(), loadEntries()]);
}
