// Feedback: short-lived toasts, the notification center behind the bell,
// and a polite live region for screen-reader announcements.
// Notifications are local to this browser; nothing is sent anywhere.

import { html, toElement } from '../utils/dom.js';
import { getState, updateSlice, LIMITS } from '../state.js';
import { icon } from './icons.js';

const TONE_ICON = { success: 'check-circle', error: 'alert', info: 'info' };

function region() {
  let element = document.getElementById('toasts');
  if (!element) {
    element = document.createElement('div');
    element.id = 'toasts';
    element.className = 'toasts';
    element.setAttribute('aria-live', 'polite');
    document.body.appendChild(element);
  }
  return element;
}

/**
 * Shows a toast. `action` is either { label, href } or { label, onClick }.
 * The toast region is a polite live region, so screen readers read each toast.
 */
export function toast({ title, body = '', tone = 'info', action, duration = 5000 }) {
  const container = region();
  const node = toElement(html`<div class="toast toast--${tone}">
    ${icon(TONE_ICON[tone] || 'info', { className: 'toast__icon' })}
    <div>
      <p class="toast__title">${title}</p>
      ${body ? html`<p class="toast__body">${body}</p>` : ''}
      ${action
        ? html`<div class="toast__actions">${action.href
            ? html`<a class="btn btn--secondary btn--sm" href="${action.href}" data-toast-action>${action.label}</a>`
            : html`<button type="button" class="btn btn--secondary btn--sm" data-toast-action>${action.label}</button>`}</div>`
        : ''}
    </div>
    <button type="button" class="icon-btn icon-btn--sm" aria-label="Dismiss notification" data-toast-dismiss>${icon('close')}</button>
  </div>`);

  let timer = null;
  const remove = () => {
    clearTimeout(timer);
    node.remove();
  };
  const arm = () => {
    clearTimeout(timer);
    if (duration > 0) timer = setTimeout(remove, duration);
  };

  node.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('[data-toast-dismiss]')) remove();
    if (target?.closest('[data-toast-action]')) {
      action?.onClick?.();
      remove();
    }
  });
  node.addEventListener('mouseenter', () => clearTimeout(timer));
  node.addEventListener('mouseleave', arm);
  node.addEventListener('focusin', () => clearTimeout(timer));
  node.addEventListener('focusout', arm);

  container.appendChild(node);
  while (container.children.length > 3) container.firstElementChild.remove();
  arm();
  return remove;
}

/** Adds an entry to the notification center (the bell in the header). */
export function notify({ title, body = '', kind = 'info', href = null }) {
  const item = { id: `n-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, title, body, kind, href, createdAt: Date.now(), read: false };
  updateSlice(
    'notifications',
    (notifications) => ({ ...notifications, items: [item, ...notifications.items].slice(0, LIMITS.MAX_NOTIFICATIONS) }),
    'notifications/added',
  );
  return item;
}

export function markAllRead() {
  const { items } = getState().notifications;
  if (!items.some((item) => !item.read)) return;
  updateSlice('notifications', (notifications) => ({ ...notifications, items: notifications.items.map((item) => ({ ...item, read: true })) }), 'notifications/read');
}

export function clearNotifications() {
  updateSlice('notifications', (notifications) => ({ ...notifications, items: [] }), 'notifications/cleared');
}

export function unreadCount(state = getState()) {
  return state.notifications.items.filter((item) => !item.read).length;
}

let announceTimer = null;
/** Screen-reader announcement through a polite live region. */
export function announce(message) {
  const live = document.getElementById('live-region');
  if (!live) return;
  live.textContent = '';
  clearTimeout(announceTimer);
  announceTimer = setTimeout(() => {
    live.textContent = message;
  }, 60);
}
