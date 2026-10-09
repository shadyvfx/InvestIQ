// Trading journal rules: validation, per-entry metrics and summary statistics.
//
// The statistics deliberately lead with process (planning, following the
// plan, reflecting) and only show outcome numbers once there are enough
// closed trades for them to mean anything.

export const MIN_CLOSED_FOR_OUTCOMES = 3;
export const TEXT_LIMIT = 2000;
export const PLAN_FOLLOWED = ['yes', 'partly', 'no'];
export const PLAN_LABELS = { yes: 'Followed the plan', partly: 'Partly followed', no: 'Did not follow' };

const MAX_PRICE = 1000000;

function parsePrice(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim().replace(/[$,\s]/g, '');
  if (text === '') return null;
  if (!/^\d*\.?\d+$/.test(text)) return Number.NaN;
  return Math.round(Number(text) * 100) / 100;
}

function parseCount(value) {
  const text = String(value ?? '').trim().replace(/,/g, '');
  if (text === '') return null;
  if (!/^\d+$/.test(text)) return Number.NaN;
  return Number(text);
}

const cleanText = (value) => String(value ?? '').replace(/\r\n?/g, '\n').trim();

/**
 * Validates raw form values. Returns { ok, errors: {field: message}, value }.
 * `knownSymbols` limits the symbol to instruments in the simulated market.
 */
export function validateJournalEntry(input, { knownSymbols = [] } = {}) {
  const errors = {};
  const symbol = String(input.symbol ?? '').trim().toUpperCase();
  const entryPrice = parsePrice(input.entryPrice);
  const exitPrice = parsePrice(input.exitPrice);
  const stopPrice = parsePrice(input.stopPrice);
  const targetPrice = parsePrice(input.targetPrice);
  const quantity = parseCount(input.quantity);
  const thesis = cleanText(input.thesis);
  const risks = cleanText(input.risks);
  const lessons = cleanText(input.lessons);
  const followedPlan = PLAN_FOLLOWED.includes(input.followedPlan) ? input.followedPlan : '';

  if (!symbol) errors.symbol = 'Choose the stock this entry is about.';
  else if (knownSymbols.length && !knownSymbols.includes(symbol)) errors.symbol = 'Choose a stock from the simulated market.';

  if (entryPrice === null) errors.entryPrice = 'Enter the price you bought at (or plan to).';
  else if (!(entryPrice > 0) || entryPrice > MAX_PRICE) errors.entryPrice = 'Enter a price greater than $0, like 42.50.';

  if (exitPrice !== null && (!(exitPrice > 0) || exitPrice > MAX_PRICE)) {
    errors.exitPrice = 'Enter a price greater than $0, or leave it empty while the trade is open.';
  }

  if (quantity !== null && (!Number.isInteger(quantity) || quantity < 1)) {
    errors.quantity = 'Enter a whole number of shares, or leave it empty.';
  }

  if (stopPrice !== null) {
    if (!(stopPrice > 0)) errors.stopPrice = 'Enter a price greater than $0, or leave it empty.';
    else if (entryPrice > 0 && stopPrice >= entryPrice) {
      errors.stopPrice = 'Set the stop below your entry price. TradeLab trades are buy-first (long) only.';
    }
  }

  if (targetPrice !== null) {
    if (!(targetPrice > 0)) errors.targetPrice = 'Enter a price greater than $0, or leave it empty.';
    else if (entryPrice > 0 && targetPrice <= entryPrice) errors.targetPrice = 'Set the target above your entry price.';
  }

  if (thesis.length < 15) errors.thesis = 'Write at least a sentence on why you are taking this trade.';
  for (const [field, text] of [['thesis', thesis], ['risks', risks], ['lessons', lessons]]) {
    if (text.length > TEXT_LIMIT) errors[field] = `Keep this under ${TEXT_LIMIT} characters.`;
  }

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    value: {
      symbol,
      entryPrice,
      exitPrice,
      stopPrice,
      targetPrice,
      quantity,
      thesis,
      risks,
      lessons,
      followedPlan,
    },
  };
}

/** Derived numbers for one entry. */
export function entryMetrics(entry) {
  const closed = Number(entry.exitPrice) > 0;
  const risk = entry.stopPrice > 0 ? entry.entryPrice - entry.stopPrice : null;
  const reward = entry.targetPrice > 0 ? entry.targetPrice - entry.entryPrice : null;
  const returnPct = closed ? (entry.exitPrice - entry.entryPrice) / entry.entryPrice : null;
  const pnl = closed && entry.quantity ? Math.round((entry.exitPrice - entry.entryPrice) * entry.quantity * 100) / 100 : null;
  const plannedRewardToRisk = risk > 0 && reward > 0 ? reward / risk : null;
  const rMultiple = closed && risk > 0 ? (entry.exitPrice - entry.entryPrice) / risk : null;
  const hasPlan = Boolean(entry.thesis && entry.risks && entry.stopPrice > 0);
  return { status: closed ? 'closed' : 'open', returnPct, pnl, plannedRewardToRisk, rMultiple, hasPlan };
}

const PLAN_SCORE = { yes: 1, partly: 0.5, no: 0 };

/**
 * Summary statistics. `trades` is the simulated transaction ledger, used to
 * report how many buy orders have a linked journal entry.
 */
export function journalStats(entries = [], trades = []) {
  const withMetrics = entries.map((entry) => ({ entry, metrics: entryMetrics(entry) }));
  const closed = withMetrics.filter(({ metrics }) => metrics.status === 'closed');
  const planned = withMetrics.filter(({ metrics }) => metrics.hasPlan).length;
  const answeredPlan = closed.filter(({ entry }) => entry.followedPlan in PLAN_SCORE);
  const reflected = closed.filter(({ entry }) => entry.lessons).length;

  const buys = trades.filter((tx) => tx.side === 'buy');
  const linkedIds = new Set(entries.map((entry) => entry.transactionId).filter(Boolean));
  const journaledBuys = buys.filter((tx) => linkedIds.has(tx.id)).length;

  const stats = {
    total: entries.length,
    open: entries.length - closed.length,
    closed: closed.length,
    planned,
    planRate: entries.length ? planned / entries.length : null,
    followedRate: answeredPlan.length
      ? answeredPlan.reduce((sum, { entry }) => sum + PLAN_SCORE[entry.followedPlan], 0) / answeredPlan.length
      : null,
    followedAnswered: answeredPlan.length,
    reflectionRate: closed.length ? reflected / closed.length : null,
    reflected,
    buys: buys.length,
    journaledBuys,
    hasOutcomes: closed.length >= MIN_CLOSED_FOR_OUTCOMES,
    outcomes: null,
  };

  if (stats.hasOutcomes) {
    const returns = closed.map(({ metrics }) => metrics.returnPct);
    const wins = returns.filter((value) => value > 0).length;
    const rValues = closed.map(({ metrics }) => metrics.rMultiple).filter((value) => value !== null);
    stats.outcomes = {
      winRate: wins / closed.length,
      averageReturn: returns.reduce((sum, value) => sum + value, 0) / returns.length,
      best: Math.max(...returns),
      worst: Math.min(...returns),
      averageR: rValues.length ? rValues.reduce((sum, value) => sum + value, 0) / rValues.length : null,
      rCount: rValues.length,
    };
  }

  return stats;
}
