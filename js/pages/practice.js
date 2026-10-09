// Practice Trading: a paper-trading desk with simulated prices.
// Searchable stock list, quote and chart, an order ticket with live
// validation, the learner's position and the simulated order history.
// Order math lives in core/orders.js; placing orders goes through
// tradingService so this page never touches the ledger directly.

import { html, render, on, createDisposer, $ } from '../utils/dom.js';
import { getState, watch, updateSlice, selectAccount, selectValuation, selectInstrument } from '../state.js';
import { money, percent, plural, compactNumber, formatDate } from '../utils/format.js';
import { icon } from '../components/icons.js';
import { change, simulatedPill, exampleTag, sideTag, emptyState, segmented, fieldError, notApplicable } from '../components/ui.js';
import { createPriceChart, describeHistory, dataTableToggle, fillDataTable, historyColumns } from '../components/charts.js';
import { mountSimBar } from '../components/simBar.js';
import { openDialog } from '../components/modals.js';
import { toast, notify, announce } from '../components/notifications.js';
import { getHistory, dateOfDay, RANGES, MARKET_SOURCE } from '../services/marketDataService.js';
import { placeOrder, OrderError } from '../services/tradingService.js';
import { previewOrder, parseQuantity } from '../core/orders.js';
import { positionQuantity } from '../core/portfolio.js';
import { href } from '../router.js';

const ui = {
  symbol: null,
  range: null,
  style: null,
  list: 'watchlist',
  search: '',
  side: 'buy',
  quantity: '1',
  historyScope: 'symbol',
  attempted: false,
  // A rejection from the server, shown under Shares until the order changes.
  serverError: null,
};

const orderKey = () => `${ui.symbol}|${ui.side}|${ui.quantity.trim()}`;

// ---------------------------------------------------------------------------
// Stock list (inline on wide screens, in a dialog on narrower ones)

function listRows(state) {
  const query = ui.search.trim().toLowerCase();
  const pool = ui.list === 'watchlist' ? state.watchlist.map((symbol) => selectInstrument(symbol, state)).filter(Boolean) : state.runtime.instruments;
  return pool.filter((instrument) => !query || `${instrument.symbol} ${instrument.name} ${instrument.sector}`.toLowerCase().includes(query));
}

function instrumentList(state, { idPrefix }) {
  const rows = listRows(state);
  const watching = new Set(state.watchlist);
  return html`<div class="picker">
    <div class="picker__controls">
      <div class="field">
        <label class="sr-only" for="${idPrefix}-search">Search simulated stocks</label>
        <div class="input-affix input-affix--icon">${icon('search', { className: 'input-affix__icon' })}<input class="input" type="search" id="${idPrefix}-search" data-picker="search" placeholder="Search symbol or company" value="${ui.search}" autocomplete="off" /></div>
      </div>
      ${segmented({
        items: [
          { id: 'watchlist', label: `Watchlist (${state.watchlist.length})` },
          { id: 'all', label: `All stocks (${state.runtime.instruments.length})` },
        ],
        selected: ui.list,
        label: 'Which stocks to list',
        name: 'list',
        className: 'seg--block',
      })}
    </div>
    ${rows.length
      ? html`<ul class="picker__list" aria-label="${ui.list === 'watchlist' ? 'Watchlist' : 'All simulated stocks'}">${rows.map((instrument) => {
          const quote = state.runtime.quotes[instrument.symbol];
          const selected = instrument.symbol === ui.symbol;
          const starred = watching.has(instrument.symbol);
          return html`<li class="picker__row${selected ? ' is-selected' : ''}">
            <a class="picker__main" href="#/practice/${instrument.symbol}" ${selected ? html`aria-current="true"` : ''}>
              <span class="cell-symbol"><span class="cell-symbol__ticker">${instrument.symbol}</span><span class="cell-symbol__name truncate">${instrument.name}</span></span>
              <span class="picker__quote"><span class="num">${money(quote?.price)}</span>${change(quote?.change, quote?.changePct, { pctOnly: true })}</span>
            </a>
            <button type="button" class="icon-btn icon-btn--sm picker__star" data-star="${instrument.symbol}" aria-pressed="${starred}" aria-label="${starred ? `Remove ${instrument.symbol} from watchlist` : `Add ${instrument.symbol} to watchlist`}">${icon(starred ? 'star-filled' : 'star')}</button>
          </li>`;
        })}</ul>`
      : ui.list === 'watchlist' && !ui.search
        ? emptyState({ iconName: 'star', title: 'Your watchlist is empty', text: 'Star a stock in the full list to follow it here and on the Overview.', actions: [{ label: 'Show all stocks', action: 'show-all' }], compact: true })
        : emptyState({ iconName: 'search', title: `No stocks match "${ui.search}"`, text: ui.list === 'watchlist' ? 'Your search only covers the watchlist right now.' : 'Try a symbol like HLCN or a sector like Energy.', actions: ui.list === 'watchlist' ? [{ label: 'Search all stocks', action: 'show-all' }] : [], compact: true })}
    <p class="picker__source"><span class="hatch" aria-hidden="true"></span>Fictional companies with simulated prices.</p>
  </div>`;
}

// ---------------------------------------------------------------------------
// Quote, chart, position and history

function quotePanel(state) {
  const instrument = selectInstrument(ui.symbol, state);
  const quote = state.runtime.quotes[ui.symbol];
  const starred = state.watchlist.includes(ui.symbol);
  return html`<section class="panel quote-panel" aria-labelledby="quote-symbol">
    <div class="panel__body">
      <button type="button" class="picker-trigger" data-action="open-picker" aria-haspopup="dialog">
        <span class="picker-trigger__label">Change stock</span>${icon('chevron-down')}
      </button>
      <div class="quote-head">
        <div class="quote-head__id">
          <div class="cluster">
            <h2 class="quote-head__symbol" id="quote-symbol">${ui.symbol}</h2>
            <span class="tag">${instrument?.sector}</span>
            ${simulatedPill()}
          </div>
          <p class="quote-head__name">${instrument?.name}</p>
          <p class="quote-head__desc">${instrument?.description}</p>
        </div>
        <div class="quote-head__price">
          <p class="hero-figure figure">${money(quote?.price)}</p>
          <p class="quote-head__change">${change(quote?.change, quote?.changePct)}<span class="muted">on simulated day ${state.market.day}</span></p>
          <button type="button" class="btn btn--secondary btn--sm" data-star="${ui.symbol}" aria-pressed="${starred}">${icon(starred ? 'star-filled' : 'star')}${starred ? 'On watchlist' : 'Add to watchlist'}</button>
        </div>
      </div>
      <dl class="kv kv--grid quote-stats">
        <div class="kv__row"><dt class="kv__key">Open</dt><dd class="kv__val">${money(quote?.open)}</dd></div>
        <div class="kv__row"><dt class="kv__key">High</dt><dd class="kv__val">${money(quote?.high)}</dd></div>
        <div class="kv__row"><dt class="kv__key">Low</dt><dd class="kv__val">${money(quote?.low)}</dd></div>
        <div class="kv__row"><dt class="kv__key">Previous close</dt><dd class="kv__val">${money(quote?.prevClose)}</dd></div>
        <div class="kv__row"><dt class="kv__key">Volume</dt><dd class="kv__val">${compactNumber(quote?.volume)} <span class="faint">avg ${compactNumber(quote?.averageVolume)}</span></dd></div>
        <div class="kv__row"><dt class="kv__key">52-week range</dt><dd class="kv__val">${money(quote?.low52)} to ${money(quote?.high52)}</dd></div>
      </dl>
      <div class="chart-toolbar">
        ${segmented({ items: RANGES.map((r) => ({ id: r.id, label: r.label, title: r.description })), selected: ui.range, label: 'Time range', name: 'range' })}
        ${segmented({ items: [{ id: 'line', label: 'Line' }, { id: 'candles', label: 'Candles' }], selected: ui.style, label: 'Chart style', name: 'style' })}
      </div>
      <p class="chart-range" id="p-range-change"></p>
      <div class="chart chart--lg" id="p-chart"></div>
      <div class="chart-foot">
        <p class="chart-caption"><span class="hatch" aria-hidden="true"></span>Source: ${MARKET_SOURCE.name}, generated in your browser. Not real market data.</p>
        ${dataTableToggle({ id: 'p-chart-data', summary: 'Show prices as a table', caption: `Simulated prices for ${ui.symbol}` })}
      </div>
    </div>
  </section>`;
}

function positionPanel(state) {
  const valuation = selectValuation(state);
  const row = valuation.positions.find((position) => position.symbol === ui.symbol);
  return html`<section class="panel" aria-labelledby="position-title">
    <div class="panel__head"><h2 class="panel__title" id="position-title">Your ${ui.symbol} position</h2>${simulatedPill()}</div>
    ${row
      ? html`<div class="panel__body"><dl class="kv kv--grid">
          <div class="kv__row"><dt class="kv__key">Shares</dt><dd class="kv__val">${row.quantity}</dd></div>
          <div class="kv__row"><dt class="kv__key">Average cost</dt><dd class="kv__val">${money(row.averageCost)}</dd></div>
          <div class="kv__row"><dt class="kv__key">Market value</dt><dd class="kv__val">${money(row.marketValue)}</dd></div>
          <div class="kv__row"><dt class="kv__key">Unrealized P/L</dt><dd class="kv__val">${change(row.unrealizedPnl, row.unrealizedPct)}</dd></div>
          <div class="kv__row"><dt class="kv__key">Share of account</dt><dd class="kv__val">${percent(row.weight, { digits: 1 })}</dd></div>
          <div class="kv__row"><dt class="kv__key">Held since</dt><dd class="kv__val">Day ${row.openedDay}, ${formatDate(dateOfDay(row.openedDay), 'short')}</dd></div>
        </dl></div>`
      : html`<div class="panel__body"><p class="muted">You don't own any ${ui.symbol} right now. Use the order ticket to buy with virtual cash.</p></div>`}
  </section>`;
}

function historyPanel(state) {
  const account = selectAccount(state);
  const rows = [...account.transactions].reverse().filter((tx) => ui.historyScope === 'all' || tx.symbol === ui.symbol);
  return html`<section class="panel" aria-labelledby="orders-title">
    <div class="panel__head">
      <h2 class="panel__title" id="orders-title">Simulated order history</h2>
      ${segmented({ items: [{ id: 'symbol', label: ui.symbol }, { id: 'all', label: 'All stocks' }], selected: ui.historyScope, label: 'Show orders for', name: 'scope' })}
    </div>
    <div class="panel__body panel__body--flush">
      ${rows.length
        ? html`<div class="table-wrap"><table class="table table--stack">
            <caption class="sr-only">Simulated orders ${ui.historyScope === 'all' ? 'for all stocks' : `for ${ui.symbol}`}, newest first</caption>
            <thead><tr><th scope="col">When</th><th scope="col">Trade</th><th scope="col">Stock</th><th scope="col" class="num">Shares</th><th scope="col" class="num">Price</th><th scope="col" class="num">Total</th><th scope="col" class="num">Realized P/L</th></tr></thead>
            <tbody>${rows.map(
              (tx) => html`<tr>
                <td data-label="When"><span class="nowrap">Day ${tx.day}</span> <span class="faint nowrap">${formatDate(dateOfDay(tx.day), 'short')}</span></td>
                <td data-label="Trade"><span class="cluster">${sideTag(tx.side)}${tx.example ? exampleTag() : ''}</span></td>
                <td data-label="Stock">${tx.symbol}</td>
                <td data-label="Shares" class="num">${tx.quantity}</td>
                <td data-label="Price" class="num">${money(tx.price)}</td>
                <td data-label="Total" class="num">${money(tx.total)}</td>
                <td data-label="Realized P/L" class="num">${tx.realizedPnl === null ? notApplicable() : change(tx.realizedPnl, null, { amountOnly: true })}</td>
              </tr>`,
            )}</tbody>
          </table></div>`
        : emptyState({
            iconName: 'list',
            title: ui.historyScope === 'all' ? 'No simulated orders yet' : `No simulated orders for ${ui.symbol} yet`,
            text: 'Orders you place with the ticket appear here with their fill price and any realized profit or loss.',
            compact: true,
          })}
    </div>
  </section>`;
}

// ---------------------------------------------------------------------------
// Order ticket

function currentPreview(state) {
  const account = selectAccount(state);
  const valuation = selectValuation(state);
  const quote = state.runtime.quotes[ui.symbol];
  const quantity = parseQuantity(ui.quantity);
  return {
    quote,
    quantity,
    held: positionQuantity(account, ui.symbol),
    preview: previewOrder({
      symbol: ui.symbol,
      side: ui.side,
      quantity,
      price: quote?.price,
      cash: account.cash,
      positionQuantity: positionQuantity(account, ui.symbol),
      equity: valuation.equity,
    }),
  };
}

function ticketShell() {
  return html`<form class="panel ticket" id="ticket" novalidate aria-labelledby="ticket-title">
    <div class="panel__head"><h2 class="panel__title" id="ticket-title">Order ticket</h2>${simulatedPill('Virtual money')}</div>
    <div class="panel__body stack">
      <fieldset class="ticket__side">
        <legend class="sr-only">Buy or sell</legend>
        <div class="seg seg--block seg--strong">
          <label class="seg__opt"><input type="radio" name="side" value="buy" ${ui.side === 'buy' ? 'checked' : ''} /><span class="seg__item">Buy</span></label>
          <label class="seg__opt"><input type="radio" name="side" value="sell" ${ui.side === 'sell' ? 'checked' : ''} /><span class="seg__item">Sell</span></label>
        </div>
      </fieldset>
      <p class="ticket__lede" id="ticket-lede"></p>
      <div class="field">
        <div class="split ticket__qty-head">
          <label class="field__label" for="ticket-qty">Shares</label>
          <button type="button" class="btn btn--ghost btn--sm" data-fill-max></button>
        </div>
        <div class="stepper">
          <button type="button" class="stepper__btn" data-step-qty="-1" aria-label="One share fewer">${icon('minus')}</button>
          <input class="input" id="ticket-qty" name="quantity" type="text" inputmode="numeric" autocomplete="off" value="${ui.quantity}" aria-describedby="ticket-qty-hint ticket-qty-error" />
          <button type="button" class="stepper__btn" data-step-qty="1" aria-label="One share more">${icon('plus')}</button>
        </div>
        <p class="field__hint" id="ticket-qty-hint"></p>
        <div id="ticket-qty-error"></div>
      </div>
      <dl class="kv ticket__summary" id="ticket-summary"></dl>
      <div id="ticket-nudge"></div>
      <button type="submit" class="btn btn--primary btn--block" id="ticket-submit"></button>
      <p class="tiny faint">Simulated market order. No real money moves and nothing is sent to a broker.</p>
    </div>
  </form>`;
}

function paintTicket(root, state, { busy = false } = {}) {
  const form = $('#ticket', root);
  if (!form) return;
  const { quote, quantity, held, preview } = currentPreview(state);
  const quantityError = preview.errors.find((error) => error.field === 'quantity' || error.field === 'price');
  const typed = ui.quantity.trim() !== '';
  const showError = (typed || ui.attempted) && quantityError;

  $('#ticket-lede', form).textContent =
    ui.side === 'buy'
      ? `Buy ${ui.symbol} at the simulated price of ${money(quote?.price)}. Market orders fill immediately at that price.`
      : held > 0
        ? `Sell ${ui.symbol} at the simulated price of ${money(quote?.price)}. You hold ${plural(held, 'share')}.`
        : `You don't hold any ${ui.symbol} to sell.`;

  $('#ticket-qty-hint', form).textContent =
    ui.side === 'buy' ? `Whole shares only. Your cash covers up to ${plural(preview.maxBuy, 'share')}.` : `Whole shares only. You can sell up to ${plural(held, 'share')}.`;
  const fill = $('[data-fill-max]', form);
  fill.textContent = ui.side === 'buy' ? 'Max' : 'All';
  fill.setAttribute('aria-label', ui.side === 'buy' ? `Fill in the most shares your cash covers (${preview.maxBuy})` : `Fill in your full position (${held} shares)`);
  fill.disabled = (ui.side === 'buy' ? preview.maxBuy : held) <= 0;

  const serverError = !showError && ui.serverError?.key === orderKey() ? ui.serverError : null;
  const shownError = showError ? quantityError : serverError;
  const input = $('#ticket-qty', form);
  input.setAttribute('aria-invalid', shownError ? 'true' : 'false');
  render($('#ticket-qty-error', form), shownError ? fieldError('ticket-qty-error-text', shownError.message) : '');

  const validQuantity = Number.isInteger(quantity) && quantity > 0;
  render(
    $('#ticket-summary', form),
    html`<div class="kv__row"><dt class="kv__key">Order type</dt><dd class="kv__val">Market</dd></div>
      <div class="kv__row"><dt class="kv__key">Simulated price</dt><dd class="kv__val">${money(quote?.price)}</dd></div>
      <div class="kv__row kv__row--total"><dt class="kv__key">Estimated order value</dt><dd class="kv__val">${validQuantity ? money(preview.total) : '–'}</dd></div>
      <div class="kv__row"><dt class="kv__key">Virtual cash available</dt><dd class="kv__val">${money(selectAccount(state).cash)}</dd></div>
      <div class="kv__row"><dt class="kv__key">Cash after order</dt><dd class="kv__val">${validQuantity && preview.ok ? money(preview.cashAfter) : '–'}</dd></div>
      <div class="kv__row"><dt class="kv__key">${ui.symbol} shares after order</dt><dd class="kv__val">${validQuantity && preview.ok ? preview.positionAfter : '–'}</dd></div>`,
  );

  let nudge = '';
  if (preview.ok && preview.concentration !== 'ok') {
    const pct = percent(preview.positionShare, { digits: 0 });
    nudge = html`<div class="callout${preview.concentration === 'high' ? ' callout--warn' : ''}">
      ${icon(preview.concentration === 'high' ? 'alert' : 'shield', { className: 'callout__icon' })}
      <div>
        <p class="callout__title">${preview.concentration === 'high' ? 'Large position' : 'Check the position size'}</p>
        <p>After this order, ${ui.symbol} would be about ${pct} of your account. ${preview.concentration === 'high' ? 'One bad day for this stock would move your whole account.' : 'Many traders keep single positions smaller than this.'} <a class="link" href="#/learn/position-sizing">Position sizing lesson</a></p>
      </div>
    </div>`;
  }
  render($('#ticket-nudge', form), nudge);

  const submit = $('#ticket-submit', form);
  submit.textContent = busy ? 'Placing simulated order…' : ui.side === 'buy' ? 'Review buy order' : 'Review sell order';
  submit.disabled = busy || (ui.side === 'sell' && held <= 0);
  form.classList.toggle('is-refreshing', busy);
}

async function reviewAndPlace(root, navigate) {
  const state = getState();
  const { quote, quantity, preview } = currentPreview(state);
  if (!preview.ok) {
    ui.attempted = true;
    paintTicket(root, state);
    $('#ticket-qty', root)?.focus();
    return;
  }
  const verb = ui.side === 'buy' ? 'Buy' : 'Sell';
  const confirmed = await openDialog({
    title: `${verb} ${plural(quantity, 'share')} of ${ui.symbol}?`,
    description: 'Simulated market order with virtual money.',
    body: html`<dl class="kv">
        <div class="kv__row"><dt class="kv__key">Simulated price</dt><dd class="kv__val">${money(quote.price)}</dd></div>
        <div class="kv__row"><dt class="kv__key">Shares</dt><dd class="kv__val">${quantity}</dd></div>
        <div class="kv__row kv__row--total"><dt class="kv__key">${ui.side === 'buy' ? 'Estimated cost' : 'Estimated proceeds'}</dt><dd class="kv__val">${money(preview.total)}</dd></div>
        <div class="kv__row"><dt class="kv__key">Virtual cash after</dt><dd class="kv__val">${money(preview.cashAfter)}</dd></div>
        <div class="kv__row"><dt class="kv__key">${ui.symbol} shares after</dt><dd class="kv__val">${preview.positionAfter}</dd></div>
      </dl>
      <p class="small muted dialog__note">Before confirming, can you say in one sentence why you're making this trade and what would prove you wrong?</p>`,
    actions: [
      { label: 'Cancel', value: false, variant: 'secondary' },
      { label: `Place ${ui.side} order`, value: true, variant: 'primary' },
    ],
    initialFocus: '[data-dialog-action="1"]',
  });
  if (!confirmed) return;

  paintTicket(root, getState(), { busy: true });
  let refocus = false;
  try {
    const transaction = await placeOrder({ symbol: ui.symbol, side: ui.side, quantity });
    const past = transaction.side === 'buy' ? 'Bought' : 'Sold';
    const summaryText = `${past} ${plural(transaction.quantity, 'share')} of ${transaction.symbol} at ${money(transaction.price)} (simulated).`;
    notify({ title: `${past} ${transaction.quantity} ${transaction.symbol}`, body: summaryText, kind: 'order', href: `#/practice/${transaction.symbol}` });
    toast({
      title: 'Simulated order filled',
      body: summaryText,
      tone: 'success',
      duration: 8000,
      action: transaction.side === 'buy' ? { label: 'Write a journal entry', onClick: () => navigate(href('/journal', { new: 1, tx: transaction.id })) } : undefined,
    });
    announce(summaryText);
    ui.attempted = false;
    ui.quantity = '1';
    const input = $('#ticket-qty', root);
    if (input) input.value = ui.quantity;
  } catch (error) {
    if (error instanceof OrderError) {
      // The server's rules disagreed with the preview (prices or cash changed,
      // for example). Show why under Shares, where the learner can fix it.
      ui.serverError = { key: orderKey(), message: error.message };
      refocus = true;
    } else {
      toast({ title: 'Order not placed', body: error.message || 'Something went wrong. Try again.', tone: 'error' });
    }
  } finally {
    paintTicket(root, getState());
    if (refocus) $('#ticket-qty', root)?.focus();
  }
}

// ---------------------------------------------------------------------------

export default {
  id: 'practice',
  mount(root, ctx) {
    const disposer = createDisposer();
    const state = getState();
    ui.range = ui.range || state.preferences.defaultRange || '3M';
    ui.style = ui.style || state.preferences.chartStyle || 'line';

    let chart = null;
    let history = null;
    let request = 0;

    const resolveSymbol = (params) => {
      const fromRoute = params.symbol ? String(params.symbol).toUpperCase() : null;
      if (fromRoute && selectInstrument(fromRoute, getState())) return fromRoute;
      if (ui.symbol && selectInstrument(ui.symbol, getState())) return ui.symbol;
      return getState().watchlist.find((symbol) => selectInstrument(symbol, getState())) || getState().runtime.instruments[0]?.symbol;
    };

    const unknownSymbol = ctx.params.symbol && !selectInstrument(String(ctx.params.symbol).toUpperCase(), state);
    ui.symbol = resolveSymbol(ctx.params);

    render(
      root,
      html`<div class="page practice">
        <div id="p-simbar"></div>
        ${unknownSymbol ? html`<div class="callout callout--warn" role="alert">${icon('alert', { className: 'callout__icon' })}<div><p class="callout__title">No simulated stock called "${String(ctx.params.symbol)}"</p><p>Showing ${ui.symbol} instead. TradeLab only lists its eight fictional instruments.</p></div></div>` : ''}
        <div class="trade-layout">
          <aside class="panel trade-list" aria-label="Simulated stocks" id="p-list"></aside>
          <div class="trade-quote" id="p-quote"></div>
          <div class="trade-ticket">${ticketShell()}</div>
          <div class="trade-position" id="p-position"></div>
          <div class="trade-history" id="p-history"></div>
        </div>
      </div>`,
    );

    disposer.add(mountSimBar($('#p-simbar', root)));

    const paintList = () => {
      const focused = document.activeElement?.dataset?.picker === 'search' && root.contains(document.activeElement);
      render($('#p-list', root), instrumentList(getState(), { idPrefix: 'p-list' }));
      if (focused) {
        const input = $('#p-list [data-picker="search"]', root);
        input?.focus();
        input?.setSelectionRange(input.value.length, input.value.length);
      }
    };

    const paintRangeChange = () => {
      const target = $('#p-range-change', root);
      if (!target || !history) return;
      const last = history.points.at(-1)?.c;
      const delta = last - history.reference;
      const range = RANGES.find((r) => r.id === ui.range);
      render(target, html`${change(delta, delta / history.reference)}<span class="muted">${range?.description}</span>`);
    };

    const loadChart = async () => {
      const container = $('#p-chart', root);
      if (!container) return;
      const id = ++request;
      container.classList.add('is-refreshing');
      const next = await getHistory(ui.symbol, ui.range);
      if (id !== request) return;
      history = next;
      container.classList.remove('is-refreshing');
      const range = RANGES.find((r) => r.id === ui.range);
      const label = describeHistory(ui.symbol, history, range?.description || ui.range);
      if (chart) chart.update(history, ui.style, label);
      else chart = createPriceChart(container, { history, style: ui.style, label });
      paintRangeChange();
      const details = $('#p-chart-data', root);
      if (details?.open) fillDataTable(details, historyColumns(history.interval), [...history.points].reverse());
    };

    const paintQuote = () => {
      chart?.destroy();
      chart = null;
      render($('#p-quote', root), quotePanel(getState()));
      loadChart();
    };
    const paintPosition = () => render($('#p-position', root), positionPanel(getState()));
    const paintHistory = () => render($('#p-history', root), historyPanel(getState()));

    paintList();
    paintQuote();
    paintPosition();
    paintHistory();
    paintTicket(root, getState());
    disposer.add(() => chart?.destroy());

    // --- Stock list and picker -------------------------------------------
    const onPickerInput = (event) => {
      if (event.target.dataset.picker !== 'search') return;
      ui.search = event.target.value;
      const scope = event.target.closest('.picker');
      if (scope?.closest('dialog')) renderPickerDialog(scope.closest('dialog'));
      else paintList();
    };
    root.addEventListener('input', onPickerInput);
    disposer.add(() => root.removeEventListener('input', onPickerInput));

    disposer.add(
      on(root, 'click', '[data-list]', (_event, button) => {
        ui.list = button.dataset.list;
        paintList();
      }),
    );
    disposer.add(
      on(root, 'click', '[data-action="show-all"]', () => {
        ui.list = 'all';
        paintList();
      }),
    );

    const toggleStar = (symbol) => {
      const watching = getState().watchlist.includes(symbol);
      updateSlice('watchlist', (list) => (watching ? list.filter((item) => item !== symbol) : [...list, symbol]), 'watchlist/toggle');
      announce(watching ? `${symbol} removed from your watchlist.` : `${symbol} added to your watchlist.`);
    };
    disposer.add(on(root, 'click', '[data-star]', (_event, button) => toggleStar(button.dataset.star)));

    let pickerDialog = null;
    const renderPickerDialog = (dialog) => {
      const body = dialog.querySelector('.dialog__body');
      const focused = document.activeElement?.dataset?.picker === 'search';
      render(body, instrumentList(getState(), { idPrefix: 'p-dialog' }));
      if (focused) {
        const input = body.querySelector('[data-picker="search"]');
        input?.focus();
        input?.setSelectionRange(input.value.length, input.value.length);
      }
    };

    disposer.add(
      on(root, 'click', '[data-action="open-picker"]', () => {
        openDialog({
          title: 'Choose a simulated stock',
          className: 'dialog--sheet picker-dialog',
          body: instrumentList(getState(), { idPrefix: 'p-dialog' }),
          initialFocus: '[data-picker="search"]',
          onMount(dialog, close) {
            pickerDialog = dialog;
            const offs = [
              on(dialog, 'input', '[data-picker="search"]', (event) => {
                ui.search = event.target.value;
                renderPickerDialog(dialog);
              }),
              on(dialog, 'click', '[data-list]', (_event, button) => {
                ui.list = button.dataset.list;
                renderPickerDialog(dialog);
              }),
              on(dialog, 'click', '[data-action="show-all"]', () => {
                ui.list = 'all';
                renderPickerDialog(dialog);
              }),
              on(dialog, 'click', '[data-star]', (_event, button) => {
                toggleStar(button.dataset.star);
                renderPickerDialog(dialog);
              }),
              on(dialog, 'click', '.picker__main', () => close(true)),
            ];
            return () => {
              pickerDialog = null;
              offs.forEach((off) => off());
            };
          },
        });
      }),
    );
    disposer.add(() => pickerDialog?.close());

    // --- Chart controls --------------------------------------------------
    disposer.add(
      on(root, 'click', '[data-range]', (_event, button) => {
        ui.range = button.dataset.range;
        for (const item of root.querySelectorAll('[data-range]')) item.setAttribute('aria-pressed', String(item === button));
        loadChart();
      }),
    );
    disposer.add(
      on(root, 'click', '[data-style]', (_event, button) => {
        ui.style = button.dataset.style;
        for (const item of root.querySelectorAll('[data-style]')) item.setAttribute('aria-pressed', String(item === button));
        loadChart();
      }),
    );
    disposer.add(
      on(root, 'toggle', '#p-chart-data', (event) => {
        if (event.target.open && history) fillDataTable(event.target, historyColumns(history.interval), [...history.points].reverse());
      }, true),
    );
    disposer.add(
      on(root, 'click', '[data-scope]', (_event, button) => {
        ui.historyScope = button.dataset.scope;
        paintHistory();
      }),
    );

    // --- Order ticket ----------------------------------------------------
    disposer.add(
      on(root, 'change', 'input[name="side"]', (event) => {
        ui.side = event.target.value;
        paintTicket(root, getState());
      }),
    );
    disposer.add(
      on(root, 'input', '#ticket-qty', (event) => {
        ui.quantity = event.target.value;
        paintTicket(root, getState());
      }),
    );
    disposer.add(
      on(root, 'click', '[data-step-qty]', (_event, button) => {
        const current = parseQuantity(ui.quantity);
        const base = Number.isInteger(current) ? current : 0;
        ui.quantity = String(Math.max(1, base + Number(button.dataset.stepQty)));
        $('#ticket-qty', root).value = ui.quantity;
        paintTicket(root, getState());
      }),
    );
    disposer.add(
      on(root, 'click', '[data-fill-max]', () => {
        const { preview, held } = currentPreview(getState());
        const max = ui.side === 'buy' ? preview.maxBuy : held;
        if (max <= 0) return;
        ui.quantity = String(max);
        $('#ticket-qty', root).value = ui.quantity;
        paintTicket(root, getState());
      }),
    );
    disposer.add(
      on(root, 'submit', '#ticket', (event) => {
        event.preventDefault();
        reviewAndPlace(root, ctx.navigate);
      }),
    );

    // --- Store updates ---------------------------------------------------
    disposer.add(
      watch((s) => s.runtime.quotes, () => {
        paintList();
        render($('#p-quote', root), quotePanel(getState()));
        chart?.destroy();
        chart = null;
        loadChart();
        paintPosition();
        paintTicket(root, getState());
      }),
    );
    disposer.add(
      watch((s) => s.account, () => {
        paintPosition();
        paintHistory();
        paintTicket(root, getState());
      }),
    );
    disposer.add(
      watch((s) => s.watchlist, () => {
        paintList();
        const button = $('#p-quote .quote-head__price [data-star]', root);
        if (button) {
          const starred = getState().watchlist.includes(ui.symbol);
          button.setAttribute('aria-pressed', String(starred));
          render(button, html`${icon(starred ? 'star-filled' : 'star')}${starred ? 'On watchlist' : 'Add to watchlist'}`);
        }
      }),
    );

    return {
      cleanup: () => disposer.dispose(),
      update(next) {
        const symbol = resolveSymbol(next.params);
        if (symbol === ui.symbol) return;
        ui.symbol = symbol;
        paintList();
        paintQuote();
        paintPosition();
        paintHistory();
        paintTicket(root, getState());
        $('#quote-symbol', root)?.setAttribute('tabindex', '-1');
        $('#quote-symbol', root)?.focus({ preventScroll: true });
      },
    };
  },
};
