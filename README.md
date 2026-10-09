# TradeLab frontend

TradeLab teaches beginners how the stock market works: interactive lessons, paper trading with virtual money, a portfolio view, a trading journal and a tutor. This repository is the **frontend only**. Every price is simulated, every dollar is virtual, and the tutor runs in a preview mode with prewritten answers.

Built with HTML, CSS and vanilla JavaScript (ES modules). Chart.js is the only third-party code, and it is vendored, so there is nothing to install.

## Run it locally

ES modules don't load from `file://`, so serve the folder over HTTP. Either server works and neither needs any packages:

```bash
# Node 18 or newer
npm run dev                      # http://127.0.0.1:5173

# or Python 3.7 or newer
python scripts/dev_server.py     # http://127.0.0.1:5173
```

Use another port with `npm run dev -- 8000` or `python scripts/dev_server.py 8000`. Both servers send the right MIME type for `.js` files (some Windows setups otherwise break module loading) and disable caching so edits show up on refresh.

Run the unit tests for the business logic (Node's built-in test runner, no dependencies):

```bash
npm test
```

## What you get on first launch

The first visit creates a demo account with $10,000 in virtual cash, five example trades and two example journal entries, all labeled **Example**, sitting on simulated day 15. That way the dashboard, portfolio and journal show what they do right away. To start clean, use **Start with an empty account** on the Overview banner or **Settings > Reset simulated account**.

Prices only change when you press **Advance 1 day** or **Advance 1 week**. That keeps the simulation honest (nothing pretends to be live) and lets you see how a decision plays out.

## Pages

| Page | What it does |
| --- | --- |
| Overview | Cash, portfolio value, today's simulated P/L, learning progress, a price chart with time ranges, the watchlist with sparklines, recent simulated trades, suggested lessons and a way into the tutor. |
| Learn | The course outline: 10 lessons in 7 topics with difficulty, time, status and progress, filterable by topic, level and status. |
| Lesson | One section at a time with section navigation, figures, three interactive tools (candle builder, limit-order fill checker, position-size calculator) and a knowledge check. Passing two of three completes the lesson. |
| Practice Trading | Searchable stock list with a watchlist, quote and statistics, line or candlestick chart across 1D to 5Y, an order ticket with live validation and a concentration warning, a confirmation step, your position and the order history. |
| Portfolio | Totals, unrealized and realized P/L, account value over simulated days, allocation by holding or sector, holdings and the full transaction history. |
| Trading Journal | Entries with symbol, entry and exit price, shares, planned stop and target, thesis, risks and lessons. Create, edit and delete. Insights score planning and follow-through first; outcome statistics appear after three closed entries. |
| AI Tutor | Chat with suggested questions, a loading state, formatted answers and a clear-conversation control. Answers are prewritten and labeled as such. Two topics read your simulated account ("my last trade", "my portfolio"). |
| Settings | Theme (dark, light, system), gain and loss colors (green/red or blue/orange), density, reduced motion, default chart style and range, learning level, account reset and clearing local data. |

Search with **Ctrl+K**, **Cmd+K** or **/** to jump to any page, simulated stock or lesson.

## Project structure

```
tradelab/
  index.html                 App shell, early theme script, script and style tags
  package.json               npm scripts (dev, test); no dependencies
  assets/
    icons/favicon.svg
    fonts/                   Archivo variable font (self-hosted) + license
    vendor/                  Chart.js 4.5.1 UMD build + license
  css/
    tokens.css               Design tokens: color (dark first + light), type, space, motion
    base.css                 Reset, typography, focus styles, utilities
    layout.css               Shell, sidebar, header, page grid, panels
    components.css           Buttons, controls, pills, tables, dialogs, toasts, charts
    pages.css                Page-specific layout
    responsive.css           Breakpoints: 1600, 1280, 1100, 900 (drawer), 640, 480
  js/
    app.js                   Boot: store, preferences, shell, market data, router
    config.js                Data source switch (mock or api) and app settings
    router.js                Hash router and route table
    state.js                 Central store, persistence, derived selectors
    storage.js               localStorage wrapper with in-memory fallback
    core/                    Pure business logic (no DOM): portfolio, orders, progress,
                             journal, calendar, seeded random numbers
    data/                    Mock data: market model, lessons, tutor answers, example account
    services/                The only layer that reads or writes domain data; each has a
                             mock adapter and a remote (Flask) adapter
    components/              Shell, charts, dialogs, notifications, search, icons, widgets
    pages/                   One module per page: mount(root, ctx) returns a cleanup
    utils/                   Safe HTML templating, formatting, a small Markdown renderer
  docs/
    integration.md           Flask API contract and the llama.cpp tutor plan
    mobile.md                What carries over to a mobile app and what doesn't
  scripts/                   Zero-dependency dev servers (Node and Python)
  tests/core.test.mjs        Unit tests for core/ and the mock data
```

Icons are drawn in `js/components/icons.js` (one consistent 24px set) rather than as separate files, so they inherit color from the theme.

## How it fits together

**One source of truth.** The account is stored as a transaction ledger. Cash, holdings, average cost and realized P/L are always derived from it by `core/portfolio.js`, so no copy of a balance can drift. Lesson progress, journal entries, the tutor conversation and preferences live in the same store (`state.js`).

**Services decide where data comes from.** Pages never import mock data for domain state. They call services (`marketDataService`, `tradingService`, `progressService`, `journalService`, `tutorService`), which pick an adapter based on `config.dataSource`:

- `mock` (default): runs locally against the store and the simulated market.
- `api`: calls the Flask backend through `services/apiClient.js`.

Both adapters return the same shapes and the service writes the result into the store the same way, so pages don't change when the backend arrives.

**Business rules are pure functions.** Order validation, fills, P/L, day change, the equity curve, quiz grading, lesson progress, journal validation and journal statistics live in `js/core/` with no DOM or storage access. They are covered by `npm test` and are written to be ported to Python as-is.

**Rendering is plain DOM.** Pages build markup with an `html` tagged template that escapes every value by default (`utils/dom.js`), use event delegation, and re-render only the regions whose store slice changed (`watch()`).

## Mock data

| What | Where | Notes |
| --- | --- | --- |
| Eight fictional instruments and their prices | `js/data/mockMarketData.js` | "TradeLab Simulated Market": a seeded random walk with market, sector and company factors, volatility regimes and quarterly jumps. Deterministic, so every device sees the same history. About five years of history and five years of future days. |
| Intraday bars (1D, 1W) | same file | Brownian bridge from each day's open to close, stretched to its high and low. |
| Example account and journal | `js/data/exampleAccount.js` | Labeled Example everywhere; removed by Reset. |
| Lessons and quizzes | `js/data/mockLessons.js` | Educational content, not financial advice. |
| Tutor answers | `js/data/mockTutorResponses.js` | Keyword topic matching to prewritten Markdown. Not a language model. |

Simulated dates are weekdays only (no market holidays). The companies don't exist, and the prices don't track anything real.

## Connecting a backend later

See [docs/integration.md](docs/integration.md) for the endpoint list with request and response shapes, a Flask sketch, and how to put a local model behind TradeLab Tutor with llama.cpp. In short: implement the endpoints, set `dataSource: 'api'` in `js/config.js` (or define `window.TRADELAB_CONFIG = { dataSource: 'api' }` before `js/app.js` loads), and serve the frontend from Flask so it shares an origin with `/api`.

## Accessibility

- Semantic landmarks, a skip link, one `h1` per page and announced page changes.
- Visible focus on every control; dialogs trap focus and return it on close; the mobile drawer makes the page behind it inert.
- Gains and losses always carry a sign and an arrow, never color alone; up candles are hollow and down candles filled; a color-vision-friendly palette is one setting away.
- Every chart has a text summary for screen readers and a "Show as a table" view.
- Touch screens get 44px targets; inputs use 16px text on touch devices so iOS doesn't zoom.
- `prefers-reduced-motion` is respected, and there is an in-app setting too.

## Known limitations

- **Frontend only.** No backend, accounts or authentication. Data lives in this browser's `localStorage` and is not a secure or permanent store. Clearing site data resets everything.
- **Market orders only.** Limit and stop orders, fractional shares, short selling, fees, dividends and a bid/ask spread are not simulated yet. The order lesson says so.
- **Tutor preview.** A fixed set of prewritten topics; anything else gets an honest "I don't have an answer for that yet".
- **One tab at a time.** Two open tabs don't sync with each other.
- **No market holidays** in the simulated calendar.
- **English only**, US dollar formatting.

## Licenses

- Chart.js 4.5.1, MIT (`assets/vendor/CHART_JS_LICENSE.md`)
- Archivo, SIL Open Font License 1.1 (`assets/fonts/ARCHIVO_OFL.txt`)
# InvestIQ
