// Portfolio math for the paper-trading simulator.
//
// The transaction ledger is the single source of truth: cash, holdings,
// average cost and realized profit/loss are all derived by replaying it.
// Money is handled in integer cents to avoid floating-point drift.
//
// Everything here is pure (no DOM, no storage, no network) so the same logic
// can move to the Flask backend or a mobile app unchanged.

export const toCents = (dollars) => Math.round(Number(dollars) * 100);
export const fromCents = (cents) => Math.round(cents) / 100;
export const round2 = (value) => Math.round(value * 100) / 100;

/** Chronological order: simulation day, then time placed, then ledger order. */
export function sortTransactions(transactions = []) {
  return transactions
    .map((tx, index) => ({ tx, index }))
    .sort((a, b) => a.tx.day - b.tx.day || (a.tx.timestamp || 0) - (b.tx.timestamp || 0) || a.index - b.index)
    .map(({ tx }) => tx);
}

/**
 * Replays a ledger into an account snapshot.
 * @param {number} startingCash virtual dollars at account creation
 * @param {Array<{id:string,symbol:string,side:'buy'|'sell',quantity:number,price:number,day:number,timestamp:number}>} transactions
 */
export function deriveAccount(startingCash, transactions = []) {
  let cashCents = toCents(startingCash);
  let realizedCents = 0;
  const positions = new Map();
  const ledger = [];

  for (const tx of sortTransactions(transactions)) {
    const priceCents = toCents(tx.price);
    const position = positions.get(tx.symbol) || { quantity: 0, costCents: 0, realizedCents: 0, openedDay: tx.day };
    let realizedTxCents = null;
    let quantity = tx.quantity;

    if (tx.side === 'buy') {
      const totalCents = priceCents * quantity;
      if (position.quantity === 0) position.openedDay = tx.day;
      cashCents -= totalCents;
      position.quantity += quantity;
      position.costCents += totalCents;
      ledger.push({ ...tx, total: fromCents(totalCents), realizedPnl: null });
    } else {
      // A malformed ledger cannot sell more than it holds.
      quantity = Math.min(quantity, position.quantity);
      const totalCents = priceCents * quantity;
      const averageCents = position.quantity > 0 ? position.costCents / position.quantity : 0;
      const costOutCents = averageCents * quantity;
      realizedTxCents = Math.round(totalCents - costOutCents);
      cashCents += totalCents;
      position.quantity -= quantity;
      position.costCents -= costOutCents;
      position.realizedCents += realizedTxCents;
      realizedCents += realizedTxCents;
      if (position.quantity <= 0) {
        position.quantity = 0;
        position.costCents = 0;
      }
      ledger.push({ ...tx, quantity, total: fromCents(totalCents), realizedPnl: fromCents(realizedTxCents) });
    }

    positions.set(tx.symbol, position);
  }

  const holdings = [];
  for (const [symbol, position] of positions) {
    if (position.quantity <= 0) continue;
    holdings.push({
      symbol,
      quantity: position.quantity,
      averageCost: position.costCents / position.quantity / 100,
      costBasis: fromCents(position.costCents),
      openedDay: position.openedDay,
      realizedPnl: fromCents(position.realizedCents),
    });
  }

  return {
    startingCash: Number(startingCash),
    cash: fromCents(cashCents),
    holdings,
    transactions: ledger,
    realizedPnl: fromCents(realizedCents),
  };
}

export function positionQuantity(account, symbol) {
  return account.holdings.find((holding) => holding.symbol === symbol)?.quantity ?? 0;
}

/**
 * Values an account at the given quotes ({ [symbol]: { price, prevClose } }).
 * Returns totals plus one row per holding with market value, unrealized P/L
 * and weight.
 */
export function valueAccount(account, quotes = {}) {
  const positions = account.holdings.map((holding) => {
    const quote = quotes[holding.symbol];
    const price = quote?.price ?? holding.averageCost;
    const marketValue = round2(holding.quantity * price);
    const unrealizedPnl = round2(marketValue - holding.costBasis);
    return {
      ...holding,
      price,
      prevClose: quote?.prevClose ?? price,
      marketValue,
      unrealizedPnl,
      unrealizedPct: holding.costBasis > 0 ? unrealizedPnl / holding.costBasis : 0,
    };
  });

  const holdingsValue = round2(positions.reduce((sum, row) => sum + row.marketValue, 0));
  const equity = round2(account.cash + holdingsValue);
  const unrealizedPnl = round2(positions.reduce((sum, row) => sum + row.unrealizedPnl, 0));
  const totalReturn = round2(equity - account.startingCash);

  for (const row of positions) row.weight = equity > 0 ? row.marketValue / equity : 0;
  positions.sort((a, b) => b.marketValue - a.marketValue);

  return {
    cash: account.cash,
    holdingsValue,
    equity,
    unrealizedPnl,
    realizedPnl: account.realizedPnl,
    totalReturn,
    totalReturnPct: account.startingCash > 0 ? totalReturn / account.startingCash : 0,
    cashWeight: equity > 0 ? account.cash / equity : 1,
    positions,
  };
}

/**
 * Profit or loss for the current simulated day. Only shares held at the start
 * of the day count: orders fill at the day's closing price, so a share bought
 * today has not moved yet.
 */
export function dayChange(account, quotes, day) {
  const deltaToday = new Map();
  let cashFlowToday = 0;
  for (const tx of account.transactions) {
    if (tx.day !== day) continue;
    const signed = tx.side === 'buy' ? tx.quantity : -tx.quantity;
    deltaToday.set(tx.symbol, (deltaToday.get(tx.symbol) || 0) + signed);
    cashFlowToday += tx.side === 'buy' ? -tx.total : tx.total;
  }

  const symbols = new Set([...account.holdings.map((h) => h.symbol), ...deltaToday.keys()]);
  let amount = 0;
  let holdingsAtPrevClose = 0;
  for (const symbol of symbols) {
    const quote = quotes[symbol];
    if (!quote) continue;
    const quantityNow = positionQuantity(account, symbol);
    const quantityAtOpen = quantityNow - (deltaToday.get(symbol) || 0);
    if (quantityAtOpen <= 0) continue;
    amount += quantityAtOpen * (quote.price - quote.prevClose);
    holdingsAtPrevClose += quantityAtOpen * quote.prevClose;
  }

  const cashAtOpen = account.cash - cashFlowToday;
  const equityAtPrevClose = cashAtOpen + holdingsAtPrevClose;
  return {
    amount: round2(amount),
    pct: equityAtPrevClose > 0 ? amount / equityAtPrevClose : 0,
  };
}

/** Groups holdings by a key (for example sector) with cash as its own row. */
export function allocation(valuation, keyOf = (row) => row.symbol, labelOf = (key) => key) {
  const groups = new Map();
  for (const row of valuation.positions) {
    const key = keyOf(row);
    const group = groups.get(key) || { key, label: labelOf(key, row), value: 0 };
    group.value += row.marketValue;
    groups.set(key, group);
  }
  const rows = [...groups.values()]
    .map((group) => ({ ...group, value: round2(group.value), weight: valuation.equity > 0 ? group.value / valuation.equity : 0 }))
    .sort((a, b) => b.value - a.value);
  rows.push({
    key: 'cash',
    label: 'Cash',
    value: valuation.cash,
    weight: valuation.cashWeight,
    isCash: true,
  });
  return rows;
}

/**
 * Account value at each simulated day's close.
 * @param {(symbol:string, day:number) => number} closeOf price lookup
 */
export function equityCurve({ startingCash, transactions, fromDay, toDay, closeOf }) {
  const ordered = sortTransactions(transactions);
  const quantities = new Map();
  let cashCents = toCents(startingCash);
  let cursor = 0;
  const points = [];

  for (let day = fromDay; day <= toDay; day += 1) {
    while (cursor < ordered.length && ordered[cursor].day <= day) {
      const tx = ordered[cursor];
      const held = quantities.get(tx.symbol) || 0;
      const quantity = tx.side === 'buy' ? tx.quantity : Math.min(tx.quantity, held);
      const totalCents = toCents(tx.price) * quantity;
      if (tx.side === 'buy') {
        cashCents -= totalCents;
        quantities.set(tx.symbol, held + quantity);
      } else {
        cashCents += totalCents;
        quantities.set(tx.symbol, held - quantity);
      }
      cursor += 1;
    }

    let value = cashCents / 100;
    for (const [symbol, quantity] of quantities) {
      if (quantity > 0) value += quantity * closeOf(symbol, day);
    }
    points.push({ day, equity: round2(value) });
  }

  return points;
}
