// shared/storage.js
// Thin promise wrappers around chrome.storage.local/session so callers
// never touch the callback-style API directly.

export const local = {
  async get(keyOrKeys, fallback) {
    const result = await chrome.storage.local.get(keyOrKeys);
    if (typeof keyOrKeys === 'string') {
      return result[keyOrKeys] !== undefined ? result[keyOrKeys] : fallback;
    }
    return result;
  },
  async set(obj) {
    return chrome.storage.local.set(obj);
  },
  async remove(keyOrKeys) {
    return chrome.storage.local.remove(keyOrKeys);
  }
};

export const session = {
  async get(keyOrKeys, fallback) {
    const result = await chrome.storage.session.get(keyOrKeys);
    if (typeof keyOrKeys === 'string') {
      return result[keyOrKeys] !== undefined ? result[keyOrKeys] : fallback;
    }
    return result;
  },
  async set(obj) {
    return chrome.storage.session.set(obj);
  },
  async remove(keyOrKeys) {
    return chrome.storage.session.remove(keyOrKeys);
  }
};

/**
 * Read-modify-write helper to avoid lost updates when multiple callers
 * touch the same key in quick succession (best-effort — chrome.storage
 * has no real transactions, but service worker JS is single-threaded
 * between awaits, so this is safe enough for our access patterns).
 */
export async function updateLocal(key, defaultValue, mutator) {
  const current = await local.get(key, defaultValue);
  const next = mutator(current);
  await local.set({ [key]: next });
  return next;
}

export async function updateSession(key, defaultValue, mutator) {
  const current = await session.get(key, defaultValue);
  const next = mutator(current);
  await session.set({ [key]: next });
  return next;
}
