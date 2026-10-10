// The simulated market clock. Shown on pages with live figures so it is
// always clear that prices are simulated and only move when the learner
// advances time.

import { html, render, on } from '../utils/dom.js';
import { getState, watch, selectValuation, selectDayChange } from '../state.js';
import { advanceMarket, canAdvance, dateOfDay } from '../services/marketDataService.js';
import { formatDate, money } from '../utils/format.js';
import { icon } from './icons.js';
import { announce, toast } from './notifications.js';
import { accountLinks, showAccountGate } from './accountGate.js';

export function mountSimBar(container) {
  let busy = false;

  const paint = () => {
    const state = getState();
    const { day } = state.market;
    const guest = state.runtime.userStatus !== 'signed-in';
    const remaining = state.runtime.guestLimits?.simulationDaysRemaining;
    const disabled = (days) => (busy || !canAdvance(days) ? 'disabled' : '');
    render(
      container,
      html`<section class="simbar${busy ? ' is-refreshing' : ''}" aria-label="Simulated market clock">
        <div class="simbar__status">
          <span class="hatch hatch--lg" aria-hidden="true"></span>
          <div class="simbar__text">
            <span class="simbar__label">Simulated market, day ${day}</span>
            <span class="simbar__date">${formatDate(dateOfDay(day), 'long')}</span>
          </div>
        </div>
        <p class="simbar__note">${guest ? `Guest allowance: one virtual month${Number.isInteger(remaining) ? ` (${remaining} trading days remaining)` : ''}. ` : ''}Virtual money only. Prices move when you advance time, and orders fill at the simulated closing price.</p>
        ${guest && remaining === 0
          ? html`<div class="callout callout--warn simbar__limit" role="status">
              ${icon('alert', { className: 'callout__icon' })}
              <div>
                <p class="callout__title">Guest simulation limit reached</p>
                <p>You've reached the guest simulation limit. Create an account to continue using TradeLab.</p>
                ${accountLinks(window.location.hash.slice(1) || '/practice')}
              </div>
            </div>`
          : ''}
        <div class="simbar__actions">
          <button type="button" class="btn btn--secondary btn--sm" data-advance="1" ${disabled(1)}>${icon('play')}Advance 1 day</button>
          <button type="button" class="btn btn--secondary btn--sm" data-advance="5" ${disabled(5)}>${icon('forward')}Advance 1 week</button>
        </div>
      </section>`,
    );
  };

  const off = on(container, 'click', '[data-advance]', async (_event, button) => {
    if (busy) return;
    const days = Number(button.dataset.advance);
    busy = true;
    paint();
    try {
      const clock = await advanceMarket(days);
      const state = getState();
      const valuation = selectValuation(state);
      const today = selectDayChange(state);
      announce(
        `Advanced to simulated day ${state.market.day}. Account value ${money(valuation.equity)}, ${money(today.amount, { sign: true })} on the day.`,
      );
      if (clock.guestLimitReached) {
        await showAccountGate({
          title: 'Guest simulation limit reached',
          message: "You've reached the guest simulation limit. Create an account to continue using TradeLab.",
          returnTo: window.location.hash.slice(1) || '/practice',
        });
      }
    } catch (error) {
      if (error.code === 'guest_simulation_limit') {
        await showAccountGate({
          title: 'Guest simulation limit reached',
          message: "You've reached the guest simulation limit. Create an account to continue using TradeLab.",
          returnTo: window.location.hash.slice(1) || '/practice',
        });
      } else {
        toast({ title: 'The simulated market could not advance', body: error.message, tone: 'error' });
      }
    } finally {
      busy = false;
      paint();
      container.querySelector(`[data-advance="${days}"]`)?.focus();
    }
  });

  const unwatch = watch((state) => state.market, paint);
  paint();
  return () => {
    off();
    unwatch();
  };
}
