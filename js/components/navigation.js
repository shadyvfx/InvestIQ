// Application shell: sidebar navigation (a drawer on small screens), the
// header with page title, search, simulation notice, notifications and the
// profile menu.

import { html, render, $, on } from '../utils/dom.js';
import { getState, updateSlice, watch } from '../state.js';
import { ROUTES } from '../router.js';
import { formatDate, relativeTime } from '../utils/format.js';
import { icon, logoMark } from './icons.js';
import { openCommandPalette } from './commandPalette.js';
import { markAllRead, clearNotifications, unreadCount } from './notifications.js';
import { openDialog } from './modals.js';
import { MARKET_SOURCE, dateOfDay } from '../services/marketDataService.js';

const mobileQuery = window.matchMedia('(max-width: 899px)');
const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

function navItem(route) {
  return html`<li><a class="nav-link" href="#${route.path}" data-route="${route.id}" title="${route.title}">
    ${icon(route.icon, { className: 'nav-link__icon' })}<span class="nav-link__label">${route.title}</span>
  </a></li>`;
}

function shellMarkup() {
  const main = ROUTES.filter((route) => route.nav && route.navGroup !== 'bottom');
  const bottom = ROUTES.filter((route) => route.nav && route.navGroup === 'bottom');
  return html`<div class="sidebar" id="sidebar">
      <a class="sidebar__brand" href="#/" aria-label="TradeLab, go to Overview">${logoMark()}<span class="brand-name">TradeLab</span></a>
      <nav class="sidebar__nav" aria-label="Primary">
        <ul class="nav-list">${main.map(navItem)}</ul>
        <div class="stack-sm">
          <ul class="nav-list">${bottom.map(navItem)}</ul>
          <p class="sidebar__note"><span class="hatch" aria-hidden="true"></span><span class="sidebar__note-text">Practice environment: virtual money and simulated prices only.</span></p>
        </div>
      </nav>
    </div>
    <div class="scrim" data-shell="scrim" aria-hidden="true"></div>
    <div class="workspace" id="workspace">
      <header class="topbar">
        <div class="topbar__start">
          <button type="button" class="icon-btn" id="nav-toggle" aria-controls="sidebar"></button>
          <div class="topbar__titles">
            <nav class="topbar__crumb" id="page-crumb" aria-label="Breadcrumb" hidden></nav>
            <h1 class="topbar__title" id="page-title">TradeLab</h1>
          </div>
        </div>
        <div class="topbar__end">
          <button type="button" class="search-trigger" id="search-trigger" aria-keyshortcuts="${isMac ? 'Meta+K' : 'Control+K'} /">
            ${icon('search')}<span class="search-trigger__label">Search</span><kbd class="search-trigger__kbd">${isMac ? '⌘ K' : 'Ctrl K'}</kbd>
          </button>
          <div class="pop-anchor">
            <button type="button" class="sim-pill" id="sim-trigger" aria-expanded="false" aria-controls="sim-popover">
              <span class="hatch" aria-hidden="true"></span><strong>Simulated</strong><span class="sim-pill__extra">Virtual money</span>
            </button>
            <div class="popover" id="sim-popover" role="dialog" aria-label="About the practice environment" hidden></div>
          </div>
          <div class="pop-anchor">
            <button type="button" class="icon-btn" id="bell-trigger" aria-expanded="false" aria-controls="bell-popover" aria-label="Notifications">
              ${icon('bell')}<span class="count-badge" id="bell-count" hidden></span>
            </button>
            <div class="popover" id="bell-popover" role="dialog" aria-label="Notifications" hidden></div>
          </div>
          <div class="pop-anchor">
            <button type="button" class="icon-btn" id="profile-trigger" aria-expanded="false" aria-controls="profile-popover" aria-label="Profile and settings">
              <span class="avatar" aria-hidden="true">DL</span>
            </button>
            <div class="popover popover--menu" id="profile-popover" hidden></div>
          </div>
        </div>
      </header>
      <main class="main" id="main" tabindex="-1">
        <div class="view" id="view"></div>
      </main>
    </div>`;
}

// ---------------------------------------------------------------------------
// Popovers: one open at a time, close on outside click or Escape.

function createPopovers(root) {
  let openPair = null;

  const close = ({ restoreFocus = false } = {}) => {
    if (!openPair) return;
    const { trigger, panel } = openPair;
    panel.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    openPair = null;
    if (restoreFocus) trigger.focus();
  };

  const toggle = (trigger, panel, onOpen) => {
    if (openPair?.panel === panel) {
      close();
      return;
    }
    close();
    onOpen?.(panel);
    panel.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    openPair = { trigger, panel };
  };

  document.addEventListener('pointerdown', (event) => {
    if (!openPair) return;
    const target = event.target;
    if (openPair.panel.contains(target) || openPair.trigger.contains(target)) return;
    close();
  });
  root.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && openPair) {
      event.stopPropagation();
      close({ restoreFocus: true });
    }
  });

  return { toggle, close };
}

function simPopoverContent() {
  const { market } = getState();
  return html`<div class="popover__head"><p class="popover__title">Practice environment</p>${''}</div>
    <div class="popover__text">
      <p><strong>Virtual money.</strong> Your account balance is not real money and nothing connects to a broker.</p>
      <p><strong>${MARKET_SOURCE.name}.</strong> ${MARKET_SOURCE.description}</p>
      <p><strong>Simulated day ${market.day}</strong>, ${formatDate(dateOfDay(market.day), 'long')}. Prices change only when you advance the simulated market.</p>
      <p><strong>TradeLab Tutor</strong> runs in preview mode with prewritten answers.</p>
    </div>`;
}

function bellContent() {
  const { items } = getState().notifications;
  return html`<div class="popover__head">
      <p class="popover__title">Notifications</p>
      ${items.length ? html`<button type="button" class="btn btn--ghost btn--sm" data-shell="clear-notifications">Clear all</button>` : ''}
    </div>
    <div class="popover__body">
      ${items.length
        ? html`<ul class="notice-list">${items.map(
            (item) => html`<li class="notice${item.read ? '' : ' notice--unread'}">
              <span class="notice__dot" aria-hidden="true"></span>
              <div>
                <p class="notice__title">${item.href ? html`<a class="link" href="${item.href}">${item.title}</a>` : item.title}</p>
                ${item.body ? html`<p class="notice__body">${item.body}</p>` : ''}
                <p class="notice__time">${relativeTime(item.createdAt)}${item.read ? '' : html`<span class="sr-only">, unread</span>`}</p>
              </div>
            </li>`,
          )}</ul>`
        : html`<p class="popover__text">No notifications yet. Simulated order fills and finished lessons will show up here.</p>`}
    </div>`;
}

function profileContent() {
  return html`<div class="popover__head">
      <div><p class="popover__title">Demo learner</p><p class="tiny faint">Local profile. Data stays in this browser.</p></div>
    </div>
    <ul class="menu">
      <li><a class="menu__item" href="#/settings">${icon('settings')}Settings</a></li>
      <li><a class="menu__item" href="#/learn">${icon('learn')}Learning progress</a></li>
      <li><button type="button" class="menu__item" data-shell="shortcuts">${icon('keyboard')}Keyboard shortcuts</button></li>
    </ul>`;
}

function showShortcuts() {
  const mod = isMac ? '⌘' : 'Ctrl';
  openDialog({
    title: 'Keyboard shortcuts',
    body: html`<dl class="kv">
      <div class="kv__row"><dt class="kv__key">Search pages, stocks and lessons</dt><dd class="kv__val"><kbd>${mod}</kbd> <kbd>K</kbd> or <kbd>/</kbd></dd></div>
      <div class="kv__row"><dt class="kv__key">Close a dialog, menu or the navigation drawer</dt><dd class="kv__val"><kbd>Esc</kbd></dd></div>
      <div class="kv__row"><dt class="kv__key">Send a message to the tutor</dt><dd class="kv__val"><kbd>Enter</kbd></dd></div>
      <div class="kv__row"><dt class="kv__key">New line in a tutor message</dt><dd class="kv__val"><kbd>Shift</kbd> <kbd>Enter</kbd></dd></div>
    </dl>`,
    actions: [{ label: 'Done', value: true, variant: 'primary' }],
  });
}

/**
 * Builds the shell inside `root` and returns controls used by app.js.
 * @param {{ navigate: (href:string) => void, onCommand: (name:string) => void }} options
 */
export function mountShell(root, { navigate, onCommand }) {
  render(root, shellMarkup());
  root.classList.add('app');

  const sidebar = $('#sidebar', root);
  const workspace = $('#workspace', root);
  const toggle = $('#nav-toggle', root);
  const popovers = createPopovers(root);

  const drawerOpen = () => root.dataset.drawer === 'open';

  const syncToggle = () => {
    if (mobileQuery.matches) {
      const open = drawerOpen();
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
      render(toggle, icon('menu'));
    } else {
      const collapsed = getState().ui.sidebarCollapsed;
      toggle.setAttribute('aria-expanded', String(!collapsed));
      toggle.setAttribute('aria-label', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
      render(toggle, icon('sidebar'));
    }
  };

  const applySidebar = () => {
    root.dataset.sidebar = !mobileQuery.matches && getState().ui.sidebarCollapsed ? 'collapsed' : 'expanded';
    syncToggle();
  };

  const openDrawer = () => {
    root.dataset.drawer = 'open';
    workspace.inert = true;
    syncToggle();
    sidebar.querySelector('[aria-current="page"], .nav-link')?.focus();
  };

  const closeDrawer = ({ restoreFocus = false } = {}) => {
    if (!drawerOpen()) return;
    root.dataset.drawer = 'closed';
    workspace.inert = false;
    syncToggle();
    if (restoreFocus) toggle.focus();
  };

  toggle.addEventListener('click', () => {
    if (mobileQuery.matches) {
      if (drawerOpen()) closeDrawer({ restoreFocus: true });
      else openDrawer();
    } else {
      updateSlice('ui', (ui) => ({ ...ui, sidebarCollapsed: !ui.sidebarCollapsed }), 'ui/sidebar');
    }
  });

  $('[data-shell="scrim"]', root).addEventListener('click', () => closeDrawer({ restoreFocus: true }));
  sidebar.addEventListener('click', (event) => {
    if (event.target instanceof Element && event.target.closest('a')) closeDrawer();
  });
  root.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && drawerOpen()) closeDrawer({ restoreFocus: true });
  });
  mobileQuery.addEventListener('change', () => {
    closeDrawer();
    applySidebar();
  });

  // Search
  const openSearch = () => {
    popovers.close();
    openCommandPalette({ navigate, onAction: onCommand });
  };
  $('#search-trigger', root).addEventListener('click', openSearch);
  document.addEventListener('keydown', (event) => {
    const target = event.target;
    const typing = target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
    if ((event.key === 'k' || event.key === 'K') && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      if (!document.querySelector('dialog[open]')) openSearch();
    } else if (event.key === '/' && !typing && !event.metaKey && !event.ctrlKey && !document.querySelector('dialog[open]')) {
      event.preventDefault();
      openSearch();
    }
  });

  // Popovers
  const simTrigger = $('#sim-trigger', root);
  const simPanel = $('#sim-popover', root);
  simTrigger.addEventListener('click', () => popovers.toggle(simTrigger, simPanel, (panel) => render(panel, simPopoverContent())));

  const bellTrigger = $('#bell-trigger', root);
  const bellPanel = $('#bell-popover', root);
  bellTrigger.addEventListener('click', () =>
    popovers.toggle(bellTrigger, bellPanel, (panel) => {
      render(panel, bellContent());
      markAllRead();
    }),
  );
  on(bellPanel, 'click', '[data-shell="clear-notifications"]', () => {
    clearNotifications();
    render(bellPanel, bellContent());
    bellTrigger.focus();
  });
  on(bellPanel, 'click', 'a', () => popovers.close());

  const profileTrigger = $('#profile-trigger', root);
  const profilePanel = $('#profile-popover', root);
  profileTrigger.addEventListener('click', () => popovers.toggle(profileTrigger, profilePanel, (panel) => render(panel, profileContent())));
  on(profilePanel, 'click', 'a, button', (event, element) => {
    popovers.close();
    if (element.dataset.shell === 'shortcuts') showShortcuts();
  });

  const badge = $('#bell-count', root);
  const paintBadge = () => {
    const count = unreadCount();
    badge.hidden = count === 0;
    badge.textContent = count > 9 ? '9+' : String(count);
    bellTrigger.setAttribute('aria-label', count ? `Notifications, ${count} unread` : 'Notifications');
  };
  watch((state) => state.notifications, () => {
    paintBadge();
    if (!bellPanel.hidden) render(bellPanel, bellContent());
  });
  watch((state) => state.ui.sidebarCollapsed, applySidebar);
  paintBadge();
  applySidebar();

  return {
    view: $('#view', root),
    main: $('#main', root),
    closeDrawer,
    closePopovers: () => popovers.close(),
    setActive(routeId) {
      for (const link of root.querySelectorAll('.nav-link')) {
        if (link.dataset.route === routeId) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
      }
    },
    setTitle(title, crumbs = []) {
      $('#page-title', root).textContent = title;
      const crumb = $('#page-crumb', root);
      crumb.hidden = crumbs.length === 0;
      render(crumb, crumbs.map((item) => html`<a href="${item.href}">${item.label}</a>${icon('chevron-right', { size: 12 })}`));
      document.title = `${title} – TradeLab`;
    },
  };
}
