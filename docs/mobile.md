# Taking TradeLab to mobile

The web app already works on phones: below 900px the sidebar becomes a drawer, dialogs open as bottom sheets, tables stack into rows, and touch screens get 44px targets. This document is about a store app later: what carries over from this codebase, what has to be rebuilt, and three ways to get there.

## What carries over

| Layer | Files | How it carries over |
| --- | --- | --- |
| Business rules | `js/core/*.js` | As is. Pure functions with no DOM or storage code: ledger replay and P/L, order validation and fills, quiz grading, lesson progress, journal validation and statistics, the trading calendar. They run in any JavaScript runtime, React Native included. For Swift or Kotlin, port them the way [integration.md](integration.md#6-porting-the-business-rules) describes for Python. |
| Content | `js/data/mockLessons.js`, `js/data/mockTutorResponses.js` | Lessons, quizzes and tutor answers are plain data and Markdown strings. Lesson figures are inline SVG strings. The catalog is JSON-safe (no functions), so it can be exported for a native app (see below). |
| Simulated market | `js/data/mockMarketData.js`, `js/core/random.js` | As is, for an offline demo. Seeded, so every device generates the same prices. |
| Services | `js/services/*.js` | The mock and remote adapters and the API contract carry over. They depend on the store and on `fetch`. |
| Store | `js/state.js`, `js/storage.js` | The pattern carries over: one store, immutable slices, `watch(selector, callback)`, memoized selectors (`selectAccount`, `selectValuation`, `selectDayChange`). Persistence needs a different storage backend (below). |
| Formatting | `js/utils/format.js` | As is, as long as the runtime has `Intl.NumberFormat` and `Intl.DateTimeFormat`. |
| Markdown | `js/utils/markdown.js` | Produces HTML, so it only helps inside a WebView. Natively, render the same subset with a Markdown component and keep the same rule: only in-app links. |
| Design tokens | `css/tokens.css` | The values carry over (table below); the CSS doesn't. |
| API contract | `docs/integration.md` | Unchanged. A mobile app is one more client of the same Flask API. |

The reusable layers touch browser APIs in four places, and each one is guarded so the modules load outside a browser:

- `js/config.js` reads `window.TRADELAB_CONFIG` only when `window` exists.
- `js/storage.js` uses `localStorage` and falls back to memory when it's missing.
- `js/state.js` saves on `pagehide` and `visibilitychange` only in a browser. In an app, call the exported `persistNow()` when the app goes to the background.
- `js/services/apiClient.js` resolves a relative `apiBaseUrl` against the page. Without a page, set an absolute one (`https://tradelab.example.com/api`).

## What has to be rebuilt

| Web | Mobile |
| --- | --- |
| `js/pages/*`, `js/components/*` (DOM rendering, event delegation) | Screens and components |
| `css/*` | Styles built from the tokens |
| Chart.js charts | A native chart library, following the chart rules below |
| Hash router (`js/router.js`) | Stack and tab navigation |
| `<dialog>` modals, toasts, command palette | Bottom sheets, native confirmation alerts, a search screen |
| Hover tooltips and the chart crosshair | Press and hold to scrub |
| Keyboard shortcuts | Not needed |

## Three ways to get there

### 1. Wrap the web app

Run the existing app in a WebView with Capacitor or a similar shell. This is the fastest path, and most of the groundwork is already here: `viewport-fit=cover` with safe-area insets on sticky bars and toasts, 44px targets on touch screens, 16px inputs so iOS doesn't zoom, bottom-sheet dialogs and reduced-motion support.

To do:

- Use API mode. WebView storage isn't guaranteed to last (the OS can clear it), so don't keep the account in `localStorage`.
- Set an absolute `apiBaseUrl` and allow the WebView's origin on the API with CORS.
- Consider a bottom tab bar at phone widths instead of the drawer (see the screen map).

### 2. React Native (or Expo), sharing the logic

Move `js/core/`, `js/data/`, `js/services/`, `js/state.js`, `js/storage.js`, `js/config.js` and `js/utils/format.js` into a shared package that both the web app and the mobile app import.

- **Storage.** `storage.js` is synchronous and AsyncStorage is not. Read the saved JSON once at startup (before `initStore()`), serve reads from that copy, and write through asynchronously. Or skip local persistence and rely on API mode.
- **Store binding.** `useSyncExternalStore(subscribe, getState)` plus the existing selectors gives components the same re-render-on-change behavior the web pages get from `watch()`.
- **Charts.** Use a chart library built on SVG or Skia, and follow the rules below.
- **Markdown.** Use a Markdown component and map `#/learn/<id>` links to navigation; drop every other link.
- **Lesson figures.** They are SVG strings, which an SVG component can render from XML.

### 3. Fully native (Swift, Kotlin)

- Use API mode only.
- Port the rules the app needs to preview locally: the order ticket preview (`previewOrder`) and journal validation. To avoid a third copy of those rules, the backend could expose `POST /api/orders/preview` and validate the journal server-side only.
- Export the lesson catalog to JSON, from the repository root:

  ```bash
  node -e "import('./js/data/mockLessons.js').then(m => console.log(JSON.stringify({ categories: m.CATEGORIES, lessons: m.LESSONS })))" > lessons.json
  ```

- Turn the tokens into an asset catalog (iOS) or a Compose theme (Android).

## Screen map

| Web route | Phone app |
| --- | --- |
| `#/` Overview | Home tab |
| `#/learn`, `#/learn/:lessonId` | Learn tab, then a lesson screen with one section at a time, as on the web |
| `#/practice`, `#/practice/:symbol` | Trade tab: stock list, then a stock screen with the order ticket in a bottom sheet |
| `#/portfolio` | Portfolio tab |
| `#/journal` | Reached from Portfolio and from the "Write a journal entry" prompt after each trade |
| `#/tutor` | Tutor tab |
| `#/settings` | From the profile button |

## Behavior to keep

These are what make TradeLab a teaching tool rather than a trading app. Keep them in any port:

- **Simulation is always visible.** The hatched "paper money" mark and the Simulated label sit next to every group of virtual figures.
- **Color is never the only signal.** Gains and losses carry a sign and an arrow, up candles are hollow and down candles filled, and blue/orange is offered instead of green/red.
- **Prices move only when the learner advances the simulated clock.** Nothing pretends to be live.
- **Every simulated order has a review step,** and buys that would make one position 20% or 35% of the account get a nudge about concentration.
- **The journal leads with process.** Planning and follow-through come first; outcome statistics appear only after three closed entries.
- **The tutor labels where an answer came from** and never tells the learner to buy or sell.

Chart rules: one y-axis per chart; thin lines; a caption saying what is shown; a text summary for screen readers and a table alternative; the reference line marks the period's starting price (price charts) or the starting balance (account value).

## Design tokens

From `css/tokens.css`. The app is dark-first.

| Token | Dark | Light | Use |
| --- | --- | --- | --- |
| `ground` | `#131518` | `#f2f3f5` | App background |
| `panel` | `#191c20` | `#ffffff` | Panels and sheets |
| `raised` | `#20242a` | `#f6f7f9` | Controls, hovered rows |
| `sunken` | `#0f1114` | `#eceef1` | Navigation, wells |
| `line` | `#272b31` | `#e0e3e8` | Hairlines between panels and rows |
| `fg` | `#e8eaed` | `#14171b` | Primary text |
| `fg-2` | `#a3aab4` | `#4b535e` | Secondary text |
| `fg-3` | `#858d98` | `#626a76` | Labels and captions |
| `up` | `#3fbf86` | `#0c7650` | Price up, profit (blue/orange option: `#5aa4f0` / `#1d68b9`) |
| `down` | `#ef6b6b` | `#c0313a` | Price down, loss (blue/orange option: `#f09a4a` / `#a24f05`) |
| `warn` | `#e3b04b` | `#8f6200` | Warnings, such as the concentration nudge |
| `hatch` | `#4a515b` | `#b4bbc5` | The "paper money" mark |
| `chart-series` | `#c9ced5` | `#3b424c` | Neutral chart line |
| `chart-grid` | `#24282e` | `#e6e8ec` | Gridlines |

- **Type.** Archivo (SIL Open Font License, files in `assets/fonts/`). Sizes 12, 13, 14, 15, 16, 18, 20, 24, 28 and 36. Weights 400 to 700. Titles use the width axis at 112%; dense figures use 96% with tabular numerals. Where a platform can't set the width axis, keep regular width and tabular numerals.
- **Space.** A 4px base: 4, 8, 12, 16, 20, 24, 32, 40, 48.
- **Shape.** Radii of 4px for controls and 6px for panels, plus pills for tags.
- **Sizes.** Controls 36px high and rows 44px; on touch screens, 44px and 48px.

## Data and accounts on a phone

- Use API mode. The simulated clock and the ledger live on the server, so the same account shows the same prices and trades on the web and on a phone.
- Keep preferences and the tutor conversation on the device if you like; they are the only things the web app keeps locally in API mode.
- When sign-in arrives, store session tokens in the Keychain (iOS) or Keystore-backed storage (Android), never in plain key-value storage.
- Offline, show the last loaded quotes labeled with their simulated day, and disable trading until the server is reachable.
