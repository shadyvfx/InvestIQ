// Figures and interactive practice blocks used inside lessons.
// Figures are static SVG drawn from data; widgets are small calculators that
// run entirely in the browser. Both read colors from CSS tokens, so they
// follow the theme and the movement-color setting.

import { html, raw, render } from '../utils/dom.js';
import { money, percent, plural, MINUS } from '../utils/format.js';
import { getState, selectValuation } from '../state.js';

// ---------------------------------------------------------------------------
// Candle drawing

/**
 * Draws one candle as SVG. Up candles are hollow, down candles filled.
 * y(price) maps a price to a y coordinate.
 */
function candleShape({ o, h, l, c }, x, width, y) {
  const up = c >= o;
  const top = y(Math.max(o, c));
  const bottom = y(Math.min(o, c));
  const bodyHeight = Math.max(2, bottom - top);
  const cls = up ? 'candle candle--up' : 'candle candle--down';
  return `<g class="${cls}">
    <line x1="${x}" x2="${x}" y1="${y(h)}" y2="${top}" />
    <line x1="${x}" x2="${x}" y1="${top + bodyHeight}" y2="${y(l)}" />
    <rect x="${x - width / 2}" y="${top}" width="${width}" height="${bodyHeight}" rx="1.5" />
  </g>`;
}

function scaleFor(prices, top, bottom) {
  const max = Math.max(...prices);
  const min = Math.min(...prices);
  const span = max - min || 1;
  return (price) => top + ((max - price) / span) * (bottom - top);
}

function label(x, yPos, text, anchor = 'start') {
  return `<text x="${x}" y="${yPos}" text-anchor="${anchor}" dominant-baseline="middle">${text}</text>`;
}

function leader(x1, x2, yPos) {
  return `<line class="leader" x1="${x1}" x2="${x2}" y1="${yPos}" y2="${yPos}" />`;
}

const FIGURES = {
  'candle-anatomy': () => {
    const upCandle = { o: 102, h: 110, l: 96, c: 107 };
    const downCandle = { o: 106, h: 109, l: 95, c: 99 };
    const y = scaleFor([110, 95], 24, 196);
    const left = candleShape(upCandle, 110, 30, y);
    const right = candleShape(downCandle, 330, 30, y);
    const labels = [
      leader(128, 150, y(110)), label(156, y(110), 'High: top of the upper wick'),
      leader(128, 150, y(107)), label(156, y(107), 'Close: top of the body'),
      leader(128, 150, y(102)), label(156, y(102), 'Open: bottom of the body'),
      leader(128, 150, y(96)), label(156, y(96), 'Low: end of the lower wick'),
      leader(312, 290, y(106)), label(284, y(106), 'Open', 'end'),
      leader(312, 290, y(99)), label(284, y(99), 'Close', 'end'),
    ].join('');
    return {
      svg: `<svg viewBox="0 0 440 220" class="lesson-figure__svg" role="img" aria-label="Two candlesticks. The up candle on the left is hollow: it opened at 102, rose to a high of 110, fell to a low of 96 and closed at 107. The down candle on the right is filled: it opened at 106 and closed lower at 99.">${left}${right}${labels}
        <text class="caption-label" x="110" y="214" text-anchor="middle">Up candle</text>
        <text class="caption-label" x="330" y="214" text-anchor="middle">Down candle</text></svg>`,
    };
  },

  'pattern-doji': () => {
    const series = [
      { o: 100, h: 104, l: 98, c: 103 },
      { o: 103, h: 108, l: 102, c: 107 },
      { o: 107, h: 112, l: 103, c: 107.2 },
      { o: 107, h: 108, l: 101, c: 102 },
    ];
    const y = scaleFor(series.flatMap((s) => [s.h, s.l]), 16, 150);
    const shapes = series.map((s, i) => candleShape(s, 60 + i * 70, 22, y)).join('');
    return {
      svg: `<svg viewBox="0 0 320 180" class="lesson-figure__svg" role="img" aria-label="Two rising candles, then a doji with almost no body and wicks on both sides, followed by a down candle.">${shapes}
        ${leader(232, 262, y(112))}${label(268, y(112), 'Doji')}</svg>`,
    };
  },

  'pattern-hammer': () => {
    const hammer = { o: 100, h: 101.5, l: 92, c: 101 };
    const star = { o: 101, h: 110, l: 100, c: 100.4 };
    const yh = scaleFor([110, 92], 16, 150);
    return {
      svg: `<svg viewBox="0 0 320 180" class="lesson-figure__svg" role="img" aria-label="A hammer with a small body at the top and a long lower wick, and a shooting star with a small body at the bottom and a long upper wick.">
        ${candleShape(hammer, 90, 24, yh)}${candleShape(star, 230, 24, yh)}
        <text class="caption-label" x="90" y="172" text-anchor="middle">Hammer</text>
        <text class="caption-label" x="230" y="172" text-anchor="middle">Shooting star</text></svg>`,
    };
  },

  'pattern-engulfing': () => {
    const first = { o: 104, h: 105, l: 100.5, c: 101 };
    const second = { o: 100.5, h: 107, l: 99.5, c: 106 };
    const y = scaleFor([107, 99.5], 16, 150);
    return {
      svg: `<svg viewBox="0 0 320 180" class="lesson-figure__svg" role="img" aria-label="A small down candle followed by a larger up candle whose body covers the whole body of the first.">
        ${candleShape(first, 130, 22, y)}${candleShape(second, 190, 30, y)}
        ${leader(212, 236, y(106))}${label(242, y(106), 'Covers the')}${label(242, y(106) + 16, 'prior body')}</svg>`,
    };
  },
};

export function renderFigure(name, caption) {
  const figure = FIGURES[name]?.();
  if (!figure) return '';
  return html`<figure class="lesson-figure">${raw(figure.svg)}${caption ? html`<figcaption>${caption}</figcaption>` : ''}</figure>`;
}

// ---------------------------------------------------------------------------
// Widgets

const WIDGETS = {
  'candle-builder': {
    render: (id) => html`<div class="widget candle-builder" data-widget="candle-builder" id="${id}">
      <div class="widget__head"><p class="widget__title">Candle builder</p><p class="widget__hint">Prices from $90 to $110</p></div>
      <div class="candle-builder__grid">
        <div class="candle-builder__controls">
          ${['open', 'high', 'low', 'close'].map(
            (key) => html`<div class="field field--range">
              <div class="split"><label class="field__label" for="${id}-${key}">${key[0].toUpperCase() + key.slice(1)}</label><output class="num" id="${id}-${key}-out" for="${id}-${key}"></output></div>
              <input type="range" class="range" id="${id}-${key}" data-key="${key}" min="90" max="110" step="0.5" />
            </div>`,
          )}
        </div>
        <div class="candle-builder__preview">
          <svg viewBox="0 0 160 220" class="candle-builder__svg" aria-hidden="true"></svg>
          <p class="candle-builder__verdict" role="status" aria-live="polite"></p>
        </div>
      </div>
    </div>`,
    mount(element) {
      const values = { open: 100, high: 106, low: 96, close: 104 };
      const svg = element.querySelector('svg');
      const verdict = element.querySelector('.candle-builder__verdict');
      const inputs = Object.fromEntries(['open', 'high', 'low', 'close'].map((key) => [key, element.querySelector(`[data-key="${key}"]`)]));

      const paint = () => {
        for (const [key, input] of Object.entries(inputs)) {
          input.value = values[key];
          element.querySelector(`#${input.id}-out`).textContent = money(values[key]);
        }
        const y = (price) => 12 + ((110 - price) / 20) * 196;
        const ticks = [110, 105, 100, 95, 90]
          .map((price) => `<line class="gridline" x1="8" x2="152" y1="${y(price)}" y2="${y(price)}"/><text x="152" y="${y(price) - 4}" text-anchor="end">${price}</text>`)
          .join('');
        svg.innerHTML = ticks + candleShape({ o: values.open, h: values.high, l: values.low, c: values.close }, 70, 34, y);
        const diff = values.close - values.open;
        let text;
        if (Math.abs(diff) < 0.25) text = 'Doji: the open and close are almost equal, so buyers and sellers ended roughly balanced.';
        else if (diff > 0) text = `Up candle: it closed ${money(diff)} above its open. The body is hollow.`;
        else text = `Down candle: it closed ${money(-diff)} below its open. The body is filled.`;
        const range = values.high - values.low;
        verdict.textContent = `${text} The full range from low to high is ${money(range)}.`;
      };

      const onInput = (event) => {
        const key = event.target.dataset.key;
        const value = Number(event.target.value);
        values[key] = value;
        // Keep the four prices consistent: high is the highest, low the lowest.
        if (key === 'open' || key === 'close') {
          values.high = Math.max(values.high, value);
          values.low = Math.min(values.low, value);
        } else if (key === 'high') {
          values.open = Math.min(values.open, value);
          values.close = Math.min(values.close, value);
          values.low = Math.min(values.low, value);
        } else if (key === 'low') {
          values.open = Math.max(values.open, value);
          values.close = Math.max(values.close, value);
          values.high = Math.max(values.high, value);
        }
        paint();
      };
      element.addEventListener('input', onInput);
      paint();
      return () => element.removeEventListener('input', onInput);
    },
  },

  'limit-check': {
    render: (id) => html`<div class="widget limit-check" data-widget="limit-check" id="${id}">
      <div class="widget__head"><p class="widget__title">Would this buy order fill?</p><p class="widget__hint">One example session</p></div>
      <p class="small muted">During this session the stock opened at $49.80, traded as high as $51.10 and as low as $48.20, and closed at $50.40. You place your order at the open.</p>
      <div class="limit-check__controls">
        <fieldset class="field">
          <legend class="field__label">Order type</legend>
          <div class="seg">
            <label class="seg__opt"><input type="radio" name="${id}-type" value="market" checked /><span class="seg__item">Market</span></label>
            <label class="seg__opt"><input type="radio" name="${id}-type" value="limit" /><span class="seg__item">Limit</span></label>
          </div>
        </fieldset>
        <div class="field">
          <label class="field__label" for="${id}-limit">Buy limit price</label>
          <div class="input-affix"><span class="input-affix__prefix">$</span><input class="input" id="${id}-limit" type="text" inputmode="decimal" value="49.00" /></div>
        </div>
      </div>
      <div class="range-bar" aria-hidden="true">
        <div class="range-bar__track"><span class="range-bar__fill"></span><span class="range-bar__marker range-bar__marker--limit"></span><span class="range-bar__tick range-bar__tick--open"></span></div>
        <div class="range-bar__labels"><span>Low $48.20</span><span>Open $49.80</span><span>High $51.10</span></div>
      </div>
      <p class="limit-check__result" role="status" aria-live="polite"></p>
    </div>`,
    mount(element) {
      const session = { open: 49.8, high: 51.1, low: 48.2 };
      const pos = (price) => `${(((price - session.low) / (session.high - session.low)) * 100).toFixed(1)}%`;
      const result = element.querySelector('.limit-check__result');
      const limitInput = element.querySelector('input[type="text"]');
      const marker = element.querySelector('.range-bar__marker--limit');
      const fill = element.querySelector('.range-bar__fill');
      element.querySelector('.range-bar__tick--open').style.left = pos(session.open);

      const paint = () => {
        const type = element.querySelector('input[type="radio"]:checked').value;
        limitInput.disabled = type === 'market';
        const limit = Number(limitInput.value.replace(/[$,\s]/g, ''));
        marker.hidden = type === 'market' || !(limit > 0);
        if (type === 'market') {
          fill.style.left = '0%';
          fill.style.width = '0%';
          result.textContent = 'Market order: fills right away at about the opening price of $49.80, plus any slippage. You are certain to get the shares, but not the exact price.';
          return;
        }
        if (!(limit > 0)) {
          result.textContent = 'Enter a limit price, such as 49.00.';
          return;
        }
        const clamped = Math.min(session.high, Math.max(session.low, limit));
        marker.style.left = pos(clamped);
        fill.style.left = '0%';
        fill.style.width = pos(clamped);
        if (limit >= session.open) {
          result.textContent = `Fills right away at about $49.80. Your limit of ${money(limit)} is above the current price, so it caps what you pay but doesn't delay the trade.`;
        } else if (limit >= session.low) {
          result.textContent = `Fills later in the session at ${money(limit)} or better, once the price dips that far. You save ${money(session.open - limit)} per share compared with buying at the open.`;
        } else {
          result.textContent = `Doesn't fill this session. The lowest price was $48.20, which never reached your limit of ${money(limit)}. Missing the trade is the cost of price control.`;
        }
      };

      element.addEventListener('input', paint);
      element.addEventListener('change', paint);
      paint();
      return () => {
        element.removeEventListener('input', paint);
        element.removeEventListener('change', paint);
      };
    },
  },

  'position-sizer': {
    render: (id) => html`<div class="widget sizer" data-widget="position-sizer" id="${id}">
      <div class="widget__head"><p class="widget__title">Position size calculator</p><p class="widget__hint">Starts with your simulated account value</p></div>
      <div class="form-grid sizer__inputs">
        ${[
          ['account', 'Account value', '$'],
          ['risk', 'Risk per trade', '%'],
          ['entry', 'Entry price', '$'],
          ['stop', 'Stop price', '$'],
          ['target', 'Target price (optional)', '$'],
        ].map(
          ([key, text, unit]) => html`<div class="field">
            <label class="field__label" for="${id}-${key}">${text}</label>
            <div class="input-affix${unit === '%' ? ' input-affix--suffix' : ''}"><span class="input-affix__prefix">${unit}</span><input class="input" id="${id}-${key}" data-key="${key}" type="text" inputmode="decimal" /></div>
          </div>`,
        )}
      </div>
      <div class="sizer__output" role="status" aria-live="polite"></div>
    </div>`,
    mount(element) {
      const equity = selectValuation(getState()).equity;
      const defaults = { account: Math.round(equity || 10000), risk: 1, entry: 50, stop: 47, target: 56 };
      const inputs = {};
      for (const [key, value] of Object.entries(defaults)) {
        inputs[key] = element.querySelector(`[data-key="${key}"]`);
        inputs[key].value = String(value);
      }
      const output = element.querySelector('.sizer__output');
      const read = (key) => {
        const text = inputs[key].value.replace(/[$,%\s]/g, '');
        return text === '' ? null : Number(text);
      };

      const paint = () => {
        const account = read('account');
        const risk = read('risk');
        const entry = read('entry');
        const stop = read('stop');
        const target = read('target');
        const problems = [];
        if (!(account > 0)) problems.push('Enter an account value greater than $0.');
        if (!(risk > 0 && risk <= 100)) problems.push('Enter a risk between 0% and 100%.');
        if (!(entry > 0)) problems.push('Enter an entry price greater than $0.');
        if (!(stop > 0) || stop >= entry) problems.push('Set the stop below the entry price.');
        if (target !== null && !(target > entry)) problems.push('Set the target above the entry price, or leave it empty.');
        if (problems.length) {
          render(output, html`<p class="field__error">${problems[0]}</p>`);
          return;
        }
        const dollarsAtRisk = (account * risk) / 100;
        const perShare = entry - stop;
        const shares = Math.floor(dollarsAtRisk / perShare);
        const cost = shares * entry;
        const maxLoss = shares * perShare;
        const reward = target ? target - entry : null;
        const ratio = reward ? reward / perShare : null;
        const breakEven = reward ? perShare / (perShare + reward) : null;
        const overBudget = cost > account;
        render(
          output,
          html`<dl class="kv kv--grid sizer__results">
              <div class="kv__row"><dt class="kv__key">Dollars at risk</dt><dd class="kv__val">${money(dollarsAtRisk)}</dd></div>
              <div class="kv__row"><dt class="kv__key">Risk per share</dt><dd class="kv__val">${money(perShare)}</dd></div>
              <div class="kv__row"><dt class="kv__key">Position size</dt><dd class="kv__val">${plural(shares, 'share')}</dd></div>
              <div class="kv__row"><dt class="kv__key">Position cost</dt><dd class="kv__val">${money(cost)} <span class="faint">(${percent(cost / account, { digits: 1 })} of account)</span></dd></div>
              <div class="kv__row"><dt class="kv__key">Loss if stopped out</dt><dd class="kv__val">${MINUS}${money(maxLoss)}</dd></div>
              <div class="kv__row"><dt class="kv__key">Risk-to-reward</dt><dd class="kv__val">${ratio ? `1:${ratio.toFixed(1)}` : 'Add a target'}</dd></div>
              <div class="kv__row"><dt class="kv__key">Break-even win rate</dt><dd class="kv__val">${breakEven ? percent(breakEven, { digits: 0 }) : 'Add a target'}</dd></div>
            </dl>
            ${shares === 0 ? html`<p class="field__hint">The stop is too far from the entry to fit even one share within this risk. Use a closer stop or skip the trade.</p>` : ''}
            ${overBudget ? html`<p class="field__hint">The position would cost more than the whole account, so the cash you have becomes the real limit.</p>` : ''}`,
        );
      };

      element.addEventListener('input', paint);
      paint();
      return () => element.removeEventListener('input', paint);
    },
  },
};

let widgetCount = 0;

export function renderWidget(name) {
  const widget = WIDGETS[name];
  if (!widget) return '';
  widgetCount += 1;
  return widget.render(`widget-${name}-${widgetCount}`);
}

/** Activates every widget inside `root`. Returns a cleanup function. */
export function mountWidgets(root) {
  const cleanups = [];
  for (const element of root.querySelectorAll('[data-widget]')) {
    const widget = WIDGETS[element.dataset.widget];
    if (widget) cleanups.push(widget.mount(element));
  }
  return () => cleanups.forEach((fn) => fn?.());
}

