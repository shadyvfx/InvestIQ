// Predefined answers for TradeLab Tutor's preview mode.
//
// This is NOT a language model. Each message is matched to the closest topic
// by keywords, and a prewritten explanation is returned. Two topics ("my last
// trade" and "my portfolio") fill in numbers from the user's simulated account.
//
// When the Flask + llama.cpp backend exists, services/tutorService.js sends
// messages to it instead and this file is no longer used.

import { money, percent, plural, formatDate } from '../utils/format.js';

const lessonLink = (id, title) => `[${title}](#/learn/${id})`;

/** Topics in priority order. `keywords` are matched as lowercase substrings. */
export const TUTOR_TOPICS = [
  {
    id: 'advice',
    keywords: ['should i buy', 'should i sell', 'what should i buy', 'what stock should', 'which stock should', 'recommend a stock', 'will it go up', 'going to go up', 'predict', 'best stock', 'tip for', 'get rich', 'guaranteed'],
    weight: 3,
    reply: () => `I can't tell you what to buy or predict where a price will go, and that holds for the simulated market too. What I can do is help you build a way to decide for yourself.

Before any trade, try answering these in the [Trading Journal](#/journal):

1. **Why this stock, and why now?** Write your thesis in a sentence or two.
2. **What would prove you wrong?** That's where your stop belongs.
3. **How much are you risking?** Size the position so a loss at your stop stays within your rule, for example 1% of the account.
4. **What's the upside if you're right?** Compare it with the risk. A 1:2 risk-to-reward means you need to be right only about one time in three to break even.

The lesson ${lessonLink('position-sizing', 'Position Sizing and Risk-to-Reward')} walks through each step with a calculator.`,
  },
  {
    id: 'simulation',
    keywords: ['is this real', 'real money', 'real data', 'real prices', 'live data', 'simulat', 'advance the', 'advance 1', 'advance a day', 'next day', 'how does tradelab', 'fake', 'mock'],
    weight: 2,
    reply: () => `Everything in TradeLab is simulated:

- **Virtual money.** Your account starts with virtual cash. No real money is involved and nothing connects to a broker.
- **Generated prices.** The eight stocks and the index fund are fictional. Their prices come from a seeded model that runs in your browser, so they don't track any real company or market.
- **You control time.** Prices only change when you advance the simulated market with the **Advance 1 day** or **Advance 1 week** buttons. That lets you see how a decision plays out without waiting.

And I'm a preview too: I answer from a set of prewritten explanations. A locally hosted language model is planned to replace this mode.`,
  },
  {
    id: 'last-trade',
    keywords: ['last trade', 'last simulated trade', 'my trade', 'recent trade', 'latest trade', 'what happened', 'my last order', 'last order'],
    weight: 3,
    dynamic: true,
    reply: ({ context }) => describeLastTrade(context),
  },
  {
    id: 'portfolio',
    keywords: ['my portfolio', 'how am i doing', 'my account', 'my holdings', 'my positions', 'portfolio doing', 'my performance', 'am i diversified'],
    weight: 3,
    dynamic: true,
    reply: ({ context }) => describePortfolio(context),
  },
  {
    id: 'candlesticks',
    keywords: ['candle', 'candlestick', 'wick', 'ohlc', 'doji', 'hammer', 'engulfing', 'shadow'],
    reply: () => `A **candlestick** summarizes one period of trading, such as a day or five minutes, with four prices:

- **Open:** the first trade of the period
- **High** and **low:** the extremes, shown by the thin wicks
- **Close:** the last trade

The thick **body** spans the open and the close. If the close is above the open, it's an up candle; if below, a down candle. In TradeLab, up candles are drawn hollow and down candles filled, so you can read direction from the shape as well as the color.

A tall body means the price traveled far during the period. A small body with long wicks means it swung around and ended near where it started.

Build your own candle in ${lessonLink('candlestick-anatomy', 'Anatomy of a Candlestick')}.`,
    deeper: `### Going further
Named patterns like the doji, the hammer and the engulfing pattern describe how control shifted between buyers and sellers. They're weak evidence on their own. Check where they appear in the trend and how much volume came with them, then see ${lessonLink('candlestick-patterns', 'Reading Candlestick Patterns')}.`,
  },
  {
    id: 'order-types',
    keywords: ['market order', 'limit order', 'order type', 'types of order', 'slippage', 'limit price', 'fill'],
    reply: () => `The difference comes down to one question: **is getting the trade done more important, or getting a specific price?**

- A **market order** fills right away at the best available price. You get speed, but not exact price control. The gap between the price you expected and the price you got is called **slippage**.
- A **limit order** fills only at your price or better: a buy limit at $40 fills at $40 or lower, and a sell limit at $45 fills at $45 or higher. You get price control, but the order may never fill.

TradeLab's practice desk uses market orders that fill at the simulated price shown. Try the fill checker in ${lessonLink('market-vs-limit-orders', 'Market Orders vs. Limit Orders')}.`,
    deeper: `### Going further
A **stop order** turns into a market order once the price reaches a trigger. A sell stop is a common way to cap a loss, but in a fast move the fill can land beyond the stop price. A **stop-limit** order adds a limit to avoid that, at the risk of not filling at all.`,
  },
  {
    id: 'risk-reward',
    keywords: ['risk-to-reward', 'risk to reward', 'risk/reward', 'reward to risk', 'risk reward', 'r multiple', 'r-multiple', 'break even win', 'win rate'],
    weight: 2,
    reply: () => `A **risk-to-reward ratio** compares what a trade could lose with what it could gain.

Say you buy at $50, plan to exit at $47 if you're wrong (your stop) and at $56 if you're right (your target). You're risking $3 to make $6, a ratio of **1:2**.

Why it matters: the better the ratio, the lower the win rate you need to break even.

- At 1:1, you need to win about half your trades.
- At 1:2, about one in three.
- At 1:3, about one in four.

(Before costs, and only if you actually exit at your stop and target.)

You can record a stop and target on each entry in the [Trading Journal](#/journal), and TradeLab will show the planned ratio.`,
    deeper: `### Going further
The break-even win rate is **risk ÷ (risk + reward)**. For 1:2 that's 3 ÷ (3 + 6) ≈ 33%. A great ratio isn't free, though: targets far away are reached less often, so the ratio and the win rate trade off against each other.`,
  },
  {
    id: 'stop-loss',
    keywords: ['stop loss', 'stop-loss', 'stoploss', 'where to put my stop', 'where should my stop', 'set a stop', 'stop order'],
    reply: () => `A **stop-loss** is the price at which you've decided your trade idea is wrong and you'll exit. It turns "how much could this cost me?" into a number you choose in advance.

A good stop is placed where the reason for the trade breaks, not at a random percentage. For example, below a recent low you expected to hold.

Once you know your stop, it also sets your position size: divide the dollars you're willing to lose by the distance from entry to stop. With $100 of risk and a $3 stop distance, that's 33 shares.

The calculator in ${lessonLink('position-sizing', 'Position Sizing and Risk-to-Reward')} does this math for you.`,
  },
  {
    id: 'position-sizing',
    keywords: ['position size', 'position sizing', 'how many shares', 'how many shares should', 'how much should i invest', 'how much to buy', '1% rule', 'one percent rule', 'sizing'],
    weight: 2,
    reply: () => `Position sizing starts with what you can afford to lose, not with how much you want to buy.

1. **Pick your account risk.** A common guideline is 1% to 2% of the account per trade. On $10,000, 1% is $100.
2. **Find your risk per share.** That's your entry minus your stop. Buying at $50 with a stop at $47 risks $3 a share.
3. **Divide.** $100 ÷ $3 ≈ 33 shares.

The order ticket in [Practice Trading](#/practice) also shows how large a position would be as a share of your account, and warns you when one stock would make up a big part of it.`,
  },
  {
    id: 'diversification',
    keywords: ['diversif', 'correlat', 'eggs in one basket', 'concentrat', 'spread my risk', 'too much in one'],
    reply: () => `**Diversification** means spreading money across investments that don't all move together, so one company's bad news can't sink the whole portfolio.

How *many* holdings you have matters less than how *different* they are. **Correlation** measures how closely two investments move together, from −1 (opposite) to +1 (in lockstep). Two chipmakers tend to move together; a chipmaker and a grocery chain less so.

In the simulated market, HLCN and SKLF share a technology factor, while BRMB and MRDH move more independently. The index fund TLMX holds the whole market in one position.

The Portfolio page shows your allocation by holding and by sector. More in ${lessonLink('diversification-basics', 'Diversification Basics')}.`,
    deeper: `### Going further
Diversification reduces company-specific risk but not market risk: in a broad selloff most stocks fall together. That's why position sizing still matters in a diversified portfolio.`,
  },
  {
    id: 'what-is-stock',
    keywords: ['what is a stock', 'what are stocks', 'what is a share', 'own a stock', 'owning a stock', 'what is equity', 'how do stocks work', 'stock market work'],
    reply: () => `A **stock** is a small piece of ownership in a company. Own 100 of a company's 10 million shares and you own 0.001% of it.

Shareholders can earn a return in two ways:

- **Price appreciation:** selling for more than you paid
- **Dividends:** cash some companies pay out of their profits

Prices move because investors' expectations about the company's future change. That's also why prices can fall, sometimes sharply, and why a share can lose all its value if a company fails.

Start with ${lessonLink('what-is-a-stock', 'What Is a Stock?')}.`,
  },
  {
    id: 'moving-average',
    keywords: ['moving average', ' sma', ' ema', 'crossover', 'golden cross', 'death cross', '200-day', '50-day', 'trend line'],
    reply: () => `A **moving average** smooths out price noise by averaging the last N closes and updating every period. A 5-day simple moving average of $10, $11, $12, $11 and $13 is $57 ÷ 5 = $11.40.

- A **simple** moving average (SMA) weights each day equally.
- An **exponential** moving average (EMA) weights recent days more, so it turns faster, for real changes and for noise alike.

Traders read trend direction from the slope and watch for crossovers between short and long averages. The catch: averages are built from past prices, so they always **lag**, and in sideways markets crossovers can flip back and forth.

More in ${lessonLink('moving-averages', 'Moving Averages and Trend')}.`,
  },
  {
    id: 'rsi',
    keywords: [' rsi', 'relative strength', 'overbought', 'oversold', 'momentum', 'divergence', 'oscillator'],
    reply: () => `The **Relative Strength Index (RSI)** compares the size of recent gains with recent losses, usually over 14 periods, and scales the result from 0 to 100.

- Above 70 is traditionally called **overbought**, below 30 **oversold**.
- Those labels describe recent strength, not a forecast. In a strong trend RSI can stay above 70 for weeks.

The formula: **RSI = 100 − 100 ÷ (1 + RS)**, where RS is the average gain divided by the average loss. Equal gains and losses give an RSI of 50.

More in ${lessonLink('rsi-momentum', 'RSI and Momentum')}.`,
    deeper: `### Going further
A **divergence** is when price and RSI disagree, such as a higher high in price with a lower high in RSI. It can hint at fading momentum, but it can persist for a long time. Indicators built from the same prices often agree with each other, so stacking several adds less confirmation than it seems.`,
  },
  {
    id: 'volatility',
    keywords: ['volatil', 'swings', 'risky stock', 'how risky', 'beta', 'standard deviation'],
    reply: () => `**Volatility** describes how much a price tends to swing. A stock that moves 3% on a typical day is more volatile than one that moves 0.5%.

Higher volatility means a wider range of outcomes in both directions, so the same position size carries more risk. That's why many traders size volatile positions smaller and set wider stops.

In the simulated market, Verdant Materials (VRDM) is the most volatile stock and Bramble Foods (BRMB) one of the calmest. Compare their 1Y charts in [Practice Trading](#/practice) to see the difference.`,
  },
  {
    id: 'spread',
    keywords: [' bid', 'ask price', 'spread', 'order book', 'liquidity'],
    reply: () => `The **bid** is the highest price a buyer is offering right now, and the **ask** is the lowest price a seller will accept. The difference between them is the **spread**.

If the bid is $50.00 and the ask is $50.04, the spread is 4 cents. Buying immediately means paying about the ask; selling immediately means getting about the bid. Heavily traded stocks usually have narrow spreads, while thinly traded ones can have wide spreads, which raises the cost of getting in and out.

TradeLab's simulator fills orders at a single simulated price and doesn't model a spread yet. More in ${lessonLink('how-prices-move', 'How Stock Prices Move')}.`,
  },
  {
    id: 'index-fund',
    keywords: ['index fund', ' etf', 'tlmx', 'passive', 'total market', 's&p'],
    reply: () => `An **index fund** holds many companies at once by tracking a market index, so one purchase spreads your money across a whole market segment. It reduces company-specific risk, though not market risk.

In TradeLab, **TLMX** is a simulated total-market fund. Because it holds the whole simulated market, it moves with the market factor and swings much less than individual stocks like VRDM or SKLF.

A useful exercise: compare your simulated results with what holding only TLMX would have done over the same period.`,
  },
  {
    id: 'psychology',
    keywords: ['fomo', 'fear of missing', 'fear', 'greed', 'emotion', 'bias', 'revenge', 'panic', 'discipline', 'tilt', 'impulsive', 'loss aversion', 'overconfiden'],
    reply: () => `Emotions are part of every trade. A few patterns to watch for:

- **FOMO:** chasing a stock after a big run because everyone else seems to be winning
- **Loss aversion:** holding a loser too long because selling makes the loss feel real
- **Overconfidence:** taking bigger risks after a few wins
- **Revenge trading:** jumping into a new trade to win back a loss

What helps most is deciding before you're in the trade. Write your thesis, your stop and your size in the [Trading Journal](#/journal) first, then judge yourself on whether you followed the plan, not only on the result.

More in ${lessonLink('trading-psychology', 'Emotions, Bias and Discipline')}.`,
  },
  {
    id: 'dividends',
    keywords: ['dividend', 'yield', 'payout'],
    reply: () => `A **dividend** is cash a company pays its shareholders out of its profits, often every quarter. If a stock pays $2 a year and trades at $50, its **dividend yield** is 4%.

Dividends are one of the two ways stocks produce a return; the other is price appreciation. Many growing companies pay no dividend and reinvest their profits instead. A dividend can also be cut if the business struggles.

TradeLab's simulator doesn't pay dividends yet, so simulated returns come from price changes only.`,
  },
  {
    id: 'market-cap',
    keywords: ['market cap', 'capitalization', 'company size', 'large cap', 'small cap'],
    reply: () => `**Market capitalization** is a company's share price multiplied by its shares outstanding. A $40 stock with 500 million shares has a market cap of $20 billion.

It's the right way to compare company sizes. A $10 share isn't "cheaper" than a $300 share in any useful sense, because each share is a different slice of a different-sized company.`,
  },
  {
    id: 'greeting',
    keywords: ['hello', ' hi ', ' hey', 'help', 'what can you do', 'who are you', 'how do you work', 'good morning', 'good evening'],
    weight: 0.5,
    reply: () => `Hi, I'm TradeLab Tutor, currently in **preview mode**. I answer from a set of prewritten explanations rather than a language model, so I cover a fixed list of beginner topics:

- Candlestick charts, market and limit orders
- Risk-to-reward, stop-losses and position sizing
- Diversification, volatility and index funds
- Moving averages and RSI
- Trading psychology
- Your own simulated account: try "Explain what happened in my last simulated trade"

Pick a suggestion or ask about one of these topics.`,
  },
];

export const FALLBACK_REPLY = `I don't have a prewritten answer for that yet. In preview mode I only cover a fixed set of topics, and I'd rather say so than guess.

Try asking about one of these:

- How candlestick charts work
- Market orders versus limit orders
- Risk-to-reward ratios or position sizing
- Diversification
- What happened in your last simulated trade

You can also browse the [lessons](#/learn) for a structured walk-through.`;

export const SUGGESTED_QUESTIONS = [
  'Explain candlestick charts to me.',
  'What is the difference between a market order and a limit order?',
  'Help me understand risk-to-reward ratios.',
  'Explain what happened in my last simulated trade.',
  'What does diversification mean?',
];

// ---------------------------------------------------------------------------
// Topic matching

function normalize(text) {
  const cleaned = String(text)
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9&%/'\- ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return ` ${cleaned} `;
}

/** Picks the best topic for a message, or null when nothing matches. */
export function matchTopic(text) {
  const message = normalize(text);
  let best = null;
  for (const topic of TUTOR_TOPICS) {
    let score = 0;
    for (const keyword of topic.keywords) {
      if (message.includes(keyword)) score += keyword.length > 6 ? 2 : 1;
    }
    if (!score) continue;
    score *= topic.weight ?? 1;
    if (!best || score > best.score) best = { topic, score };
  }
  return best?.topic ?? null;
}

/**
 * Builds a predefined reply. `level` is the learner's difficulty preference;
 * intermediate and advanced learners also get the "Going further" section.
 */
export function buildMockReply({ text, context = {}, level = 'beginner' }) {
  const topic = matchTopic(text);
  if (!topic) return { topic: 'fallback', content: FALLBACK_REPLY };
  let content = topic.reply({ context, level });
  if (topic.deeper && level !== 'beginner') content += `\n\n${topic.deeper}`;
  return { topic: topic.id, content };
}

// ---------------------------------------------------------------------------
// Answers that use the learner's simulated account

function describeLastTrade(context) {
  const tx = context.lastTransaction;
  if (!tx) {
    return `You haven't placed a simulated trade yet, so there's nothing to review.

Once you do, ask again and I'll walk through it: the price you got, how the simulated price has moved since, and what that means for your position. Head to [Practice Trading](#/practice) to place one with virtual money.`;
  }

  const name = context.instrumentNames?.[tx.symbol] || tx.symbol;
  const when = tx.date ? `on simulated day ${tx.day} (${formatDate(tx.date, 'long')})` : `on simulated day ${tx.day}`;
  const verb = tx.side === 'buy' ? 'bought' : 'sold';
  const lines = [`**Your last simulated trade:** you ${verb} ${plural(tx.quantity, 'share')} of ${tx.symbol} (${name}) at ${money(tx.price)} ${when}, for ${money(tx.total)}.${tx.example ? ' It is one of the example trades the demo account starts with.' : ''}`];

  const current = context.quotes?.[tx.symbol]?.price;
  if (Number.isFinite(current)) {
    const move = current - tx.price;
    const movePct = tx.price ? move / tx.price : 0;
    const daysSince = Math.max(0, (context.day ?? tx.day) - tx.day);
    const timing = daysSince === 0 ? 'Since then, within the same simulated day,' : `In the ${plural(daysSince, 'simulated day')} since,`;
    const direction = move > 0 ? 'risen' : move < 0 ? 'fallen' : 'not moved';
    lines.push(
      `${timing} the price has ${direction}${move !== 0 ? ` to ${money(current)}, a change of ${money(move, { sign: true })} per share (${percent(movePct, { sign: true })})` : ` from ${money(current)}`}.`,
    );

    if (tx.side === 'buy') {
      lines.push(
        move === 0
          ? `Orders fill at the simulated closing price, so a position bought today hasn't had a chance to move yet. Advance the simulated market to see what happens next.`
          : `On those ${plural(tx.quantity, 'share')}, that's ${money(move * tx.quantity, { sign: true })} of unrealized ${move > 0 ? 'gain' : 'loss'}. "Unrealized" means it only becomes real if you sell.`,
      );
    } else if (tx.realizedPnl !== null && tx.realizedPnl !== undefined) {
      lines.push(
        `Selling locked in a realized ${tx.realizedPnl >= 0 ? 'gain' : 'loss'} of ${money(tx.realizedPnl, { sign: true })}, measured against your average cost. ${move > 0 ? 'The price has kept rising since you sold, which is normal and not by itself a mistake.' : move < 0 ? 'The price has fallen since you sold.' : ''}`.trim(),
      );
    }
  }

  const holding = context.positions?.find((row) => row.symbol === tx.symbol);
  if (holding) {
    lines.push(
      `You now hold ${plural(holding.quantity, 'share')} at an average cost of ${money(holding.averageCost)}. That's ${percent(holding.weight, { digits: 1 })} of your account, with an unrealized ${holding.unrealizedPnl >= 0 ? 'gain' : 'loss'} of ${money(holding.unrealizedPnl, { sign: true })}.`,
    );
  } else if (tx.side === 'sell') {
    lines.push(`You no longer hold any ${tx.symbol}.`);
  }

  lines.push(`**Questions worth asking yourself:**

- Did the move match the reason you had for the trade?
- Do you know the price at which you'd exit if you're wrong?
- Is this position still a size you're comfortable with?

Record your answers in the [Trading Journal](#/journal). One trade says more about luck than skill, so focus on whether you followed your plan.`);

  return lines.join('\n\n');
}

function describePortfolio(context) {
  const v = context.valuation;
  if (!v) return 'I could not read your simulated account just now. Try again in a moment.';
  if (!v.positions.length) {
    return `Your simulated account is all cash right now: ${money(v.cash)} in virtual money and no holdings.

That's a fine place to start. Before buying, decide how much of the account you'd risk on one idea, and consider how a single stock compares with the index fund TLMX. [Practice Trading](#/practice) is where you place orders.`;
  }

  const top = v.positions[0];
  const lines = [
    `**Your simulated account:** ${money(v.equity)} in total, made up of ${money(v.holdingsValue)} in ${plural(v.positions.length, 'holding')} and ${money(v.cash)} in cash. Since the account opened with ${money(context.startingCash)}, that's ${money(v.totalReturn, { sign: true })} (${percent(v.totalReturnPct, { sign: true })}).`,
    `Your largest holding is ${top.symbol} at ${percent(top.weight, { digits: 1 })} of the account.${top.weight >= 0.35 ? ' That is a concentrated position: a sharp move in one stock would swing your whole account.' : top.weight >= 0.2 ? ' That is a sizable share for one position, so keep an eye on concentration.' : ''}`,
  ];
  if (Number.isFinite(context.dayChange?.amount)) {
    lines.push(`Today's simulated change is ${money(context.dayChange.amount, { sign: true })} (${percent(context.dayChange.pct, { sign: true })}).`);
  }
  lines.push(`Remember that a few simulated weeks say very little about skill. The [Portfolio](#/portfolio) page breaks this down by holding and by sector.`);
  return lines.join('\n\n');
}
