# TradeLab frontend

TradeLab teaches beginners how the stock market works: interactive lessons, paper trading with virtual money, a portfolio view, a trading journal and a tutor. The frontend uses mock data for market, account, progress and journal features; the tutor can use the local Flask/Qwen backend or prewritten answers. Every app price is simulated and every account dollar is virtual.

The frontend uses HTML, CSS and vanilla JavaScript (ES modules). Chart.js is its only third-party code and is vendored. Backend Python dependencies are listed in `requirements.txt`.

## Run it locally

ES modules don't load from `file://`, so serve the folder over HTTP. For the
frontend-only preview, turn off the local tutor in `js/config.js` first:

```js
tutorApiEnabled: false,
```

Then run `npm run dev` (Node 18 or newer) and open
`http://127.0.0.1:5173`. For a working local Qwen tutor, use the Flask setup in
[docs/integration.md](docs/integration.md); it serves the frontend and API from
the same origin.

Run the unit tests for the business logic (Node's built-in test runner, no dependencies):

```bash
npm test

# Flask tutor endpoint tests (from an activated project .venv)
python -m unittest discover -s tests -p "test_*.py"
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
| AI Tutor | Chat with suggested questions, a loading state, formatted answers and a clear-conversation control. Uses local Qwen by default, with a switch to prewritten mock answers. |
| Settings | Theme (dark, light, system), gain and loss colors (green/red or blue/orange), density, reduced motion, default chart style and range, learning level, account reset and clearing local data. |

Search with **Ctrl+K**, **Cmd+K** or **/** to jump to any page, simulated stock or lesson.

## Project structure

```
tradelab/
  index.html                 App shell, early theme script, script and style tags
  package.json               npm scripts (dev, test); no dependencies
  requirements.txt           Flask and requests for the local tutor backend
  ai_system_prompt.txt       Local Qwen tutor behavior and safety instructions
  backend/
    app.py                   Flask tutor endpoint and same-origin frontend server
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
    integration.md           Flask tutor setup and future API contracts
    mobile.md                What carries over to a mobile app and what doesn't
  scripts/                   Zero-dependency Node frontend development server
  tests/core.test.mjs        Unit tests for core/ and the mock data
  tests/test_backend.py      Flask tutor endpoint and static-file tests
```

Icons are drawn in `js/components/icons.js` (one consistent 24px set) rather than as separate files, so they inherit color from the theme.

## How it fits together

**One source of truth.** The account is stored as a transaction ledger. Cash, holdings, average cost and realized P/L are always derived from it by `core/portfolio.js`, so no copy of a balance can drift. Lesson progress, journal entries, the tutor conversation and preferences live in the same store (`state.js`).

**Services decide where data comes from.** Pages never import mock data for domain state. They call services (`marketDataService`, `tradingService`, `progressService`, `journalService`, `tutorService`). Non-tutor services pick an adapter based on `config.dataSource`:

- `mock` (default): runs locally against the store and the simulated market.
- `api`: calls the Flask backend through `services/apiClient.js`.

The tutor adapter is selected independently from `dataSource`, so enabling its local API does not change the source of market, account, progress, or journal data.

**Business rules are pure functions.** Order validation, fills, P/L, day change, the equity curve, quiz grading, lesson progress, journal validation and journal statistics live in `js/core/` with no DOM or storage access. They are covered by `npm test` and are written to be ported to Python as-is.

**Rendering is plain DOM.** Pages build markup with an `html` tagged template that escapes every value by default (`utils/dom.js`), use event delegation, and re-render only the regions whose store slice changed (`watch()`).

## Mock data

| What | Where | Notes |
| --- | --- | --- |
| Eight fictional instruments and their prices | `js/data/mockMarketData.js` | "TradeLab Simulated Market": a seeded random walk with market, sector and company factors, volatility regimes and quarterly jumps. Deterministic, so every device sees the same history. About five years of history and five years of future days. |
| Intraday bars (1D, 1W) | same file | Brownian bridge from each day's open to close, stretched to its high and low. |
| Example account and journal | `js/data/exampleAccount.js` | Labeled Example everywhere; removed by Reset. |
| Lessons and quizzes | `js/data/mockLessons.js` | Educational content, not financial advice. |
| Tutor answers | `js/data/mockTutorResponses.js` | Keyword topic matching to prewritten Markdown when `tutorApiEnabled` is false. |

Simulated dates are weekdays only (no market holidays). The companies don't exist, and the prices don't track anything real.

## Local Qwen tutor

The tutor uses the local Flask and llama.cpp backend by default. All other
application services remain on mock data (`dataSource: 'mock'`). See
[docs/integration.md](docs/integration.md) for the Windows PowerShell setup,
endpoint test command, and how to switch the tutor back to prewritten mock
answers with `tutorApiEnabled: false`.

## Local financial knowledge library (RAG)

The tutor uses a local BM25-style text index to retrieve relevant excerpts
before asking Qwen to answer. This is retrieval-augmented generation (RAG),
**not fine-tuning**: it does not train or change the Qwen model. The index,
imported text, and chat requests stay local. No source corpus is bundled;
Qwen is not called for a question when no relevant indexed material is found.

### Add a permitted source

Activate the existing project environment:

```powershell
.\.venv\Scripts\Activate.ps1
```

Import a local `.txt`, `.md`, `.html`, `.htm`, or text-based `.pdf` file.
Provide its title and publisher, its original URL when it has one, and a
specific license or permission basis you have verified:

```powershell
python -m backend.ingest_knowledge add-file "C:\path\to\permitted-material.pdf" `
  --title "Investor Education: Understanding Risk" `
  --topic "Investment risk and diversification" `
  --publisher "Publisher name shown on the document" `
  --url "https://publisher.example/education/understanding-risk" `
  --publication-date "2025-02-01" `
  --rights-basis "Verified CC BY 4.0 license permits local storage and educational use" `
  --confirm-rights
```

For example, use the actual license and scope printed on the work, or describe
the written permission you obtained, including who granted it and what uses it
covers. Do not use a generic statement such as “I have permission” without
verifying the basis. `--confirm-rights` is your attestation, not legal
verification by the importer. The `--url` value is recorded for attribution
only; `add-file` reads the specified local file and does not fetch that URL.
PDFs must contain extractable text; scanned-image PDFs are not OCR-processed.

Or fetch one explicitly selected page at a time from the allowlisted HTTPS
hosts Investor.gov, FINRA, or SEC:

```powershell
python -m backend.ingest_knowledge add-url `
  --url "https://www.investor.gov/REPLACE-WITH-A-VERIFIED-PAGE-URL" `
  --topic "Stock market fundamentals" `
  --rights-basis "Describe the permission or license you verified" `
  --confirm-rights
```

The URL importer checks `robots.txt`, refuses disallowed paths and
cross-domain redirects, sends a descriptive user-agent, limits downloads, and
does not crawl links. If `robots.txt` returns HTTP 403 or another response
that prevents checking its rules, permission is **unresolved**: the importer
does not fetch the page. `--confirm-rights` cannot override that check or
authorize web scraping. Use `add-file` only when you already have a local
copy and have independently verified you may store and use it. The importer
does **not** determine copyright permission or verify claims, even when
`--confirm-rights` is given. Local source claims and rights details are
recorded as user-reported and not independently verified.

Choose one of these topic labels exactly:

- `Stock market fundamentals`
- `Stocks, bonds, ETFs, and index funds`
- `Financial statements and basic valuation`
- `Investment risk and diversification`
- `Market orders and limit orders`
- `Candlestick charts and common trading terminology`
- `Paper trading and portfolio management`

### Rebuild and inspect the index

After adding or replacing source files, rebuild the index and inspect its
source list:

```powershell
python -m backend.ingest_knowledge rebuild
python -m backend.ingest_knowledge list
```

Rebuild whenever source records change. Imported text under
`knowledge_base\sources\` and the derived `knowledge_base\index.json` are
git-ignored to avoid accidentally committing material with usage restrictions.
Keep backups of any local source files you need; they are not tracked in git.
The retrieval index can always be regenerated from those source records.
Rebuilding replaces the index from the source-record files; it does not append
duplicate documents.

### Search and verify retrieval

Search the rebuilt local index without calling Qwen:

```powershell
python -m backend.ingest_knowledge search "How does diversification reduce investment risk?"
```

Each result shows its passage, source title, publisher, original URL, and
lexical relevance score. An unrelated question should return “No relevant
passages found.” Search runs locally and uses the same retriever as the tutor.

To verify that Qwen is using retrieved evidence, first make sure the local
`llama-server` is running on `127.0.0.1:8080` and Flask is running on
`127.0.0.1:5000`. Search for the question above and confirm the SEC guide is
among the results. Then send the same question to the Flask endpoint:

```powershell
$body = @{
  messages = @(@{
    role = "user"
    content = "Explain how diversification can reduce investment risk, and identify what it cannot guarantee."
  })
  context = @{ level = "beginner"; route = "tutor" }
} | ConvertTo-Json -Depth 5

Invoke-RestMethod -Uri "http://127.0.0.1:5000/api/tutor/chat" `
  -Method Post -ContentType "application/json" -Body $body
```

The tutor's response should describe diversification as potentially reducing
some risk, not guaranteeing profit or eliminating all losses. Source passages
are used internally for grounding; replies no longer append source lists or
quote the source text. The backend caps retrieval at three passages and 2,800 retrieval-context
characters, limits recent conversation history to 2,500 characters while
retaining the current question, sends the ordered recent exchange to Qwen, and treats passages as untrusted reference
data. Qwen3's supported `enable_thinking` template option is disabled for these
short tutor answers so the local model's context budget is used for the answer.
When a short follow-up has no standalone topic, retrieval uses the recent
conversation to resolve its subject. If no passage matches, Qwen may still
answer stable general educational questions, with instructions to disclose
that no verified local source was retrieved; it must not invent citations or
current/source-specific facts. Index-read failures remain distinct backend
errors. Simple greetings and direct questions about the tutor's identity are
answered without retrieval.

### Test and troubleshoot

Run the existing frontend tests and local knowledge/backend tests:

```powershell
npm test
python -m unittest discover -s tests -p "test_*.py" -v
```

- **Verify the local pipeline**: use the `search` command above; automated
  backend tests build temporary source records and mock Qwen while asserting
  the retrieved passage and source URL reach the model context.
- **“No relevant, indexed source”**: import a permitted document tagged with
  the appropriate topic, run `rebuild`, and ask a question addressed by its
  text. The tutor deliberately will not ask Qwen to answer unsupported
  factual questions.
- **“Could not read the local tutor knowledge index”**: run the rebuild
  command again; if it fails, inspect invalid or unreadable JSON records in
  `knowledge_base\sources\`.
- **URL import refused**: verify the URL uses HTTPS and an allowlisted
  Investor.gov, FINRA, or SEC host, review that site's current terms, and
  check its `robots.txt`. The pipeline will not bypass access restrictions.
- **Weak/missed match**: use a more specific question and check that the
  imported text contains the relevant terms. Retrieval is lexical (BM25),
  not semantic vector search; it is a simple local index, not a guarantee of
  authority or completeness.

## Connecting the other services to a backend later

See [docs/integration.md](docs/integration.md) for the remaining endpoint list and request/response shapes. Only switch `dataSource` to `'api'` after implementing those market, account, lesson-progress, and journal endpoints.

## Accessibility

- Semantic landmarks, a skip link, one `h1` per page and announced page changes.
- Visible focus on every control; dialogs trap focus and return it on close; the mobile drawer makes the page behind it inert.
- Gains and losses always carry a sign and an arrow, never color alone; up candles are hollow and down candles filled; a color-vision-friendly palette is one setting away.
- Every chart has a text summary for screen readers and a "Show as a table" view.
- Touch screens get 44px targets; inputs use 16px text on touch devices so iOS doesn't zoom.
- `prefers-reduced-motion` is respected, and there is an in-app setting too.

## Known limitations

- **Local prototype.** The Flask backend currently serves the frontend and the local tutor only; there is no sign-in or server-side account persistence. Mock account data lives in this browser's `localStorage`, which is not a secure or permanent store.
- **Market orders only.** Limit and stop orders, fractional shares, short selling, fees, dividends and a bid/ask spread are not simulated yet. The order lesson says so.
- **Other backend services.** Market, account, progress and journal still use local mock data; their API endpoints are not implemented.
- **One tab at a time.** Two open tabs don't sync with each other.
- **No market holidays** in the simulated calendar.
- **English only**, US dollar formatting.

## Licenses

- Chart.js 4.5.1, MIT (`assets/vendor/CHART_JS_LICENSE.md`)
- Archivo, SIL Open Font License 1.1 (`assets/fonts/ARCHIVO_OFL.txt`)
