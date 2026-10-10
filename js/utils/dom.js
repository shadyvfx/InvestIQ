// Small DOM helpers. Markup is written with the `html` tagged template, which
// escapes every interpolated value unless it is wrapped with `raw()` or is the
// result of another `html` call. User text (journal entries, chat messages,
// search queries) is therefore safe to interpolate directly.

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
}

class SafeHTML {
  constructor(value) {
    this.value = value;
  }

  toString() {
    return this.value;
  }
}

/** Marks a trusted string as HTML so `html` does not escape it. */
export function raw(value) {
  return new SafeHTML(String(value ?? ''));
}

function stringify(value) {
  if (value === null || value === undefined || value === false) return '';
  if (value instanceof SafeHTML) return value.value;
  if (Array.isArray(value)) return value.map(stringify).join('');
  return escapeHTML(value);
}

/** Tagged template that produces escaped, trusted HTML. */
export function html(strings, ...values) {
  let out = '';
  for (let i = 0; i < strings.length; i += 1) {
    out += strings[i];
    if (i < values.length) out += stringify(values[i]);
  }
  return new SafeHTML(out);
}

/** Replaces an element's children with the given markup. */
export function render(target, content) {
  if (!target) return;
  target.innerHTML = stringify(content);
}

/** Builds a DocumentFragment (or the first element when `single` is true). */
export function toElement(content) {
  const template = document.createElement('template');
  template.innerHTML = stringify(content).trim();
  return template.content.firstElementChild;
}

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

/**
 * Delegated event listener. Calls handler(event, matchedElement) when the event
 * target is inside an element matching `selector` within `root`.
 * Returns a function that removes the listener.
 */
export function on(root, type, selector, handler, options) {
  const listener = (event) => {
    const match = event.target instanceof Element ? event.target.closest(selector) : null;
    if (match && root.contains(match)) handler(event, match);
  };
  root.addEventListener(type, listener, options);
  return () => root.removeEventListener(type, listener, options);
}

/** Runs cleanup functions collected during a page's lifetime. */
export function createDisposer() {
  const fns = [];
  return {
    /** True once the page has been cleaned up; async work checks it before drawing. */
    disposed: false,
    add(fn) {
      if (typeof fn === 'function') fns.push(fn);
      return fn;
    },
    dispose() {
      this.disposed = true;
      while (fns.length) {
        try {
          fns.pop()();
        } catch (error) {
          console.error(error);
        }
      }
    },
  };
}

/** Elements that can receive keyboard focus, for focus trapping. */
export function focusableWithin(root) {
  return $$(
    'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    root,
  ).filter((el) => !el.closest('[hidden]') && el.getClientRects().length > 0);
}

let idCounter = 0;
export function uid(prefix = 'id') {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

/** Reads a CSS custom property from the document root. */
export function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
