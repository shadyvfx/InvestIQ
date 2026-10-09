// Course content for the Learn section. This is static mock content today;
// a future backend or CMS can serve the same shape from GET /api/lessons.
//
// Block types inside a section:
//   { type: 'md', text }                      Markdown (see utils/markdown.js)
//   { type: 'callout', tone, title, text }    tone: 'tip' | 'key' | 'warn'
//   { type: 'terms', items: [{ term, definition }] }
//   { type: 'figure', name, caption }         drawn by pages/lesson.js
//   { type: 'widget', name }                  interactive practice, see pages/lesson.js
//
// Quiz questions: { id, prompt, options, correct (index), explanation }.
// Educational content only. Not financial advice.

export const CATEGORIES = [
  {
    id: 'fundamentals',
    title: 'Stock Market Fundamentals',
    description: 'What a stock is, how prices are set, and why they move.',
    icon: 'trend',
  },
  {
    id: 'candlesticks',
    title: 'Reading Candlestick Charts',
    description: 'Turn open, high, low and close into a shape you can read at a glance.',
    icon: 'practice',
  },
  {
    id: 'orders',
    title: 'Market Orders and Limit Orders',
    description: 'Choose between getting filled quickly and controlling your price.',
    icon: 'orders',
  },
  {
    id: 'indicators',
    title: 'Technical Indicators',
    description: 'Moving averages and momentum, and the limits of both.',
    icon: 'pulse',
  },
  {
    id: 'risk',
    title: 'Risk Management',
    description: 'Size every position so one bad trade never sinks the account.',
    icon: 'shield',
  },
  {
    id: 'diversification',
    title: 'Portfolio Diversification',
    description: "Spread risk across holdings that don't all move together.",
    icon: 'layers',
  },
  {
    id: 'psychology',
    title: 'Trading Psychology',
    description: 'Recognize the habits and biases that pull you away from your plan.',
    icon: 'mind',
  },
];

export const LESSONS = [
  // ---------------------------------------------------------------------
  {
    id: 'what-is-a-stock',
    categoryId: 'fundamentals',
    title: 'What Is a Stock?',
    summary: 'Ownership, the two ways shares can earn a return, and why prices can fall as well as rise.',
    difficulty: 'beginner',
    minutes: 7,
    objectives: [
      'Explain what owning a share of a company means',
      'Describe the two main sources of stock returns',
      'Compare company sizes with market capitalization',
    ],
    tutorPrompts: ['What does it mean to own a stock?', 'What does diversification mean?'],
    sections: [
      {
        id: 'ownership',
        title: 'Owning a slice of a company',
        blocks: [
          {
            type: 'md',
            text: `A **stock**, also called a share or equity, is a unit of ownership in a company. If a company has 10 million shares and you own 100 of them, you own 0.001% of the business. You don't run the company, but you share in how it does: if the business becomes more valuable over time, your slice tends to become more valuable too.

Companies sell shares to raise money, often through an **initial public offering (IPO)**. After that, shares trade between investors on an exchange. When you buy a stock on an exchange, you are almost always buying it from another investor, not from the company itself.`,
          },
          {
            type: 'callout',
            tone: 'key',
            title: 'Key idea',
            text: "A share makes you a part-owner. What it's worth on any day depends on what other investors are willing to pay for that ownership.",
          },
        ],
      },
      {
        id: 'returns',
        title: 'How shareholders make or lose money',
        blocks: [
          {
            type: 'md',
            text: `A stock can produce a return in two main ways:

- **Price appreciation.** You buy at one price and later sell at a higher one. The difference is a capital gain. Selling for less than you paid is a capital loss.
- **Dividends.** Some companies pay part of their profits to shareholders in cash, often every quarter. Many growing companies pay no dividend and reinvest their profits instead.

Your **total return** combines both. Say you buy 10 shares at $50, which costs $500. A year later the price is $54 and you've received $1 per share in dividends. You've gained $40 from the price and $10 from dividends: a total return of $50, or 10% of your $500.`,
          },
        ],
      },
      {
        id: 'market-cap',
        title: 'Share price and company size',
        blocks: [
          {
            type: 'md',
            text: `A company's **market capitalization**, or market cap, is its share price multiplied by its number of shares outstanding. A $40 stock with 500 million shares has a market cap of $20 billion.

Market cap is how you compare company sizes. A $10 stock is not "cheaper" than a $300 stock in any useful sense, because each share is a different-sized slice of a different-sized company.`,
          },
          {
            type: 'terms',
            items: [
              { term: 'Share price', definition: 'What one share last traded for.' },
              { term: 'Shares outstanding', definition: 'The total number of shares held by investors.' },
              { term: 'Market cap', definition: 'Share price multiplied by shares outstanding.' },
            ],
          },
        ],
      },
      {
        id: 'risk',
        title: 'Why prices fall as well as rise',
        blocks: [
          {
            type: 'md',
            text: `A stock price reflects what investors collectively expect a company to earn in the future, and how confident they are about it. When expectations improve, perhaps after strong sales or a new product, buyers bid the price up. When they worsen, after weak earnings, new competition or a broad market selloff, the price falls.

Owning stock carries real risk. If a company fails, shareholders are paid after its lenders, and a share price can fall to zero. That's why the later lessons on diversification and position sizing matter so much.`,
          },
          {
            type: 'callout',
            tone: 'tip',
            title: 'Practicing in TradeLab',
            text: 'Every price in TradeLab is simulated and every dollar is virtual. The habits you build here, like sizing positions and writing down your reasons, are what carry over to real markets.',
          },
        ],
      },
    ],
    quiz: [
      {
        id: 'q1',
        prompt: 'You own 200 shares of a company that has 1,000,000 shares outstanding. What percentage of the company do you own?',
        options: ['0.02%', '0.2%', '2%', '20%'],
        correct: 0,
        explanation: '200 ÷ 1,000,000 = 0.0002, which is 0.02% of the company.',
      },
      {
        id: 'q2',
        prompt: 'Which pair describes the two main sources of stock returns?',
        options: ['Interest and principal', 'Price appreciation and dividends', 'Fees and commissions', 'Margin and leverage'],
        correct: 1,
        explanation: 'Shareholders earn from the price rising (a capital gain) and from any dividends the company pays.',
      },
      {
        id: 'q3',
        prompt: 'Stock A trades at $12 and Stock B trades at $250. What can you conclude from that alone?',
        options: [
          'Stock A is the better value',
          'Company B is larger',
          'Nothing about value or size without more information',
          'Stock A will rise faster',
        ],
        correct: 2,
        explanation: 'A share price alone says nothing about company size or value. Compare market caps and the businesses themselves.',
      },
    ],
  },

  // ---------------------------------------------------------------------
  {
    id: 'how-prices-move',
    categoryId: 'fundamentals',
    title: 'How Stock Prices Move',
    summary: 'Bids, asks and spreads, plus the supply, demand and news that push prices around.',
    difficulty: 'beginner',
    minutes: 9,
    objectives: [
      'Read a bid, an ask and the spread between them',
      'Explain how supply and demand move a price',
      'Tell volatility and volume apart',
    ],
    tutorPrompts: ['What is volatility?', 'What is a bid-ask spread?'],
    sections: [
      {
        id: 'bid-ask',
        title: 'Every trade has a buyer and a seller',
        blocks: [
          {
            type: 'md',
            text: `An exchange matches buyers with sellers. The **bid** is the highest price any buyer is currently willing to pay. The **ask**, or offer, is the lowest price any seller will accept. The gap between them is the **spread**. The "last price" you see quoted is simply the price of the most recent match.

For example, if the bid is $50.00 and the ask is $50.04, the spread is 4 cents. Buying right away means paying about the ask; selling right away means receiving about the bid.`,
          },
        ],
      },
      {
        id: 'supply-demand',
        title: 'Supply, demand and news',
        blocks: [
          {
            type: 'md',
            text: `Prices move when the balance between eager buyers and eager sellers shifts. If more people want to buy at the current ask than there are shares offered, buyers have to raise their bids and the price climbs. If sellers are more eager, they lower their asks and the price falls.

What shifts that balance? Company news such as earnings reports, product launches or lawsuits. Industry trends. Interest rates. And the mood of the market as a whole: on many days, a large part of a stock's move has little to do with the company itself.`,
          },
          {
            type: 'callout',
            tone: 'tip',
            title: 'How TradeLab simulates this',
            text: "Each simulated stock's daily move combines a market-wide factor, a sector factor and company-specific noise. That's a simplified version of how real returns are often modeled.",
          },
        ],
      },
      {
        id: 'volatility-volume',
        title: 'Volatility and volume',
        blocks: [
          {
            type: 'md',
            text: `**Volatility** describes how much a price tends to swing. A stock that moves 3% on a typical day is more volatile than one that moves 0.5%. Higher volatility means a wider range of possible outcomes in both directions.

**Volume** is the number of shares traded in a period. A big move on heavy volume suggests broad participation, while a move on very light volume can reverse more easily. Volume is a clue about conviction, not a promise about direction.`,
          },
          {
            type: 'terms',
            items: [
              { term: 'Bid', definition: 'The highest price a buyer is offering right now.' },
              { term: 'Ask', definition: 'The lowest price a seller will accept right now.' },
              { term: 'Spread', definition: 'The difference between the ask and the bid.' },
              { term: 'Volatility', definition: 'How widely a price tends to swing.' },
              { term: 'Volume', definition: 'How many shares changed hands in a period.' },
            ],
          },
        ],
      },
      {
        id: 'reading-changes',
        title: 'Reading a price change',
        blocks: [
          {
            type: 'md',
            text: `Price changes are shown two ways: in dollars and in percent. A stock that rises from $80 to $82 is up $2.00, or 2.5%. Percentages let you compare moves across stocks with very different prices. A $2 move is large for an $80 stock and small for a $900 one.

In TradeLab, gains carry a plus sign and an upward triangle, and losses carry a minus sign and a downward triangle, so you never have to rely on color alone.`,
          },
        ],
      },
    ],
    quiz: [
      {
        id: 'q1',
        prompt: 'The bid is $25.10 and the ask is $25.14. What is the spread?',
        options: ['$0.02', '$0.04', '$0.14', '$25.12'],
        correct: 1,
        explanation: 'The spread is the ask minus the bid: $25.14 − $25.10 = $0.04.',
      },
      {
        id: 'q2',
        prompt: 'A stock falls from $40 to $38. What is the percentage change?',
        options: ['−2%', '−5%', '−20%', '−0.5%'],
        correct: 1,
        explanation: 'The price fell $2, and $2 ÷ $40 = 0.05, a 5% decline.',
      },
      {
        id: 'q3',
        prompt: 'Which statement about volume is most accurate?',
        options: [
          'High volume guarantees the price will keep rising',
          'Volume counts shares traded and hints at the conviction behind a move',
          'Volume is another word for volatility',
          'A price cannot change on low volume',
        ],
        correct: 1,
        explanation: 'Volume measures activity. It can support a reading of a move, but it never guarantees what happens next.',
      },
    ],
  },

  // ---------------------------------------------------------------------
  {
    id: 'candlestick-anatomy',
    categoryId: 'candlesticks',
    title: 'Anatomy of a Candlestick',
    summary: 'Read open, high, low and close from one shape, and build your own candle.',
    difficulty: 'beginner',
    minutes: 8,
    objectives: [
      'Identify the open, high, low and close of a candle',
      'Tell up candles from down candles without relying on color',
      'Explain why the timeframe changes what a chart shows',
    ],
    tutorPrompts: ['Explain candlestick charts to me.'],
    sections: [
      {
        id: 'ohlc',
        title: 'Four prices in one shape',
        blocks: [
          {
            type: 'md',
            text: `A candlestick summarizes trading over one period, such as a day or five minutes, using four prices: the **open** (the first trade), the **high**, the **low**, and the **close** (the last trade). Together they're known as OHLC.

The thick part of the candle is the **body**. It spans the open and the close. The thin lines above and below are the **wicks**, sometimes called shadows. They reach up to the high and down to the low.`,
          },
          {
            type: 'figure',
            name: 'candle-anatomy',
            caption: 'An up candle (left) closes above its open. A down candle (right) closes below it.',
          },
        ],
      },
      {
        id: 'direction',
        title: 'Up candles and down candles',
        blocks: [
          {
            type: 'md',
            text: `When the close is above the open, buyers pushed the price up during the period. That's an **up**, or bullish, candle. When the close is below the open, it's a **down**, or bearish, candle.

Many platforms color up candles green and down candles red. TradeLab also draws up candles hollow and down candles filled, so the shape alone tells you the direction.`,
          },
          {
            type: 'callout',
            tone: 'tip',
            title: 'Reading the body',
            text: 'A tall body means the price traveled far between the open and the close. A small body with long wicks means the price swung around but finished near where it started.',
          },
        ],
      },
      {
        id: 'build',
        title: 'Build a candle',
        blocks: [
          {
            type: 'md',
            text: 'Adjust the four prices below and watch the candle change. The high must be at least as high as both the open and the close, and the low at most as low as both.',
          },
          { type: 'widget', name: 'candle-builder' },
        ],
      },
      {
        id: 'timeframes',
        title: 'Timeframes change the story',
        blocks: [
          {
            type: 'md',
            text: `The same price history looks different at different timeframes. A daily candle condenses a whole trading session into one shape. A 5-minute chart of that same day might show dozens of candles, some up and some down.

A long-term investor and a day trader can look at the same stock and see very different pictures. Always check which timeframe a chart shows before drawing conclusions. On TradeLab's practice chart, the 1D view uses 5-minute candles and the 1M view uses daily ones.`,
          },
        ],
      },
    ],
    quiz: [
      {
        id: 'q1',
        prompt: 'A candle opens at $20, rises to $23, dips to $19 and closes at $22. What kind of candle is it?',
        options: [
          'An up candle, because it closed above its open',
          'A down candle, because it touched $19',
          'Neither, because it has wicks',
          'A down candle, because the high is above the close',
        ],
        correct: 0,
        explanation: 'Direction depends on the close versus the open. $22 is above $20, so it is an up candle.',
      },
      {
        id: 'q2',
        prompt: 'In that same candle, what does the upper wick show?',
        options: ['The price reached $23 before closing lower', 'The closing price', 'The average price', 'The opening price'],
        correct: 0,
        explanation: 'The upper wick runs from the top of the body to the high: the price traded up to $23 at some point.',
      },
      {
        id: 'q3',
        prompt: 'What does a candle with a small body and long wicks usually suggest?',
        options: [
          'The price moved steadily in one direction',
          'The price swung widely but finished near its open',
          'No shares traded',
          'The company paid a dividend',
        ],
        correct: 1,
        explanation: 'Long wicks show a wide range; a small body shows the open and close ended up close together.',
      },
    ],
  },

  // ---------------------------------------------------------------------
  {
    id: 'candlestick-patterns',
    categoryId: 'candlesticks',
    title: 'Reading Candlestick Patterns',
    summary: 'Doji, hammers and engulfing patterns, and why context matters more than the shape.',
    difficulty: 'intermediate',
    minutes: 10,
    objectives: [
      'Recognize a doji, a hammer and an engulfing pattern',
      'Explain what each pattern suggests about buyers and sellers',
      'Use patterns as one clue among several',
    ],
    tutorPrompts: ['Explain candlestick charts to me.'],
    sections: [
      {
        id: 'clues',
        title: 'Patterns are clues, not signals',
        blocks: [
          {
            type: 'md',
            text: `Traders have named many recurring candle shapes. Some suggest indecision; others suggest that buyers or sellers took control. On their own they are weak evidence. Research on whether candlestick patterns predict future prices has produced mixed results, and a pattern that seemed to work in one market or period often fails in another.

Treat a pattern as a question worth investigating, not an instruction to trade.`,
          },
        ],
      },
      {
        id: 'doji',
        title: 'Doji: indecision',
        blocks: [
          {
            type: 'md',
            text: `A **doji** has an open and a close that are nearly equal, so its body is a thin line. Buyers and sellers ended the period roughly balanced.

After a long run in one direction, a doji can hint that momentum is fading. Just as often, it simply marks a quiet session.`,
          },
          { type: 'figure', name: 'pattern-doji', caption: 'A doji: open and close almost equal, with wicks on both sides.' },
        ],
      },
      {
        id: 'hammer',
        title: 'Hammer and shooting star',
        blocks: [
          {
            type: 'md',
            text: `A **hammer** has a small body near the top of its range and a long lower wick, at least about twice the size of the body. Sellers pushed the price well down during the period, but buyers brought it back up by the close. When a hammer appears after a decline, some traders read it as a possible turning point.

A **shooting star** is the mirror image: a small body near the bottom and a long upper wick. It appears after a rise and shows buyers pushing higher and failing to hold the gains.`,
          },
          { type: 'figure', name: 'pattern-hammer', caption: 'A hammer (left) and a shooting star (right).' },
        ],
      },
      {
        id: 'engulfing',
        title: 'Engulfing patterns',
        blocks: [
          {
            type: 'md',
            text: `A **bullish engulfing** pattern is two candles: a down candle followed by an up candle whose body completely covers the previous body. A **bearish engulfing** pattern is the reverse. Both show a sharp shift in control from one period to the next.`,
          },
          { type: 'figure', name: 'pattern-engulfing', caption: 'Bullish engulfing: a small down candle, then a larger up candle that covers it.' },
          {
            type: 'callout',
            tone: 'warn',
            title: 'Context beats shape',
            text: 'Where the pattern appears in the trend, how much volume came with it and what the broader market is doing all matter more than the shape. Never risk more than you planned because a pattern looks convincing.',
          },
        ],
      },
    ],
    quiz: [
      {
        id: 'q1',
        prompt: 'Which candle has an open and close that are almost equal?',
        options: ['Doji', 'Hammer', 'Bullish engulfing', 'Shooting star'],
        correct: 0,
        explanation: 'A doji has a very thin body because the open and close are nearly the same.',
      },
      {
        id: 'q2',
        prompt: 'A hammer typically has…',
        options: [
          'A long lower wick and a small body near the top',
          'A long upper wick and a small body near the bottom',
          'No wicks at all',
          'Two candles of equal size',
        ],
        correct: 0,
        explanation: 'The long lower wick shows sellers pushed the price down and buyers brought it back up.',
      },
      {
        id: 'q3',
        prompt: 'What is the most sensible way to use candlestick patterns?',
        options: [
          'Buy every time a hammer appears',
          'As one clue, alongside the trend, volume and a risk plan',
          'Ignore price and use only patterns',
          'Increase your position size whenever a pattern appears',
        ],
        correct: 1,
        explanation: 'Patterns are weak evidence on their own. Combine them with context and keep your risk plan unchanged.',
      },
    ],
  },

  // ---------------------------------------------------------------------
  {
    id: 'market-vs-limit-orders',
    categoryId: 'orders',
    title: 'Market Orders vs. Limit Orders',
    summary: 'Speed or price control: when each order type fits, what slippage is, and how stops work.',
    difficulty: 'beginner',
    minutes: 8,
    objectives: [
      'Explain the difference between a market order and a limit order',
      'Describe slippage and the risk of an unfilled order',
      'Understand how a stop order works',
    ],
    tutorPrompts: ['What is the difference between a market order and a limit order?'],
    sections: [
      {
        id: 'two-questions',
        title: 'Two ways to say what you want',
        blocks: [
          {
            type: 'md',
            text: `Every order tells your broker what to buy or sell, how many shares, and under what conditions. The two most common order types answer one question differently: **is getting the trade done more important, or getting a specific price?**

- A **market order** says: buy (or sell) now, at the best price available.
- A **limit order** says: buy at this price or lower, or sell at this price or higher. It waits until that's possible.`,
          },
        ],
      },
      {
        id: 'market-orders',
        title: 'Market orders: speed over price',
        blocks: [
          {
            type: 'md',
            text: `A market order fills almost immediately as long as someone is willing to take the other side. The trade-off is that you don't control the exact price. You'll pay about the current ask when buying and receive about the bid when selling.

In fast-moving or thinly traded stocks, your fill can differ from the last price you saw. That difference is called **slippage**. Say the last price is $30.00 and you send a market order for 100 shares. The best ask is $30.05, but only 60 shares are offered there, so the other 40 fill at $30.08. Your average price is $30.062, a little more than you expected.`,
          },
        ],
      },
      {
        id: 'limit-orders',
        title: 'Limit orders: price over speed',
        blocks: [
          {
            type: 'md',
            text: `A limit order sets the worst price you'll accept. A buy limit at $29.50 only fills at $29.50 or lower. A sell limit at $32.00 only fills at $32.00 or higher.

You get control over price, but the order might never fill if the market doesn't reach your limit. Missing a trade is the cost of a limit order, just as slippage is the cost of a market order. Try it with the session below.`,
          },
          { type: 'widget', name: 'limit-check' },
          {
            type: 'terms',
            items: [
              { term: 'Market order', definition: 'Fill now at the best available price.' },
              { term: 'Limit order', definition: 'Fill only at your price or better.' },
              { term: 'Slippage', definition: 'The gap between the price you expected and the price you got.' },
              { term: 'Fill', definition: 'The execution of an order, fully or in part.' },
            ],
          },
        ],
      },
      {
        id: 'stops',
        title: 'Stop orders, and practicing here',
        blocks: [
          {
            type: 'md',
            text: `A **stop order**, often called a stop-loss when it's used to limit a loss, becomes a market order once the price reaches a trigger called the stop price. A sell stop at $45 on a stock you bought at $50 aims to cap your loss at about 10%. In a fast drop, though, the fill can come in below $45.

TradeLab's practice desk currently uses market orders that fill at the simulated price shown. Limit and stop orders are planned for a later version, and everything in this lesson will carry straight over.`,
          },
        ],
      },
    ],
    quiz: [
      {
        id: 'q1',
        prompt: 'You want to buy right away and can accept a small difference from the last price. Which order fits?',
        options: ['A market order', 'A buy limit far below the current price', 'A sell stop', 'No order'],
        correct: 0,
        explanation: 'Market orders prioritize getting filled now, at the cost of exact price control.',
      },
      {
        id: 'q2',
        prompt: 'A buy limit order at $40.00 can fill at…',
        options: ['$40.00 or lower', '$40.00 or higher', 'Only exactly $40.00', 'Any price'],
        correct: 0,
        explanation: 'A buy limit sets the most you will pay, so it fills at $40.00 or better (lower).',
      },
      {
        id: 'q3',
        prompt: 'What is slippage?',
        options: [
          'The difference between the expected price and the actual fill price',
          'A fee charged by exchanges',
          'The gap between two candles',
          'A type of dividend',
        ],
        correct: 0,
        explanation: 'Slippage is the gap between the price you expected and the price your order actually got.',
      },
    ],
  },

  // ---------------------------------------------------------------------
  {
    id: 'moving-averages',
    categoryId: 'indicators',
    title: 'Moving Averages and Trend',
    summary: 'Calculate a simple moving average, compare it with an exponential one, and know why both lag.',
    difficulty: 'intermediate',
    minutes: 10,
    objectives: [
      'Calculate a simple moving average',
      'Explain how an exponential moving average differs',
      'Recognize why crossovers can mislead',
    ],
    tutorPrompts: ['What is a moving average?'],
    sections: [
      {
        id: 'smoothing',
        title: 'Smoothing out the noise',
        blocks: [
          {
            type: 'md',
            text: `Daily prices jump around. A **moving average** smooths them by averaging the last N closing prices and updating every period. A 20-day simple moving average (SMA) adds up the last 20 closes and divides by 20. Drawn as a line, it shows the general direction without the day-to-day noise.

For example, closes of $10, $11, $12, $11 and $13 add up to $57, so the 5-day SMA is $57 ÷ 5 = $11.40.`,
          },
        ],
      },
      {
        id: 'sma-ema',
        title: 'Simple vs. exponential',
        blocks: [
          {
            type: 'md',
            text: `A **simple moving average** weights every day equally. An **exponential moving average (EMA)** gives more weight to recent prices, so it reacts faster when something changes.

Faster isn't automatically better. An EMA responds sooner to real changes, but also to random noise.`,
          },
        ],
      },
      {
        id: 'using',
        title: 'Reading trend and crossovers',
        blocks: [
          {
            type: 'md',
            text: `Traders use moving averages in a few common ways:

- **Trend direction.** A price holding above a rising average suggests an uptrend. Below a falling one suggests a downtrend.
- **Crossovers.** When a shorter average, like the 50-day, crosses above a longer one, like the 200-day, some call it a bullish signal. The reverse is read as bearish.
- **Support and resistance.** Prices sometimes pause near widely watched averages, partly because many traders watch the same lines.`,
          },
        ],
      },
      {
        id: 'lag',
        title: 'The catch: averages lag',
        blocks: [
          {
            type: 'md',
            text: `Because they're built from past prices, moving averages always **lag**. By the time a crossover appears, much of the move may already be over. In choppy, sideways markets, averages can cross back and forth and produce a string of false signals.

Use them to describe what has happened, not to predict what will.`,
          },
          {
            type: 'callout',
            tone: 'tip',
            title: 'Try it',
            text: 'On the practice chart, compare the 1M and 1Y views of the same stock. Notice how the overall direction becomes clearer over a longer window, just as it does with a longer moving average.',
          },
        ],
      },
    ],
    quiz: [
      {
        id: 'q1',
        prompt: 'Closes are $20, $22, $21 and $25. What is the 4-day simple moving average?',
        options: ['$21.00', '$22.00', '$22.50', '$25.00'],
        correct: 1,
        explanation: '$20 + $22 + $21 + $25 = $88, and $88 ÷ 4 = $22.00.',
      },
      {
        id: 'q2',
        prompt: 'Compared with a simple moving average of the same length, an exponential moving average…',
        options: [
          'Reacts faster, because it weights recent prices more',
          'Ignores recent prices',
          'Is always more accurate',
          'Uses volume instead of price',
        ],
        correct: 0,
        explanation: 'EMAs put more weight on recent closes, so they turn sooner, for better and for worse.',
      },
      {
        id: 'q3',
        prompt: 'Why can moving-average crossovers give false signals?',
        options: [
          'They lag the price and can flip back and forth in sideways markets',
          'They are calculated from future prices',
          'They only work on weekends',
          'They ignore closing prices',
        ],
        correct: 0,
        explanation: 'Averages are built from past prices. In a range-bound market they cross repeatedly without a real trend.',
      },
    ],
  },

  // ---------------------------------------------------------------------
  {
    id: 'rsi-momentum',
    categoryId: 'indicators',
    title: 'RSI and Momentum',
    summary: 'What the Relative Strength Index measures, how it is calculated, and how it misleads.',
    difficulty: 'advanced',
    minutes: 11,
    objectives: [
      'Describe what a momentum indicator measures',
      'Calculate RSI from average gains and losses',
      'Explain overbought, oversold and divergence, and their limits',
    ],
    tutorPrompts: ['What is RSI?'],
    sections: [
      {
        id: 'momentum',
        title: 'Measuring momentum',
        blocks: [
          {
            type: 'md',
            text: `Momentum indicators ask how strongly and consistently a price has been moving, not just where it is. The **Relative Strength Index (RSI)**, introduced by J. Welles Wilder in 1978, compares the size of recent gains with the size of recent losses and turns that into a number between 0 and 100. Most charts use a 14-period RSI.`,
          },
        ],
      },
      {
        id: 'calculation',
        title: 'How RSI is calculated',
        blocks: [
          {
            type: 'md',
            text: `The idea in three steps:

1. Over the last 14 periods, find the average gain on up periods and the average loss on down periods.
2. Divide them to get relative strength: **RS = average gain ÷ average loss**.
3. Convert to a 0 to 100 scale: **RSI = 100 − 100 ÷ (1 + RS)**.

If the average gain is twice the average loss, RS is 2 and RSI is 100 − 100 ÷ 3, about 66.7. Wilder's version smooths these averages over time, so values on real charts differ slightly from a plain average.`,
          },
        ],
      },
      {
        id: 'readings',
        title: 'Overbought, oversold and divergence',
        blocks: [
          {
            type: 'md',
            text: `Readings above 70 are traditionally called **overbought** and readings below 30 **oversold**. Those labels describe recent strength, not a forecast. In a strong trend, RSI can stay above 70 for weeks while the price keeps climbing.

A **divergence** is when price and RSI disagree. For example, the price makes a new high while RSI makes a lower high. Some traders read that as fading momentum. Divergences can last a long time before anything happens.`,
          },
        ],
      },
      {
        id: 'responsibly',
        title: 'Using momentum responsibly',
        blocks: [
          {
            type: 'md',
            text: `Momentum tools are most useful as context for a plan you've already made: why you're entering, where you'll exit if you're wrong, and how much you're risking. Indicators built from the same price data tend to agree with one another, so stacking several of them adds less confirmation than it seems.`,
          },
          {
            type: 'callout',
            tone: 'warn',
            title: 'Oversold is not a reason on its own',
            text: 'A price that keeps falling can stay oversold for a long time. An RSI reading never replaces a stop and a position size.',
          },
        ],
      },
    ],
    quiz: [
      {
        id: 'q1',
        prompt: 'If the average gain equals the average loss, what is the RSI?',
        options: ['0', '30', '50', '70'],
        correct: 2,
        explanation: 'RS = 1, so RSI = 100 − 100 ÷ 2 = 50.',
      },
      {
        id: 'q2',
        prompt: 'What does an RSI reading above 70 traditionally indicate?',
        options: [
          'Overbought: strong recent gains, not a guaranteed reversal',
          'The stock must fall tomorrow',
          'Trading volume is low',
          'The stock is oversold',
        ],
        correct: 0,
        explanation: '"Overbought" describes recent strength. Prices can keep rising while RSI stays high.',
      },
      {
        id: 'q3',
        prompt: 'The price makes a higher high while RSI makes a lower high. What is this called?',
        options: ['A bearish divergence', 'A bullish engulfing pattern', 'A doji', 'A moving-average crossover'],
        correct: 0,
        explanation: 'Price and momentum disagree, with momentum weakening: a bearish divergence.',
      },
    ],
  },

  // ---------------------------------------------------------------------
  {
    id: 'position-sizing',
    categoryId: 'risk',
    title: 'Position Sizing and Risk-to-Reward',
    summary: 'Decide what you can lose first, then size the trade from your stop. Includes a calculator.',
    difficulty: 'intermediate',
    minutes: 12,
    objectives: [
      'Set a fixed risk per trade',
      'Calculate a position size from an entry and a stop',
      'Calculate a risk-to-reward ratio and the win rate it needs',
    ],
    tutorPrompts: ['Help me understand risk-to-reward ratios.', 'What is a stop-loss?'],
    sections: [
      {
        id: 'risk-first',
        title: 'Decide your risk before your reward',
        blocks: [
          {
            type: 'md',
            text: `Experienced traders start with one question: **if this trade goes wrong, how much will I lose?** A common guideline is to risk a small, fixed share of your account on any single trade, often 1% to 2%. With a $10,000 account and a 1% rule, you'd plan to lose no more than $100 if the trade fails.

Small, consistent risk means a string of losses, which happens to everyone, doesn't knock you out of the game.`,
          },
        ],
      },
      {
        id: 'stop-to-size',
        title: 'From stop-loss to position size',
        blocks: [
          {
            type: 'md',
            text: `Your **stop** is the price at which your trade idea is proven wrong and you plan to exit. The distance from your entry to your stop is your risk per share. Then:

**Position size = account risk ÷ risk per share**

Example: your account risk is $100, your entry is $50 and your stop is $47. You risk $3 per share, so 100 ÷ 3 gives 33 shares after rounding down. The position costs about $1,650, but the planned loss if the stop is hit is about $99.`,
          },
          { type: 'widget', name: 'position-sizer' },
        ],
      },
      {
        id: 'risk-reward',
        title: 'Risk-to-reward ratio',
        blocks: [
          {
            type: 'md',
            text: `The **risk-to-reward ratio** compares what you stand to lose with what you hope to gain. With an entry of $50, a stop of $47 and a target of $56, you risk $3 to make $6: a ratio of 1:2.

A better ratio lowers the win rate you need to break even. At 1:2, winning one trade out of every three breaks even before costs, because one $6 win covers two $3 losses.`,
          },
        ],
      },
      {
        id: 'survival',
        title: 'Why survival comes first',
        blocks: [
          {
            type: 'md',
            text: `Losses and gains aren't symmetrical. After a 10% loss, you need about an 11% gain to get back to even. After a 50% loss, you need 100%. Keeping individual losses small protects your ability to recover.`,
          },
          {
            type: 'callout',
            tone: 'tip',
            title: 'Where this shows up in TradeLab',
            text: 'The order ticket shows how much of your account a position would be, and the Trading Journal lets you record a planned stop and target so you can see your risk-to-reward.',
          },
        ],
      },
    ],
    quiz: [
      {
        id: 'q1',
        prompt: 'Your account is $20,000 and you risk 1% per trade. What is the most you plan to lose on one trade?',
        options: ['$20', '$200', '$2,000', '$1,000'],
        correct: 1,
        explanation: '1% of $20,000 is $200.',
      },
      {
        id: 'q2',
        prompt: 'Entry $80, stop $76, account risk $200. How many shares fit the plan?',
        options: ['25', '40', '50', '250'],
        correct: 2,
        explanation: 'Risk per share is $80 − $76 = $4, and $200 ÷ $4 = 50 shares.',
      },
      {
        id: 'q3',
        prompt: 'Entry $30, stop $28, target $36. What is the risk-to-reward ratio?',
        options: ['1:1', '1:2', '1:3', '3:1'],
        correct: 2,
        explanation: 'You risk $2 (30 − 28) to gain $6 (36 − 30), a ratio of 1:3.',
      },
    ],
  },

  // ---------------------------------------------------------------------
  {
    id: 'diversification-basics',
    categoryId: 'diversification',
    title: 'Diversification Basics',
    summary: 'Correlation, concentration and index funds: why the mix matters as much as the picks.',
    difficulty: 'beginner',
    minutes: 8,
    objectives: [
      'Explain what diversification protects against',
      'Use correlation to judge whether holdings really differ',
      'Spot concentration in a portfolio',
    ],
    tutorPrompts: ['What does diversification mean?'],
    sections: [
      {
        id: 'baskets',
        title: "Don't put all your eggs in one basket",
        blocks: [
          {
            type: 'md',
            text: `**Diversification** means spreading money across investments that don't all move together. If one company stumbles, the damage to your whole portfolio is limited.

A portfolio of one stock lives or dies with that company. A portfolio of hundreds depends much more on the economy as a whole.`,
          },
        ],
      },
      {
        id: 'correlation',
        title: 'Correlation: do they move together?',
        blocks: [
          {
            type: 'md',
            text: `What matters isn't only how many holdings you have, but how they relate to each other. **Correlation** measures how closely two investments move together, on a scale from −1 (opposite directions) to +1 (in lockstep).

Two chipmakers tend to rise and fall together, so owning both diversifies less than owning a chipmaker and a grocery chain.`,
          },
          {
            type: 'callout',
            tone: 'tip',
            title: 'In the simulated market',
            text: 'Halcyon Semiconductor (HLCN) and Skyloft Software (SKLF) share a technology sector factor, so they tend to move together. Bramble Foods (BRMB) and Meridian Health (MRDH) move more independently.',
          },
        ],
      },
      {
        id: 'concentration',
        title: 'Concentration risk',
        blocks: [
          {
            type: 'md',
            text: `**Concentration** is when one holding or one sector dominates a portfolio. A rule of thumb you'll often hear is to keep any single stock to a modest share of your portfolio, frequently cited as 5% to 10%, though the right number depends on your goals and situation.

The Portfolio page shows your allocation by holding and by sector, so you can spot concentration at a glance.`,
          },
        ],
      },
      {
        id: 'index-funds',
        title: 'Index funds: diversification in one purchase',
        blocks: [
          {
            type: 'md',
            text: `An **index fund** holds many companies at once by tracking a market index, so a single purchase spreads your money across an entire market segment.

Diversification reduces company-specific risk, but it can't remove **market risk**. In a broad downturn, most stocks fall together. TradeLab includes a simulated index fund, TLMX, so you can compare how a diversified holding behaves next to single stocks.`,
          },
        ],
      },
    ],
    quiz: [
      {
        id: 'q1',
        prompt: 'Which pair of holdings offers more diversification?',
        options: [
          'Two semiconductor makers',
          'A semiconductor maker and a grocery chain',
          'Two purchases of the same stock',
          'A chipmaker and a chip-equipment maker',
        ],
        correct: 1,
        explanation: 'Businesses in different industries tend to be less correlated, so they offset each other more.',
      },
      {
        id: 'q2',
        prompt: 'A correlation of +1 between two stocks means…',
        options: ['They move in lockstep', 'They move in opposite directions', 'They are unrelated', 'One of them pays dividends'],
        correct: 0,
        explanation: '+1 is perfect positive correlation: the two move together.',
      },
      {
        id: 'q3',
        prompt: 'Which risk can diversification not eliminate?',
        options: [
          'The risk of one company missing its earnings',
          'Market-wide risk in a broad downturn',
          'The risk of one CEO leaving',
          'A single product recall',
        ],
        correct: 1,
        explanation: 'Diversification shrinks company-specific risk, but a broad selloff affects most stocks at once.',
      },
    ],
  },

  // ---------------------------------------------------------------------
  {
    id: 'trading-psychology',
    categoryId: 'psychology',
    title: 'Emotions, Bias and Discipline',
    summary: 'FOMO, loss aversion and overconfidence, and how a journal keeps you honest.',
    difficulty: 'beginner',
    minutes: 9,
    objectives: [
      'Recognize common biases in your own decisions',
      'Judge a trade by its process as well as its outcome',
      'Build a journaling habit that improves your decisions',
    ],
    tutorPrompts: ['How do I deal with fear of missing out?'],
    sections: [
      {
        id: 'brain',
        title: 'Your brain is part of the trade',
        blocks: [
          {
            type: 'md',
            text: `Markets move fast, money triggers strong emotions, and outcomes are uncertain. That combination makes it easy to act on feelings rather than plans. Noticing your own patterns is one of the most valuable skills you can practice with simulated money.`,
          },
        ],
      },
      {
        id: 'biases',
        title: 'Common biases',
        blocks: [
          {
            type: 'md',
            text: `- **Fear of missing out (FOMO):** chasing a stock after a big run because everyone else seems to be making money.
- **Loss aversion:** losses tend to feel about twice as painful as equal gains feel good, which can make people hold losing positions too long, hoping to get back to even.
- **Overconfidence:** a few wins in a row can push you to take bigger risks than your plan allows.
- **Confirmation bias:** seeking out information that supports a trade you already like and brushing off the rest.
- **Recency bias:** assuming the last few days' moves will continue.`,
          },
        ],
      },
      {
        id: 'process',
        title: 'Judge the process, not just the outcome',
        blocks: [
          {
            type: 'md',
            text: `A trade can lose money even when your decision was sound, and a reckless trade can get lucky. If you judge yourself only by profit, you can learn the wrong lessons. Instead, ask: Did I have a clear reason? Did I size the position by my risk rule? Did I follow my exit plan?

Over many trades, good process tends to show up in results. Over just a few, luck dominates.`,
          },
        ],
      },
      {
        id: 'journaling',
        title: 'Build a journaling habit',
        blocks: [
          {
            type: 'md',
            text: `Writing down your thesis and risks before a trade forces you to slow down. Recording what happened afterward turns every trade, winner or loser, into a lesson. TradeLab's Trading Journal tracks how often you plan ahead and follow your plan, not only your profit.`,
          },
          {
            type: 'callout',
            tone: 'tip',
            title: 'Try this next time',
            text: "Before your next simulated trade, write one sentence on why you're entering and one on what would prove you wrong.",
          },
        ],
      },
    ],
    quiz: [
      {
        id: 'q1',
        prompt: 'You keep a losing position only because selling would "make the loss real." Which bias is this?',
        options: ['Loss aversion', 'Fear of missing out', 'Recency bias', 'Diversification'],
        correct: 0,
        explanation: 'Avoiding the pain of locking in a loss is classic loss aversion.',
      },
      {
        id: 'q2',
        prompt: 'A trade followed your plan exactly but lost money. How should you evaluate it?',
        options: [
          'As a good decision with a bad outcome: review it, but keep the process',
          'As a failure that means changing everything',
          'By ignoring it',
          'By doubling the next position to win it back',
        ],
        correct: 0,
        explanation: 'Judge decisions by their process. Individual outcomes include luck.',
      },
      {
        id: 'q3',
        prompt: 'Which habit best counters impulsive trading?',
        options: [
          'Writing down your thesis, risks and exit before entering',
          'Trading more often',
          'Checking prices every minute',
          'Following tips from social media',
        ],
        correct: 0,
        explanation: 'A written plan slows you down and gives you something to measure yourself against.',
      },
    ],
  },
];

export function getLesson(id) {
  return LESSONS.find((lesson) => lesson.id === id) || null;
}

export function getCategory(id) {
  return CATEGORIES.find((category) => category.id === id) || null;
}

export function lessonsInCategory(categoryId) {
  return LESSONS.filter((lesson) => lesson.categoryId === categoryId);
}
