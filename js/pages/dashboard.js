// Overview: account snapshot, a price chart, the watchlist, recent simulated
// trades, what to learn next and a way into the tutor.

import { html, render, on, createDisposer, $ } from '../utils/dom.js';
import { getState, watch, updateSlice, selectValuation, selectDayChange, selectAccount, selectInstrument } from '../state.js';
import { money, percent, formatDate, plural } from '../utils/format.js';
import { icon } from '../components/icons.js';
import { change, simulatedPill, exampleTag, sideTag, emptyState, meter, lessonStatus, segmented, symbolCell } from '../components/ui.js';
import { createPriceChart, sparkline, describeHistory } from '../components/charts.js';
import { mountSimBar } from '../components/simBar.js';
import { confirmDialog } from '../components/modals.js';
import { toast } from '../components/notifications.js';
import { getHistory, getSparklines, dateOfDay, RANGES, MARKET_SOURCE } from '../services/marketDataService.js';
import { resetAccount } from '../services/tradingService.js';
import { catalog, overall, suggestions } from '../services/progressService.js';
import { SUGGESTED_QUESTIONS } from '../data/mockTutorResponses.js';
import { href } from '../router.js';

let chartSymbol = null;
let chartRange = null;

function welcomeBanner(state) {
  if (!state.meta.exampleData || state.meta.welcomeDismissed) return '';
  return html`<section class="callout welcome" aria-labelledby="welcome-title">
    ${icon('paper', { className: 'callout__icon' })}
    <div>
      <h2 class="callout__title" id="welcome-title">Welcome to TradeLab</h2>
      <p>This demo account starts with ${money(state.account.startingCash)} in virtual cash and a few trades marked <strong>Example</strong>, so there is something to explore. All prices are simulated and only move when you advance the market. Start with the lessons, or jump into a practice trade.</p>
      <div class="callout__actions">
        <a class="btn btn--primary btn--sm" href="#/learn/what-is-a-stock">Start the first lesson</a>
        <button type="button" class="btn btn--secondary btn--sm" data-action="start-empty">Start with an empty account</button>
        <button type="button" class="btn btn--ghost btn--sm" data-action="dismiss-welcome">Dismiss</button>
      </div>
    </div>
  </section>`;
}

function statsStrip(state) {
  const valuation = selectValuation(state);
  const today = selectDayChange(state);
  const learning = overall(state);
  return html`<section class="stats stats--4" aria-label="Account and learning summary">
    <div class="stat">
      <p class="stat__label"><span class="hatch" aria-hidden="true"></span>Cash balance</p>
      <p class="stat__value figure">${money(valuation.cash)}</p>
      <p class="stat__sub">Virtual cash available to trade</p>
    </div>
    <div class="stat">
      <p class="stat__label"><span class="hatch" aria-hidden="true"></span>Portfolio value</p>
      <p class="stat__value figure">${money(valuation.equity)}</p>
      <p class="stat__sub">${change(valuation.totalReturn, valuation.totalReturnPct)}<span>since the account opened</span></p>
    </div>
    <div class="stat">
      <p class="stat__label"><span class="hatch" aria-hidden="true"></span>Today's simulated P/L</p>
      <p class="stat__value figure">${change(today.amount, today.pct, { amountOnly: true, className: 'chg--figure' })}</p>
      <p class="stat__sub">${percent(today.pct, { sign: true })} on simulated day ${state.market.day}</p>
    </div>
    <div class="stat">
      <p class="stat__label">${icon('learn', { size: 14 })}Learning progress</p>
      <p class="stat__value figure">${learning.completed} <span class="stat__unit">of ${learning.total} lessons</span></p>
      ${meter(learning.ratio, 'Overall learning progress')}
      <p class="stat__sub">${learning.inProgress ? `${plural(learning.inProgress, 'lesson')} in progress` : 'Complete a lesson by passing its knowledge check'}</p>
    </div>
  </section>`;
}

function chartPanelShell(state) {
  const symbols = state.runtime.instruments;
  return html`<section class="panel" aria-labelledby="dash-chart-title">
    <div class="panel__head">
      <div class="chart-title">
        <h2 class="panel__title sr-only" id="dash-chart-title">Price chart</h2>
        <div class="select-wrap select-wrap--inline">
          <label class="sr-only" for="dash-symbol">Stock shown in the chart</label>
          <select class="select select--title" id="dash-symbol">
            ${symbols.map((instrument) => html`<option value="${instrument.symbol}" ${instrument.symbol === chartSymbol ? 'selected' : ''}>${instrument.symbol} ${instrument.name}</option>`)}
          </select>
        </div>
        ${simulatedPill()}
      </div>
      ${segmented({ items: RANGES.map((r) => ({ id: r.id, label: r.label, title: r.description })), selected: chartRange, label: 'Time range', name: 'range' })}
    </div>
    <div class="panel__body">
      <div class="chart-head" id="dash-chart-head"></div>
      <div class="chart" id="dash-chart"></div>
    </div>
    <div class="panel__foot">
      <span class="chart-caption"><span class="hatch" aria-hidden="true"></span>${MARKET_SOURCE.name}: generated prices, not real market data.</span>
      <a class="link" id="dash-trade-link" href="#/practice/${chartSymbol}">Practice trading ${chartSymbol}</a>
    </div>
  </section>`;
}

function chartHead(symbol, history, state) {
  const quote = state.runtime.quotes[symbol];
  const instrument = selectInstrument(symbol, state);
  const last = history.points.at(-1)?.c ?? quote?.price;
  const rangeChange = last - history.reference;
  const range = RANGES.find((r) => r.id === history.range);
  return html`<div>
      <p class="hero-figure figure">${money(last)}</p>
      <p class="chart-head__sub">${change(rangeChange, rangeChange / history.reference)}<span class="muted">${range?.description || ''}</span></p>
    </div>
    <p class="chart-head__meta muted small">${instrument?.sector || ''}${quote ? html`<span class="sep" aria-hidden="true"></span>Closed at ${money(quote.price)} on simulated day ${state.market.day}` : ''}</p>`;
}

function watchlistPanel(state, sparks) {
  const rows = state.watchlist.map((symbol) => ({ symbol, instrument: selectInstrument(symbol, state), quote: state.runtime.quotes[symbol] })).filter((row) => row.instrument);
  return html`<section class="panel" aria-labelledby="dash-watch-title">
    <div class="panel__head">
      <h2 class="panel__title" id="dash-watch-title">Watchlist</h2>
      <a class="link small" href="#/practice">Edit in Practice Trading</a>
    </div>
    <div class="panel__body panel__body--flush">
      ${rows.length
        ? html`<ul class="list watch-list">${rows.map(
            ({ symbol, instrument, quote }) => html`<li class="list__row"><a class="row-link watch-row" href="#/practice/${symbol}">
              ${symbolCell(symbol, instrument.name)}
              <span class="watch-row__spark">${sparkline(sparks?.[symbol])}</span>
              <span class="watch-row__price">
                <span class="num">${money(quote?.price)}</span>
                ${change(quote?.change, quote?.changePct, { pctOnly: true })}
              </span>
            </a></li>`,
          )}</ul>`
        : emptyState({
            iconName: 'star',
            title: 'Your watchlist is empty',
            text: 'Star stocks on the Practice Trading page to follow their simulated prices here.',
            actions: [{ label: 'Browse simulated stocks', href: '#/practice' }],
            compact: true,
          })}
    </div>
    <div class="panel__foot"><span>Sparklines show the last 30 simulated days.</span></div>
  </section>`;
}

function recentTradesPanel(state) {
  const account = selectAccount(state);
  const recent = [...account.transactions].reverse().slice(0, 6);
  return html`<section class="panel" aria-labelledby="dash-trades-title">
    <div class="panel__head">
      <div><h2 class="panel__title" id="dash-trades-title">Recent simulated trades</h2></div>
      ${recent.length ? html`<a class="link small" href="#/portfolio">View all in Portfolio</a>` : ''}
    </div>
    <div class="panel__body panel__body--flush">
      ${recent.length
        ? html`<div class="table-wrap"><table class="table table--stack">
            <caption class="sr-only">Your six most recent simulated trades</caption>
            <thead><tr><th scope="col">Trade</th><th scope="col">Stock</th><th scope="col" class="num">Shares</th><th scope="col" class="num">Price</th><th scope="col" class="num">Total</th><th scope="col">When</th></tr></thead>
            <tbody>${recent.map(
              (tx) => html`<tr>
                <td data-label="Trade"><span class="cluster">${sideTag(tx.side)}${tx.example ? exampleTag() : ''}</span></td>
                <td data-label="Stock"><a class="link" href="#/practice/${tx.symbol}">${tx.symbol}</a></td>
                <td data-label="Shares" class="num">${tx.quantity}</td>
                <td data-label="Price" class="num">${money(tx.price)}</td>
                <td data-label="Total" class="num">${money(tx.total)}</td>
                <td data-label="When"><span class="nowrap">Day ${tx.day}</span> <span class="faint nowrap">${formatDate(dateOfDay(tx.day), 'short')}</span></td>
              </tr>`,
            )}</tbody>
          </table></div>`
        : emptyState({
            iconName: 'practice',
            title: 'No simulated trades yet',
            text: 'Place a practice order with virtual money to see it here. Consider writing down why you are making the trade first.',
            actions: [
              { label: 'Open Practice Trading', href: '#/practice', variant: 'primary' },
              { label: 'Read about order types', href: '#/learn/market-vs-limit-orders' },
            ],
          })}
    </div>
  </section>`;
}

function learningPanel(state) {
  const next = suggestions(3, state);
  const totals = overall(state);
  return html`<section class="panel" aria-labelledby="dash-learn-title">
    <div class="panel__head">
      <h2 class="panel__title" id="dash-learn-title">Suggested lessons</h2>
      <a class="link small" href="#/learn">All lessons</a>
    </div>
    <div class="panel__body panel__body--flush">
      ${next.length
        ? html`<ul class="list">${next.map(({ lesson, progress }) => {
            const category = catalog.getCategory(lesson.categoryId);
            return html`<li class="list__row"><a class="row-link lesson-row" href="#/learn/${lesson.id}">
              <span class="lesson-row__icon">${icon(category?.icon || 'learn')}</span>
              <span class="lesson-row__text">
                <span class="lesson-row__title">${lesson.title}</span>
                <span class="lesson-row__meta">${category?.title}<span class="sep" aria-hidden="true"></span><span class="nowrap">${lesson.minutes} min</span></span>
              </span>
              <span class="lesson-row__status">${lessonStatus(progress.status)}</span>
            </a></li>`;
          })}</ul>`
        : emptyState({ iconName: 'check-circle', title: 'Every lesson is complete', text: 'Review any lesson again or put what you learned into practice.', actions: [{ label: 'Browse lessons', href: '#/learn' }], compact: true })}
    </div>
    <div class="panel__foot"><span>${totals.completed} of ${totals.total} complete. Suggestions follow your ${state.preferences.difficulty} level in Settings.</span></div>
  </section>`;
}

function tutorPanel() {
  const picks = [SUGGESTED_QUESTIONS[3], SUGGESTED_QUESTIONS[0], SUGGESTED_QUESTIONS[2]];
  return html`<section class="panel tutor-card" aria-labelledby="dash-tutor-title">
    <div class="panel__body stack-sm">
      <div class="split">
        <h2 class="panel__title tutor-card__title" id="dash-tutor-title">${icon('tutor', { size: 18 })}Ask TradeLab Tutor</h2>
        <span class="pill">Preview: prewritten answers</span>
      </div>
      <p class="muted small">Get plain-language explanations of trading concepts and a walk-through of your own simulated trades.</p>
      <div class="chip-list">${picks.map((question) => html`<a class="chip" href="${href('/tutor', { ask: question })}">${question}</a>`)}</div>
      <a class="btn btn--primary btn--block" href="#/tutor">${icon('tutor')}Open the tutor</a>
    </div>
  </section>`;
}

export default {
  id: 'overview',
  mount(root) {
    const disposer = createDisposer();
    const state = getState();
    chartSymbol = chartSymbol && selectInstrument(chartSymbol, state) ? chartSymbol : state.watchlist[0] || 'TLMX';
    chartRange = chartRange || state.preferences.defaultRange || '3M';

    render(
      root,
      html`<div class="page dashboard">
        <div id="dash-welcome"></div>
        <div id="dash-simbar"></div>
        <div id="dash-stats"></div>
        <div class="dash-columns">
          <div class="dash-main">
            <div id="dash-chart-panel">${chartPanelShell(state)}</div>
            <div id="dash-trades"></div>
          </div>
          <div class="dash-side">
            <div id="dash-watch"></div>
            <div id="dash-learn"></div>
            ${tutorPanel()}
          </div>
        </div>
      </div>`,
    );

    disposer.add(mountSimBar($('#dash-simbar', root)));

    let chart = null;
    let sparks = null;
    let historyRequest = 0;

    const paintWelcome = () => render($('#dash-welcome', root), welcomeBanner(getState()));
    const paintStats = () => render($('#dash-stats', root), statsStrip(getState()));
    const paintTrades = () => render($('#dash-trades', root), recentTradesPanel(getState()));
    const paintLearning = () => render($('#dash-learn', root), learningPanel(getState()));
    const paintWatch = () => render($('#dash-watch', root), watchlistPanel(getState(), sparks));

    const loadSparks = async () => {
      sparks = await getSparklines(getState().watchlist, 30);
      if (disposer.disposed) return; // the page was left or rebuilt meanwhile
      paintWatch();
    };

    const loadChart = async () => {
      const request = ++historyRequest;
      const container = $('#dash-chart', root);
      container.classList.add('is-refreshing');
      const history = await getHistory(chartSymbol, chartRange);
      if (request !== historyRequest || disposer.disposed) return;
      container.classList.remove('is-refreshing');
      const range = RANGES.find((r) => r.id === chartRange);
      const label = describeHistory(chartSymbol, history, range?.description || chartRange);
      render($('#dash-chart-head', root), chartHead(chartSymbol, history, getState()));
      const style = getState().preferences.chartStyle;
      if (chart) chart.update(history, style, label);
      else chart = createPriceChart(container, { history, style, label });
    };

    paintWelcome();
    paintStats();
    paintTrades();
    paintLearning();
    paintWatch();
    loadSparks();
    loadChart();

    disposer.add(() => chart?.destroy());

    disposer.add(
      on(root, 'change', '#dash-symbol', (event) => {
        chartSymbol = event.target.value;
        const link = $('#dash-trade-link', root);
        link.href = `#/practice/${chartSymbol}`;
        link.textContent = `Practice trading ${chartSymbol}`;
        loadChart();
      }),
    );

    disposer.add(
      on(root, 'click', '[data-range]', (_event, button) => {
        chartRange = button.dataset.range;
        for (const item of root.querySelectorAll('[data-range]')) item.setAttribute('aria-pressed', String(item === button));
        loadChart();
      }),
    );

    disposer.add(
      on(root, 'click', '[data-action="dismiss-welcome"]', () => {
        updateSlice('meta', (meta) => ({ ...meta, welcomeDismissed: true }), 'meta/welcome');
        $('#main')?.focus();
      }),
    );

    disposer.add(
      on(root, 'click', '[data-action="start-empty"]', async () => {
        const confirmed = await confirmDialog({
          title: 'Start with an empty account?',
          message: `The example trades and example journal entries will be removed, and you'll start on simulated day 0 with ${money(getState().account.startingCash)} in virtual cash. Your lesson progress stays.`,
          confirmLabel: 'Start empty account',
          danger: true,
        });
        if (!confirmed) return;
        await resetAccount(getState().account.startingCash);
        updateSlice('meta', (meta) => ({ ...meta, welcomeDismissed: true }), 'meta/welcome');
        toast({ title: 'Empty account ready', body: 'You are on simulated day 0 with virtual cash only.', tone: 'success' });
      }),
    );

    disposer.add(watch((s) => s.meta, paintWelcome));
    disposer.add(
      watch((s) => s.account, () => {
        paintStats();
        paintTrades();
      }),
    );
    disposer.add(
      watch((s) => s.runtime.quotes, () => {
        paintStats();
        loadSparks();
        loadChart();
      }),
    );
    disposer.add(watch((s) => s.learning, () => {
      paintStats();
      paintLearning();
    }));
    disposer.add(watch((s) => s.preferences.difficulty, paintLearning));
    disposer.add(watch((s) => s.preferences.chartStyle, loadChart));
    disposer.add(watch((s) => s.watchlist, loadSparks));

    return () => disposer.dispose();
  },
};
