// Formatting helpers for money, percentages, counts and dates.
// Pure functions with no DOM access, so they can be reused by a future mobile app.

const MINUS = '−';
const EMPTY = '–';

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const usdCompact = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
});

const plain = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const integer = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

const isNum = (value) => typeof value === 'number' && Number.isFinite(value);
const roundTo = (value, digits) => Math.round(value * 10 ** digits) / 10 ** digits;

/** $1,234.56 with a true minus sign; `sign` adds + for gains. */
export function money(value, { sign = false, compact: useCompact = false } = {}) {
  if (!isNum(value)) return EMPTY;
  const abs = Math.abs(value);
  const rounded = roundTo(abs, 2);
  const body = useCompact && abs >= 100000 ? usdCompact.format(abs) : usd.format(abs);
  if (value < 0 && rounded !== 0) return MINUS + body;
  if (sign && value > 0 && rounded !== 0) return `+${body}`;
  return body;
}

/** Fraction to percent: 0.0123 -> "1.23%". `sign` adds + for gains. */
export function percent(value, { sign = false, digits = 2 } = {}) {
  if (!isNum(value)) return EMPTY;
  const pct = roundTo(value * 100, digits);
  const body = `${Math.abs(pct).toFixed(digits)}%`;
  if (pct < 0) return MINUS + body;
  if (sign && pct > 0) return `+${body}`;
  return body;
}

export function number(value, { digits = 2 } = {}) {
  if (!isNum(value)) return EMPTY;
  const formatted = digits === 0 ? integer.format(Math.abs(value)) : plain.format(Math.abs(roundTo(value, digits)));
  return value < 0 ? MINUS + formatted : formatted;
}

export function compactNumber(value) {
  if (!isNum(value)) return EMPTY;
  return compact.format(value);
}

export function plural(count, singular, pluralForm = `${singular}s`) {
  const word = count === 1 ? singular : pluralForm;
  return `${integer.format(count)} ${word}`;
}

/** Direction of a change: 'up', 'down' or 'flat' (rounded to cents/basis points). */
export function direction(value, digits = 4) {
  if (!isNum(value)) return 'flat';
  const rounded = roundTo(value, digits);
  if (rounded > 0) return 'up';
  if (rounded < 0) return 'down';
  return 'flat';
}

// ---- Dates ----------------------------------------------------------------
// Simulated dates are 'YYYY-MM-DD' strings interpreted in UTC so they never
// shift with the viewer's time zone. Intraday points add 'THH:MM'.

const dateFormats = {
  short: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }),
  medium: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }),
  long: new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }),
  weekdayName: new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' }),
  month: new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' }),
  monthYear: new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }),
};

export function parseISODate(iso) {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}

export function formatDate(iso, style = 'medium') {
  if (!iso) return EMPTY;
  const date = parseISODate(iso);
  // "Mon 12": built by hand because Intl orders weekday and day differently by locale.
  if (style === 'weekday') return `${dateFormats.weekdayName.format(date)} ${date.getUTCDate()}`;
  const formatter = dateFormats[style] || dateFormats.medium;
  return formatter.format(date);
}

/** '2026-10-14T10:30' -> '10:30 AM' (simulated session time, not local time). */
export function formatTime(isoDateTime) {
  const time = String(isoDateTime).split('T')[1];
  if (!time) return '';
  const [h, m] = time.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour12 = ((h + 11) % 12) + 1;
  return `${hour12}:${String(m).padStart(2, '0')} ${suffix}`;
}

/** Timestamps (ms) for real-world events such as notifications. */
export function relativeTime(timestamp, now = Date.now()) {
  if (!isNum(timestamp)) return '';
  const seconds = Math.round((now - timestamp) / 1000);
  if (seconds < 45) return 'Just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return days === 1 ? 'Yesterday' : `${days} days ago`;
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(timestamp));
}

export function clockTime(timestamp) {
  if (!isNum(timestamp)) return '';
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(timestamp));
}

export { EMPTY, MINUS };
