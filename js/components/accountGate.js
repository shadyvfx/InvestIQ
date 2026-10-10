import { html } from '../utils/dom.js';
import { openDialog } from './modals.js';
import { href } from '../router.js';

export const TUTOR_ACCOUNT_MESSAGE = "You'll need to sign in to access TraderLab Tutor.";

export function accountLinks(returnTo = '/') {
  const destination = typeof returnTo === 'string' && returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/';
  return html`<div class="cluster">
    <a class="btn btn--secondary" href="${href('/account', { mode: 'signin', returnTo: destination })}">Sign In</a>
    <a class="btn btn--primary" href="${href('/account', { mode: 'signup', returnTo: destination })}">Create Account</a>
  </div>`;
}

export async function showAccountGate({ title = 'Create a TradeLab account', message, returnTo = '/' }) {
  const action = await openDialog({
    title,
    description: 'Your guest progress stays in this browser.',
    body: html`<div class="stack-sm"><p>${message}</p><p class="small muted">Sign in or create an account to continue. You can close this dialog and keep exploring as a guest.</p></div>`,
    actions: [
      { label: 'Sign In', value: 'signin', variant: 'secondary' },
      { label: 'Create Account', value: 'signup', variant: 'primary' },
    ],
    initialFocus: '[data-dialog-action="1"]',
  });
  if (action) {
    const destination = typeof returnTo === 'string' && returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/';
    window.location.hash = href('/account', { mode: action, returnTo: destination });
  }
}
