// Order validation and fills for the paper-trading simulator.
//
// Pure functions: the UI uses previewOrder() for live estimates, and the mock
// trading service uses executeMarketOrder() as its "server". A Flask backend
// should implement the same rules and return the same error codes.

import { money, plural } from '../utils/format.js';
import { toCents, fromCents, round2 } from './portfolio.js';

export const MAX_ORDER_SHARES = 100000;
export const ORDER_SIDES = ['buy', 'sell'];

/** Concentration thresholds used for the "large position" nudge. */
export const CONCENTRATION = { elevated: 0.2, high: 0.35 };

/** Parses a share quantity typed by the user. Returns NaN unless it is a whole number. */
export function parseQuantity(input) {
  const text = String(input ?? '').trim().replace(/,/g, '');
  if (!/^\d+$/.test(text)) return Number.NaN;
  return Number(text);
}

/**
 * Validates an order and estimates its effect without executing it.
 * @returns {{ok:boolean, errors:Array<{field:string, code:string, message:string}>, total:number,
 *   cashAfter:number, positionAfter:number, shareOfEquity:number, maxBuy:number, maxSell:number,
 *   concentration:'ok'|'elevated'|'high'}}
 */
export function previewOrder({ symbol, side, quantity, price, cash, positionQuantity = 0, equity = 0 }) {
  const errors = [];
  const priceCents = toCents(price);
  const cashCents = toCents(cash);
  const validQuantity = Number.isInteger(quantity) && quantity >= 1;

  if (!ORDER_SIDES.includes(side)) {
    errors.push({ field: 'side', code: 'invalid_side', message: 'Choose whether to buy or sell.' });
  }

  if (!(priceCents > 0)) {
    errors.push({ field: 'price', code: 'no_price', message: 'No simulated price is available for this stock yet.' });
  }

  if (!validQuantity) {
    errors.push({ field: 'quantity', code: 'invalid_quantity', message: 'Enter a whole number of shares, 1 or more.' });
  } else if (quantity > MAX_ORDER_SHARES) {
    errors.push({
      field: 'quantity',
      code: 'quantity_too_large',
      message: `The simulator accepts up to ${plural(MAX_ORDER_SHARES, 'share')} per order.`,
    });
  }

  const shares = validQuantity ? quantity : 0;
  const totalCents = priceCents > 0 ? priceCents * shares : 0;
  const maxBuy = priceCents > 0 ? Math.floor(cashCents / priceCents) : 0;
  const maxSell = positionQuantity;

  if (!errors.length && side === 'buy' && totalCents > cashCents) {
    errors.push({
      field: 'quantity',
      code: 'insufficient_cash',
      message:
        maxBuy > 0
          ? `This order costs ${money(fromCents(totalCents))}, but you have ${money(cash)} in virtual cash. You can buy up to ${plural(maxBuy, 'share')}.`
          : `You have ${money(cash)} in virtual cash, which isn't enough for one share at ${money(price)}.`,
    });
  }

  if (!errors.length && side === 'sell') {
    if (positionQuantity <= 0) {
      errors.push({
        field: 'quantity',
        code: 'no_position',
        message: `You don't own any ${symbol} shares to sell. TradeLab doesn't support short selling.`,
      });
    } else if (shares > positionQuantity) {
      errors.push({
        field: 'quantity',
        code: 'insufficient_shares',
        message: `You can sell up to ${plural(positionQuantity, 'share')}, your full position.`,
      });
    }
  }

  const total = fromCents(totalCents);
  const cashAfter = side === 'sell' ? fromCents(cashCents + totalCents) : fromCents(cashCents - totalCents);
  const positionAfter = side === 'sell' ? positionQuantity - shares : positionQuantity + shares;
  const shareOfEquity = equity > 0 ? total / equity : 0;

  // For buys, warn about the size of the resulting position, not just this order.
  const positionValueAfter = side === 'buy' ? positionAfter * fromCents(priceCents) : 0;
  const positionShare = equity > 0 ? positionValueAfter / equity : 0;
  let concentration = 'ok';
  if (side === 'buy' && positionShare >= CONCENTRATION.high) concentration = 'high';
  else if (side === 'buy' && positionShare >= CONCENTRATION.elevated) concentration = 'elevated';

  return {
    ok: errors.length === 0,
    errors,
    total,
    cashAfter,
    positionAfter,
    shareOfEquity,
    positionShare,
    maxBuy,
    maxSell,
    concentration,
  };
}

/**
 * Executes a market order against a simulated price. Returns either
 * { ok: true, transaction } or { ok: false, errors }.
 */
export function executeMarketOrder({ order, price, cash, positionQuantity, equity, day, now = Date.now(), id }) {
  const preview = previewOrder({
    symbol: order.symbol,
    side: order.side,
    quantity: order.quantity,
    price,
    cash,
    positionQuantity,
    equity,
  });
  if (!preview.ok) return { ok: false, errors: preview.errors };

  return {
    ok: true,
    transaction: {
      id,
      symbol: order.symbol,
      side: order.side,
      quantity: order.quantity,
      price: round2(price),
      type: 'market',
      day,
      timestamp: now,
      ...(order.note ? { note: String(order.note).slice(0, 280) } : {}),
    },
  };
}
