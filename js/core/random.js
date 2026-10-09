// Seeded pseudo-random numbers so the simulated market is identical on every
// device and every reload. Not suitable for anything security related.

/** FNV-1a 32-bit hash of a string. */
export function hashString(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Mulberry32: small, fast, good enough for visual simulations. */
export function mulberry32(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Random source with uniform and standard-normal draws. */
export function createRandom(seedText) {
  const next = mulberry32(hashString(String(seedText)));
  let spare = null;

  return {
    next,
    normal() {
      if (spare !== null) {
        const value = spare;
        spare = null;
        return value;
      }
      let u = 0;
      while (u === 0) u = next();
      const v = next();
      const magnitude = Math.sqrt(-2 * Math.log(u));
      spare = magnitude * Math.sin(2 * Math.PI * v);
      return magnitude * Math.cos(2 * Math.PI * v);
    },
  };
}
