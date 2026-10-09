// TradeLab's icon set: 24px grid, 1.75px strokes, round joins.
// icon(name) returns trusted SVG markup for use inside html`` templates.
// Icons are decorative (aria-hidden) unless a label is given.

import { raw, escapeHTML } from '../utils/dom.js';

const PATHS = {
  overview:
    '<rect x="3.5" y="3.5" width="7" height="8" rx="1"/><rect x="13.5" y="3.5" width="7" height="5" rx="1"/><rect x="13.5" y="11.5" width="7" height="9" rx="1"/><rect x="3.5" y="14.5" width="7" height="6" rx="1"/>',
  learn: '<path d="M12 6.6C10.4 5.3 8.2 4.6 5.5 4.6H3.5v13.8h2c2.7 0 4.9.7 6.5 2 1.6-1.3 3.8-2 6.5-2h2V4.6h-2c-2.7 0-4.9.7-6.5 2Z"/><path d="M12 6.6v13.8"/>',
  practice:
    '<path d="M7 3.5v3M7 16v4.5"/><rect x="5" y="6.5" width="4" height="9.5" rx=".6"/><path d="M17 3.5v5.5M17 17v3.5"/><rect x="15" y="9" width="4" height="8" rx=".6" fill="currentColor" stroke="none"/>',
  portfolio: '<path d="M20.5 13A8.5 8.5 0 1 1 11 3.55V13Z"/><path d="M14.5 3.7A8.6 8.6 0 0 1 20.3 9.5h-5.8Z"/>',
  journal:
    '<rect x="5" y="3.5" width="14" height="17" rx="1.5"/><path d="M9 8h6M9 11.5h6M9 15h3.5"/><path d="M5 7.5H3.5M5 12H3.5M5 16.5H3.5"/>',
  tutor:
    '<path d="M4.5 5.5h15v10.5h-8l-4.5 3.5V16H4.5Z"/><path d="M10.1 9.2a1.95 1.95 0 1 1 2.7 1.8c-.5.2-.8.6-.8 1.1v.4"/><path d="M12 14.3v.1"/>',
  settings:
    '<path d="M4 7h8.5M17.5 7H20M4 17h2.5M11.5 17H20"/><circle cx="15" cy="7" r="2.3"/><circle cx="9" cy="17" r="2.3"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/>',
  bell: '<path d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 2h-15Z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/>',
  user: '<circle cx="12" cy="8.5" r="4"/><path d="M4.5 20.5c1-3.6 4-5.5 7.5-5.5s6.5 1.9 7.5 5.5"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  sidebar: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M9.5 4.5v15"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  'chevron-right': '<path d="m9.5 6 6 6-6 6"/>',
  'chevron-left': '<path d="m14.5 6-6 6 6 6"/>',
  'chevron-down': '<path d="m6 9.5 6 6 6-6"/>',
  'arrow-left': '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  'arrow-right': '<path d="M5 12h14M13 6l6 6-6 6"/>',
  up: '<path d="M12 5.5 20 18.5H4Z" fill="currentColor" stroke="none"/>',
  down: '<path d="M12 18.5 4 5.5h16Z" fill="currentColor" stroke="none"/>',
  flat: '<path d="M5 12h14" stroke-width="3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/><path d="M10 11v5.5M14 11v5.5"/>',
  edit: '<path d="M15.2 5.3 18.7 8.8 9 18.5H5.5V15Z"/><path d="m13 7.5 3.5 3.5"/>',
  star: '<path d="m12 3.8 2.5 5.1 5.6.8-4 3.9.9 5.6-5-2.6-5 2.6.9-5.6-4-3.9 5.6-.8Z"/>',
  'star-filled': '<path d="m12 3.8 2.5 5.1 5.6.8-4 3.9.9 5.6-5-2.6-5 2.6.9-5.6-4-3.9 5.6-.8Z" fill="currentColor"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  'check-circle': '<circle cx="12" cy="12" r="8.5"/><path d="m8.5 12.2 2.4 2.4 4.7-4.9"/>',
  'x-circle': '<circle cx="12" cy="12" r="8.5"/><path d="m9.2 9.2 5.6 5.6M14.8 9.2l-5.6 5.6"/>',
  circle: '<circle cx="12" cy="12" r="8.5"/>',
  'half-circle': '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17Z" fill="currentColor" stroke="none"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.2M12 7.9v.1"/>',
  alert: '<path d="M12 4.2 21 19.5H3Z"/><path d="M12 10v4.2M12 16.9v.1"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  reset: '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.5 4.5v4h4"/>',
  send: '<path d="m20.5 3.5-7.6 17-2.7-7.2-7.2-2.7Z"/><path d="M10.2 13.3 20.5 3.5"/>',
  play: '<path d="M7.5 5.5v13l10.5-6.5Z"/>',
  forward: '<path d="M4 6.5v11l7.5-5.5Z"/><path d="M12.5 6.5v11l7.5-5.5Z"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/>',
  more: '<circle cx="5.5" cy="12" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/><circle cx="18.5" cy="12" r="1.2" fill="currentColor"/>',
  bulb: '<path d="M9 17.5h6M10 20.5h4"/><path d="M8.6 14.6a6 6 0 1 1 6.8 0c-.6.5-.9 1.1-.9 1.9v1H9.5v-1c0-.8-.3-1.4-.9-1.9Z"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 8.5-8.5M16 7l2.5 2.5M14 9l2 2"/>',
  shield: '<path d="M12 3.5 19 6v5.5c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6Z"/>',
  layers: '<path d="m12 4 8.5 4.5L12 13 3.5 8.5Z"/><path d="m3.5 12.5 8.5 4.5 8.5-4.5"/><path d="m3.5 16.5 8.5 4.5 8.5-4.5"/>',
  mind: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 14.2c.9 1.3 2.1 1.9 3.5 1.9s2.6-.6 3.5-1.9"/><path d="M9 9.5v.6M15 9.5v.6"/>',
  trend: '<path d="M3.5 17.5 9 12l4 4 7.5-8.5"/><path d="M15 7.5h5.5V13"/>',
  orders: '<path d="M4 8h14M14.5 4.5 18 8l-3.5 3.5"/><path d="M20 16H6M9.5 12.5 6 16l3.5 3.5"/>',
  pulse: '<path d="M3.5 12h4l2-5.5 4 11 2-5.5h5"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".8" fill="currentColor"/>',
  list: '<path d="M9 7h11M9 12h11M9 17h11"/><circle cx="4.8" cy="7" r=".9" fill="currentColor"/><circle cx="4.8" cy="12" r=".9" fill="currentColor"/><circle cx="4.8" cy="17" r=".9" fill="currentColor"/>',
  wallet: '<path d="M4 7.5V18a1.5 1.5 0 0 0 1.5 1.5h14V9h-14A1.5 1.5 0 0 1 4 7.5Zm0 0A1.5 1.5 0 0 1 5.5 6H17V4.5"/><circle cx="15.5" cy="14.3" r="1" fill="currentColor"/>',
  paper:
    '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 11 11 4M4 17 17 4M8 20 20 8M14 20l6-6"/>',
  book: '<path d="M5 4.5h11.5a2 2 0 0 1 2 2v13H7a2 2 0 0 1-2-2Z"/><path d="M5 17.5a2 2 0 0 1 2-2h11.5"/>',
  external: '<path d="M14 4.5h5.5V10M19.5 4.5 11 13"/><path d="M18 14v5.5H4.5V6H10"/>',
  keyboard: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10h.1M10.5 10h.1M14 10h.1M17 10h.1M7 14h10"/>',
  logout: '<path d="M10 4.5H5.5v15H10"/><path d="M14.5 8 19 12l-4.5 4M19 12H9.5"/>',
};

export function icon(name, { size, label, className = '' } = {}) {
  const body = PATHS[name] || PATHS.circle;
  const sizeAttr = size ? ` width="${size}" height="${size}"` : '';
  const a11y = label ? ` role="img" aria-label="${escapeHTML(label)}"` : ' aria-hidden="true" focusable="false"';
  const cls = className ? ` class="${escapeHTML(className)}"` : '';
  return raw(
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"${sizeAttr}${cls}${a11y}>${body}</svg>`,
  );
}

/** The TradeLab mark: a hollow up candle beside a filled down candle. */
export function logoMark({ className = 'brand-mark' } = {}) {
  return raw(
    `<svg class="${className}" viewBox="0 0 28 28" fill="none" aria-hidden="true" focusable="false">` +
      '<rect x="1" y="1" width="26" height="26" rx="6" stroke="currentColor" stroke-width="1.6"/>' +
      '<path d="M10 6.5v3.5M10 19v2.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>' +
      '<rect x="7.6" y="10" width="4.8" height="9" rx="1" stroke="currentColor" stroke-width="1.6"/>' +
      '<path d="M18 8v4M18 18.5v2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>' +
      '<rect x="15.6" y="12" width="4.8" height="6.5" rx="1" fill="currentColor"/>' +
      '</svg>',
  );
}
