// Settings: appearance, chart defaults, learning level, and the controls
// for resetting the simulated account or clearing all local demo data.
// Preferences apply immediately and persist in this browser.

import { html, render, on, createDisposer, $ } from '../utils/dom.js';
import { getState, watch, updateSlice, clearAllData, selectAccount } from '../state.js';
import { config, isMock } from '../config.js';
import { storedBytes, storageAvailable } from '../storage.js';
import { money, plural } from '../utils/format.js';
import { icon } from '../components/icons.js';
import { confirmDialog } from '../components/modals.js';
import { toast, announce } from '../components/notifications.js';
import { resetAccount } from '../services/tradingService.js';
import { refreshQuotes, RANGES } from '../services/marketDataService.js';
import { loadAppData } from '../services/session.js';
import { DIFFICULTY_LEVELS, DIFFICULTY_LABELS } from '../core/progress.js';

const ui = { startingCash: null };

function radioGroup({ name, legend, hint, options, value }) {
  return html`<fieldset class="setting-row">
    <div class="setting-row__text">
      <legend class="setting-row__label">${legend}</legend>
      ${hint ? html`<p class="setting-row__hint">${hint}</p>` : ''}
    </div>
    <div class="setting-row__control">
      <div class="seg">${options.map(
        (option) => html`<label class="seg__opt"><input type="radio" name="${name}" value="${option.value}" data-pref="${name}" ${value === option.value ? 'checked' : ''} /><span class="seg__item">${option.label}</span></label>`,
      )}</div>
    </div>
  </fieldset>`;
}

const DIFFICULTY_HINTS = {
  beginner: 'Suggested lessons stay at the beginner level until those are done. Tutor answers keep to the essentials.',
  intermediate: 'Suggestions include intermediate lessons, and tutor answers add a "Going further" section.',
  advanced: 'Every lesson can be suggested, and tutor answers include the extra detail.',
};

function dataLocationHint(bytes) {
  const size = `about ${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (!storageAvailable()) {
    return isMock()
      ? `This browser is blocking local storage, so changes last only until you close the tab.${config.tutorApiEnabled ? ' Tutor messages are sent only to the local Flask and Qwen servers.' : ''}`
      : 'Your account, lessons and journal are saved on the TradeLab server. This browser is blocking local storage, so preferences and the tutor conversation reset when you close the tab.';
  }
  return isMock()
    ? `Progress, journal entries and preferences are kept in this browser's local storage (${size}). It is a prototype convenience, not a secure or permanent database.${config.tutorApiEnabled ? ' Tutor messages are sent only to the local Flask and Qwen servers.' : ' Nothing is sent to a server.'}`
    : `Your simulated account, lesson progress and journal are saved on the TradeLab server (${config.apiBaseUrl}). This browser keeps your preferences, the tutor conversation and notifications (${size}).`;
}

function page(state) {
  const prefs = state.preferences;
  const account = selectAccount(state);
  const starting = ui.startingCash ?? state.account.startingCash;
  const bytes = storedBytes(config.storageKey);
  return html`<div class="page settings">
    <p class="settings__note muted">${icon('check', { size: 14 })}Changes apply right away and are saved in this browser.</p>

    <section class="panel" aria-labelledby="set-appearance">
      <div class="panel__head"><h2 class="panel__title" id="set-appearance">Appearance</h2></div>
      <div class="panel__body settings__rows">
        ${radioGroup({
          name: 'theme',
          legend: 'Theme',
          hint: 'TradeLab is designed dark first. Match system follows your device setting.',
          value: prefs.theme,
          options: [
            { value: 'dark', label: 'Dark' },
            { value: 'light', label: 'Light' },
            { value: 'system', label: 'Match system' },
          ],
        })}
        <fieldset class="setting-row">
          <div class="setting-row__text">
            <legend class="setting-row__label">Gain and loss colors</legend>
            <p class="setting-row__hint">Blue and orange are easier to tell apart for many people with color vision deficiencies. Gains and losses always show a sign and an arrow too.</p>
          </div>
          <div class="setting-row__control">
            <div class="seg">
              ${[
                { value: 'green-red', label: 'Green and red' },
                { value: 'blue-orange', label: 'Blue and orange' },
              ].map(
                (option) => html`<label class="seg__opt"><input type="radio" name="movement" value="${option.value}" data-pref="movement" ${prefs.movement === option.value ? 'checked' : ''} /><span class="seg__item">${option.label}</span></label>`,
              )}
            </div>
            <p class="movement-preview" aria-hidden="true"><span class="chg chg--up">${icon('up', { className: 'chg__icon' })}+$12.40</span><span class="chg chg--down">${icon('down', { className: 'chg__icon' })}−$8.15</span></p>
          </div>
        </fieldset>
        ${radioGroup({
          name: 'density',
          legend: 'Density',
          hint: 'Compact fits more rows on screen. Touch screens keep larger controls either way.',
          value: prefs.density,
          options: [
            { value: 'comfortable', label: 'Comfortable' },
            { value: 'compact', label: 'Compact' },
          ],
        })}
        <div class="setting-row">
          <div class="setting-row__text">
            <p class="setting-row__label" id="motion-label">Reduce motion</p>
            <p class="setting-row__hint" id="motion-hint">Turns off transitions such as dialogs sliding in. Your device's reduced-motion setting is always respected.</p>
          </div>
          <div class="setting-row__control">
            <button type="button" class="switch" id="pref-motion" role="switch" aria-checked="${prefs.motion === 'reduce'}" aria-labelledby="motion-label" aria-describedby="motion-hint" data-toggle="motion"></button>
          </div>
        </div>
      </div>
    </section>

    <section class="panel" aria-labelledby="set-charts">
      <div class="panel__head"><h2 class="panel__title" id="set-charts">Charts</h2></div>
      <div class="panel__body settings__rows">
        ${radioGroup({
          name: 'chartStyle',
          legend: 'Default chart style',
          hint: 'Candles show open, high, low and close for each period. Up candles are hollow, down candles filled.',
          value: prefs.chartStyle,
          options: [
            { value: 'line', label: 'Line' },
            { value: 'candles', label: 'Candles' },
          ],
        })}
        <div class="setting-row">
          <div class="setting-row__text">
            <label class="setting-row__label" for="pref-range">Default time range</label>
            <p class="setting-row__hint">Used when a chart first opens.</p>
          </div>
          <div class="setting-row__control">
            <div class="select-wrap"><select class="select" id="pref-range" data-pref="defaultRange">
              ${RANGES.map((range) => html`<option value="${range.id}" ${prefs.defaultRange === range.id ? 'selected' : ''}>${range.label}: ${range.description}</option>`)}
            </select></div>
          </div>
        </div>
      </div>
    </section>

    <section class="panel" aria-labelledby="set-learning">
      <div class="panel__head"><h2 class="panel__title" id="set-learning">Learning</h2></div>
      <div class="panel__body settings__rows">
        ${radioGroup({
          name: 'difficulty',
          legend: 'Difficulty level',
          hint: DIFFICULTY_HINTS[prefs.difficulty],
          value: prefs.difficulty,
          options: DIFFICULTY_LEVELS.map((level) => ({ value: level, label: DIFFICULTY_LABELS[level] })),
        })}
      </div>
    </section>

    <section class="panel" aria-labelledby="set-account">
      <div class="panel__head"><h2 class="panel__title" id="set-account">Simulated account</h2><span class="pill"><span class="hatch" aria-hidden="true"></span>Virtual money</span></div>
      <div class="panel__body settings__rows">
        <div class="setting-row">
          <div class="setting-row__text">
            <p class="setting-row__label">Current account</p>
            <p class="setting-row__hint">Started with ${money(state.account.startingCash)} on simulated day 0. Now on day ${state.market.day} with ${plural(account.transactions.length, 'transaction')} and ${money(account.cash)} in cash.${state.meta.exampleData ? ' Includes example trades.' : ''}</p>
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-row__text">
            <label class="setting-row__label" for="reset-cash">Reset simulated account</label>
            <p class="setting-row__hint">Starts over on simulated day 0 with the virtual balance you choose. Removes every simulated trade and example journal entry. Lessons, your own journal entries and preferences stay.</p>
          </div>
          <div class="setting-row__control setting-row__control--stack">
            <div class="select-wrap"><select class="select" id="reset-cash">
              ${config.startingCashOptions.map((amount) => html`<option value="${amount}" ${starting === amount ? 'selected' : ''}>${money(amount)} virtual cash</option>`)}
            </select></div>
            <button type="button" class="btn btn--danger" id="reset-account-btn" data-action="reset-account">${icon('reset')}Reset account</button>
          </div>
        </div>
      </div>
    </section>

    <section class="panel" aria-labelledby="set-data">
      <div class="panel__head"><h2 class="panel__title" id="set-data">${isMock() ? 'Local demo data' : 'Data in this browser'}</h2></div>
      <div class="panel__body settings__rows">
        <div class="setting-row">
          <div class="setting-row__text">
            <p class="setting-row__label">Where your data lives</p>
            <p class="setting-row__hint">${dataLocationHint(bytes)}</p>
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-row__text">
            <p class="setting-row__label">${isMock() ? 'Clear all local demo data' : 'Clear data in this browser'}</p>
            <p class="setting-row__hint">${isMock()
              ? 'Erases everything TradeLab stored here: the simulated account, lesson progress, journal, tutor conversation, notifications and preferences. TradeLab then starts fresh with the example account.'
              : 'Erases the preferences, tutor conversation and notifications stored here, then reloads your account, lessons and journal from the server. Nothing on the server is deleted.'}</p>
          </div>
          <div class="setting-row__control">
            <button type="button" class="btn btn--danger" id="clear-data-btn" data-action="clear-data">${icon('trash')}${isMock() ? 'Clear all data' : 'Clear browser data'}</button>
          </div>
        </div>
      </div>
    </section>

    <section class="panel" aria-labelledby="set-about">
      <div class="panel__head"><h2 class="panel__title" id="set-about">About</h2></div>
      <div class="panel__body">
        <dl class="kv">
          <div class="kv__row"><dt class="kv__key">Version</dt><dd class="kv__val">${config.appName} frontend ${config.version}</dd></div>
          <div class="kv__row"><dt class="kv__key">Data source</dt><dd class="kv__val">${isMock() ? 'Local mock data (no server)' : `Backend at ${config.apiBaseUrl}`}</dd></div>
          <div class="kv__row"><dt class="kv__key">Market prices</dt><dd class="kv__val">Simulated, fictional companies</dd></div>
          <div class="kv__row"><dt class="kv__key">Tutor</dt><dd class="kv__val">${config.tutorApiEnabled ? 'Local Qwen language model' : 'Preview mode, prewritten answers'}</dd></div>
          <div class="kv__row"><dt class="kv__key">Account</dt><dd class="kv__val">No sign-in. A local demo profile.</dd></div>
        </dl>
      </div>
    </section>
  </div>`;
}

const LABELS = {
  theme: { dark: 'Dark theme', light: 'Light theme', system: 'Theme matches your system' },
  movement: { 'green-red': 'Green and red gain and loss colors', 'blue-orange': 'Blue and orange gain and loss colors' },
  density: { comfortable: 'Comfortable density', compact: 'Compact density' },
  chartStyle: { line: 'Line charts by default', candles: 'Candlestick charts by default' },
  difficulty: Object.fromEntries(DIFFICULTY_LEVELS.map((level) => [level, `${DIFFICULTY_LABELS[level]} level`])),
};

export default {
  id: 'settings',
  mount(root, { navigate }) {
    const disposer = createDisposer();
    ui.startingCash = null;

    const paint = () => {
      const focusedId = document.activeElement && root.contains(document.activeElement) ? document.activeElement.id : null;
      const focusedPref = document.activeElement?.dataset?.pref && root.contains(document.activeElement) ? `${document.activeElement.name}:${document.activeElement.value}` : null;
      render(root, page(getState()));
      if (focusedId) $(`#${focusedId}`, root)?.focus();
      else if (focusedPref) {
        const [name, value] = focusedPref.split(':');
        root.querySelector(`input[name="${name}"][value="${value}"]`)?.focus();
      }
    };
    paint();

    const setPreference = (key, value) => {
      if (getState().preferences[key] === value) return;
      updateSlice('preferences', (prefs) => ({ ...prefs, [key]: value }), 'preferences/update');
      const label = LABELS[key]?.[value];
      if (label) announce(`${label} saved.`);
    };

    disposer.add(on(root, 'change', '[data-pref]', (event) => setPreference(event.target.dataset.pref, event.target.value)));
    disposer.add(
      on(root, 'click', '[data-toggle="motion"]', () => {
        const next = getState().preferences.motion === 'reduce' ? 'system' : 'reduce';
        setPreference('motion', next);
        announce(next === 'reduce' ? 'Reduced motion on.' : 'Reduced motion off.');
      }),
    );
    disposer.add(
      on(root, 'change', '#reset-cash', (event) => {
        ui.startingCash = Number(event.target.value);
      }),
    );

    disposer.add(
      on(root, 'click', '[data-action="reset-account"]', async (_event, button) => {
        const amount = ui.startingCash ?? Number($('#reset-cash', root).value);
        const confirmed = await confirmDialog({
          title: 'Reset the simulated account?',
          message: `You'll start over on simulated day 0 with ${money(amount)} in virtual cash. All simulated trades and example journal entries are removed. Lesson progress, your own journal entries and preferences stay.`,
          confirmLabel: 'Reset account',
          danger: true,
        });
        if (!confirmed) return;
        button.disabled = true;
        try {
          await resetAccount(amount);
          updateSlice('meta', (meta) => ({ ...meta, welcomeDismissed: true }), 'meta/welcome');
          toast({ title: 'Simulated account reset', body: `Day 0 with ${money(amount)} in virtual cash.`, tone: 'success', action: { label: 'Go to Practice Trading', href: '#/practice' } });
        } catch (error) {
          toast({ title: 'The account could not be reset', body: error.message, tone: 'error' });
        } finally {
          button.disabled = false;
        }
      }),
    );

    disposer.add(
      on(root, 'click', '[data-action="clear-data"]', async (_event, button) => {
        const confirmed = await confirmDialog(
          isMock()
            ? {
                title: 'Clear all local demo data?',
                message: 'This erases the simulated account, lesson progress, journal entries, the tutor conversation, notifications and preferences from this browser. It cannot be undone.',
                confirmLabel: 'Clear all data',
                danger: true,
              }
            : {
                title: 'Clear data in this browser?',
                message: 'This erases your preferences, the tutor conversation and notifications from this browser. Your account, lessons and journal stay on the server.',
                confirmLabel: 'Clear browser data',
                danger: true,
              },
        );
        if (!confirmed) return;
        button.disabled = true;
        clearAllData();
        try {
          if (isMock()) {
            await refreshQuotes();
            toast({ title: 'Local data cleared', body: 'TradeLab has started fresh with the example account.', tone: 'success' });
          } else {
            await loadAppData();
            toast({ title: 'Browser data cleared', body: 'Your account, lessons and journal were reloaded from the server.', tone: 'success' });
          }
        } catch (error) {
          toast({ title: 'Data was cleared, but reloading failed', body: `${error.message} Reload the page to try again.`, tone: 'error' });
        }
        navigate('#/');
      }),
    );

    disposer.add(watch((state) => state.preferences, paint));
    disposer.add(watch((state) => state.account, paint));
    disposer.add(watch((state) => state.market, paint));

    return () => disposer.dispose();
  },
};
