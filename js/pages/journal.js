// Trading Journal: record the reasoning behind simulated trades, then review
// process before outcome. Entries are created and edited in a dialog.

import { html, render, on, createDisposer, $ } from '../utils/dom.js';
import { getState, watch, selectInstrument } from '../state.js';
import { money, percent, formatDate, relativeTime, plural } from '../utils/format.js';
import { icon } from '../components/icons.js';
import { change, exampleTag, emptyState, segmented, fieldError } from '../components/ui.js';
import { openDialog, confirmDialog } from '../components/modals.js';
import { accountLinks, showAccountGate } from '../components/accountGate.js';
import { toast } from '../components/notifications.js';
import { createEntry, updateEntry, deleteEntry, entryById, ValidationError, GuestLimitError } from '../services/journalService.js';
import { transactionById } from '../services/tradingService.js';
import { dateOfDay } from '../services/marketDataService.js';
import { entryMetrics, journalStats, MIN_CLOSED_FOR_OUTCOMES, PLAN_LABELS, TEXT_LIMIT } from '../core/journal.js';

const ui = { filter: 'all' };
let pendingDraft = null;

const rate = (value) => (value === null ? '–' : percent(value, { digits: 0 }));

function insights(state) {
  const stats = journalStats(state.journal.entries, state.account.transactions);
  return html`<section class="journal-insights" aria-label="Journal insights">
    <div class="stats stats--4">
      <div class="stat">
        <p class="stat__label">${icon('target', { size: 14 })}Planned ahead</p>
        <p class="stat__value stat__value--md figure">${rate(stats.planRate)}</p>
        <p class="stat__sub">${stats.total ? `${stats.planned} of ${plural(stats.total, 'entry', 'entries')} list a thesis, risks and a stop` : 'Entries with a thesis, risks and a stop'}</p>
      </div>
      <div class="stat">
        <p class="stat__label">${icon('check-circle', { size: 14 })}Followed the plan</p>
        <p class="stat__value stat__value--md figure">${rate(stats.followedRate)}</p>
        <p class="stat__sub">${stats.followedAnswered ? `Across ${plural(stats.followedAnswered, 'closed trade')} you rated` : 'Rate this when you close a trade'}</p>
      </div>
      <div class="stat">
        <p class="stat__label">${icon('bulb', { size: 14 })}Reflected afterward</p>
        <p class="stat__value stat__value--md figure">${rate(stats.reflectionRate)}</p>
        <p class="stat__sub">${stats.closed ? `${stats.reflected} of ${plural(stats.closed, 'closed entry', 'closed entries')} record a lesson` : 'Closed entries with a lesson learned'}</p>
      </div>
      <div class="stat">
        <p class="stat__label">${icon('journal', { size: 14 })}Trades journaled</p>
        <p class="stat__value stat__value--md figure">${stats.buys ? `${stats.journaledBuys} of ${stats.buys}` : '–'}</p>
        <p class="stat__sub">Simulated buys linked to an entry</p>
      </div>
    </div>
    <div class="panel outcomes">
      <div class="panel__head panel__head--plain">
        <div><h2 class="panel__title">Outcomes</h2><p class="panel__subtitle">Results of closed entries. A handful of trades says more about luck than skill.</p></div>
      </div>
      <div class="panel__body">
        ${stats.hasOutcomes
          ? html`<dl class="kv kv--grid">
              <div class="kv__row"><dt class="kv__key">Closed entries</dt><dd class="kv__val">${stats.closed}</dd></div>
              <div class="kv__row"><dt class="kv__key">Win rate</dt><dd class="kv__val">${percent(stats.outcomes.winRate, { digits: 0 })}</dd></div>
              <div class="kv__row"><dt class="kv__key">Average return</dt><dd class="kv__val">${change(null, stats.outcomes.averageReturn, { pctOnly: true })}</dd></div>
              <div class="kv__row"><dt class="kv__key">Best and worst</dt><dd class="kv__val">${change(null, stats.outcomes.best, { pctOnly: true })} / ${change(null, stats.outcomes.worst, { pctOnly: true })}</dd></div>
              <div class="kv__row"><dt class="kv__key">Average R multiple</dt><dd class="kv__val">${stats.outcomes.averageR === null ? 'Add stops to see this' : `${stats.outcomes.averageR.toFixed(2)}R`}</dd></div>
            </dl>`
          : html`<p class="muted small">Outcome statistics appear after ${MIN_CLOSED_FOR_OUTCOMES} closed entries (you have ${stats.closed}). Add an exit price to an entry to close it.</p>`}
      </div>
    </div>
  </section>`;
}

function entryCard(entry, state) {
  const metrics = entryMetrics(entry);
  const instrument = selectInstrument(entry.symbol, state);
  const sections = [
    ['Thesis', entry.thesis],
    ['Perceived risks', entry.risks],
    ['Lessons learned', entry.lessons],
  ];
  return html`<li><article class="entry" aria-labelledby="entry-${entry.id}-title">
    <header class="entry__head">
      <div class="entry__id">
        <h3 class="entry__symbol" id="entry-${entry.id}-title">${entry.symbol}<span class="sr-only"> journal entry</span></h3>
        <span class="entry__name truncate">${instrument?.name || ''}</span>
        <span class="pill${metrics.status === 'closed' ? ' pill--solid' : ''}">${metrics.status === 'closed' ? 'Closed' : 'Open'}</span>
        ${entry.example ? exampleTag() : ''}
      </div>
      <div class="entry__actions">
        <button type="button" class="btn btn--ghost btn--sm" data-edit="${entry.id}">${icon('edit')}Edit<span class="sr-only"> ${entry.symbol} entry</span></button>
        <button type="button" class="btn btn--ghost btn--sm" data-delete="${entry.id}">${icon('trash')}Delete<span class="sr-only"> ${entry.symbol} entry</span></button>
      </div>
    </header>
    <dl class="kv kv--grid entry__numbers">
      <div class="kv__row"><dt class="kv__key">Entry</dt><dd class="kv__val">${money(entry.entryPrice)}</dd></div>
      <div class="kv__row"><dt class="kv__key">Exit</dt><dd class="kv__val">${entry.exitPrice ? money(entry.exitPrice) : 'Still open'}</dd></div>
      ${entry.quantity ? html`<div class="kv__row"><dt class="kv__key">Shares</dt><dd class="kv__val">${entry.quantity}</dd></div>` : ''}
      <div class="kv__row"><dt class="kv__key">Planned stop</dt><dd class="kv__val">${entry.stopPrice ? money(entry.stopPrice) : html`<span class="faint">Not set</span>`}</dd></div>
      <div class="kv__row"><dt class="kv__key">Target</dt><dd class="kv__val">${entry.targetPrice ? money(entry.targetPrice) : html`<span class="faint">Not set</span>`}</dd></div>
      <div class="kv__row"><dt class="kv__key">Risk-to-reward</dt><dd class="kv__val">${metrics.plannedRewardToRisk ? `1:${metrics.plannedRewardToRisk.toFixed(1)}` : html`<span class="faint">Needs stop and target</span>`}</dd></div>
      ${metrics.status === 'closed'
        ? html`<div class="kv__row"><dt class="kv__key">Result</dt><dd class="kv__val">${metrics.pnl !== null ? change(metrics.pnl, metrics.returnPct) : change(null, metrics.returnPct, { pctOnly: true })}</dd></div>
            ${metrics.rMultiple !== null ? html`<div class="kv__row"><dt class="kv__key">R multiple</dt><dd class="kv__val">${metrics.rMultiple.toFixed(2)}R</dd></div>` : ''}`
        : ''}
    </dl>
    <div class="entry__text">${sections.map(([title, text]) =>
      text ? html`<div class="entry__section"><h4 class="entry__label">${title}</h4><p class="entry__body">${text}</p></div>` : title === 'Perceived risks' ? html`<div class="entry__section"><h4 class="entry__label">${title}</h4><p class="entry__body faint">No risks written down yet. Naming them before a trade is one of the most useful habits to build.</p></div>` : '',
    )}</div>
    <footer class="entry__foot">
      <span>${entry.entryDay !== undefined ? `Simulated day ${entry.entryDay}, ${formatDate(dateOfDay(entry.entryDay), 'short')}` : ''}</span>
      ${entry.followedPlan ? html`<span>${PLAN_LABELS[entry.followedPlan]}</span>` : ''}
      <span>Updated ${relativeTime(entry.updatedAt)}</span>
    </footer>
  </article></li>`;
}

function entriesPanel(state) {
  const entries = state.journal.entries
    .filter((entry) => ui.filter === 'all' || entryMetrics(entry).status === ui.filter)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return html`<section class="panel" aria-labelledby="entries-title">
    <div class="panel__head">
      <h2 class="panel__title" id="entries-title">Entries</h2>
      ${segmented({ items: [{ id: 'all', label: 'All' }, { id: 'open', label: 'Open' }, { id: 'closed', label: 'Closed' }], selected: ui.filter, label: 'Filter entries', name: 'jfilter' })}
    </div>
    <div class="panel__body">
      ${entries.length
        ? html`<ul class="entry-list">${entries.map((entry) => entryCard(entry, state))}</ul>`
        : state.journal.entries.length
          ? emptyState({ iconName: 'search', title: `No ${ui.filter} entries`, text: ui.filter === 'closed' ? 'An entry closes when you add an exit price.' : 'Every entry here has an exit price.', compact: true })
          : emptyState({
              iconName: 'journal',
              title: 'Your journal is empty',
              text: 'Before your next simulated trade, write down why you are taking it and what would prove you wrong. After you exit, note what you learned.',
              actions: [{ label: 'Write the first entry', action: 'new-entry', variant: 'primary' }],
            })}
    </div>
  </section>`;
}

function guidePanel() {
  return html`<aside class="panel journal-guide" aria-labelledby="guide-title">
    <div class="panel__head panel__head--plain"><h2 class="panel__title" id="guide-title">What makes a useful entry</h2></div>
    <div class="panel__body">
      <ol class="guide-list">
        <li><strong>Why this stock, and why now?</strong> One or two sentences you could defend.</li>
        <li><strong>What would prove you wrong?</strong> That price is your stop.</li>
        <li><strong>How much are you risking?</strong> Shares times the distance to your stop.</li>
        <li><strong>After you exit:</strong> did you follow the plan, and what will you repeat or change?</li>
      </ol>
      <p class="small muted">The insights above score preparation and consistency first. A losing trade that followed a sound plan is still good practice.</p>
      <a class="link small" href="#/learn/trading-psychology">Lesson: Emotions, Bias and Discipline</a>
    </div>
  </aside>`;
}

// ---------------------------------------------------------------------------
// Editor

function editorForm(values, errors, instruments) {
  const err = (field) => (errors[field] ? html` aria-invalid="true" aria-describedby="je-${field}-error"` : '');
  const text = (value) => (value === null || value === undefined ? '' : String(value));
  return html`<form id="journal-form" class="stack" novalidate>
    ${values.transactionId ? html`<p class="callout callout--plain small">${icon('practice', { className: 'callout__icon' })}<span>Linked to your simulated order. Prices and shares were filled in from the fill.</span></p>` : ''}
    <div class="form-grid">
      <div class="field">
        <label class="field__label" for="je-symbol">Stock</label>
        <div class="select-wrap"><select class="select" id="je-symbol" name="symbol"${err('symbol')}>
          <option value="">Choose a stock</option>
          ${instruments.map((instrument) => html`<option value="${instrument.symbol}" ${values.symbol === instrument.symbol ? 'selected' : ''}>${instrument.symbol} ${instrument.name}</option>`)}
        </select></div>
        ${fieldError('je-symbol-error', errors.symbol)}
      </div>
      <div class="field">
        <label class="field__label" for="je-quantity">Shares <span class="optional">optional</span></label>
        <input class="input" id="je-quantity" name="quantity" type="text" inputmode="numeric" value="${text(values.quantity)}"${err('quantity')} />
        ${fieldError('je-quantity-error', errors.quantity)}
      </div>
      <div class="field">
        <label class="field__label" for="je-entryPrice">Entry price</label>
        <div class="input-affix"><span class="input-affix__prefix">$</span><input class="input" id="je-entryPrice" name="entryPrice" type="text" inputmode="decimal" value="${text(values.entryPrice)}"${err('entryPrice')} /></div>
        ${fieldError('je-entryPrice-error', errors.entryPrice)}
      </div>
      <div class="field">
        <label class="field__label" for="je-exitPrice">Exit price <span class="optional">leave empty while open</span></label>
        <div class="input-affix"><span class="input-affix__prefix">$</span><input class="input" id="je-exitPrice" name="exitPrice" type="text" inputmode="decimal" value="${text(values.exitPrice)}"${err('exitPrice')} /></div>
        ${fieldError('je-exitPrice-error', errors.exitPrice)}
      </div>
      <div class="field">
        <label class="field__label" for="je-stopPrice">Planned stop <span class="optional">optional</span></label>
        <div class="input-affix"><span class="input-affix__prefix">$</span><input class="input" id="je-stopPrice" name="stopPrice" type="text" inputmode="decimal" value="${text(values.stopPrice)}"${err('stopPrice')} /></div>
        ${errors.stopPrice ? fieldError('je-stopPrice-error', errors.stopPrice) : html`<p class="field__hint">Where the idea is proven wrong.</p>`}
      </div>
      <div class="field">
        <label class="field__label" for="je-targetPrice">Target <span class="optional">optional</span></label>
        <div class="input-affix"><span class="input-affix__prefix">$</span><input class="input" id="je-targetPrice" name="targetPrice" type="text" inputmode="decimal" value="${text(values.targetPrice)}"${err('targetPrice')} /></div>
        ${fieldError('je-targetPrice-error', errors.targetPrice)}
      </div>
    </div>
    <div class="field">
      <label class="field__label" for="je-thesis">Trade thesis</label>
      <textarea class="textarea" id="je-thesis" name="thesis" rows="3" maxlength="${TEXT_LIMIT}" placeholder="Why this stock, and why now?"${err('thesis')}>${text(values.thesis)}</textarea>
      ${fieldError('je-thesis-error', errors.thesis)}
    </div>
    <div class="field">
      <label class="field__label" for="je-risks">Perceived risks</label>
      <textarea class="textarea" id="je-risks" name="risks" rows="3" maxlength="${TEXT_LIMIT}" placeholder="What could go wrong? What would make you exit?"${err('risks')}>${text(values.risks)}</textarea>
      ${errors.risks ? fieldError('je-risks-error', errors.risks) : html`<p class="field__hint">Optional, but entries with risks and a stop count as planned ahead.</p>`}
    </div>
    <div class="field">
      <label class="field__label" for="je-lessons">Lessons learned <span class="optional">optional</span></label>
      <textarea class="textarea" id="je-lessons" name="lessons" rows="3" maxlength="${TEXT_LIMIT}" placeholder="After the trade: what happened, and what would you repeat or change?"${err('lessons')}>${text(values.lessons)}</textarea>
      ${fieldError('je-lessons-error', errors.lessons)}
    </div>
    <fieldset class="field">
      <legend class="field__label">Did you follow your plan? <span class="optional">for closed trades</span></legend>
      <div class="seg">
        ${[['', 'Not yet'], ['yes', 'Yes'], ['partly', 'Partly'], ['no', 'No']].map(
          ([value, label]) => html`<label class="seg__opt"><input type="radio" name="followedPlan" value="${value}" ${(values.followedPlan || '') === value ? 'checked' : ''} /><span class="seg__item">${label}</span></label>`,
        )}
      </div>
    </fieldset>
  </form>`;
}

function readForm(form) {
  const data = new FormData(form);
  return Object.fromEntries(['symbol', 'quantity', 'entryPrice', 'exitPrice', 'stopPrice', 'targetPrice', 'thesis', 'risks', 'lessons', 'followedPlan'].map((key) => [key, data.get(key) ?? '']));
}

async function openEditor({ entry = null, prefill = {} } = {}) {
  const instruments = getState().runtime.instruments;
  let values = entry ? { ...entry } : { followedPlan: '', ...prefill };
  const editing = Boolean(entry);

  return openDialog({
    title: editing ? `Edit ${entry.symbol} entry` : 'New journal entry',
    description: 'Write it for your future self. Plain sentences are fine.',
    size: 'wide',
    body: editorForm(values, {}, instruments),
    actions: [
      { label: 'Cancel', value: null, variant: 'secondary' },
      { label: editing ? 'Save changes' : 'Save entry', type: 'submit', form: 'journal-form', variant: 'primary' },
    ],
    initialFocus: editing ? '#je-thesis' : values.symbol ? '#je-thesis' : '#je-symbol',
    onMount(dialog, close) {
      let saving = false;
      const onSubmit = async (event) => {
        event.preventDefault();
        if (saving) return;
        const form = dialog.querySelector('#journal-form');
        values = { ...values, ...readForm(form) };
        saving = true;
        const submit = dialog.querySelector('[type="submit"]');
        submit.disabled = true;
        try {
          const saved = editing ? await updateEntry(entry.id, values) : await createEntry(values, { transactionId: values.transactionId });
          close(saved);
        } catch (error) {
          if (error instanceof ValidationError) {
            const body = dialog.querySelector('.dialog__body');
            render(body, editorForm(values, error.errors, instruments));
            const first = Object.keys(error.errors)[0];
            body.querySelector(`#je-${first}`)?.focus();
          } else if (error instanceof GuestLimitError) {
            pendingDraft = values;
            close(null);
            showAccountGate({
              title: 'Guest journal limit reached',
              message: "You've reached the guest journal limit. Create an account to add more entries. Your draft will reopen after you sign in.",
              returnTo: '/journal?new=1',
            });
          } else {
            toast({ title: 'The entry could not be saved', body: error.message, tone: 'error' });
          }
        } finally {
          saving = false;
          submit.disabled = false;
        }
      };
      dialog.addEventListener('submit', onSubmit);
      return () => dialog.removeEventListener('submit', onSubmit);
    },
  });
}

function clearQuery() {
  try {
    if (window.location.hash !== '#/journal') window.history.replaceState(null, '', '#/journal');
  } catch {
    // Ignored: some embedded viewers block history updates.
  }
}

export default {
  id: 'journal',
  mount(root, { query }) {
    const disposer = createDisposer();
    const guest = getState().runtime.userStatus !== 'signed-in';
    render(
      root,
      html`<div class="page journal">
        <div class="page-intro">
          <div class="page-intro__text">
            <h2 class="page-intro__title">Write down the why</h2>
            <p>Record the reasoning behind each simulated trade, then review it once the trade is over. TradeLab scores planning and consistency first, and only shows outcome numbers once there are enough closed trades.</p>
            <div id="journal-guest-allowance"></div>
          </div>
          <button type="button" class="btn btn--primary" data-action="new-entry">${icon('plus')}New entry</button>
        </div>
        <div id="journal-insights"></div>
        <div class="journal-columns">
          <div id="journal-entries"></div>
          ${guidePanel()}
        </div>
      </div>`,
    );

    const paintGuestAllowance = () => {
      if (!guest) return;
      const remaining = getState().runtime.guestLimits?.journalEntriesRemaining;
      render(
        $('#journal-guest-allowance', root),
        html`<p class="small muted">Guest allowance: ${Number.isInteger(remaining) ? `${remaining} of 2 entries available` : '2 entries available'}. Deleting an entry does not restore an allowance.</p>
          ${remaining === 0
            ? html`<div class="callout callout--warn" role="status"><div>
                <p class="callout__title">You've reached the guest journal limit. Create an account to add more entries.</p>
                ${accountLinks(pendingDraft ? '/journal?new=1' : '/journal')}
              </div></div>`
            : ''}`,
      );
    };
    paintGuestAllowance();

    const paintInsights = () => render($('#journal-insights', root), insights(getState()));
    const paintEntries = () => render($('#journal-entries', root), entriesPanel(getState()));
    paintInsights();
    paintEntries();

    const startNew = async (prefill = {}) => {
      if (guest && getState().runtime.guestLimits?.journalEntriesRemaining === 0) {
        await showAccountGate({
          title: 'Guest journal limit reached',
          message: "You've reached the guest journal limit. Create an account to add more entries.",
          returnTo: '/journal',
        });
        return;
      }
      const saved = await openEditor({ prefill });
      clearQuery();
      if (saved) toast({ title: 'Journal entry saved', body: `${saved.symbol}: ${saved.exitPrice ? 'closed' : 'open'} entry added.`, tone: 'success' });
    };

    disposer.add(on(root, 'click', '[data-action="new-entry"]', () => startNew()));
    disposer.add(
      on(root, 'click', '[data-edit]', async (_event, button) => {
        const entry = entryById(button.dataset.edit);
        if (!entry) return;
        const saved = await openEditor({ entry });
        if (saved) toast({ title: 'Journal entry updated', body: `${saved.symbol} entry saved.`, tone: 'success' });
      }),
    );
    disposer.add(
      on(root, 'click', '[data-delete]', async (_event, button) => {
        const entry = entryById(button.dataset.delete);
        if (!entry) return;
        const confirmed = await confirmDialog({
          title: `Delete the ${entry.symbol} entry?`,
          message: 'The entry and its notes will be removed from this journal. This cannot be undone.',
          confirmLabel: 'Delete entry',
          danger: true,
        });
        if (!confirmed) return;
        try {
          await deleteEntry(entry.id);
          toast({ title: 'Journal entry deleted', body: `${entry.symbol} entry removed.`, tone: 'success' });
          root.querySelector('[data-action="new-entry"]')?.focus();
        } catch (error) {
          toast({ title: 'The entry could not be deleted', body: error.message, tone: 'error' });
        }
      }),
    );
    disposer.add(
      on(root, 'click', '[data-jfilter]', (_event, button) => {
        ui.filter = button.dataset.jfilter;
        paintEntries();
      }),
    );

    disposer.add(watch((state) => state.runtime.guestLimits, paintGuestAllowance));
    disposer.add(watch((state) => state.journal, () => {
      paintInsights();
      paintEntries();
    }));
    disposer.add(watch((state) => state.account, paintInsights));

    // Deep link from a filled order: #/journal?new=1&tx=<id>
    if (query.new) {
      const tx = query.tx ? transactionById(query.tx) : null;
      const prefill = tx
        ? { symbol: tx.symbol, entryPrice: tx.price, quantity: tx.quantity, transactionId: tx.id }
        : query.symbol
          ? { symbol: String(query.symbol).toUpperCase() }
          : pendingDraft || {};
      pendingDraft = null;
      queueMicrotask(() => startNew(prefill));
    }

    return () => disposer.dispose();
  },
};
