// Mock market data: a fictional universe of eight instruments and a seeded
// price model. Nothing here is real market data, and none of these companies
// exist. The model is deterministic, so every device sees the same history.
//
// Model (per trading day t, per instrument i):
//   return_i,t = drift_i + beta_i * market_t + sectorBeta_i * sector_t + vol_i * regime_t * noise
// with a slowly changing volatility regime and occasional "earnings" jumps.
// Stocks that share a sector factor tend to move together, which the
// diversification lesson points out.
//
// Day numbers are relative to the simulation: day 0 is when the account was
// opened, negative days are history, positive days are reached by advancing
// the simulated market.

import { createRandom, hashString } from '../core/random.js';

export const MARKET_SOURCE = {
  id: 'tradelab-simulated-market',
  name: 'TradeLab Simulated Market',
  shortName: 'Simulated market',
  description:
    'Prices are generated in your browser by a seeded random-walk model with market, sector and company factors. They are not real market data, and the companies are fictional.',
};

export const INSTRUMENTS = [
  {
    symbol: 'HLCN',
    name: 'Halcyon Semiconductor',
    sector: 'Technology',
    kind: 'stock',
    description: 'Designs processors for data centers and consumer devices.',
    price0: 186.4,
    drift: 0.0004,
    beta: 1.3,
    sectorBeta: 1.6,
    vol: 0.014,
    volume: 4200000,
  },
  {
    symbol: 'SKLF',
    name: 'Skyloft Software',
    sector: 'Technology',
    kind: 'stock',
    description: 'Sells accounting and scheduling software to small businesses.',
    price0: 94.1,
    drift: 0.0003,
    beta: 1.25,
    sectorBeta: 1.5,
    vol: 0.016,
    volume: 3100000,
  },
  {
    symbol: 'MRDH',
    name: 'Meridian Health',
    sector: 'Healthcare',
    kind: 'stock',
    description: 'Runs outpatient clinics and diagnostic labs.',
    price0: 132.05,
    drift: 0.00025,
    beta: 0.7,
    sectorBeta: 0.6,
    vol: 0.009,
    volume: 1800000,
  },
  {
    symbol: 'RDGE',
    name: 'Ridgeway Energy',
    sector: 'Energy',
    kind: 'stock',
    description: 'Produces natural gas and is building a portfolio of solar farms.',
    price0: 58.3,
    drift: 0.0001,
    beta: 0.9,
    sectorBeta: 1.2,
    vol: 0.014,
    volume: 5600000,
  },
  {
    symbol: 'BRMB',
    name: 'Bramble Foods',
    sector: 'Consumer staples',
    kind: 'stock',
    description: 'Operates a regional grocery chain and its own line of store brands.',
    price0: 71.2,
    drift: 0.0002,
    beta: 0.5,
    sectorBeta: 0.5,
    vol: 0.0075,
    volume: 1200000,
  },
  {
    symbol: 'HRBL',
    name: 'Harborline Financial',
    sector: 'Financials',
    kind: 'stock',
    description: 'A regional bank offering mortgages, business loans and savings accounts.',
    price0: 47.6,
    drift: 0.0002,
    beta: 1.1,
    sectorBeta: 0.8,
    vol: 0.012,
    volume: 6300000,
  },
  {
    symbol: 'VRDM',
    name: 'Verdant Materials',
    sector: 'Materials',
    kind: 'stock',
    description: 'Mines and refines metals used in batteries. Known for large price swings.',
    price0: 23.15,
    drift: 0,
    beta: 1.2,
    sectorBeta: 1.1,
    vol: 0.027,
    volume: 9800000,
  },
  {
    symbol: 'TLMX',
    name: 'TradeLab Total Market Fund',
    sector: 'Index fund',
    kind: 'fund',
    description: 'A simulated index fund that holds the whole TradeLab market, so it moves with the market factor.',
    price0: 412.3,
    drift: 0.0001,
    beta: 1.0,
    sectorBeta: 0,
    vol: 0.0015,
    volume: 2400000,
  },
];

export const SECTORS = ['Technology', 'Healthcare', 'Energy', 'Consumer staples', 'Financials', 'Materials', 'Index fund'];

export const RANGES = [
  { id: '1D', label: '1D', description: 'today' },
  { id: '1W', label: '1W', description: 'past week' },
  { id: '1M', label: '1M', description: 'past month' },
  { id: '3M', label: '3M', description: 'past 3 months' },
  { id: '1Y', label: '1Y', description: 'past year' },
  { id: '5Y', label: '5Y', description: 'past 5 years' },
];

export const SEED = 'tradelab-market-96';
export const HISTORY_DAYS = 1300; // about five years of history before day 0
export const MAX_SIM_DAY = 1300; // the simulation can advance about five years
const OFFSET = HISTORY_DAYS;
const LENGTH = HISTORY_DAYS + MAX_SIM_DAY + 1;
const MARKET_VOL = 0.0085;
const SECTOR_VOL = 0.006;
const SESSION_MINUTES = 390; // 9:30 to 16:00
const EARNINGS_CYCLE = 63; // about once a quarter

const round2 = (value) => Math.round(value * 100) / 100;
const instrumentIndex = new Map(INSTRUMENTS.map((instrument) => [instrument.symbol, instrument]));

let series = null;

function build() {
  const marketRng = createRandom(`${SEED}:market`);
  const regimeRng = createRandom(`${SEED}:regime`);
  const regime = new Float64Array(LENGTH);
  const market = new Float64Array(LENGTH);
  let logVol = 0;
  for (let i = 0; i < LENGTH; i += 1) {
    logVol = 0.985 * logVol + 0.05 * regimeRng.normal();
    regime[i] = Math.exp(logVol);
    market[i] = 0.00025 + MARKET_VOL * regime[i] * marketRng.normal();
  }

  const sectors = new Map();
  for (const sector of SECTORS) {
    const rng = createRandom(`${SEED}:sector:${sector}`);
    const path = new Float64Array(LENGTH);
    for (let i = 0; i < LENGTH; i += 1) path[i] = SECTOR_VOL * regime[i] * rng.normal();
    sectors.set(sector, path);
  }

  series = new Map();
  for (const instrument of INSTRUMENTS) {
    const rng = createRandom(`${SEED}:${instrument.symbol}`);
    const ohlcRng = createRandom(`${SEED}:${instrument.symbol}:ohlc`);
    const sectorPath = sectors.get(instrument.sector);
    const earningsOffset = hashString(instrument.symbol) % EARNINGS_CYCLE;
    const returns = new Float64Array(LENGTH);
    const sigma = new Float64Array(LENGTH);
    const earnings = new Uint8Array(LENGTH);
    const baseSigma = Math.hypot(instrument.beta * MARKET_VOL, instrument.sectorBeta * SECTOR_VOL, instrument.vol);

    for (let i = 0; i < LENGTH; i += 1) {
      sigma[i] = baseSigma * regime[i];
      if (i === 0) continue;
      let value =
        instrument.drift +
        instrument.beta * market[i] +
        instrument.sectorBeta * sectorPath[i] +
        instrument.vol * regime[i] * rng.normal();
      if (instrument.kind === 'stock' && (i + earningsOffset) % EARNINGS_CYCLE === 0) {
        value += instrument.vol * 2.5 * rng.normal();
        earnings[i] = 1;
      }
      returns[i] = Math.max(-0.25, Math.min(0.25, value));
    }

    const close = new Float64Array(LENGTH);
    close[OFFSET] = instrument.price0;
    for (let i = OFFSET + 1; i < LENGTH; i += 1) close[i] = close[i - 1] * Math.exp(returns[i]);
    for (let i = OFFSET; i > 0; i -= 1) close[i - 1] = close[i] / Math.exp(returns[i]);

    const open = new Float64Array(LENGTH);
    const high = new Float64Array(LENGTH);
    const low = new Float64Array(LENGTH);
    const volume = new Float64Array(LENGTH);
    for (let i = 0; i < LENGTH; i += 1) {
      const c = round2(close[i]);
      const previous = i > 0 ? round2(close[i - 1]) : c;
      const o = round2(previous * Math.exp(0.3 * sigma[i] * ohlcRng.normal()));
      const h = round2(Math.max(o, c) * Math.exp(Math.abs(0.55 * sigma[i] * ohlcRng.normal())));
      const l = round2(Math.min(o, c) * Math.exp(-Math.abs(0.55 * sigma[i] * ohlcRng.normal())));
      const surprise = sigma[i] > 0 ? Math.abs(returns[i]) / sigma[i] : 0;
      close[i] = c;
      open[i] = o;
      high[i] = Math.max(h, o, c);
      low[i] = Math.max(0.01, Math.min(l, o, c));
      volume[i] = Math.round(
        instrument.volume * Math.exp(0.28 * ohlcRng.normal()) * (0.75 + 0.35 * surprise) * (earnings[i] ? 2.1 : 1),
      );
    }

    series.set(instrument.symbol, { open, high, low, close, volume, earnings });
  }
}

function seriesFor(symbol) {
  if (!series) build();
  const data = series.get(symbol);
  if (!data) throw new Error(`Unknown simulated symbol: ${symbol}`);
  return data;
}

const clampDay = (day) => Math.max(-HISTORY_DAYS, Math.min(MAX_SIM_DAY, Math.round(day)));

export function getInstrument(symbol) {
  return instrumentIndex.get(String(symbol).toUpperCase()) || null;
}

export function closeAt(symbol, day) {
  return seriesFor(symbol).close[OFFSET + clampDay(day)];
}

export function dayBar(symbol, day) {
  const data = seriesFor(symbol);
  const i = OFFSET + clampDay(day);
  return { day: clampDay(day), o: data.open[i], h: data.high[i], l: data.low[i], c: data.close[i], v: data.volume[i] };
}

/** Quote for a symbol as of the close of a simulated day. */
export function quoteAt(symbol, day) {
  const data = seriesFor(symbol);
  const d = clampDay(day);
  const i = OFFSET + d;
  const price = data.close[i];
  const prevClose = data.close[Math.max(0, i - 1)];
  let high52 = -Infinity;
  let low52 = Infinity;
  for (let k = Math.max(0, i - 251); k <= i; k += 1) {
    if (data.high[k] > high52) high52 = data.high[k];
    if (data.low[k] < low52) low52 = data.low[k];
  }
  let volumeSum = 0;
  let volumeCount = 0;
  for (let k = Math.max(0, i - 19); k <= i; k += 1) {
    volumeSum += data.volume[k];
    volumeCount += 1;
  }
  return {
    symbol,
    day: d,
    price,
    prevClose,
    change: round2(price - prevClose),
    changePct: prevClose ? (price - prevClose) / prevClose : 0,
    open: data.open[i],
    high: data.high[i],
    low: data.low[i],
    volume: data.volume[i],
    averageVolume: Math.round(volumeSum / volumeCount),
    high52,
    low52,
  };
}

/** Last `count` daily closes up to and including `day` (for sparklines). */
export function recentCloses(symbol, day, count = 30) {
  const data = seriesFor(symbol);
  const end = OFFSET + clampDay(day);
  const start = Math.max(0, end - count + 1);
  return Array.from(data.close.slice(start, end + 1));
}

/**
 * One-minute price path for a simulated session: a Brownian bridge from the
 * day's open to its close, stretched to touch the day's high and low.
 */
function sessionPath(symbol, day) {
  const bar = dayBar(symbol, day);
  const rng = createRandom(`${SEED}:${symbol}:session:${bar.day}`);
  const n = SESSION_MINUTES;
  const walk = new Float64Array(n + 1);
  for (let k = 1; k <= n; k += 1) walk[k] = walk[k - 1] + rng.normal();

  const deviation = new Float64Array(n + 1);
  const base = new Float64Array(n + 1);
  let maxDev = 0;
  let minDev = 0;
  let maxAt = Math.floor(n / 3);
  let minAt = Math.floor((2 * n) / 3);
  for (let k = 0; k <= n; k += 1) {
    const t = k / n;
    base[k] = bar.o + (bar.c - bar.o) * t;
    deviation[k] = walk[k] - t * walk[n];
    if (deviation[k] > maxDev) {
      maxDev = deviation[k];
      maxAt = k;
    }
    if (deviation[k] < minDev) {
      minDev = deviation[k];
      minAt = k;
    }
  }

  const up = maxDev > 0 ? (bar.h - base[maxAt]) / maxDev : 0;
  const down = minDev < 0 ? (bar.l - base[minAt]) / minDev : 0;
  const path = new Float64Array(n + 1);
  for (let k = 0; k <= n; k += 1) {
    const scaled = base[k] + deviation[k] * (deviation[k] >= 0 ? up : down);
    path[k] = Math.min(bar.h, Math.max(bar.l, scaled));
  }
  path[0] = bar.o;
  path[n] = bar.c;
  if (maxAt > 0 && maxAt < n) path[maxAt] = bar.h;
  if (minAt > 0 && minAt < n) path[minAt] = bar.l;
  return { bar, path };
}

function aggregateSession(symbol, day, minutesPerBar) {
  const { bar, path } = sessionPath(symbol, day);
  const bars = [];
  const count = SESSION_MINUTES / minutesPerBar;
  const weights = [];
  for (let b = 0; b < count; b += 1) {
    const x = (b / (count - 1)) * 2 - 1;
    weights.push(1 + 2.2 * x * x);
  }
  const weightSum = weights.reduce((sum, value) => sum + value, 0);
  for (let b = 0; b < count; b += 1) {
    const from = b * minutesPerBar;
    const to = from + minutesPerBar;
    let h = -Infinity;
    let l = Infinity;
    for (let k = from; k <= to; k += 1) {
      if (path[k] > h) h = path[k];
      if (path[k] < l) l = path[k];
    }
    bars.push({
      day: bar.day,
      minute: from,
      o: round2(path[from]),
      h: round2(h),
      l: round2(l),
      c: round2(path[to]),
      v: Math.round((bar.v * weights[b]) / weightSum),
    });
  }
  return bars;
}

/**
 * Price history for a range ending at the close of `day`.
 * Returns { symbol, range, interval, reference, points } where `reference` is
 * the price the range's change is measured from.
 */
export function historyAt(symbol, range, day) {
  const d = clampDay(day);
  const data = seriesFor(symbol);
  const i = OFFSET + d;

  if (range === '1D') {
    return { symbol, range, interval: '5m', reference: data.close[Math.max(0, i - 1)], points: aggregateSession(symbol, d, 5) };
  }

  if (range === '1W') {
    const points = [];
    for (let k = d - 4; k <= d; k += 1) points.push(...aggregateSession(symbol, k, 30));
    return { symbol, range, interval: '30m', reference: data.close[Math.max(0, i - 5)], points };
  }

  if (range === '5Y') {
    const points = [];
    const buckets = 252;
    for (let b = buckets - 1; b >= 0; b -= 1) {
      const endDay = d - b * 5;
      const startDay = endDay - 4;
      if (startDay < -HISTORY_DAYS) continue;
      let h = -Infinity;
      let l = Infinity;
      let v = 0;
      for (let k = startDay; k <= endDay; k += 1) {
        const idx = OFFSET + k;
        if (data.high[idx] > h) h = data.high[idx];
        if (data.low[idx] < l) l = data.low[idx];
        v += data.volume[idx];
      }
      points.push({ day: endDay, o: data.open[OFFSET + startDay], h, l, c: data.close[OFFSET + endDay], v });
    }
    const first = points[0] ? OFFSET + points[0].day - 5 : 0;
    return { symbol, range, interval: '1w', reference: data.close[Math.max(0, first)], points };
  }

  const lengths = { '1M': 21, '3M': 63, '1Y': 252 };
  const length = lengths[range] || lengths['3M'];
  const start = Math.max(-HISTORY_DAYS, d - length + 1);
  const points = [];
  for (let k = start; k <= d; k += 1) points.push(dayBar(symbol, k));
  return {
    symbol,
    range: lengths[range] ? range : '3M',
    interval: '1d',
    reference: data.close[Math.max(0, OFFSET + start - 1)],
    points,
  };
}
