# TradeLab frontend

TradeLab teaches beginners how the stock market works: interactive lessons, paper trading with virtual money, a portfolio view, a trading journal and a tutor. This repository is the frontend plus a small local server for **user accounts** (sign-up and sign-in, saved in a SQLite database). Every price is simulated, every dollar is virtual, and the tutor runs in a preview mode with prewritten answers.

Built with HTML, CSS and vanilla JavaScript (ES modules); the account server uses only Python's standard library. Chart.js is the only third-party code, and it is vendored, so there is nothing to install.

## Run it locally

ES modules don't load from `file://`, so serve the folder over HTTP. Neither server needs any packages:

```bash
# Python 3.8 or newer: the whole app, including sign-up and sign-in
python3 scripts/dev_server.py    # http://127.0.0.1:5173

# Node 18 or newer: the app without accounts (frontend work only)
npm run dev                      # http://127.0.0.1:5173
```

`npm run server` starts the Python server too. Use another port with `python3 scripts/dev_server.py 8000` or `npm run dev -- 8000`. Both servers send the right MIME type for `.js` files (some Windows setups otherwise break module loading) and disable caching so edits show up on refresh. On Windows, type `python` instead of `python3`.

The Python server saves accounts in `tradelab.db` in this folder, and creates the file on first run. When you use the Node server, the Account page says that accounts need the Python server.

Run the tests (no dependencies for either):

```bash
npm test                                   # business rules and sign-up rules (Node)
python3 -m unittest discover -s tests -v   # account server and user database (Python)
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
| Account | Create an account (username, email, password) or sign in, with live checks and a status message for every result. Reached from **Sign up** in the header or the profile menu. |

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
                             journal, accounts, calendar, seeded random numbers
    data/                    Mock data: market model, lessons, tutor answers, example account
    services/                The only layer that reads or writes domain data; each has a
                             mock adapter and a remote (Flask) adapter
    components/              Shell, charts, dialogs, notifications, search, icons, widgets
    pages/                   One module per page: mount(root, ctx) returns a cleanup
    utils/                   Safe HTML templating, formatting, a small Markdown renderer
  docs/
    integration.md           Flask API contract and the llama.cpp tutor plan
    mobile.md                What carries over to a mobile app and what doesn't
  server/accounts.py         Sign-up rules, password hashing, the SQLite user database, saved progress
  server/email_check.py      Email checker: provider typos, reserved domains, DNS MX lookup
  scripts/                   Zero-dependency servers: dev_server.py (app + accounts), dev-server.mjs (app only)
  tests/
    core.test.mjs            Unit tests for core/, the mock data and the sign-up rules
    test_accounts.py         Unit tests for the account server and database
    account-cases.json       Sign-up cases both test suites check, so browser and server agree
  tradelab.db                The user database (created by the Python server; not in git)
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

## Accounts and the user database

Sign up on the **Account** page (header: **Sign up**, or the profile menu). The form asks for:

- a **username**: no spaces or @, up to 30 characters, unique (capital letters don't count, so Ayoub and ayoub are the same)
- an **email** address that can actually receive mail (stored in lowercase, unique). See "The email checker" below.
- a **password** of at least 8 characters with at least one capital letter and one special character such as ! @ # or $

A checklist under the password field ticks off each requirement as you type, and a line under the email field shows what the email checker found. When you submit, a status banner at the top of the form shows the result: **Account created** in green with a check mark, or **Account not created** in red, listing each problem with a link to the field. The same messages appear under the fields. Sign in with your username or email; signing in and out shows a status too.

### The email checker

When you pause typing an email, and again when you submit, the server checks (`server/email_check.py`, standard library only):

1. **Typos of popular providers.** gnail.com, gmial.com, hotmial.com, yahooo.com, outlok.com and similar get "Did you mean …@gmail.com?" with a button that fixes the address. These typo domains usually exist and even accept mail (typo-squatters register them), so a DNS lookup alone would let them through.
2. **Reserved and made-up endings.** example.com, .test and .invalid can't receive mail; endings like .con or .ed get "Did you mean .com / .edu?".
3. **The domain's mail servers.** A DNS lookup for MX records rejects domains that don't exist, have no mail server, or publish a "null MX" (meaning they never accept mail).

The lookup uses the DNS servers in `/etc/resolv.conf`, then 1.1.1.1 and 8.8.8.8, and caches answers for ten minutes. If no DNS server answers (you're offline), the address is accepted as unverified so sign-up still works. Set `TRADELAB_DNS_SERVER` to use a specific DNS server. Try the checker on its own:

```bash
python3 server/email_check.py you@gmail.com someone@gnail.com
```

This proves the address's domain can receive email, not that the mailbox exists or belongs to the person signing up. That takes a confirmation email, which needs an email account (SMTP) for the server to send from.

### Progress belongs to each account

Signed in, everything you do (lessons, simulated trades and the simulated day, journal entries, the tutor conversation, notifications and settings) is saved to your account in the `user_data` table and loads again whenever you sign in, in any browser. Changes save about a second after you make them; the Account page shows "Progress saved to your account".

Signed out, TradeLab shows a separate **guest** copy kept in this browser, so one person's progress never shows for another. When an account has nothing saved yet (a new sign-up, or an account from before this feature), it takes over the progress in this browser, and the guest copy starts fresh.

How it works:

- The browser checks the rules first (`js/core/accounts.js`), and the server checks them again (`server/accounts.py`) and has the final say. Both use the same messages, and `tests/account-cases.json` is run against both.
- Accounts are saved in the `users` table of `tradelab.db`. Passwords are never stored: the server keeps a salted PBKDF2-SHA256 hash (1,000,000 iterations) in Werkzeug's format, so a Flask backend can check them with `werkzeug.security.check_password_hash`.
- If `tradelab.db` already has a `users` table (`id`, `display_name`, `email`, `password_hash`, `created_at`), the server adds a `username` column and leaves existing rows alone. Those accounts sign in with their email. New accounts get the username in both `username` and `display_name`.
- Signing in sets an HttpOnly, SameSite=Lax session cookie that lasts 7 days. The `sessions` table stores only a hash of each session token.
- The server refuses requests from other websites that would change anything (signing up, in or out, or saving progress), and never serves the database, its own code or dotfiles such as `.git`.
- **Settings > Start over** (signed in) resets your account's progress; **Clear all local demo data** (signed out) resets the guest copy. Neither deletes accounts.

See every account (never the passwords), and when each one last saved progress, from this folder with:

```bash
python3 -c "import sqlite3; [print(row) for row in sqlite3.connect('tradelab.db').execute('SELECT u.id, u.username, u.email, u.created_at, d.updated_at FROM users u LEFT JOIN user_data d ON d.user_id = u.id')]"
```

The account API (`POST /api/users`, `POST`/`GET`/`DELETE /api/session`, `POST /api/email-check`, `GET`/`PUT /api/me/data`) is described in [docs/integration.md](docs/integration.md#accounts).

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

- **Guest data is browser-only.** Signed out, progress lives in this browser's `localStorage`, which is not a secure or permanent store; clearing site data resets it. Signed in, it's saved to your account on the server.
- **Accounts are a local prototype.** No confirmation emails, password reset or rate limiting on sign-in. The email checker confirms the domain receives mail, not the mailbox. The Python server listens only on 127.0.0.1 over plain HTTP; a public deployment needs HTTPS and a production server.
- **Market orders only.** Limit and stop orders, fractional shares, short selling, fees, dividends and a bid/ask spread are not simulated yet. The order lesson says so.
- **Tutor preview.** A fixed set of prewritten topics; anything else gets an honest "I don't have an answer for that yet".
- **One tab at a time.** Two open tabs don't sync with each other; signed in, the last tab to save wins.
- **No market holidays** in the simulated calendar.
- **English only**, US dollar formatting.

## Licenses

- Chart.js 4.5.1, MIT (`assets/vendor/CHART_JS_LICENSE.md`)
- Archivo, SIL Open Font License 1.1 (`assets/fonts/ARCHIVO_OFL.txt`)
# InvestIQ
