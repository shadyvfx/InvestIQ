# Connecting TradeLab to a backend

The frontend keeps market, account, lesson-progress, and journal features on their existing mock implementations. Flask serves the frontend and provides the tutor endpoint, which forwards chat requests to a locally hosted llama.cpp model.

The backend currently implements `POST /api/tutor/chat` only. The other endpoints below remain future integration contracts; do not set the global `dataSource` to `'api'` until those endpoints exist.

1. [Switching the tutor between local Qwen and mock responses](#1-switching-the-tutor-between-local-qwen-and-mock-responses)
2. [Serving the frontend from Flask](#2-serving-the-frontend-from-flask)
3. [Conventions and errors](#3-conventions-and-errors)
4. [Endpoints](#4-endpoints)
5. [Data shapes](#5-data-shapes)
6. [Porting the business rules](#6-porting-the-business-rules)
7. [Flask sketch](#7-flask-sketch)
8. [TradeLab Tutor on llama.cpp](#8-tradelab-tutor-on-llamacpp)
9. [Checklist](#9-checklist)

## 1. Switching the tutor between local Qwen and mock responses

The tutor uses the local Qwen endpoint by default through its dedicated
`tutorApiEnabled` setting. All other services continue to use
`dataSource: 'mock'`. To use prewritten tutor responses instead, set:

```js
tutorApiEnabled: false,
```

To explicitly enable Qwen, set `tutorApiEnabled: true` in `js/config.js`, or
override it in `index.html` before the `js/app.js` module:

```html
<script>window.TRADELAB_CONFIG = { tutorApiEnabled: true };</script>
```

Keep `dataSource` as `'mock'`. Setting it to `'api'` switches all services to
their remote adapters and will fail until the other endpoints below have been
implemented.

| Feature | Current source |
| --- | --- |
| Simulated clock, instruments, quotes and price history | Browser mock data |
| Account ledger, trading, lesson progress and journal | Browser/localStorage mock data |
| Tutor replies (`tutorApiEnabled: true`) | Flask, then local llama.cpp / Qwen |
| Tutor replies (`tutorApiEnabled: false`) | Prewritten answers (`js/data/mockTutorResponses.js`) |
| Lesson catalog and quiz content | Bundled data (`js/data/mockLessons.js`) |
| Preferences, tutor conversation, notifications and UI state | localStorage |

The market, account, progress, and journal still use the existing mock data.
Their future API adapters are not enabled by the tutor switch.

Generated replies use the existing TradeLab Tutor name and timestamp without
showing a model name. Retrieved sources are appended to grounded Qwen answers.
With the API disabled, the existing preview labels and prewritten responses
remain available. Errors from Flask appear as warning messages in the
conversation; they do not silently fall back to mock answers.

The API answers factual questions only when the local knowledge library
contains relevant indexed material; otherwise it explains that it cannot
support an answer from the library. See the root README's
[local financial knowledge library](../README.md#local-financial-knowledge-library-rag)
section for permitted-source ingestion, index rebuild, and troubleshooting
commands.

The tutor endpoint does not load or send account balances or trades.

## 2. Serving the frontend from Flask

Serve the frontend and the API from the same origin: Flask returns the static files and handles `/api`. Then `apiBaseUrl: '/api'` works as is, there is no CORS to configure, and cookies for a future sign-in are sent automatically (the client uses `credentials: 'same-origin'`).

Page routes live in the URL hash (`/#/practice/HLCN`), so the server only ever receives `/`. No rewrite rules or catch-all route are needed for pages.

- Serve `.js` files as `text/javascript`. Some Windows Python installs map `.js` to `text/plain`, and browsers refuse to run ES modules with that type. `mimetypes.add_type("text/javascript", ".js")` fixes it.
- To serve the frontend from another origin during development (for example a separate dev server), set `apiBaseUrl: 'http://127.0.0.1:5000/api'`, allow that origin on `/api/*` with CORS, and change `credentials: 'same-origin'` to `'include'` in `js/services/apiClient.js` once you add cookie sign-in.

### Windows PowerShell quick start

From the project root, in separate PowerShell windows:

```powershell
# Activate the existing virtual environment
.\.venv\Scripts\Activate.ps1

# Install the declared backend dependencies
python -m pip install -r requirements.txt
```

If PowerShell blocks activation, run
`Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` in that window,
then activate the environment again.

Start llama.cpp using the existing Qwen GGUF model (replace the path with its
actual location; do not download or rebuild it):

```powershell
llama-server -m "C:\path\to\Qwen3-8B-Q4_K_M.gguf" --host 127.0.0.1 --port 8080 -c 8192
```

In another PowerShell window, from the project root:

```powershell
.\.venv\Scripts\Activate.ps1
python -m flask --app backend.app run --host 127.0.0.1 --port 5000
```

Open `http://127.0.0.1:5000/`. Flask serves the HTML, stylesheets, JavaScript
modules, and assets from the same origin as the API. The browser calls only
`/api/tutor/chat`; Flask alone calls llama.cpp.

Test the endpoint from PowerShell:

```powershell
$body = @{
  messages = @(@{ role = "user"; content = "Explain candlestick charts to me." })
  context = @{ level = "beginner"; route = "tutor" }
} | ConvertTo-Json -Depth 5

Invoke-RestMethod -Uri "http://127.0.0.1:5000/api/tutor/chat" `
  -Method Post -ContentType "application/json" -Body $body
```

Use Qwen with `tutorApiEnabled: true` (the default), or set it to `false` in
`js/config.js` for prewritten mock tutor answers. Keep `dataSource: 'mock'`
for both choices so other application features remain unaffected.

Run both test suites with:

```powershell
npm test
python -m unittest discover -s tests -p "test_*.py"
```

## 3. Conventions and errors

- **JSON** request and response bodies (`Content-Type: application/json`). A `204` response has no body.
- **Money** is a number in dollars rounded to cents (`186.4`, `9532.17`). Compute in integer cents or `Decimal` on the server, as `js/core/portfolio.js` does with cents.
- **Simulated days** are integers. Day 0 is the day the account was opened or last reset, and each day after it is one trading day (weekdays only, no holidays) from `startDate`. Negative days are history from before the account existed; charts use them.
- The frontend turns day numbers into dates itself with `createDayCalendar(startDate)` from `js/core/calendar.js`. If the backend adds market holidays, port the calendar with the same holidays, or the dates shown in the UI will drift from the server's.
- **Dates** are `YYYY-MM-DD`. Intraday times are `YYYY-MM-DDTHH:MM` in exchange time (the session runs 09:30 to 16:00).
- **Timestamps** (`timestamp`, `createdAt`, `updatedAt`) are Unix epoch milliseconds.
- **IDs** are strings assigned by the server. **Symbols** are uppercase.
- **Timeouts**: the client gives up after 15 seconds (`apiTimeoutMs`), or 120 seconds for the tutor (`tutorTimeoutMs`).

### Error format

Every non-2xx response carries the same body:

```json
{
  "error": {
    "code": "insufficient_cash",
    "message": "This order costs $1,864.00, but you have $1,200.00 in virtual cash. You can buy up to 6 shares.",
    "field": "quantity"
  }
}
```

- `message` is shown to the learner word for word, so write it for them: what went wrong and what to do.
- `field` (optional) places the message under that form field.
- `details.fields` (optional) carries several field messages at once, for journal validation: `"details": { "fields": { "thesis": "...", "stopPrice": "..." } }`.

Where messages appear: a 400 from `POST /api/orders` appears under the order ticket's quantity field; a 400 from journal create or update appears under the matching fields in the editor; anything else appears in a toast, in the chat (tutor), or in the page's error state (startup). Network failures and timeouts get client-side messages with the codes `network` and `timeout`.

| Code | Status | Meaning |
| --- | --- | --- |
| `invalid_side` | 400 | `side` is not `buy` or `sell` |
| `invalid_quantity` | 400 | Quantity is not a whole number of 1 or more |
| `quantity_too_large` | 400 | More than 100,000 shares in one order |
| `no_price` | 400 | No simulated price for the symbol |
| `insufficient_cash` | 400 | A buy costs more than the virtual cash |
| `no_position` | 400 | Selling a stock the account doesn't hold (no short selling) |
| `insufficient_shares` | 400 | Selling more shares than the account holds |
| `validation_failed` | 400 | Journal entry breaks a rule; messages in `details.fields` |
| `invalid_request` | 400 | Malformed body or parameter (suggested) |
| `not_found` | 404 | Unknown symbol, lesson, entry or endpoint (suggested) |
| `tutor_timeout` | 504 | The model took too long (suggested) |
| `tutor_unavailable` | 503 | llama-server is not reachable (suggested) |

The first seven codes and their messages come from `js/core/orders.js`. The browser shows the same messages as a live preview while the learner types, so the server should return them unchanged.

## 4. Endpoints

All paths are under `/api`. The second column names the frontend function or control that makes the call.

### Market (`js/services/marketDataService.js`)

| Endpoint | Called by | Response |
| --- | --- | --- |
| `GET /market/instruments` | `initMarket()` at startup | `{ instruments: Instrument[] }` |
| `GET /market/clock` | `initMarket()` | `Clock` |
| `GET /market/quotes?symbols=HLCN,SKLF` | `initMarket()`; `refreshQuotes()` after advancing or resetting | `{ quotes: { [symbol]: Quote } }` |
| `GET /market/history/:symbol?range=3M` | Overview and Practice Trading charts | `History` |
| `GET /market/sparklines?symbols=HLCN,SKLF&days=30` | Overview watchlist | `{ sparklines: { [symbol]: number[] } }`: daily closes, oldest first, ending on the current day |
| `POST /market/advance` `{ days }` | Advance 1 day / Advance 1 week | `Clock` |

The clock belongs to the account, and prices move only when the learner advances it. Quotes, history and sparklines are always as of the account's current day; never return data from after it.

`range` is one of `1D` (5-minute bars for the current day), `1W` (30-minute bars for the last 5 days), `1M`, `3M` or `1Y` (21, 63 or 252 daily bars) and `5Y` (about 252 weekly bars). Treat anything else as `3M`.

`days` is an integer from 1 to 5 (the interface sends 1 or 5). Clamp the result to `maxDay` the way the mock does; the interface disables the buttons at the end.

### Account and orders (`js/services/tradingService.js`)

| Endpoint | Called by | Response |
| --- | --- | --- |
| `GET /account` | `loadAccount()` at startup | `{ startingCash, transactions: Transaction[] }` |
| `POST /orders` `{ symbol, side, quantity, type: "market" }` | `placeOrder()` after the order review | `201 { transaction: Transaction }` or a 400 error |
| `POST /account/reset` `{ startingCash }` | Settings > Reset account; Start with an empty account on Overview | `{ startingCash, transactions: [], clock: Clock }` |
| `GET /portfolio/performance` | Portfolio "Account value" chart | `{ points: [{ day, date, equity }] }`, one point per day from 0 to the current day |

To place an order, the server should:

1. Take the quote at the account's current day and fill the whole order at its `price`. Only market orders exist.
2. Validate with the rules from `js/core/orders.js` (same codes, same messages).
3. Append the transaction to the ledger. Ledger rows are never edited or deleted.

The response carries only the transaction. The browser derives cash, holdings, average cost and realized P/L from the ledger with `js/core/portfolio.js`. If the server ever returns its own derived numbers, they must match.

On reset, replace the ledger with an empty one, set `startingCash` (one of `10000`, `25000` or `100000`, from `config.startingCashOptions`), and restart the clock at day 0 with `startDate` set to the latest trading day on or before today. Keep lesson progress, journal entries and preferences.

Performance `equity` is the account value at each day's close: cash plus every holding at that day's closing price, replaying the ledger day by day (`equityCurve()` in `js/core/portfolio.js`).

### Lesson progress (`js/services/progressService.js`)

| Endpoint | Called by | Response |
| --- | --- | --- |
| `GET /progress` | `loadProgress()` at startup | `{ lessons: { [lessonId]: ProgressRecord } }` |
| `POST /progress/:lessonId/sections/:sectionId` | Continue, at the end of each lesson section | `{ record: ProgressRecord }` |
| `POST /progress/:lessonId/quiz` `{ answers: { [questionId]: optionIndex } }` | Finishing the knowledge check | `{ grade: Grade, record: ProgressRecord }` |
| `DELETE /progress/:lessonId` | `resetLesson()` (not used by the interface yet) | `204` |

The lesson catalog, including correct answers and explanations, ships with the frontend, so the per-question Check feedback runs in the browser. The server's grade is the one that counts: grade with the rules in `js/core/progress.js` (pass at two thirds; the first pass marks every section done and sets `completedAt`). To move the catalog to the server, add `GET /api/lessons` returning the `LESSONS` structure and load it at startup instead of the import in `progressService.js`.

### Journal (`js/services/journalService.js`)

| Endpoint | Called by | Response |
| --- | --- | --- |
| `GET /journal` | `loadEntries()` at startup | `{ entries: JournalEntry[] }`, newest first |
| `POST /journal` `JournalEntryInput` (plus optional `transactionId`) | Save entry in the editor | `201 { entry: JournalEntry }` |
| `PUT /journal/:id` `JournalEntryInput` | Save changes in the editor | `{ entry: JournalEntry }` |
| `DELETE /journal/:id` | Delete entry, after confirmation | `204` |

The browser validates with `js/core/journal.js` before sending. Validate again on the server with the same rules and return `validation_failed` with `details.fields` when something fails. The server sets `id`, `entryDay` (the account's current simulated day), `createdAt` and `updatedAt`. `transactionId` links the entry to the trade it describes (from the "Write a journal entry" button after an order); check that the transaction belongs to the account.

Journal insights (plan rate, follow-through, outcomes after three closed entries) are computed in the browser from the entries and the ledger, so they need no endpoint.

### Tutor (`js/services/tutorService.js`)

| Endpoint | Called by | Response |
| --- | --- | --- |
| `POST /tutor/chat` | `sendMessage()` | JSON reply by default; the tutor requests SSE streaming with `"stream": true`. Replies without retrieved evidence use source `llm_unverified`. |

```json
{
  "messages": [
    { "role": "user", "content": "How do I read a candlestick?" },
    { "role": "assistant", "content": "A candlestick shows four prices for one period..." },
    { "role": "user", "content": "What does a long lower wick mean?" }
  ],
  "context": { "level": "beginner", "route": "tutor", "lessonId": "candlestick-anatomy" }
}
```

- `messages` holds the last 12 messages, oldest first, ending with the learner's. Learner messages are at most 1,000 characters.
- `context.level` is `beginner`, `intermediate` or `advanced` (Settings > Learning level).
- `context.lessonId` is present when the learner opened the tutor from a lesson's Ask the tutor button.
- The conversation is stored in the browser (up to 120 messages). The server doesn't need to keep it.

`content` is Markdown in the subset described in [section 8](#rendering-and-safety). `model` appears under each reply as "Generated by {model}".

## 5. Data shapes

Field order doesn't matter. Values below are examples.

**Instrument**

```json
{ "symbol": "HLCN", "name": "Halcyon Semiconductor", "sector": "Technology", "kind": "stock", "description": "Designs processors for data centers and consumer devices." }
```

`kind` is `stock` or `fund`. `sector` drives the allocation-by-sector view.

**Clock**

```json
{ "startDate": "2026-09-21", "day": 15, "date": "2026-10-12", "maxDay": 1300 }
```

`startDate` is the date of day 0 and `date` is the date of `day`. `maxDay` is the last day the clock can advance to.

**Quote**

```json
{
  "symbol": "HLCN", "day": 15, "price": 191.37, "prevClose": 189.02,
  "change": 2.35, "changePct": 0.01243,
  "open": 189.5, "high": 192.1, "low": 188.76,
  "volume": 4318200, "averageVolume": 4105000,
  "high52": 214.6, "low52": 151.2
}
```

`price` is the current simulated price, which is the day's close: between advances the simulated market is closed. `changePct` is a fraction (`0.01243` is 1.243%). `averageVolume` covers the last 20 days; `high52` and `low52` the last 252. Day change on Overview and Portfolio uses `prevClose`.

**History**

```json
{
  "symbol": "HLCN", "range": "3M", "interval": "1d", "reference": 176.4,
  "points": [
    { "day": -47, "t": "2026-07-14", "o": 175.9, "h": 178.2, "l": 175.1, "c": 177.6, "v": 3950000 }
  ]
}
```

- `interval` is `5m` (1D), `30m` (1W), `1d` (1M, 3M, 1Y) or `1w` (5Y).
- `reference` is the close just before the first point; the chart measures the period's change from it.
- `t` is `YYYY-MM-DD` for daily and weekly points (a weekly point is labeled with the week's last trading day) and `YYYY-MM-DDTHH:MM` for intraday points.
- Intraday points also carry `minute`, the minutes since the 09:30 open (0, 5, … 385 for 5-minute bars; 0, 30, … 360 for 30-minute bars). Axis labels use it.
- Points are oldest first and end at the current day. `h` is at least `max(o, c)` and `l` at most `min(o, c)`.

**Transaction**

```json
{ "id": "tx_8f2c1", "symbol": "HLCN", "side": "buy", "quantity": 10, "price": 186.4, "type": "market", "day": 3, "timestamp": 1760000000000 }
```

Ledger order is `day`, then `timestamp`. Optional `example: true` shows an Example tag (the mock uses it for the demo trades).

**PerformancePoint**

```json
{ "day": 4, "date": "2026-09-25", "equity": 10132.55 }
```

**ProgressRecord**

```json
{
  "sectionsDone": ["ownership", "returns"], "quizBest": 2, "quizPassed": false, "attempts": 1,
  "lastSection": "returns", "startedAt": 1760000000000, "completedAt": null, "updatedAt": 1760000500000
}
```

`quizBest` is `null` until the first attempt.

**Grade**

```json
{
  "score": 2, "total": 3, "passed": true,
  "results": [{ "id": "q1", "chosen": 0, "correctIndex": 0, "correct": true }]
}
```

**JournalEntryInput** (what the editor sends)

```json
{
  "symbol": "HLCN", "entryPrice": 186.4, "exitPrice": null, "stopPrice": 178, "targetPrice": 205, "quantity": 10,
  "thesis": "Data center orders keep growing and the stock held its 50-day average.",
  "risks": "Earnings next week; a miss could gap it below my stop.",
  "lessons": "", "followedPlan": ""
}
```

- `exitPrice` is `null` while the trade is open; `quantity`, `stopPrice` and `targetPrice` may be `null`.
- `followedPlan` is `yes`, `partly`, `no` or `""` (not answered yet).
- Rules: the symbol exists; prices are above $0; the stop is below the entry and the target above it (TradeLab is long only); the thesis has at least 15 characters; each text field has at most 2,000.

**JournalEntry** is the input plus `id`, `entryDay`, `createdAt`, `updatedAt` and, when linked, `transactionId`.

## 6. Porting the business rules

`js/core/` has no DOM or storage code, so each file maps to a Python module. Keep the behavior, error codes and messages identical: the browser previews with the JavaScript version and the server decides with the Python one, and any difference shows up as an order the preview allowed but the server rejects.

| Module | What the backend needs |
| --- | --- |
| `core/portfolio.js` | `deriveAccount` (ledger replay, average cost, realized P/L in cents), `valueAccount`, `dayChange`, `equityCurve` |
| `core/orders.js` | `previewOrder` and `executeMarketOrder`: validation rules, codes, messages, `MAX_ORDER_SHARES` |
| `core/progress.js` | `gradeQuiz`, `completeSection`, `recordQuizAttempt`, `PASS_RATIO` |
| `core/journal.js` | `validateJournalEntry` with the same field messages |
| `core/calendar.js` | `createDayCalendar`, `latestTradingDay`, `addTradingDays` |
| `core/random.js`, `data/mockMarketData.js` | Only to keep the same simulated market. Generating the series once with Node and storing it is the simplest way to keep prices identical; replacing them with other data is fine as long as the shapes hold. |

`tests/core.test.mjs` doubles as a list of cases for the Python port.

## 7. Flask sketch

A starting point, not a finished server. `db`, `market`, `rules` and `current_user()` stand for your own persistence, simulated market, ported rules and (later) sign-in.

```python
# app.py
import mimetypes
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory

mimetypes.add_type("text/javascript", ".js")  # browsers refuse ES modules served as text/plain

FRONTEND = Path(__file__).parent / "tradelab"  # this repository
app = Flask(__name__, static_folder=None)


class ApiError(Exception):
    def __init__(self, status, code, message, field=None, details=None):
        super().__init__(message)
        self.status, self.code, self.message = status, code, message
        self.field, self.details = field, details


@app.errorhandler(ApiError)
def handle_api_error(err):
    error = {"code": err.code, "message": err.message}
    if err.field:
        error["field"] = err.field
    if err.details:
        error["details"] = err.details
    return jsonify(error=error), err.status


# Frontend: index.html and static files. Pages are hash routes, so "/" is enough.
@app.get("/")
def index():
    return send_from_directory(FRONTEND, "index.html")


@app.get("/<path:path>")
def static_files(path):
    if path.startswith("api/"):
        raise ApiError(404, "not_found", "That endpoint doesn't exist.")
    return send_from_directory(FRONTEND, path)


# Market
@app.get("/api/market/clock")
def get_clock():
    account = db.account(current_user())
    return jsonify(market.clock(account))  # {startDate, day, date, maxDay}


@app.get("/api/market/quotes")
def get_quotes():
    account = db.account(current_user())
    symbols = [s for s in request.args.get("symbols", "").upper().split(",") if market.has(s)]
    return jsonify(quotes={s: market.quote(s, account.day) for s in symbols})


@app.post("/api/market/advance")
def advance_market():
    days = (request.get_json(silent=True) or {}).get("days")
    if not isinstance(days, int) or not 1 <= days <= 5:
        raise ApiError(400, "invalid_request", "Advance by 1 to 5 trading days.", field="days")
    account = db.account(current_user())
    db.set_day(account, min(market.MAX_DAY, account.day + days))
    return jsonify(market.clock(account))


# Orders
@app.post("/api/orders")
def place_order():
    body = request.get_json(silent=True) or {}
    account = db.account(current_user())
    symbol = str(body.get("symbol", "")).upper()
    quote = market.quote(symbol, account.day) if market.has(symbol) else None
    ledger = rules.derive_account(account.starting_cash, account.transactions)
    result = rules.execute_market_order(
        order={"symbol": symbol, "side": body.get("side"), "quantity": body.get("quantity")},
        price=quote["price"] if quote else None,
        cash=ledger["cash"],
        position_quantity=rules.position_quantity(ledger, symbol),
        equity=0,  # only feeds the concentration nudge, not validation
        day=account.day,
        id=db.new_id("tx"),
    )
    if not result["ok"]:
        first = result["errors"][0]
        raise ApiError(400, first["code"], first["message"], field=first["field"])
    db.append_transaction(account, result["transaction"])
    return jsonify(transaction=result["transaction"]), 201
```

The tutor route is implemented in the following section.

## 8. TradeLab Tutor on llama.cpp

```
Browser ── POST /api/tutor/chat ──▶ Flask ── POST /v1/chat/completions ──▶ llama-server
           messages, level,             adds the system prompt and           127.0.0.1:8080
           page context                 whitelisted level guidance           local GGUF model
```

The browser never talks to llama-server directly. Flask loads
`ai_system_prompt.txt`, validates and limits the conversation, adds only a
whitelisted learning-level instruction, and keeps the model's port private.
This tutor-only backend does not own an account ledger, so account balances
and trades are not forwarded to the model.

### Run the model server

llama.cpp's `llama-server` serves an OpenAI-compatible chat API:

```bash
llama-server -m models/your-model.gguf --host 127.0.0.1 --port 8080 -c 8192
# add -ngl 99 to offload all layers to a GPU
```

Use an instruction-tuned model in GGUF format. A 7B to 8B model at 4-bit quantization is a reasonable start on a laptop; larger models explain better. Keep `--host 127.0.0.1` so only Flask can reach it. `GET http://127.0.0.1:8080/health` answers once the model has loaded, which makes a good readiness check.

### The Flask route

The validated route is implemented in [`backend/app.py`](../backend/app.py).
Each request carries the ordered recent user/assistant turns, capped by message
count and character budget. Short follow-ups reuse recent turns to formulate
the local retrieval query. A missing retrieval match is not a model/server
failure: Qwen can answer stable general educational questions while being
instructed not to claim local verification or invent citations. Current,
platform-specific, or otherwise unsupported facts should be qualified. Index
read errors and upstream Qwen failures remain explicit backend errors.

### System prompt

The active prompt is [`ai_system_prompt.txt`](../ai_system_prompt.txt). It
teaches financial concepts, distinguishes simulated data from real data, and
sets the tutor's boundaries around current information and personalized
investment decisions. No account balance or simulated trade context is
currently provided to the backend.

### Rendering and safety

- Replies go through `js/utils/markdown.js`, which escapes all HTML first and only turns `[text](#/...)` into links. Model output can't inject markup, scripts or outside links; `tests/core.test.mjs` checks this.
- Supported Markdown: paragraphs, `-` and `1.` lists, headings (`#` and `##` render at the same small size as `###`), `**bold**`, `*italic*`, inline and fenced code, and in-app links. Fenced code is HTML-escaped like the rest of model output.
- The browser caps learner messages at 1,000 characters and sends at most 12 messages; Flask validates user messages at 1,000 characters and assistant history at 4,000. For anything beyond local loopback use, add appropriate rate limiting. llama-server handles a limited number of requests at once (see its `--parallel` option).
- New assistant replies, including mock replies and visible errors, use the same safe progressive renderer. Live Qwen chunks feed that renderer as they arrive; already-complete responses use its typewriter mode. Existing persisted messages are shown immediately when reopening the tutor.
- Replies display as TradeLab Tutor with the time; the local model name is not shown.

### Streaming

The Flask tutor route preserves its JSON response when `"stream": true` is omitted. The browser uses that flag to request an SSE stream: Flask asks llama.cpp for `stream: true`, forwards text deltas as they arrive, and sends a completion event at the end. Flask closes the upstream response if the client disconnects. The frontend parses SSE frames from a POST `fetch`, updates one safely Markdown-rendered draft, and saves the completed message once, without replaying the text. The Stop button aborts the request; any received partial answer is retained and marked as stopped. Existing local mock replies remain available and use the frontend typewriter animation instead of Qwen streaming.

The conversation auto-scrolls only while the reader is near its bottom. Incremental output is escaped and rendered with the same Markdown renderer; reduced-motion preference is honored by the remaining frontend typewriter animation.

## 9. Checklist

1. The tutor-only backend is implemented and runs on the same-origin Flask server.
2. Implement the market, account, progress and journal endpoints with the shapes above before changing `dataSource` to `'api'`.
3. Port `js/core/` to Python and run the existing Node cases against that port.
4. Test the complete API-mode flow once those additional services have backends.
