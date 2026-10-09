// Chart.js wrappers for TradeLab, plus SVG sparklines and data-table twins.
//
// Conventions (shared by every chart):
// - Thin marks: 2px lines, hairline solid gridlines, no dual axes.
// - Price lines take the movement color for the range (up/down), and every
//   chart is paired with text that states the change with a sign and arrow.
// - Up candles are hollow and down candles filled, so direction survives
//   without color.
// - Colors come from CSS custom properties, so charts follow the theme.
// - No load animations; charts respond to user actions only.

import { html, escapeHTML } from '../utils/dom.js';
import { money, percent, formatDate, formatTime, compactNumber, parseISODate } from '../utils/format.js';

const live = new Set();

const wholeDollars = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

/** Axis ticks: whole dollars when the axis reaches $100, cents below that. */
function axisMoney(value, ticks) {
  const top = ticks?.length ? Math.max(...ticks.map((tick) => Math.abs(tick.value))) : Math.abs(value);
  return top >= 100 ? wholeDollars.format(value) : money(value);
}

export function chartsAvailable() {
  return typeof window.Chart === 'function';
}

function readTheme() {
  const styles = getComputedStyle(document.documentElement);
  const v = (name) => styles.getPropertyValue(name).trim();
  return {
    fg: v('--fg'),
    fg2: v('--fg-2'),
    fg3: v('--fg-3'),
    grid: v('--chart-grid'),
    axis: v('--chart-axis'),
    series: v('--chart-series'),
    muted: v('--chart-muted'),
    up: v('--up'),
    down: v('--down'),
    upWash: v('--up-wash'),
    downWash: v('--down-wash'),
    panel: v('--panel'),
    raised: v('--raised'),
    lineStrong: v('--line-strong'),
    font: v('--font') || 'system-ui, sans-serif',
  };
}

function fontOf(theme, size = 11, weight = 400) {
  return { family: theme.font, size, weight };
}

function fallback(container, message = 'Charts are unavailable because the charting library did not load.') {
  container.innerHTML = `<div class="chart__fallback">${escapeHTML(message)}</div>`;
  return { update() {}, destroy() {}, refreshTheme() {} };
}

// ---------------------------------------------------------------------------
// Plugins

/** Vertical hairline at the hovered position. */
const crosshairPlugin = {
  id: 'tlCrosshair',
  afterDatasetsDraw(chart, _args, options) {
    const active = chart.tooltip?.getActiveElements?.() || [];
    if (!active.length || options.display === false) return;
    const { ctx, chartArea } = chart;
    const x = active[0].element.x;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(Math.round(x) + 0.5, chartArea.top);
    ctx.lineTo(Math.round(x) + 0.5, chartArea.bottom);
    ctx.lineWidth = 1;
    ctx.strokeStyle = options.color;
    ctx.stroke();
    ctx.restore();
  },
};

/** Horizontal reference line with a small label (previous close, starting balance). */
const referencePlugin = {
  id: 'tlReference',
  beforeDatasetsDraw(chart, _args, options) {
    if (options.value === null || options.value === undefined) return;
    const scale = chart.scales.y;
    const y = Math.round(scale.getPixelForValue(options.value)) + 0.5;
    const { ctx, chartArea } = chart;
    if (y < chartArea.top || y > chartArea.bottom) return;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(chartArea.left, y);
    ctx.lineTo(chartArea.right, y);
    ctx.lineWidth = 1;
    ctx.strokeStyle = options.color;
    ctx.stroke();
    if (options.label) {
      ctx.font = `500 11px ${options.font}`;
      const width = ctx.measureText(options.label).width;
      const x = chartArea.left + 6;
      ctx.fillStyle = options.chip;
      ctx.fillRect(x - 4, y - 18, width + 8, 16);
      ctx.fillStyle = options.textColor;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillText(options.label, x, y - 10);
    }
    ctx.restore();
  },
};

/** Value labels at the tips of horizontal bars. */
const barLabelPlugin = {
  id: 'tlBarLabels',
  afterDatasetsDraw(chart, _args, options) {
    if (!options.format) return;
    const { ctx } = chart;
    const meta = chart.getDatasetMeta(0);
    const values = chart.data.datasets[0].data;
    ctx.save();
    ctx.font = `500 12px ${options.font}`;
    ctx.fillStyle = options.color;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    meta.data.forEach((bar, index) => {
      ctx.fillText(options.format(values[index], index), bar.x + 6, bar.y);
    });
    ctx.restore();
  },
};

// ---------------------------------------------------------------------------
// Axis labels for each interval

function isNarrow(container) {
  return container.clientWidth < 520;
}

function tickCallback(points, interval, narrow) {
  return (value, index) => {
    const point = points[index];
    if (!point) return '';
    const prev = points[index - 1];
    if (interval === '5m') {
      const step = narrow ? 120 : 60;
      return (point.minute + 30) % step === 0 && point.minute > 0 ? formatTime(point.t).replace(':00', '') : '';
    }
    if (interval === '30m') {
      return point.minute === 0 ? formatDate(point.t, 'weekday') : '';
    }
    if (interval === '1w') {
      const year = point.t.slice(0, 4);
      return prev && prev.t.slice(0, 4) !== year ? year : '';
    }
    // Daily bars
    const count = points.length;
    if (count > 120) {
      const month = point.t.slice(0, 7);
      if (!prev || prev.t.slice(0, 7) === month) return '';
      const monthIndex = Number(point.t.slice(5, 7));
      if (narrow && monthIndex % 3 !== 1) return '';
      return monthIndex === 1 ? point.t.slice(0, 4) : formatDate(point.t, 'month');
    }
    const every = count > 40 ? (narrow ? 15 : 10) : narrow ? 7 : 5;
    return (count - 1 - index) % every === 0 ? formatDate(point.t, 'short') : '';
  };
}

function tooltipWhen(point, interval) {
  if (!point) return '';
  if (interval === '5m' || interval === '30m') return `${formatTime(point.t)}, ${formatDate(point.t, 'short')}`;
  if (interval === '1w') return `Week ending ${formatDate(point.t, 'medium')}`;
  return formatDate(point.t, 'long');
}

function tooltipStyle(theme) {
  return {
    backgroundColor: theme.raised,
    borderColor: theme.lineStrong,
    borderWidth: 1,
    titleColor: theme.fg,
    bodyColor: theme.fg2,
    titleFont: fontOf(theme, 13, 600),
    bodyFont: fontOf(theme, 12),
    padding: 10,
    cornerRadius: 4,
    displayColors: false,
    caretSize: 0,
  };
}

function priceScale(theme, { position = 'right' } = {}) {
  return {
    position,
    grace: '6%',
    beginAtZero: false,
    border: { display: false },
    grid: { color: theme.grid, drawTicks: false, lineWidth: 1 },
    ticks: {
      color: theme.axis,
      font: fontOf(theme),
      padding: 8,
      maxTicksLimit: 5,
      callback: (value, _index, ticks) => axisMoney(value, ticks),
    },
  };
}

function categoryScale(theme, callback) {
  return {
    border: { display: true, color: theme.grid },
    grid: { display: false },
    ticks: { color: theme.axis, font: fontOf(theme), autoSkip: false, maxRotation: 0, callback },
  };
}

function prepareCanvas(container, label) {
  container.innerHTML = '';
  const canvas = document.createElement('canvas');
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', label || 'Chart');
  container.appendChild(canvas);
  return canvas;
}

function register(controller) {
  live.add(controller);
  return controller;
}

/** Re-reads theme colors for every chart on screen (after a theme change). */
export function refreshChartsTheme() {
  for (const controller of live) controller.refreshTheme();
}

// ---------------------------------------------------------------------------
// Price chart (line or candles)

/**
 * @param {HTMLElement} container element with a fixed height (.chart)
 * @param {{ history: {points:Array, interval:string, reference:number}, style:'line'|'candles', label:string }} options
 */
export function createPriceChart(container, { history, style = 'line', label }) {
  if (!chartsAvailable()) return fallback(container);
  const canvas = prepareCanvas(container, label);
  let theme = readTheme();
  let current = { history, style };

  const build = () => {
    const { points, interval, reference } = current.history;
    const last = points.at(-1)?.c ?? reference;
    const up = last >= reference;
    const color = up ? theme.up : theme.down;
    const narrow = isNarrow(container);
    const labels = points.map((point) => point.t);
    let datasets;

    if (current.style === 'candles') {
      const range = Math.max(...points.map((p) => p.h)) - Math.min(...points.map((p) => p.l)) || 1;
      const minBody = range * 0.004;
      const isUp = points.map((p) => p.c >= p.o);
      datasets = [
        {
          type: 'bar',
          label: 'Range',
          data: points.map((p) => [p.l, p.h]),
          backgroundColor: isUp.map((value) => (value ? theme.up : theme.down)),
          barThickness: 1,
          grouped: false,
          order: 2,
        },
        {
          type: 'bar',
          label: 'Open to close',
          data: points.map((p) => {
            const low = Math.min(p.o, p.c);
            const high = Math.max(p.o, p.c);
            return high - low < minBody ? [low - minBody / 2, high + minBody / 2] : [low, high];
          }),
          backgroundColor: isUp.map((value) => (value ? theme.panel : theme.down)),
          borderColor: isUp.map((value) => (value ? theme.up : theme.down)),
          borderWidth: 1,
          borderSkipped: false,
          barPercentage: 0.72,
          categoryPercentage: 0.92,
          maxBarThickness: 14,
          grouped: false,
          order: 1,
        },
      ];
    } else {
      datasets = [
        {
          type: 'line',
          label: 'Price',
          data: points.map((p) => p.c),
          borderColor: color,
          backgroundColor: up ? theme.upWash : theme.downWash,
          borderWidth: 2,
          fill: 'start',
          tension: 0,
          pointRadius: 0,
          pointHoverRadius: 4,
          pointHoverBackgroundColor: color,
          pointHoverBorderColor: theme.panel,
          pointHoverBorderWidth: 2,
          pointHitRadius: 12,
        },
      ];
    }

    return {
      type: current.style === 'candles' ? 'bar' : 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        normalized: true,
        interaction: { mode: 'index', intersect: false },
        layout: { padding: { top: 8, right: 0, left: 0, bottom: 0 } },
        scales: {
          x: { ...categoryScale(theme, tickCallback(points, interval, narrow)), offset: current.style === 'candles' },
          y: priceScale(theme),
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            ...tooltipStyle(theme),
            filter: (item) => current.style !== 'candles' || item.datasetIndex === 1,
            callbacks: {
              title: (items) => {
                const point = points[items[0]?.dataIndex];
                return point ? money(point.c) : '';
              },
              label: (item) => {
                const point = points[item.dataIndex];
                if (current.style !== 'candles') return tooltipWhen(point, interval);
                return [
                  tooltipWhen(point, interval),
                  `Open ${money(point.o)}   High ${money(point.h)}`,
                  `Low ${money(point.l)}   Close ${money(point.c)}`,
                ];
              },
            },
          },
          tlCrosshair: { color: theme.lineStrong },
          tlReference: {
            value: interval === '5m' ? reference : null,
            label: 'Previous close',
            color: theme.lineStrong,
            textColor: theme.fg2,
            chip: theme.panel,
            font: theme.font,
          },
        },
      },
      plugins: [crosshairPlugin, referencePlugin],
    };
  };

  let chart = new window.Chart(canvas, build());

  const controller = {
    update(nextHistory = current.history, nextStyle = current.style, nextLabel) {
      const styleChanged = nextStyle !== current.style;
      current = { history: nextHistory, style: nextStyle };
      if (nextLabel) canvas.setAttribute('aria-label', nextLabel);
      if (styleChanged) {
        chart.destroy();
        chart = new window.Chart(canvas, build());
      } else {
        const config = build();
        chart.data = config.data;
        chart.options = config.options;
        chart.update('none');
      }
    },
    refreshTheme() {
      theme = readTheme();
      controller.update();
    },
    destroy() {
      live.delete(controller);
      chart.destroy();
    },
  };
  return register(controller);
}

// ---------------------------------------------------------------------------
// Account value over simulated days, against the starting balance

export function createPerformanceChart(container, { points, baseline, label }) {
  if (!chartsAvailable()) return fallback(container);
  const canvas = prepareCanvas(container, label);
  let theme = readTheme();
  let current = { points, baseline };

  const build = () => {
    const data = current.points.map((p) => p.equity);
    const narrow = isNarrow(container);
    const lastIndex = data.length - 1;
    const tickPoints = current.points.map((p) => ({ ...p, t: p.date }));
    return {
      type: 'line',
      data: {
        labels: current.points.map((p) => p.date),
        datasets: [
          {
            label: 'Account value',
            data,
            borderColor: theme.series,
            borderWidth: 2,
            tension: 0,
            fill: { target: { value: current.baseline }, above: theme.upWash, below: theme.downWash },
            pointRadius: (ctx) => (ctx.dataIndex === lastIndex ? 3.5 : 0),
            pointBackgroundColor: theme.series,
            pointBorderColor: theme.panel,
            pointBorderWidth: 2,
            pointHoverRadius: 4,
            pointHitRadius: 12,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: 'index', intersect: false },
        layout: { padding: { top: 8 } },
        scales: {
          x: categoryScale(theme, tickCallback(tickPoints, '1d', narrow)),
          y: priceScale(theme),
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            ...tooltipStyle(theme),
            callbacks: {
              title: (items) => money(data[items[0]?.dataIndex]),
              label: (item) => {
                const point = current.points[item.dataIndex];
                const diff = point.equity - current.baseline;
                return [`Simulated day ${point.day}, ${formatDate(point.date, 'medium')}`, `${money(diff, { sign: true })} vs. starting balance`];
              },
            },
          },
          tlCrosshair: { color: theme.lineStrong },
          tlReference: { value: current.baseline, label: null, color: theme.fg3 },
        },
      },
      plugins: [crosshairPlugin, referencePlugin],
    };
  };

  let chart = new window.Chart(canvas, build());
  const controller = {
    update(nextPoints = current.points, nextBaseline = current.baseline, nextLabel) {
      current = { points: nextPoints, baseline: nextBaseline };
      if (nextLabel) canvas.setAttribute('aria-label', nextLabel);
      const config = build();
      chart.data = config.data;
      chart.options = config.options;
      chart.update('none');
    },
    refreshTheme() {
      theme = readTheme();
      controller.update();
    },
    destroy() {
      live.delete(controller);
      chart.destroy();
    },
  };
  return register(controller);
}

// ---------------------------------------------------------------------------
// Allocation: horizontal bars of each row's share of the account

export function allocationHeight(rowCount) {
  return Math.max(120, rowCount * 34 + 16);
}

export function createAllocationChart(container, { rows, label }) {
  if (!chartsAvailable()) return fallback(container);
  const canvas = prepareCanvas(container, label);
  let theme = readTheme();
  let current = rows;

  const build = () => ({
    type: 'bar',
    data: {
      labels: current.map((row) => row.label),
      datasets: [
        {
          label: 'Share of account',
          data: current.map((row) => row.weight * 100),
          backgroundColor: current.map((row) => (row.isCash ? theme.muted : theme.series)),
          borderRadius: 4,
          borderSkipped: 'start',
          maxBarThickness: 18,
          categoryPercentage: 0.8,
          barPercentage: 0.9,
        },
      ],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      layout: { padding: { right: 56 } },
      scales: {
        x: { display: false, min: 0, max: Math.max(10, ...current.map((row) => row.weight * 100)) },
        y: {
          border: { display: true, color: theme.lineStrong },
          grid: { display: false },
          ticks: { color: theme.fg2, font: fontOf(theme, 12, 500), padding: 6 },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...tooltipStyle(theme),
          callbacks: {
            title: (items) => percent(current[items[0].dataIndex].weight, { digits: 1 }),
            label: (item) => `${current[item.dataIndex].label}: ${money(current[item.dataIndex].value)}`,
          },
        },
        tlBarLabels: { color: theme.fg, font: theme.font, format: (value) => `${value.toFixed(1)}%` },
      },
    },
    plugins: [barLabelPlugin],
  });

  let chart = new window.Chart(canvas, build());
  const controller = {
    update(nextRows = current, nextLabel) {
      current = nextRows;
      if (nextLabel) canvas.setAttribute('aria-label', nextLabel);
      const config = build();
      chart.data = config.data;
      chart.options = config.options;
      chart.update('none');
    },
    refreshTheme() {
      theme = readTheme();
      controller.update();
    },
    destroy() {
      live.delete(controller);
      chart.destroy();
    },
  };
  return register(controller);
}

// ---------------------------------------------------------------------------
// Sparklines (SVG, no library) and table twins

export function sparkline(values, { width = 72, height = 26 } = {}) {
  if (!values || values.length < 2) return html`<svg class="spark" viewBox="0 0 ${width} ${height}" aria-hidden="true"></svg>`;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 2;
  const step = (width - pad * 2) / (values.length - 1);
  const coords = values.map((value, index) => [pad + index * step, pad + (height - pad * 2) * (1 - (value - min) / span)]);
  const d = coords.map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const [lx, ly] = coords.at(-1);
  return html`<svg class="spark" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d="${d}"/><circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="2"/></svg>`;
}

/**
 * A collapsed data table that mirrors a chart, for screen readers and anyone
 * who prefers exact numbers. Rows render only when opened.
 */
export function dataTableToggle({ id, summary = 'Show data as a table', caption }) {
  return html`<details class="data-details" id="${id}" data-caption="${caption}">
    <summary>${summary}</summary>
    <div class="data-details__body table-wrap"></div>
  </details>`;
}

export function fillDataTable(details, columns, rows) {
  const body = details?.querySelector('.data-details__body');
  if (!body) return;
  const caption = details.dataset.caption || '';
  body.innerHTML = String(html`<table class="table table--dense">
    <caption class="sr-only">${caption}</caption>
    <thead><tr>${columns.map((column) => html`<th scope="col"${column.numeric ? html` class="num"` : ''}>${column.label}</th>`)}</tr></thead>
    <tbody>${rows.map((row) => html`<tr>${columns.map((column) => html`<td${column.numeric ? html` class="num"` : ''}>${column.value(row)}</td>`)}</tr>`)}</tbody>
  </table>`);
}

/** Column presets for price history tables. */
export function historyColumns(interval) {
  const when = (point) => (interval === '5m' || interval === '30m' ? `${formatDate(point.t, 'short')} ${formatTime(point.t)}` : formatDate(point.t, 'medium'));
  return [
    { label: interval === '1w' ? 'Week ending' : 'Time', value: when },
    { label: 'Open', numeric: true, value: (p) => money(p.o) },
    { label: 'High', numeric: true, value: (p) => money(p.h) },
    { label: 'Low', numeric: true, value: (p) => money(p.l) },
    { label: 'Close', numeric: true, value: (p) => money(p.c) },
    { label: 'Volume', numeric: true, value: (p) => compactNumber(p.v) },
  ];
}

/** Accessible one-sentence summary of a price history. */
export function describeHistory(symbol, history, rangeLabel) {
  const first = history.reference;
  const last = history.points.at(-1)?.c;
  if (!Number.isFinite(first) || !Number.isFinite(last)) return `Simulated price chart for ${symbol}`;
  const changePct = (last - first) / first;
  const highs = history.points.map((p) => p.h);
  const lows = history.points.map((p) => p.l);
  return `Simulated price chart for ${symbol}, ${rangeLabel}: from ${money(first)} to ${money(last)} (${percent(changePct, { sign: true })}), ranging between ${money(Math.min(...lows))} and ${money(Math.max(...highs))}.`;
}

export { parseISODate };
