// Dialogs built on the native <dialog> element: it provides the modal top
// layer, inert background, Escape to close and backdrop styling. These
// helpers add consistent markup, focus handling and a promise-based API.
// (window.confirm is never used: it is blocked in some embedded viewers.)

import { html, toElement, focusableWithin } from '../utils/dom.js';
import { icon } from './icons.js';

let dialogCount = 0;

/**
 * Opens a dialog and resolves with the value passed to close(), or null when
 * dismissed (Escape, the close button or a Cancel action).
 *
 * @param {object} options
 * @param {string} options.title
 * @param {string} [options.description]
 * @param {*} options.body                 trusted markup for the dialog body
 * @param {Array<{label:string, value:*, variant?:string, type?:string, form?:string}>} [options.actions]
 * @param {'default'|'wide'} [options.size]
 * @param {(dialog: HTMLDialogElement, close: (value:*) => void) => (void|Function)} [options.onMount]
 * @param {string} [options.initialFocus] CSS selector of the element to focus first
 */
export function openDialog({ title, description, body = '', actions = [], size = 'default', onMount, initialFocus, className = '' }) {
  dialogCount += 1;
  const titleId = `dialog-title-${dialogCount}`;
  const descId = `dialog-desc-${dialogCount}`;
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  const dialog = toElement(html`<dialog class="dialog${size === 'wide' ? ' dialog--wide' : ''}${className ? ` ${className}` : ''}" aria-labelledby="${titleId}"${description ? html` aria-describedby="${descId}"` : ''}>
    <div class="dialog__head">
      <div>
        <h2 class="dialog__title" id="${titleId}">${title}</h2>
        ${description ? html`<p class="dialog__desc" id="${descId}">${description}</p>` : ''}
      </div>
      <button type="button" class="icon-btn icon-btn--sm" data-dialog-close aria-label="Close">${icon('close')}</button>
    </div>
    <div class="dialog__body">${body}</div>
    ${actions.length
      ? html`<div class="dialog__foot">${actions.map(
          (action, index) =>
            html`<button type="${action.type || 'button'}" class="btn btn--${action.variant || 'secondary'}" data-dialog-action="${index}"${action.form ? html` form="${action.form}"` : ''}>${action.label}</button>`,
        )}</div>`
      : ''}
  </dialog>`);

  document.body.appendChild(dialog);

  return new Promise((resolve) => {
    let result = null;
    let cleanup = null;

    const close = (value = null) => {
      result = value;
      if (dialog.open) dialog.close();
      else finish();
    };

    const finish = () => {
      if (typeof cleanup === 'function') cleanup();
      dialog.remove();
      if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
      resolve(result);
    };

    dialog.addEventListener('close', finish, { once: true });
    dialog.addEventListener('cancel', () => {
      result = null;
    });

    dialog.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      if (target === dialog) {
        // Click on the backdrop area outside the panel.
        const rect = dialog.getBoundingClientRect();
        const inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
        if (!inside) close(null);
        return;
      }
      if (target.closest('[data-dialog-close]')) {
        close(null);
        return;
      }
      const actionButton = target.closest('[data-dialog-action]');
      if (actionButton && actionButton.type !== 'submit') {
        const action = actions[Number(actionButton.dataset.dialogAction)];
        close(action?.value ?? null);
      }
    });

    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');

    cleanup = onMount?.(dialog, close) || null;

    const preferred = initialFocus ? dialog.querySelector(initialFocus) : null;
    const target = preferred || focusableWithin(dialog.querySelector('.dialog__body'))[0] || dialog.querySelector('.dialog__foot .btn:last-child');
    target?.focus({ preventScroll: true });
  });
}

/**
 * Asks the learner to confirm an action. Resolves true when confirmed.
 * Used for every destructive action (deleting entries, resetting data).
 */
export async function confirmDialog({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false, details }) {
  const result = await openDialog({
    title,
    body: html`<div class="stack-sm"><p class="muted">${message}</p>${details || ''}</div>`,
    actions: [
      { label: cancelLabel, value: false, variant: 'secondary' },
      { label: confirmLabel, value: true, variant: danger ? 'danger-solid' : 'primary' },
    ],
    initialFocus: '[data-dialog-action="0"]',
  });
  return result === true;
}
