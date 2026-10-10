// Search and quick navigation (Ctrl+K, Cmd+K or "/").
// Finds pages, simulated stocks and lessons, and can advance the market.
// Implements the ARIA combobox + listbox pattern for keyboard users.

import { html, render } from '../utils/dom.js';
import { getState } from '../state.js';
import { ROUTES } from '../router.js';
import { catalog } from '../services/progressService.js';
import { icon } from './icons.js';
import { openDialog } from './modals.js';

function buildItems() {
  const { instruments } = getState().runtime;
  const pages = ROUTES.filter((route) => route.nav || route.palette).map((route) => ({
    group: 'Pages',
    id: `page-${route.id}`,
    label: route.title,
    meta: '',
    icon: route.icon,
    href: `#${route.path}`,
    keywords: `${route.title} ${route.keywords || ''}`.toLowerCase(),
  }));
  const stocks = instruments.map((instrument) => ({
    group: 'Simulated stocks',
    id: `stock-${instrument.symbol}`,
    label: `${instrument.symbol} ${instrument.name}`,
    meta: instrument.sector,
    icon: 'practice',
    href: `#/practice/${instrument.symbol}`,
    keywords: `${instrument.symbol} ${instrument.name} ${instrument.sector}`.toLowerCase(),
  }));
  const lessons = catalog.lessons.map((lesson) => ({
    group: 'Lessons',
    id: `lesson-${lesson.id}`,
    label: lesson.title,
    meta: catalog.getCategory(lesson.categoryId)?.title || '',
    icon: 'learn',
    href: `#/learn/${lesson.id}`,
    keywords: `${lesson.title} ${lesson.summary} ${catalog.getCategory(lesson.categoryId)?.title || ''}`.toLowerCase(),
  }));
  const actions = [
    {
      group: 'Actions',
      id: 'action-advance',
      label: 'Advance the simulated market by 1 day',
      meta: 'Prices move only when you advance',
      icon: 'play',
      action: 'advance-day',
      keywords: 'advance next day simulate market clock time',
    },
    {
      group: 'Actions',
      id: 'action-journal',
      label: 'New journal entry',
      meta: 'Record the reasoning behind a trade',
      icon: 'edit',
      href: '#/journal?new=1',
      keywords: 'new journal entry write note thesis',
    },
  ];
  return [...pages, ...stocks, ...lessons, ...actions];
}

function filterItems(items, query) {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return items.filter((item) => item.group !== 'Lessons').concat(items.filter((item) => item.group === 'Lessons').slice(0, 4));
  return items
    .map((item) => {
      let score = 0;
      for (const term of terms) {
        const index = item.keywords.indexOf(term);
        if (index === -1) return null;
        score += index === 0 ? 3 : item.keywords.includes(` ${term}`) ? 2 : 1;
      }
      return { item, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .map(({ item }) => item)
    .slice(0, 14);
}

let open = false;

/** Opens the palette. `onAction(name)` handles non-navigation actions. */
export function openCommandPalette({ navigate, onAction }) {
  if (open) return;
  open = true;
  const items = buildItems();

  openDialog({
    title: 'Search TradeLab',
    className: 'palette',
    body: html`<div class="palette__search">
        ${icon('search')}
        <label class="sr-only" for="palette-input">Search pages, simulated stocks and lessons</label>
        <input id="palette-input" class="palette__input" type="text" autocomplete="off" spellcheck="false"
          placeholder="Search pages, stocks and lessons" role="combobox" aria-expanded="true" aria-controls="palette-list" aria-autocomplete="list" />
      </div>
      <ul class="palette__list" id="palette-list" role="listbox" aria-label="Results"></ul>
      <div class="palette__foot" aria-hidden="true"><span><kbd>↑</kbd> <kbd>↓</kbd> to move</span><span><kbd>Enter</kbd> to open</span><span><kbd>Esc</kbd> to close</span></div>`,
    initialFocus: '#palette-input',
    onMount(dialog, close) {
      const input = dialog.querySelector('#palette-input');
      const list = dialog.querySelector('#palette-list');
      let results = [];
      let active = 0;

      const choose = (item) => {
        if (!item) return;
        close(item);
      };

      const paint = () => {
        if (!results.length) {
          render(list, html`<li class="palette__empty" role="presentation">No matches. Try a stock symbol like HLCN or a topic like "risk".</li>`);
          input.removeAttribute('aria-activedescendant');
          return;
        }
        let lastGroup = null;
        render(
          list,
          results.map((item, index) => {
            const header = item.group !== lastGroup ? html`<li class="palette__group" role="presentation">${item.group}</li>` : '';
            lastGroup = item.group;
            return html`${header}<li class="palette__item" role="option" id="palette-opt-${index}" data-index="${index}" aria-selected="${index === active}">
              ${icon(item.icon)}
              <span class="palette__item-text"><span class="truncate">${item.label}</span>${item.meta ? html`<span class="palette__item-meta truncate">${item.meta}</span>` : ''}</span>
            </li>`;
          }),
        );
        input.setAttribute('aria-activedescendant', `palette-opt-${active}`);
        list.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
      };

      const update = () => {
        results = filterItems(items, input.value);
        active = 0;
        paint();
      };

      input.addEventListener('input', update);
      input.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          active = Math.min(results.length - 1, active + 1);
          paint();
        } else if (event.key === 'ArrowUp') {
          event.preventDefault();
          active = Math.max(0, active - 1);
          paint();
        } else if (event.key === 'Enter') {
          event.preventDefault();
          choose(results[active]);
        }
      });
      list.addEventListener('mousemove', (event) => {
        const option = event.target instanceof Element ? event.target.closest('[role="option"]') : null;
        if (option && Number(option.dataset.index) !== active) {
          active = Number(option.dataset.index);
          paint();
        }
      });
      list.addEventListener('click', (event) => {
        const option = event.target instanceof Element ? event.target.closest('[role="option"]') : null;
        if (option) choose(results[Number(option.dataset.index)]);
      });

      update();
    },
  }).then((item) => {
    open = false;
    if (!item) return;
    if (item.href) navigate(item.href);
    else if (item.action) onAction?.(item.action);
  });
}
