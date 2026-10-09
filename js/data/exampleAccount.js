// Example data for a first visit, so the dashboard, portfolio and journal show
// what they do before the learner has placed any trades. Every record is
// flagged `example: true` and labeled "Example" in the interface.
// Settings > "Reset simulated account" starts an empty account instead.

import { addTradingDays, latestTradingDay, localTodayISO } from '../core/calendar.js';
import { closeAt } from './mockMarketData.js';

/** The example account has been "practicing" for this many simulated days. */
export const EXAMPLE_DAY = 15;

const EXAMPLE_TRADES = [
  // symbol, side, quantity, simulated day
  ['TLMX', 'buy', 8, 0],
  ['HLCN', 'buy', 10, 0],
  ['BRMB', 'buy', 25, 3],
  ['VRDM', 'buy', 40, 8],
  ['HLCN', 'sell', 4, 12],
];

export const EXAMPLE_WATCHLIST = ['HLCN', 'SKLF', 'BRMB', 'VRDM', 'TLMX'];

export function createExampleData(now = Date.now()) {
  const today = latestTradingDay(localTodayISO(new Date(now)));
  const startDate = addTradingDays(today, -EXAMPLE_DAY);
  const dayMs = 86400000;

  const transactions = EXAMPLE_TRADES.map(([symbol, side, quantity, day], index) => ({
    id: `example-${index + 1}`,
    symbol,
    side,
    quantity,
    price: closeAt(symbol, day),
    type: 'market',
    day,
    timestamp: now - (EXAMPLE_DAY - day) * dayMs + index * 1000,
    example: true,
  }));

  const hlcnEntry = closeAt('HLCN', 0);
  const vrdmEntry = closeAt('VRDM', 8);
  const round = (value) => Math.round(value * 100) / 100;

  const journal = [
    {
      id: 'example-journal-2',
      example: true,
      symbol: 'VRDM',
      transactionId: 'example-4',
      entryPrice: vrdmEntry,
      exitPrice: null,
      quantity: 40,
      stopPrice: round(vrdmEntry * 0.88),
      targetPrice: round(vrdmEntry * 1.3),
      thesis: 'Testing how a very volatile stock behaves. I kept the position to about 10% of the account so a bad week cannot do much damage.',
      risks: 'Daily swings of 3% to 5% are normal for VRDM, so even a 12% stop could be hit by ordinary noise. Battery-metal prices are outside my control.',
      lessons: '',
      followedPlan: '',
      entryDay: 8,
      createdAt: now - (EXAMPLE_DAY - 8) * dayMs,
      updatedAt: now - (EXAMPLE_DAY - 8) * dayMs,
    },
    {
      id: 'example-journal-1',
      example: true,
      symbol: 'HLCN',
      transactionId: 'example-2',
      entryPrice: hlcnEntry,
      exitPrice: null,
      quantity: 10,
      stopPrice: round(hlcnEntry * 0.92),
      targetPrice: round(hlcnEntry * 1.15),
      thesis: 'Chipmakers have trended up over the past year in the simulation. I wanted some technology exposure but capped the position near 20% of the account.',
      risks: 'HLCN tends to move with SKLF and the whole technology sector, so a sector selloff would hit it hard. It is also one of the more volatile names.',
      lessons: 'Sold 4 shares on day 12 when the position grew past my 20% limit. Next time I will write the trimming rule down before buying.',
      followedPlan: '',
      entryDay: 0,
      createdAt: now - EXAMPLE_DAY * dayMs,
      updatedAt: now - (EXAMPLE_DAY - 12) * dayMs,
    },
  ];

  return {
    market: { startDate, day: EXAMPLE_DAY },
    transactions,
    journal,
    watchlist: [...EXAMPLE_WATCHLIST],
  };
}
