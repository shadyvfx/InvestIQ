// Public course catalog metadata and the three lessons available to guests.
// Full content for account-required lessons is served by the authenticated Flask API.

export const CATEGORIES = [
  {
    "id": "fundamentals",
    "title": "Stock Market Fundamentals",
    "description": "What a stock is, how prices are set, and why they move.",
    "icon": "trend"
  },
  {
    "id": "candlesticks",
    "title": "Reading Candlestick Charts",
    "description": "Turn open, high, low and close into a shape you can read at a glance.",
    "icon": "practice"
  },
  {
    "id": "orders",
    "title": "Market Orders and Limit Orders",
    "description": "Choose between getting filled quickly and controlling your price.",
    "icon": "orders"
  },
  {
    "id": "indicators",
    "title": "Technical Indicators",
    "description": "Moving averages and momentum, and the limits of both.",
    "icon": "pulse"
  },
  {
    "id": "risk",
    "title": "Risk Management",
    "description": "Size every position so one bad trade never sinks the account.",
    "icon": "shield"
  },
  {
    "id": "diversification",
    "title": "Portfolio Diversification",
    "description": "Spread risk across holdings that don't all move together.",
    "icon": "layers"
  },
  {
    "id": "psychology",
    "title": "Trading Psychology",
    "description": "Recognize the habits and biases that pull you away from your plan.",
    "icon": "mind"
  }
];

export const LESSONS = [
  {
    "id": "what-is-a-stock",
    "categoryId": "fundamentals",
    "title": "What Is a Stock?",
    "summary": "Ownership, the two ways shares can earn a return, and why prices can fall as well as rise.",
    "difficulty": "beginner",
    "minutes": 7,
    "objectives": [
      "Explain what owning a share of a company means",
      "Describe the two main sources of stock returns",
      "Compare company sizes with market capitalization"
    ],
    "tutorPrompts": [
      "What does it mean to own a stock?",
      "What does diversification mean?"
    ],
    "sections": [
      {
        "id": "ownership",
        "title": "Owning a slice of a company",
        "blocks": [
          {
            "type": "md",
            "text": "A **stock**, also called a share or equity, is a unit of ownership in a company. If a company has 10 million shares and you own 100 of them, you own 0.001% of the business. You don't run the company, but you share in how it does: if the business becomes more valuable over time, your slice tends to become more valuable too.\n\nCompanies sell shares to raise money, often through an **initial public offering (IPO)**. After that, shares trade between investors on an exchange. When you buy a stock on an exchange, you are almost always buying it from another investor, not from the company itself."
          },
          {
            "type": "callout",
            "tone": "key",
            "title": "Key idea",
            "text": "A share makes you a part-owner. What it's worth on any day depends on what other investors are willing to pay for that ownership."
          }
        ]
      },
      {
        "id": "returns",
        "title": "How shareholders make or lose money",
        "blocks": [
          {
            "type": "md",
            "text": "A stock can produce a return in two main ways:\n\n- **Price appreciation.** You buy at one price and later sell at a higher one. The difference is a capital gain. Selling for less than you paid is a capital loss.\n- **Dividends.** Some companies pay part of their profits to shareholders in cash, often every quarter. Many growing companies pay no dividend and reinvest their profits instead.\n\nYour **total return** combines both. Say you buy 10 shares at $50, which costs $500. A year later the price is $54 and you've received $1 per share in dividends. You've gained $40 from the price and $10 from dividends: a total return of $50, or 10% of your $500."
          }
        ]
      },
      {
        "id": "market-cap",
        "title": "Share price and company size",
        "blocks": [
          {
            "type": "md",
            "text": "A company's **market capitalization**, or market cap, is its share price multiplied by its number of shares outstanding. A $40 stock with 500 million shares has a market cap of $20 billion.\n\nMarket cap is how you compare company sizes. A $10 stock is not \"cheaper\" than a $300 stock in any useful sense, because each share is a different-sized slice of a different-sized company."
          },
          {
            "type": "terms",
            "items": [
              {
                "term": "Share price",
                "definition": "What one share last traded for."
              },
              {
                "term": "Shares outstanding",
                "definition": "The total number of shares held by investors."
              },
              {
                "term": "Market cap",
                "definition": "Share price multiplied by shares outstanding."
              }
            ]
          }
        ]
      },
      {
        "id": "risk",
        "title": "Why prices fall as well as rise",
        "blocks": [
          {
            "type": "md",
            "text": "A stock price reflects what investors collectively expect a company to earn in the future, and how confident they are about it. When expectations improve, perhaps after strong sales or a new product, buyers bid the price up. When they worsen, after weak earnings, new competition or a broad market selloff, the price falls.\n\nOwning stock carries real risk. If a company fails, shareholders are paid after its lenders, and a share price can fall to zero. That's why the later lessons on diversification and position sizing matter so much."
          },
          {
            "type": "callout",
            "tone": "tip",
            "title": "Practicing in TradeLab",
            "text": "Every price in TradeLab is simulated and every dollar is virtual. The habits you build here, like sizing positions and writing down your reasons, are what carry over to real markets."
          }
        ]
      }
    ],
    "quiz": [
      {
        "id": "q1",
        "prompt": "You own 200 shares of a company that has 1,000,000 shares outstanding. What percentage of the company do you own?",
        "options": [
          "0.02%",
          "0.2%",
          "2%",
          "20%"
        ],
        "correct": 0,
        "explanation": "200 ÷ 1,000,000 = 0.0002, which is 0.02% of the company."
      },
      {
        "id": "q2",
        "prompt": "Which pair describes the two main sources of stock returns?",
        "options": [
          "Interest and principal",
          "Price appreciation and dividends",
          "Fees and commissions",
          "Margin and leverage"
        ],
        "correct": 1,
        "explanation": "Shareholders earn from the price rising (a capital gain) and from any dividends the company pays."
      },
      {
        "id": "q3",
        "prompt": "Stock A trades at $12 and Stock B trades at $250. What can you conclude from that alone?",
        "options": [
          "Stock A is the better value",
          "Company B is larger",
          "Nothing about value or size without more information",
          "Stock A will rise faster"
        ],
        "correct": 2,
        "explanation": "A share price alone says nothing about company size or value. Compare market caps and the businesses themselves."
      }
    ]
  },
  {
    "id": "how-prices-move",
    "categoryId": "fundamentals",
    "title": "How Stock Prices Move",
    "summary": "Bids, asks and spreads, plus the supply, demand and news that push prices around.",
    "difficulty": "beginner",
    "minutes": 9,
    "objectives": [
      "Read a bid, an ask and the spread between them",
      "Explain how supply and demand move a price",
      "Tell volatility and volume apart"
    ],
    "tutorPrompts": [
      "What is volatility?",
      "What is a bid-ask spread?"
    ],
    "sections": [
      {
        "id": "bid-ask",
        "title": "Every trade has a buyer and a seller",
        "blocks": [
          {
            "type": "md",
            "text": "An exchange matches buyers with sellers. The **bid** is the highest price any buyer is currently willing to pay. The **ask**, or offer, is the lowest price any seller will accept. The gap between them is the **spread**. The \"last price\" you see quoted is simply the price of the most recent match.\n\nFor example, if the bid is $50.00 and the ask is $50.04, the spread is 4 cents. Buying right away means paying about the ask; selling right away means receiving about the bid."
          }
        ]
      },
      {
        "id": "supply-demand",
        "title": "Supply, demand and news",
        "blocks": [
          {
            "type": "md",
            "text": "Prices move when the balance between eager buyers and eager sellers shifts. If more people want to buy at the current ask than there are shares offered, buyers have to raise their bids and the price climbs. If sellers are more eager, they lower their asks and the price falls.\n\nWhat shifts that balance? Company news such as earnings reports, product launches or lawsuits. Industry trends. Interest rates. And the mood of the market as a whole: on many days, a large part of a stock's move has little to do with the company itself."
          },
          {
            "type": "callout",
            "tone": "tip",
            "title": "How TradeLab simulates this",
            "text": "Each simulated stock's daily move combines a market-wide factor, a sector factor and company-specific noise. That's a simplified version of how real returns are often modeled."
          }
        ]
      },
      {
        "id": "volatility-volume",
        "title": "Volatility and volume",
        "blocks": [
          {
            "type": "md",
            "text": "**Volatility** describes how much a price tends to swing. A stock that moves 3% on a typical day is more volatile than one that moves 0.5%. Higher volatility means a wider range of possible outcomes in both directions.\n\n**Volume** is the number of shares traded in a period. A big move on heavy volume suggests broad participation, while a move on very light volume can reverse more easily. Volume is a clue about conviction, not a promise about direction."
          },
          {
            "type": "terms",
            "items": [
              {
                "term": "Bid",
                "definition": "The highest price a buyer is offering right now."
              },
              {
                "term": "Ask",
                "definition": "The lowest price a seller will accept right now."
              },
              {
                "term": "Spread",
                "definition": "The difference between the ask and the bid."
              },
              {
                "term": "Volatility",
                "definition": "How widely a price tends to swing."
              },
              {
                "term": "Volume",
                "definition": "How many shares changed hands in a period."
              }
            ]
          }
        ]
      },
      {
        "id": "reading-changes",
        "title": "Reading a price change",
        "blocks": [
          {
            "type": "md",
            "text": "Price changes are shown two ways: in dollars and in percent. A stock that rises from $80 to $82 is up $2.00, or 2.5%. Percentages let you compare moves across stocks with very different prices. A $2 move is large for an $80 stock and small for a $900 one.\n\nIn TradeLab, gains carry a plus sign and an upward triangle, and losses carry a minus sign and a downward triangle, so you never have to rely on color alone."
          }
        ]
      }
    ],
    "quiz": [
      {
        "id": "q1",
        "prompt": "The bid is $25.10 and the ask is $25.14. What is the spread?",
        "options": [
          "$0.02",
          "$0.04",
          "$0.14",
          "$25.12"
        ],
        "correct": 1,
        "explanation": "The spread is the ask minus the bid: $25.14 − $25.10 = $0.04."
      },
      {
        "id": "q2",
        "prompt": "A stock falls from $40 to $38. What is the percentage change?",
        "options": [
          "−2%",
          "−5%",
          "−20%",
          "−0.5%"
        ],
        "correct": 1,
        "explanation": "The price fell $2, and $2 ÷ $40 = 0.05, a 5% decline."
      },
      {
        "id": "q3",
        "prompt": "Which statement about volume is most accurate?",
        "options": [
          "High volume guarantees the price will keep rising",
          "Volume counts shares traded and hints at the conviction behind a move",
          "Volume is another word for volatility",
          "A price cannot change on low volume"
        ],
        "correct": 1,
        "explanation": "Volume measures activity. It can support a reading of a move, but it never guarantees what happens next."
      }
    ]
  },
  {
    "id": "candlestick-anatomy",
    "categoryId": "candlesticks",
    "title": "Anatomy of a Candlestick",
    "summary": "Read open, high, low and close from one shape, and build your own candle.",
    "difficulty": "beginner",
    "minutes": 8,
    "sections": [
      {
        "id": "ohlc"
      },
      {
        "id": "direction"
      },
      {
        "id": "build"
      },
      {
        "id": "timeframes"
      }
    ],
    "quiz": [
      {
        "id": "q1"
      },
      {
        "id": "q2"
      },
      {
        "id": "q3"
      }
    ]
  },
  {
    "id": "candlestick-patterns",
    "categoryId": "candlesticks",
    "title": "Reading Candlestick Patterns",
    "summary": "Doji, hammers and engulfing patterns, and why context matters more than the shape.",
    "difficulty": "intermediate",
    "minutes": 10,
    "sections": [
      {
        "id": "clues"
      },
      {
        "id": "doji"
      },
      {
        "id": "hammer"
      },
      {
        "id": "engulfing"
      }
    ],
    "quiz": [
      {
        "id": "q1"
      },
      {
        "id": "q2"
      },
      {
        "id": "q3"
      }
    ]
  },
  {
    "id": "market-vs-limit-orders",
    "categoryId": "orders",
    "title": "Market Orders vs. Limit Orders",
    "summary": "Speed or price control: when each order type fits, what slippage is, and how stops work.",
    "difficulty": "beginner",
    "minutes": 8,
    "objectives": [
      "Explain the difference between a market order and a limit order",
      "Describe slippage and the risk of an unfilled order",
      "Understand how a stop order works"
    ],
    "tutorPrompts": [
      "What is the difference between a market order and a limit order?"
    ],
    "sections": [
      {
        "id": "two-questions",
        "title": "Two ways to say what you want",
        "blocks": [
          {
            "type": "md",
            "text": "Every order tells your broker what to buy or sell, how many shares, and under what conditions. The two most common order types answer one question differently: **is getting the trade done more important, or getting a specific price?**\n\n- A **market order** says: buy (or sell) now, at the best price available.\n- A **limit order** says: buy at this price or lower, or sell at this price or higher. It waits until that's possible."
          }
        ]
      },
      {
        "id": "market-orders",
        "title": "Market orders: speed over price",
        "blocks": [
          {
            "type": "md",
            "text": "A market order fills almost immediately as long as someone is willing to take the other side. The trade-off is that you don't control the exact price. You'll pay about the current ask when buying and receive about the bid when selling.\n\nIn fast-moving or thinly traded stocks, your fill can differ from the last price you saw. That difference is called **slippage**. Say the last price is $30.00 and you send a market order for 100 shares. The best ask is $30.05, but only 60 shares are offered there, so the other 40 fill at $30.08. Your average price is $30.062, a little more than you expected."
          }
        ]
      },
      {
        "id": "limit-orders",
        "title": "Limit orders: price over speed",
        "blocks": [
          {
            "type": "md",
            "text": "A limit order sets the worst price you'll accept. A buy limit at $29.50 only fills at $29.50 or lower. A sell limit at $32.00 only fills at $32.00 or higher.\n\nYou get control over price, but the order might never fill if the market doesn't reach your limit. Missing a trade is the cost of a limit order, just as slippage is the cost of a market order. Try it with the session below."
          },
          {
            "type": "widget",
            "name": "limit-check"
          },
          {
            "type": "terms",
            "items": [
              {
                "term": "Market order",
                "definition": "Fill now at the best available price."
              },
              {
                "term": "Limit order",
                "definition": "Fill only at your price or better."
              },
              {
                "term": "Slippage",
                "definition": "The gap between the price you expected and the price you got."
              },
              {
                "term": "Fill",
                "definition": "The execution of an order, fully or in part."
              }
            ]
          }
        ]
      },
      {
        "id": "stops",
        "title": "Stop orders, and practicing here",
        "blocks": [
          {
            "type": "md",
            "text": "A **stop order**, often called a stop-loss when it's used to limit a loss, becomes a market order once the price reaches a trigger called the stop price. A sell stop at $45 on a stock you bought at $50 aims to cap your loss at about 10%. In a fast drop, though, the fill can come in below $45.\n\nTradeLab's practice desk currently uses market orders that fill at the simulated price shown. Limit and stop orders are planned for a later version, and everything in this lesson will carry straight over."
          }
        ]
      }
    ],
    "quiz": [
      {
        "id": "q1",
        "prompt": "You want to buy right away and can accept a small difference from the last price. Which order fits?",
        "options": [
          "A market order",
          "A buy limit far below the current price",
          "A sell stop",
          "No order"
        ],
        "correct": 0,
        "explanation": "Market orders prioritize getting filled now, at the cost of exact price control."
      },
      {
        "id": "q2",
        "prompt": "A buy limit order at $40.00 can fill at…",
        "options": [
          "$40.00 or lower",
          "$40.00 or higher",
          "Only exactly $40.00",
          "Any price"
        ],
        "correct": 0,
        "explanation": "A buy limit sets the most you will pay, so it fills at $40.00 or better (lower)."
      },
      {
        "id": "q3",
        "prompt": "What is slippage?",
        "options": [
          "The difference between the expected price and the actual fill price",
          "A fee charged by exchanges",
          "The gap between two candles",
          "A type of dividend"
        ],
        "correct": 0,
        "explanation": "Slippage is the gap between the price you expected and the price your order actually got."
      }
    ]
  },
  {
    "id": "moving-averages",
    "categoryId": "indicators",
    "title": "Moving Averages and Trend",
    "summary": "Calculate a simple moving average, compare it with an exponential one, and know why both lag.",
    "difficulty": "intermediate",
    "minutes": 10,
    "sections": [
      {
        "id": "smoothing"
      },
      {
        "id": "sma-ema"
      },
      {
        "id": "using"
      },
      {
        "id": "lag"
      }
    ],
    "quiz": [
      {
        "id": "q1"
      },
      {
        "id": "q2"
      },
      {
        "id": "q3"
      }
    ]
  },
  {
    "id": "rsi-momentum",
    "categoryId": "indicators",
    "title": "RSI and Momentum",
    "summary": "What the Relative Strength Index measures, how it is calculated, and how it misleads.",
    "difficulty": "advanced",
    "minutes": 11,
    "sections": [
      {
        "id": "momentum"
      },
      {
        "id": "calculation"
      },
      {
        "id": "readings"
      },
      {
        "id": "responsibly"
      }
    ],
    "quiz": [
      {
        "id": "q1"
      },
      {
        "id": "q2"
      },
      {
        "id": "q3"
      }
    ]
  },
  {
    "id": "position-sizing",
    "categoryId": "risk",
    "title": "Position Sizing and Risk-to-Reward",
    "summary": "Decide what you can lose first, then size the trade from your stop. Includes a calculator.",
    "difficulty": "intermediate",
    "minutes": 12,
    "sections": [
      {
        "id": "risk-first"
      },
      {
        "id": "stop-to-size"
      },
      {
        "id": "risk-reward"
      },
      {
        "id": "survival"
      }
    ],
    "quiz": [
      {
        "id": "q1"
      },
      {
        "id": "q2"
      },
      {
        "id": "q3"
      }
    ]
  },
  {
    "id": "diversification-basics",
    "categoryId": "diversification",
    "title": "Diversification Basics",
    "summary": "Correlation, concentration and index funds: why the mix matters as much as the picks.",
    "difficulty": "beginner",
    "minutes": 8,
    "sections": [
      {
        "id": "baskets"
      },
      {
        "id": "correlation"
      },
      {
        "id": "concentration"
      },
      {
        "id": "index-funds"
      }
    ],
    "quiz": [
      {
        "id": "q1"
      },
      {
        "id": "q2"
      },
      {
        "id": "q3"
      }
    ]
  },
  {
    "id": "trading-psychology",
    "categoryId": "psychology",
    "title": "Emotions, Bias and Discipline",
    "summary": "FOMO, loss aversion and overconfidence, and how a journal keeps you honest.",
    "difficulty": "beginner",
    "minutes": 9,
    "sections": [
      {
        "id": "brain"
      },
      {
        "id": "biases"
      },
      {
        "id": "process"
      },
      {
        "id": "journaling"
      }
    ],
    "quiz": [
      {
        "id": "q1"
      },
      {
        "id": "q2"
      },
      {
        "id": "q3"
      }
    ]
  }
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
