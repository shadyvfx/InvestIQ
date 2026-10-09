// Portfolio: everything derived from the simulated ledger. Cash, holdings,
// allocation, account value over time and the full transaction history.

import { html, render, on, createDisposer, $ } from '../utils/dom.js';
import { getState, watch, selectAccount, selectValuation, selectInstrument } from '../state.js';
import { money, percent, formatDate, plural } from '../utils/format.js';
import { icon } from '../components/icons.js';
import { change, simulatedPill, exampleTag, sideTag, emptyState, segmented, symbolCell, notApplicable } from '../components/ui.js';
import { createPerformanceChart, createAllocationChart, allocationHeight, dataTableToggle, fillDataTable } from '../components/charts.js';
import { mountSimBar } from '../components/simBar.js';
import { toast } from '../components/notifications.js';
import { allocation } from '../core/portfolio.js';
import { CONCENTRATION } from '../core/orders.js';
import { dateOfDay, advanceMarket } from '../services/marketDataService.js';
import { getPerformance } from '../services/tradingService.js';

const ui = { allocationBy: 'holding', txFilter: 'all', txSymbol: 'all', txLimit: 15 };

function summary(state) {
  const v = selectValuation(state);
  return html`<section class="stats stats--6" aria-label="Simulated account summary">
    <div class="stat"><p class="stat__label"><span class="hatch" aria-hidden="true"></span>Total value</p><p class="stat__value stat__value--md figure">${money(v.equity)}</p><p class="stat__sub">Cash plus holdings</p></div>
    <div class="stat"><p class="stat__label"><span class="hatch" aria-hidden="true"></span>Virtual cash</p><p class="stat__value stat__value--md figure">${money(v.cash)}</p><p class="stat__sub">${percent(v.cashWeight, { digits: 1 })} of the account</p></div>
    <div class="stat"><p class="stat__label">Holdings value</p><p class="stat__value stat__value--md figure">${money(v.holdingsValue)}</p><p class="stat__sub">${plural(v.positions.length, 'position')}</p></div>
    <div class="stat"><p class="stat__label">Unrealized P/L</p><p class="stat__value stat__value--md figure">${change(v.unrealizedPnl, null, { amountOnly: true, className: 'chg--figure' })}</p><p class="stat__sub">On shares you still hold</p></div>
    <div class="stat"><p class="stat__label">Realized P/L</p><p class="stat__value stat__value--md figure">${change(v.realizedPnl, null, { amountOnly: true, className: 'chg--figure' })}</p><p class="stat__sub">Locked in by selling</p></div>
    <div class="stat"><p class="stat__label">Total return</p><p class="stat__value stat__value--md figure">${change(v.totalReturn, v.totalReturnPct, { pctOnly: true, className: 'chg--figure' })}</p><p class="stat__sub">${money(v.totalReturn, { sign: true })} since starting with ${money(state.account.startingCash)}</p></div>
  </section>`;
}

function performancePanel() {
  return html`<section class="panel" aria-labelledby="perf-title">
    <div class="panel__head">
      <div><h2 class="panel__title" id="perf-title">Account value</h2><p class="panel__subtitle">Value at each simulated day's close since the account opened</p></div>
      ${simulatedPill()}
    </div>
    <div class="panel__body" id="perf-body"></div>
  </section>`;
}

function allocationPanel() {
  return html`<section class="panel" aria-labelledby="alloc-title">
    <div class="panel__head">
      <div><h2 class="panel__title" id="alloc-title">Allocation</h2><p class="panel__subtitle">Share of total account value</p></div>
      ${segmented({ items: [{ id: 'holding', label: 'By holding' }, { id: 'sector', label: 'By sector' }], selected: ui.allocationBy, label: 'Group allocation', name: 'alloc' })}
    </div>
    <div class="panel__body" id="alloc-body"></div>
  </section>`;
}

function holdingsPanel(state) {
  const v = selectValuation(state);
  return html`<section class="panel" aria-labelledby="holdings-title">
    <div class="panel__head"><h2 class="panel__title" id="holdings-title">Holdings</h2><span class="small muted">Valued at simulated day ${state.market.day} closing prices</span></div>
    <div class="panel__body panel__body--flush">
      ${v.positions.length
        ? html`<div class="table-wrap"><table class="table table--stack holdings-table">
            <caption class="sr-only">Simulated holdings with cost, value and unrealized profit or loss</caption>
            <thead><tr>
              <th scope="col">Stock</th><th scope="col" class="num">Shares</th><th scope="col" class="num">Average cost</th><th scope="col" class="num">Current price</th>
              <th scope="col" class="num">Market value</th><th scope="col" class="num">Unrealized P/L</th><th scope="col" class="num">Weight</th><th scope="col"><span class="sr-only">Actions</span></th>
            </tr></thead>
            <tbody>${v.positions.map((row) => {
              const instrument = selectInstrument(row.symbol, state);
              return html`<tr>
                <td data-label="Stock">${symbolCell(row.symbol, instrument?.name)}</td>
                <td data-label="Shares" class="num">${row.quantity}</td>
                <td data-label="Average cost" class="num">${money(row.averageCost)}</td>
                <td data-label="Current price" class="num">${money(row.price)}</td>
                <td data-label="Market value" class="num">${money(row.marketValue)}</td>
                <td data-label="Unrealized P/L" class="num">${change(row.unrealizedPnl, row.unrealizedPct)}</td>
                <td data-label="Weight" class="num">${percent(row.weight, { digits: 1 })}${row.weight >= CONCENTRATION.high ? html` <span class="pill pill--warn" title="A large share of the account">Large</span>` : ''}</td>
                <td data-label="Actions" class="cell-actions"><a class="btn btn--secondary btn--sm" href="#/practice/${row.symbol}">Trade<span class="sr-only"> ${row.symbol}</span></a></td>
              </tr>`;
            })}</tbody>
          </table></div>`
        : emptyState({
            iconName: 'portfolio',
            title: 'No simulated holdings',
            text: `Your account is all virtual cash: ${money(v.cash)}. Buy a stock or the TLMX index fund on the practice desk, then come back to see allocation and profit or loss.`,
            actions: [
              { label: 'Open Practice Trading', href: '#/practice', variant: 'primary' },
              { label: 'Learn about diversification', href: '#/learn/diversification-basics' },
            ],
          })}
    </div>
  </section>`;
}

function transactionsPanel(state) {
  const account = selectAccount(state);
  const symbols = [...new Set(account.transactions.map((tx) => tx.symbol))].sort();
  const rows = [...account.transactions]
    .reverse()
    .filter((tx) => (ui.txFilter === 'all' || tx.side === ui.txFilter) && (ui.txSymbol === 'all' || tx.symbol === ui.txSymbol));
  const shown = rows.slice(0, ui.txLimit);
  return html`<section class="panel" aria-labelledby="tx-title" id="transactions">
    <div class="panel__head">
      <h2 class="panel__title" id="tx-title">Transaction history</h2>
      <div class="panel__actions">
        ${segmented({ items: [{ id: 'all', label: 'All' }, { id: 'buy', label: 'Buys' }, { id: 'sell', label: 'Sells' }], selected: ui.txFilter, label: 'Filter by side', name: 'txfilter' })}
        <div class="select-wrap"><label class="sr-only" for="tx-symbol">Filter by stock</label><select class="select select--sm" id="tx-symbol">
          <option value="all">All stocks</option>
          ${symbols.map((symbol) => html`<option value="${symbol}" ${ui.txSymbol === symbol ? 'selected' : ''}>${symbol}</option>`)}
        </select></div>
      </div>
    </div>
    <div class="panel__body panel__body--flush">
      ${shown.length
        ? html`<div class="table-wrap"><table class="table table--stack">
            <caption class="sr-only">Simulated transactions, newest first</caption>
            <thead><tr><th scope="col">When</th><th scope="col">Trade</th><th scope="col">Stock</th><th scope="col" class="num">Shares</th><th scope="col" class="num">Price</th><th scope="col" class="num">Total</th><th scope="col" class="num">Realized P/L</th></tr></thead>
            <tbody>${shown.map(
              (tx) => html`<tr>
                <td data-label="When"><span class="nowrap">Day ${tx.day}</span> <span class="faint nowrap">${formatDate(dateOfDay(tx.day), 'medium')}</span></td>
                <td data-label="Trade"><span class="cluster">${sideTag(tx.side)}${tx.example ? exampleTag() : ''}</span></td>
                <td data-label="Stock"><a class="link" href="#/practice/${tx.symbol}">${tx.symbol}</a></td>
                <td data-label="Shares" class="num">${tx.quantity}</td>
                <td data-label="Price" class="num">${money(tx.price)}</td>
                <td data-label="Total" class="num">${money(tx.total)}</td>
                <td data-label="Realized P/L" class="num">${tx.realizedPnl === null ? notApplicable() : change(tx.realizedPnl, null, { amountOnly: true })}</td>
              </tr>`,
            )}</tbody>
          </table></div>
          ${rows.length > shown.length ? html`<div class="panel__foot"><span>Showing ${shown.length} of ${rows.length}</span><button type="button" class="btn btn--secondary btn--sm" data-action="more-tx">Show ${Math.min(15, rows.length - shown.length)} more</button></div>` : ''}`
        : account.transactions.length
          ? emptyState({ iconName: 'search', title: 'No transactions match these filters', actions: [{ label: 'Show all transactions', action: 'reset-tx' }], compact: true })
          : emptyState({ iconName: 'list', title: 'No simulated transactions yet', text: 'Every simulated buy and sell is recorded here with its price and any realized profit or loss.', compact: true })}
    </div>
  </section>`;
}

export default {
  id: 'portfolio',
  mount(root) {
    const disposer = createDisposer();
    render(
      root,
      html`<div class="page portfolio">
        <div id="pf-simbar"></div>
        <div id="pf-summary"></div>
        <div class="grid">
          <div class="span-8 pf-perf">${performancePanel()}</div>
          <div class="span-4 pf-alloc">${allocationPanel()}</div>
        </div>
        <div id="pf-holdings"></div>
        <div id="pf-transactions"></div>
      </div>`,
    );
    disposer.add(mountSimBar($('#pf-simbar', root)));

    let perfChart = null;
    let allocChart = null;
    let perfPoints = [];
    let perfRequest = 0;

    const paintSummary = () => render($('#pf-summary', root), summary(getState()));
    const paintHoldings = () => render($('#pf-holdings', root), holdingsPanel(getState()));
    const paintTransactions = () => render($('#pf-transactions', root), transactionsPanel(getState()));

    const loadPerformance = async () => {
      const id = ++perfRequest;
      const { points } = await getPerformance();
      if (id !== perfRequest) return;
      perfPoints = points;
      const body = $('#perf-body', root);
      const startingCash = getState().account.startingCash;
      if (points.length < 2) {
        perfChart?.destroy();
        perfChart = null;
        render(
          body,
          emptyState({
            iconName: 'trend',
            title: 'Not enough simulated days yet',
            text: `Your account opened at ${money(startingCash)} on simulated day 0. Advance the simulated market to see how its value changes over time.`,
            actions: [{ label: 'Advance 1 day', action: 'advance-1' }],
            compact: true,
          }),
        );
        return;
      }
      const last = points.at(-1);
      const label = `Simulated account value over ${plural(points.length, 'day')}: from ${money(points[0].equity)} to ${money(last.equity)}, against a starting balance of ${money(startingCash)}.`;
      if (!perfChart) {
        render(
          body,
          html`<div class="chart" id="perf-chart"></div>
            <div class="chart-foot">
              <p class="chart-caption">The flat line marks your starting balance of ${money(startingCash)}. Shading shows whether the account is above or below it.</p>
              ${dataTableToggle({ id: 'perf-data', summary: 'Show values as a table', caption: 'Simulated account value by day' })}
            </div>`,
        );
        perfChart = createPerformanceChart($('#perf-chart', root), { points, baseline: startingCash, label });
      } else {
        perfChart.update(points, startingCash, label);
      }
      const details = $('#perf-data', root);
      if (details?.open) fillPerfTable(details);
    };

    const fillPerfTable = (details) =>
      fillDataTable(
        details,
        [
          { label: 'Simulated day', value: (p) => `Day ${p.day}, ${formatDate(p.date, 'medium')}` },
          { label: 'Account value', numeric: true, value: (p) => money(p.equity) },
        ],
        [...perfPoints].reverse(),
      );

    const paintAllocation = () => {
      const state = getState();
      const valuation = selectValuation(state);
      const body = $('#alloc-body', root);
      if (!valuation.positions.length) {
        allocChart?.destroy();
        allocChart = null;
        render(body, emptyState({ iconName: 'portfolio', title: 'All cash', text: `100% of your account is virtual cash. Allocation appears once you hold a position.`, compact: true }));
        return;
      }
      const rows =
        ui.allocationBy === 'sector'
          ? allocation(valuation, (row) => selectInstrument(row.symbol, state)?.sector || 'Other')
          : allocation(valuation, (row) => row.symbol);
      const top = valuation.positions[0];
      const label = `Allocation ${ui.allocationBy === 'sector' ? 'by sector' : 'by holding'}: ${rows.map((row) => `${row.label} ${percent(row.weight, { digits: 1 })}`).join(', ')}.`;
      if (!allocChart) {
        render(
          body,
          html`<div class="chart" id="alloc-chart" style="height: ${allocationHeight(rows.length)}px"></div>
            <div id="alloc-note"></div>
            <div class="chart-foot">${dataTableToggle({ id: 'alloc-data', summary: 'Show allocation as a table', caption: 'Allocation of the simulated account' })}</div>`,
        );
        allocChart = createAllocationChart($('#alloc-chart', root), { rows, label });
      } else {
        $('#alloc-chart', root).style.height = `${allocationHeight(rows.length)}px`;
        allocChart.update(rows, label);
      }
      render(
        $('#alloc-note', root),
        top && top.weight >= CONCENTRATION.high
          ? html`<p class="alloc-note">${icon('alert', { size: 14 })}<span>${top.symbol} is ${percent(top.weight, { digits: 0 })} of your account. A big move in one stock would swing the whole portfolio. <a class="link" href="#/learn/diversification-basics">About concentration</a></span></p>`
          : html`<p class="alloc-note muted">${icon('layers', { size: 14 })}<span>Largest position: ${top.symbol} at ${percent(top.weight, { digits: 1 })}.</span></p>`,
      );
      const details = $('#alloc-data', root);
      if (details?.open) fillAllocTable(details, rows);
      currentRows = rows;
    };

    let currentRows = [];
    const fillAllocTable = (details, rows = currentRows) =>
      fillDataTable(
        details,
        [
          { label: ui.allocationBy === 'sector' ? 'Sector' : 'Holding', value: (r) => r.label },
          { label: 'Value', numeric: true, value: (r) => money(r.value) },
          { label: 'Share of account', numeric: true, value: (r) => percent(r.weight, { digits: 1 }) },
        ],
        rows,
      );

    paintSummary();
    paintHoldings();
    paintTransactions();
    paintAllocation();
    loadPerformance();
    disposer.add(() => {
      perfChart?.destroy();
      allocChart?.destroy();
    });

    disposer.add(
      on(root, 'click', '[data-alloc]', (_event, button) => {
        ui.allocationBy = button.dataset.alloc;
        for (const item of root.querySelectorAll('[data-alloc]')) item.setAttribute('aria-pressed', String(item === button));
        allocChart?.destroy();
        allocChart = null;
        paintAllocation();
      }),
    );
    disposer.add(
      on(root, 'toggle', 'details', (event) => {
        if (!event.target.open) return;
        if (event.target.id === 'perf-data') fillPerfTable(event.target);
        if (event.target.id === 'alloc-data') fillAllocTable(event.target);
      }, true),
    );
    disposer.add(
      on(root, 'click', '[data-txfilter]', (_event, button) => {
        ui.txFilter = button.dataset.txfilter;
        ui.txLimit = 15;
        paintTransactions();
      }),
    );
    disposer.add(
      on(root, 'change', '#tx-symbol', (event) => {
        ui.txSymbol = event.target.value;
        ui.txLimit = 15;
        paintTransactions();
        $('#tx-symbol', root)?.focus();
      }),
    );
    disposer.add(
      on(root, 'click', '[data-action="more-tx"]', () => {
        ui.txLimit += 15;
        paintTransactions();
      }),
    );
    disposer.add(
      on(root, 'click', '[data-action="reset-tx"]', () => {
        ui.txFilter = 'all';
        ui.txSymbol = 'all';
        paintTransactions();
      }),
    );
    disposer.add(
      on(root, 'click', '[data-action="advance-1"]', async (_event, button) => {
        button.disabled = true;
        try {
          await advanceMarket(1);
        } catch (error) {
          toast({ title: 'The simulated market could not advance', body: error.message, tone: 'error' });
          button.disabled = false;
        }
      }),
    );

    const refresh = () => {
      paintSummary();
      paintHoldings();
      paintAllocation();
      loadPerformance();
    };
    disposer.add(watch((s) => s.runtime.quotes, refresh));
    disposer.add(
      watch((s) => s.account, () => {
        refresh();
        paintTransactions();
      }),
    );

    return () => disposer.dispose();
  },
};
