// Shown for any route that doesn't exist, so a mistyped link is never a dead end.

import { html, render } from '../utils/dom.js';
import { emptyState } from '../components/ui.js';

export default {
  id: 'not-found',
  mount(root, { path }) {
    render(
      root,
      html`<div class="page">${emptyState({
        iconName: 'search',
        title: `There's no page at ${path}`,
        text: 'The link may be out of date. Head back to the overview or search for what you need with Ctrl+K.',
        actions: [
          { label: 'Go to Overview', href: '#/', variant: 'primary' },
          { label: 'Browse lessons', href: '#/learn' },
        ],
      })}</div>`,
    );
    return () => {};
  },
};
