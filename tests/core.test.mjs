// Unit tests for the DOM-free business logic. Run with: npm test
// (uses Node's built-in test runner, no dependencies)

import test from 'node:test';
import assert from 'node:assert/strict';

import { deriveAccount, valueAccount, dayChange, equityCurve, allocation } from '../js/core/portfolio.js';
import { previewOrder, executeMarketOrder, parseQuantity } from '../js/core/orders.js';
import { gradeQuiz, lessonProgress, recordQuizAttempt, completeSection, suggestLessons } from '../js/core/progress.js';
import { validateJournalEntry, entryMetrics, journalStats } from '../js/core/journal.js';
import { addTradingDays, latestTradingDay, tradingDaysBetween, createDayCalendar } from '../js/core/calendar.js';
import { quoteAt, historyAt, closeAt, INSTRUMENTS } from '../js/data/mockMarketData.js';
import { LESSONS } from '../js/data/mockLessons.js';
import { matchTopic } from '../js/data/mockTutorResponses.js';
import { markdownToHTML } from '../js/utils/markdown.js';

const tx = (id, symbol, side, quantity, price, day) => ({ id, symbol, side, quantity, price, day, timestamp: day * 1000 + Number(id.slice(1)) });

test('ledger replay derives cash, holdings and realized P/L with average cost', () => {
  const account = deriveAccount(10000, [
    tx('t1', 'AAA', 'buy', 10, 100, 0),
    tx('t2', 'AAA', 'buy', 10, 110, 1),
    tx('t3', 'AAA', 'sell', 5, 120, 2),
  ]);
  assert.equal(account.cash, 10000 - 1000 - 1100 + 600);
  assert.equal(account.holdings.length, 1);
  assert.equal(account.holdings[0].quantity, 15);
  assert.equal(account.holdings[0].averageCost, 105);
  assert.equal(account.realizedPnl, 75); // 5 * (120 - 105)
  assert.equal(account.transactions[2].realizedPnl, 75);
});

test('cent arithmetic does not drift', () => {
  const trades = Array.from({ length: 50 }, (_, i) => tx(`t${i + 1}`, 'AAA', i % 2 ? 'sell' : 'buy', 3, 0.1 + 0.2, i));
  const account = deriveAccount(1000, trades);
  assert.equal(account.cash, 1000);
});

test('valuation, weights and day change only count shares held at the open', () => {
  const account = deriveAccount(1000, [tx('t1', 'AAA', 'buy', 5, 100, 0), tx('t2', 'AAA', 'buy', 2, 104, 3)]);
  const quotes = { AAA: { price: 104, prevClose: 100 } };
  const value = valueAccount(account, quotes);
  assert.equal(value.holdingsValue, 728);
  assert.equal(value.equity, account.cash + 728);
  assert.ok(Math.abs(value.positions[0].weight + value.cashWeight - 1) < 1e-9);
  const change = dayChange(account, quotes, 3);
  assert.equal(change.amount, 20); // 5 shares held at the open moved +$4; today's 2 shares have not moved
});

test('allocation lists holdings by value with cash last', () => {
  const account = deriveAccount(1000, [tx('t1', 'AAA', 'buy', 2, 100, 0), tx('t2', 'BBB', 'buy', 1, 300, 0)]);
  const rows = allocation(valueAccount(account, { AAA: { price: 100, prevClose: 100 }, BBB: { price: 300, prevClose: 300 } }));
  assert.deepEqual(rows.map((row) => row.key), ['BBB', 'AAA', 'cash']);
});

test('equity curve replays trades day by day', () => {
  const closes = { AAA: [100, 110, 90] };
  const points = equityCurve({
    startingCash: 1000,
    transactions: [tx('t1', 'AAA', 'buy', 5, 100, 0)],
    fromDay: 0,
    toDay: 2,
    closeOf: (symbol, day) => closes[symbol][day],
  });
  assert.deepEqual(points.map((point) => point.equity), [1000, 1050, 950]);
});

test('order preview blocks overspending and short selling', () => {
  const base = { symbol: 'AAA', price: 50, cash: 1000, positionQuantity: 3, equity: 1150 };
  assert.equal(previewOrder({ ...base, side: 'buy', quantity: 20 }).ok, true);
  const tooBig = previewOrder({ ...base, side: 'buy', quantity: 21 });
  assert.equal(tooBig.ok, false);
  assert.equal(tooBig.errors[0].code, 'insufficient_cash');
  assert.equal(tooBig.maxBuy, 20);
  assert.equal(previewOrder({ ...base, side: 'sell', quantity: 4 }).errors[0].code, 'insufficient_shares');
  assert.equal(previewOrder({ ...base, positionQuantity: 0, side: 'sell', quantity: 1 }).errors[0].code, 'no_position');
  assert.equal(previewOrder({ ...base, side: 'buy', quantity: 1.5 }).errors[0].code, 'invalid_quantity');
  assert.ok(Number.isNaN(parseQuantity('2.5')));
  assert.equal(parseQuantity(' 1,200 '), 1200);
});

test('large buys are flagged for concentration', () => {
  const preview = previewOrder({ symbol: 'AAA', side: 'buy', quantity: 10, price: 50, cash: 1000, positionQuantity: 0, equity: 1000 });
  assert.equal(preview.concentration, 'high');
});

test('market orders fill at the simulated price', () => {
  const result = executeMarketOrder({
    order: { symbol: 'AAA', side: 'buy', quantity: 2 },
    price: 12.345,
    cash: 100,
    positionQuantity: 0,
    equity: 100,
    day: 4,
    id: 'x',
    now: 1,
  });
  assert.equal(result.ok, true);
  assert.equal(result.transaction.price, 12.35);
  assert.equal(result.transaction.day, 4);
});

test('quizzes pass at two thirds and passing completes the lesson', () => {
  const lesson = LESSONS[0];
  const allRight = Object.fromEntries(lesson.quiz.map((q) => [q.id, q.correct]));
  const twoRight = { ...allRight, [lesson.quiz[0].id]: (lesson.quiz[0].correct + 1) % lesson.quiz[0].options.length };
  const oneRight = { [lesson.quiz[0].id]: lesson.quiz[0].correct };
  assert.equal(gradeQuiz(lesson.quiz, allRight).passed, true);
  assert.equal(gradeQuiz(lesson.quiz, twoRight).passed, true);
  assert.equal(gradeQuiz(lesson.quiz, oneRight).passed, false);

  let record = completeSection(null, lesson.sections[0].id, 1);
  assert.equal(lessonProgress(lesson, record).status, 'in-progress');
  record = recordQuizAttempt(record, lesson, gradeQuiz(lesson.quiz, allRight), 2);
  const progress = lessonProgress(lesson, record);
  assert.equal(progress.status, 'completed');
  assert.equal(progress.ratio, 1);
});

test('suggestions respect the difficulty preference', () => {
  const beginner = suggestLessons(LESSONS, {}, 'beginner', 10).map(({ lesson }) => lesson.difficulty);
  const firstAbove = beginner.findIndex((level) => level !== 'beginner');
  assert.ok(beginner.slice(firstAbove).every((level) => level !== 'beginner'));
});

test('journal validation and metrics', () => {
  const bad = validateJournalEntry({ symbol: '', entryPrice: 'abc', thesis: 'short', stopPrice: '60' }, { knownSymbols: ['AAA'] });
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.symbol && bad.errors.entryPrice && bad.errors.thesis);

  const good = validateJournalEntry(
    { symbol: 'aaa', entryPrice: '50', exitPrice: '56', stopPrice: '47', targetPrice: '56', thesis: 'A full sentence about why.', risks: 'Sector risk' },
    { knownSymbols: ['AAA'] },
  );
  assert.equal(good.ok, true);
  const metrics = entryMetrics(good.value);
  assert.equal(metrics.status, 'closed');
  assert.equal(metrics.plannedRewardToRisk, 2);
  assert.equal(metrics.rMultiple, 2);
  assert.equal(metrics.hasPlan, true);
});

test('journal outcome statistics wait for three closed trades', () => {
  const entry = (exit) => ({ entryPrice: 10, exitPrice: exit, thesis: 'x', risks: 'y', stopPrice: 9, followedPlan: 'yes' });
  assert.equal(journalStats([entry(11), entry(9)]).hasOutcomes, false);
  const stats = journalStats([entry(11), entry(9), entry(12)]);
  assert.equal(stats.hasOutcomes, true);
  assert.ok(Math.abs(stats.outcomes.winRate - 2 / 3) < 1e-9);
  assert.equal(stats.followedRate, 1);
});

test('trading calendar skips weekends', () => {
  assert.equal(latestTradingDay('2026-10-11'), '2026-10-09'); // Sunday -> Friday
  assert.equal(addTradingDays('2026-10-09', 1), '2026-10-12');
  assert.equal(addTradingDays('2026-10-12', -1), '2026-10-09');
  assert.equal(tradingDaysBetween('2026-10-09', '2026-10-16'), 5);
  const dateOf = createDayCalendar('2026-10-09', -10, 10);
  assert.equal(dateOf(0), '2026-10-09');
  assert.equal(dateOf(1), '2026-10-12');
  assert.equal(dateOf(-1), '2026-10-08');
});

test('simulated market is deterministic and internally consistent', () => {
  for (const { symbol } of INSTRUMENTS) {
    const quote = quoteAt(symbol, 5);
    assert.equal(quote.price, closeAt(symbol, 5));
    assert.equal(quote.prevClose, closeAt(symbol, 4));
    assert.ok(quote.low <= Math.min(quote.open, quote.price) && quote.high >= Math.max(quote.open, quote.price));
    const intraday = historyAt(symbol, '1D', 5).points;
    assert.equal(intraday.length, 78);
    assert.equal(intraday.at(-1).c, quote.price);
    assert.equal(Math.max(...intraday.map((p) => p.h)), quote.high);
    assert.equal(Math.min(...intraday.map((p) => p.l)), quote.low);
  }
  assert.equal(historyAt('TLMX', '1Y', 0).points.length, 252);
  assert.equal(closeAt('HLCN', 0), 186.4);
});

test('tutor preview mode routes the suggested questions to topics', () => {
  assert.equal(matchTopic('Explain candlestick charts to me.').id, 'candlesticks');
  assert.equal(matchTopic('What is the difference between a market order and a limit order?').id, 'order-types');
  assert.equal(matchTopic('Help me understand risk-to-reward ratios.').id, 'risk-reward');
  assert.equal(matchTopic('Explain what happened in my last simulated trade.').id, 'last-trade');
  assert.equal(matchTopic('What does diversification mean?').id, 'diversification');
  assert.equal(matchTopic('qwerty'), null);
});

test('markdown renderer escapes HTML and only links inside the app', () => {
  // Tutor replies will come from a language model later, so its output must never become markup.
  assert.equal(markdownToHTML('<img src=x onerror=alert(1)>'), '<p>&lt;img src=x onerror=alert(1)&gt;</p>');
  assert.equal(markdownToHTML('[Lesson](#/learn/rsi-momentum)'), '<p><a href="#/learn/rsi-momentum">Lesson</a></p>');
  assert.equal(markdownToHTML('[Site](https://example.com)'), '<p>[Site](https://example.com)</p>');
  assert.equal(markdownToHTML('[x](javascript:alert(1))'), '<p>[x](javascript:alert(1))</p>');
  assert.equal(markdownToHTML('**Risk** is *not* `optional`'), '<p><strong>Risk</strong> is <em>not</em> <code>optional</code></p>');
  assert.equal(markdownToHTML('2 * 3 * 4'), '<p>2 * 3 * 4</p>');
  assert.equal(markdownToHTML('## Summary\n- one\n- two'), '<h3>Summary</h3><ul><li>one</li><li>two</li></ul>');
});
