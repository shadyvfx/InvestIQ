// TradeLab entry point: loads state, applies preferences, mounts the shell,
// loads simulated market data and starts the router.

import { html, render } from './utils/dom.js';
import { initStore, getState, watch } from './state.js';
import { createRouter } from './router.js';
import { mountShell } from './components/navigation.js';
import { refreshChartsTheme } from './components/charts.js';
import { toast, announce } from './components/notifications.js';
import { advanceMarket } from './services/marketDataService.js';
import { loadAppData } from './services/session.js';
import { logoMark } from './components/icons.js';

import dashboard from './pages/dashboard.js';
import learn from './pages/learn.js';
import lesson from './pages/lesson.js';
import practice from './pages/practice.js';
import portfolio from './pages/portfolio.js';
import journal from './pages/journal.js';
import tutor from './pages/tutor.js';
import settings from './pages/settings.js';
import account from './pages/account.js';
import notFound from './pages/notFound.js';

const PAGES = {
  overview: dashboard,
  learn,
  lesson,
  practice,
  'practice-symbol': practice,
  portfolio,
  journal,
  tutor,
  settings,
  account,
  'not-found': notFound,
};

/** Mirrors preferences onto <html> data attributes that tokens.css reads. */
function applyPreferences(preferences) {
  const root = document.documentElement;
  if (preferences.theme === 'system') root.removeAttribute('data-theme');
  else root.dataset.theme = preferences.theme === 'light' ? 'light' : 'dark';
  root.dataset.movement = preferences.movement === 'blue-orange' ? 'blue-orange' : 'green-red';
  root.dataset.density = preferences.density === 'compact' ? 'compact' : 'comfortable';
  if (preferences.motion === 'reduce') root.dataset.motion = 'reduce';
  else root.removeAttribute('data-motion');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = getComputedStyle(root).getPropertyValue('--ground').trim() || '#131518';
}

function showFatal(error) {
  console.error(error);
  const container = document.getElementById('app');
  render(
    container,
    html`<div class="boot">
      ${logoMark()}
      <p class="boot__error"><strong>TradeLab couldn't start.</strong> ${error?.message || 'An unexpected error occurred.'}</p>
      <p class="small">If you opened index.html directly from your files, start the local server instead (see README.md), then reload.</p>
      <button type="button" class="btn btn--secondary" data-reload>Reload</button>
    </div>`,
  );
  container.querySelector('[data-reload]')?.addEventListener('click', () => window.location.reload());
}

async function boot() {
  initStore();
  applyPreferences(getState().preferences);

  const app = document.getElementById('app');
  let router = null;
  const shell = mountShell(app, {
    navigate: (to) => router.navigate(to),
    onCommand: async (name) => {
      if (name === 'advance-day') {
        try {
          await advanceMarket(1);
          announce(`Advanced to simulated day ${getState().market.day}.`);
          toast({ title: `Simulated day ${getState().market.day}`, body: 'The simulated market moved forward one trading day.', tone: 'info' });
        } catch (error) {
          toast({ title: 'The simulated market could not advance', body: error.message, tone: 'error' });
        }
      }
    },
  });

  document.querySelector('.skip-link')?.addEventListener('click', (event) => {
    event.preventDefault();
    shell.main.focus();
  });

  watch((state) => state.preferences, (preferences) => {
    applyPreferences(preferences);
    requestAnimationFrame(refreshChartsTheme);
  });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getState().preferences.theme === 'system') requestAnimationFrame(refreshChartsTheme);
  });
  window.addEventListener('tradelab:storage-unavailable', () => {
    toast({
      title: 'Progress is not being saved',
      body: 'This browser is blocking local storage, so changes will reset when you close the tab.',
      tone: 'error',
      duration: 10000,
    });
  });

  render(shell.view, html`<div class="loading-row" role="status"><span class="dots" aria-hidden="true"><i></i><i></i><i></i></span><span>Loading the simulated market…</span></div>`);
  try {
    await loadAppData();
  } catch (error) {
    render(
      shell.view,
      html`<div class="empty"><p class="empty__title">TradeLab data could not be loaded</p><p class="empty__text">${error.message}</p><div class="empty__actions"><button type="button" class="btn btn--secondary btn--sm" data-reload>Try again</button></div></div>`,
    );
    shell.view.querySelector('[data-reload]')?.addEventListener('click', () => window.location.reload());
    return;
  }

  let current = { page: null, instance: null, routeId: null };

  router = createRouter({
    onRoute(match, previous, { remount = false } = {}) {
      const page = PAGES[match.route.id] || notFound;
      const parentId = match.route.parent || match.route.id;
      shell.setActive(parentId);
      shell.closePopovers();

      const ctx = {
        params: match.params,
        query: match.query,
        path: match.path,
        navigate: (to, options) => router.navigate(to, options),
        setTitle: (title, crumbs) => shell.setTitle(title, crumbs),
      };

      // Rebuilding after someone signed in or out: pages that manage that
      // themselves (the Account page) stay as they are.
      if (remount && page.keepOnOwnerChange && current.page === page) return;

      // Same page with new parameters (for example another stock): update in place.
      if (!remount && current.page === page && current.instance?.update && previous) {
        current.instance.update(ctx);
        return;
      }

      try {
        current.instance?.cleanup?.();
      } catch (error) {
        console.error(error);
      }

      shell.setTitle(match.route.title);
      const result = page.mount(shell.view, ctx);
      const instance = typeof result === 'function' ? { cleanup: result } : result || {};
      current = { page, instance, routeId: match.route.id };

      if (previous && !remount) {
        window.scrollTo({ top: 0 });
        shell.main.focus({ preventScroll: true });
        announce(`${document.getElementById('page-title')?.textContent || match.route.title} page`);
      }
    },
  });

  // Signing in or out swaps whose progress is in the store; rebuild the page
  // so nothing from the previous person stays on screen.
  window.addEventListener('tradelab:owner-changed', () => router.refresh({ remount: true }));

  router.start();
}

boot().catch(showFatal);
