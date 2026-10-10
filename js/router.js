// Hash-based router: #/learn/what-is-a-stock?section=2
//
// Hash routing works with any static file server, inside WebViews (for a
// future mobile wrapper) and without server rewrite rules. In-app links are
// intercepted so navigation never depends on the hashchange event alone,
// which keeps the app usable even where history updates are restricted.

export const ROUTES = [
  { id: 'overview', path: '/', title: 'Overview', nav: true, icon: 'overview' },
  { id: 'learn', path: '/learn', title: 'Learn', nav: true, icon: 'learn' },
  { id: 'lesson', path: '/learn/:lessonId', title: 'Lesson', parent: 'learn' },
  { id: 'practice', path: '/practice', title: 'Practice Trading', nav: true, icon: 'practice' },
  { id: 'practice-symbol', path: '/practice/:symbol', title: 'Practice Trading', parent: 'practice' },
  { id: 'portfolio', path: '/portfolio', title: 'Portfolio', nav: true, icon: 'portfolio' },
  { id: 'journal', path: '/journal', title: 'Trading Journal', nav: true, icon: 'journal' },
  { id: 'tutor', path: '/tutor', title: 'AI Tutor', nav: true, icon: 'tutor' },
  { id: 'settings', path: '/settings', title: 'Settings', nav: true, icon: 'settings', navGroup: 'bottom' },
  // Reached from the header's Sign up button and profile menu, and from search.
  { id: 'account', path: '/account', title: 'Account', icon: 'user', palette: true, keywords: 'account sign up sign in log in register create profile username password email' },
];

export const NOT_FOUND = { id: 'not-found', path: '*', title: 'Page not found' };

function compile(path) {
  const keys = [];
  const pattern = path
    .split('/')
    .map((part) => {
      if (part.startsWith(':')) {
        keys.push(part.slice(1));
        return '([^/]+)';
      }
      return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  return { regex: new RegExp(`^${pattern || '/'}$`), keys };
}

const compiled = ROUTES.map((route) => ({ route, ...compile(route.path) }));

/** Parses a hash like '#/learn/x?section=2' into a route match. */
export function parseHash(hash) {
  const value = String(hash || '').replace(/^#/, '');
  const raw = value.startsWith('/') ? value : '/';
  const [pathPart, queryPart = ''] = raw.split('?');
  const path = pathPart.length > 1 ? pathPart.replace(/\/+$/, '') : '/';
  const query = Object.fromEntries(new URLSearchParams(queryPart));

  for (const { route, regex, keys } of compiled) {
    const match = path.match(regex);
    if (match) {
      const params = {};
      keys.forEach((key, index) => {
        params[key] = decodeURIComponent(match[index + 1]);
      });
      return { route, params, query, path, href: `#${raw}` };
    }
  }
  return { route: NOT_FOUND, params: {}, query, path, href: `#${raw}` };
}

/** Builds an href from a path and an optional query object. */
export function href(path, query) {
  const search = query ? new URLSearchParams(Object.entries(query).filter(([, value]) => value !== undefined && value !== null && value !== '')).toString() : '';
  return `#${path}${search ? `?${search}` : ''}`;
}

export function createRouter({ onRoute }) {
  let current = null;

  function handle(hash = window.location.hash, { force = false, remount = false } = {}) {
    // Hashes that are not routes (such as #main from the skip link) are ignored.
    if (hash && !String(hash).startsWith('#/') && hash !== '#') return;
    const match = parseHash(hash);
    if (!force && current && current.href === match.href) return;
    const previous = current;
    current = match;
    onRoute(match, previous, { remount });
  }

  function navigate(to, { replace = false } = {}) {
    const target = to.startsWith('#') ? to : `#${to}`;
    try {
      if (window.location.hash !== target) {
        if (replace) window.history.replaceState(null, '', target);
        else window.history.pushState(null, '', target);
      }
    } catch {
      // Some sandboxed frames refuse history updates; routing still works.
    }
    handle(target);
  }

  function onLinkClick(event) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target instanceof Element ? event.target.closest('a[href^="#/"]') : null;
    if (!link || link.target === '_blank') return;
    event.preventDefault();
    navigate(link.getAttribute('href'));
  }

  return {
    start() {
      window.addEventListener('hashchange', () => handle());
      window.addEventListener('popstate', () => handle());
      document.addEventListener('click', onLinkClick);
      const initial = window.location.hash.startsWith('#/') ? window.location.hash : '#/';
      handle(initial, { force: true });
    },
    navigate,
    /** Shows the current route again; with `remount`, the page is rebuilt from scratch. */
    refresh({ remount = false } = {}) {
      if (current) handle(current.href, { force: true, remount });
    },
    current: () => current,
  };
}
