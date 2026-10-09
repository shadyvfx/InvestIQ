// Prototype persistence on top of localStorage.
//
// Browser storage is a convenience for this frontend-only prototype, not an
// authoritative or secure database: it lives in one browser, can be cleared
// at any time and is readable by anyone using the device. When the Flask
// backend exists, account and progress data should live there instead.
//
// If storage is unavailable (private mode, blocked site data, sandboxed
// previews), everything falls back to memory and the app keeps working for
// the current session.

const memory = new Map();
let available = null;

export function storageAvailable() {
  if (available !== null) return available;
  try {
    const probe = '__tradelab_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    available = true;
  } catch {
    available = false;
  }
  return available;
}

function readRaw(key) {
  if (storageAvailable()) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return memory.get(key) ?? null;
    }
  }
  return memory.get(key) ?? null;
}

export function readJSON(key) {
  const text = readRaw(key);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Returns true when the value was written to durable storage. */
export function writeJSON(key, value) {
  const text = JSON.stringify(value);
  memory.set(key, text);
  if (!storageAvailable()) return false;
  try {
    window.localStorage.setItem(key, text);
    return true;
  } catch {
    return false;
  }
}

export function removeKey(key) {
  memory.delete(key);
  if (!storageAvailable()) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Nothing else to do: the in-memory copy is already gone.
  }
}

/** Approximate size of a stored value in bytes (localStorage keeps UTF-16). */
export function storedBytes(key) {
  const text = readRaw(key);
  return text ? text.length * 2 : 0;
}
