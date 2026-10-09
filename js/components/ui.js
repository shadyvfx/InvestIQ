// Small shared view fragments: movement indicators, pills, empty states,
// progress meters and table cells. Each returns trusted markup for html``.

import { html } from '../utils/dom.js';
import { money, percent, direction } from '../utils/format.js';
import { icon } from './icons.js';
import { DIFFICULTY_LABELS, levelRank } from '../core/progress.js';

/**
 * A price or P/L change with sign, arrow and color, so direction never
 * depends on color alone.
 */
export function change(amount, pct, { chip = false, amountOnly = false, pctOnly = false, className = '' } = {}) {
  const dir = direction(Number.isFinite(pct) ? pct : amount);
  const glyph = dir === 'up' ? 'up' : dir === 'down' ? 'down' : 'flat';
  let text;
  if (pctOnly) text = percent(pct, { sign: true });
  else if (amountOnly || !Number.isFinite(pct)) text = money(amount, { sign: true });
  else text = `${money(amount, { sign: true })} (${percent(pct, { sign: true })})`;
  return html`<span class="chg chg--${dir}${chip ? ' chg--chip' : ''}${className ? ` ${className}` : ''}">${icon(glyph, { className: 'chg__icon' })}<span>${text}</span></span>`;
}

export function simulatedPill(label = 'Simulated') {
  return html`<span class="pill" title="Virtual money and generated prices"><span class="hatch" aria-hidden="true"></span>${label}</span>`;
}

export function exampleTag() {
  return html`<span class="pill pill--example" title="Part of the demo account's example data">Example</span>`;
}

export function sideTag(side) {
  return html`<span class="side side--${side}">${side === 'buy' ? 'Buy' : 'Sell'}</span>`;
}

export function levelBadge(difficulty) {
  const rank = levelRank(difficulty) + 1;
  return html`<span class="level" data-level="${rank}"><span class="level__bars" aria-hidden="true"><i></i><i></i><i></i></span>${DIFFICULTY_LABELS[difficulty] || difficulty}</span>`;
}

const STATUS = {
  'not-started': { icon: 'circle', label: 'Not started' },
  'in-progress': { icon: 'half-circle', label: 'In progress' },
  completed: { icon: 'check-circle', label: 'Completed' },
};

export function lessonStatus(status) {
  const info = STATUS[status] || STATUS['not-started'];
  return html`<span class="lesson-status lesson-status--${status}">${icon(info.icon)}${info.label}</span>`;
}

export function meter(ratio, label) {
  const pct = Math.round(Math.max(0, Math.min(1, ratio || 0)) * 100);
  return html`<div class="meter" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="${label}"><div class="meter__fill" style="width: ${pct}%"></div></div>`;
}

export function symbolCell(symbol, name) {
  return html`<span class="cell-symbol"><span class="cell-symbol__ticker">${symbol}</span>${name ? html`<span class="cell-symbol__name truncate">${name}</span>` : ''}</span>`;
}

/**
 * Empty states point to the next action instead of just reporting emptiness.
 * actions: [{ label, href?, action?, variant? }]
 */
export function emptyState({ iconName = 'info', title, text, actions = [], compact = false }) {
  return html`<div class="empty${compact ? ' empty--compact' : ''}">
    ${icon(iconName, { className: 'empty__icon' })}
    <p class="empty__title">${title}</p>
    ${text ? html`<p class="empty__text">${text}</p>` : ''}
    ${actions.length
      ? html`<div class="empty__actions">${actions.map((a) =>
          a.href
            ? html`<a class="btn ${a.variant === 'primary' ? 'btn--primary' : 'btn--secondary'} btn--sm" href="${a.href}">${a.label}</a>`
            : html`<button type="button" class="btn ${a.variant === 'primary' ? 'btn--primary' : 'btn--secondary'} btn--sm" data-action="${a.action}">${a.label}</button>`,
        )}</div>`
      : ''}
  </div>`;
}

/**
 * Toggle-button group (time ranges, chart styles, filters).
 * items: [{ id, label, title? }] ; renders data-<name>="<id>" on each button.
 */
export function segmented({ items, selected, label, name, className = '' }) {
  return html`<div class="seg${className ? ` ${className}` : ''}" role="group" aria-label="${label}">${items.map(
    (item) =>
      html`<button type="button" class="seg__item" data-${name}="${item.id}" aria-pressed="${item.id === selected}"${item.title ? html` title="${item.title}" aria-label="${item.label}, ${item.title}"` : ''}>${item.label}</button>`,
  )}</div>`;
}

/** An empty table cell that still reads sensibly to screen readers. */
export function notApplicable(label = 'Not applicable') {
  return html`<span class="faint" aria-hidden="true">–</span><span class="sr-only">${label}</span>`;
}

export function loadingRow(text = 'Loading') {
  return html`<div class="loading-row" role="status"><span class="dots" aria-hidden="true"><i></i><i></i><i></i></span><span>${text}</span></div>`;
}

export function fieldError(id, message) {
  return message ? html`<p class="field__error" id="${id}">${icon('alert')}<span>${message}</span></p>` : '';
}
