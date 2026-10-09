// Trading calendar for the simulation. Weekdays count as trading days;
// holidays are ignored to keep the model simple. Dates are 'YYYY-MM-DD'
// strings in UTC so they never shift with the viewer's time zone.

const DAY_MS = 86400000;

export function toISODate(date) {
  return date.toISOString().slice(0, 10);
}

export function fromISODate(iso) {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** The viewer's local calendar date as an ISO string. */
export function localTodayISO(now = new Date()) {
  return toISODate(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));
}

export function isWeekday(iso) {
  const day = fromISODate(iso).getUTCDay();
  return day !== 0 && day !== 6;
}

/** The given date if it is a weekday, otherwise the Friday before it. */
export function latestTradingDay(iso) {
  let date = fromISODate(iso);
  while (date.getUTCDay() === 0 || date.getUTCDay() === 6) {
    date = new Date(date.getTime() - DAY_MS);
  }
  return toISODate(date);
}

/** Moves `count` trading days forward (or backward when negative). */
export function addTradingDays(iso, count) {
  let date = fromISODate(iso);
  const step = count >= 0 ? 1 : -1;
  let remaining = Math.abs(count);
  while (remaining > 0) {
    date = new Date(date.getTime() + step * DAY_MS);
    const weekday = date.getUTCDay();
    if (weekday !== 0 && weekday !== 6) remaining -= 1;
  }
  return toISODate(date);
}

/** Number of trading days from `fromIso` to `toIso` (negative if earlier). */
export function tradingDaysBetween(fromIso, toIso) {
  const from = fromISODate(fromIso);
  const to = fromISODate(toIso);
  const step = to >= from ? 1 : -1;
  let date = from;
  let count = 0;
  while ((step > 0 && date < to) || (step < 0 && date > to)) {
    date = new Date(date.getTime() + step * DAY_MS);
    const weekday = date.getUTCDay();
    if (weekday !== 0 && weekday !== 6) count += step;
  }
  return count;
}

const calendarCache = new Map();

/**
 * Returns a function mapping simulation day numbers to ISO dates, anchored so
 * that day 0 is `startIso`. Results are cached per anchor.
 */
export function createDayCalendar(startIso, minDay, maxDay) {
  const key = `${startIso}:${minDay}:${maxDay}`;
  if (calendarCache.has(key)) return calendarCache.get(key);

  const dates = new Array(maxDay - minDay + 1);
  const anchor = latestTradingDay(startIso);
  dates[-minDay] = anchor;

  let date = fromISODate(anchor);
  for (let day = 1; day <= maxDay; day += 1) {
    do {
      date = new Date(date.getTime() + DAY_MS);
    } while (date.getUTCDay() === 0 || date.getUTCDay() === 6);
    dates[day - minDay] = toISODate(date);
  }

  date = fromISODate(anchor);
  for (let day = -1; day >= minDay; day -= 1) {
    do {
      date = new Date(date.getTime() - DAY_MS);
    } while (date.getUTCDay() === 0 || date.getUTCDay() === 6);
    dates[day - minDay] = toISODate(date);
  }

  const dateOf = (day) => {
    const index = Math.round(day) - minDay;
    if (index < 0) return dates[0];
    if (index >= dates.length) return dates[dates.length - 1];
    return dates[index];
  };

  calendarCache.set(key, dateOf);
  return dateOf;
}
