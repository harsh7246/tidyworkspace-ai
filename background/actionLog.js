// background/actionLog.js
//
// Keeps the last N actions (tab-grouped / file-renamed) for the popup's
// undo panel. Persists in chrome.storage.local so it survives browser
// restarts (per the resolved "open question" in §11 — persisting gives
// more trust value than resetting each session, at negligible cost).

import { local, updateLocal } from '../shared/storage.js';
import { STORAGE_KEYS, ACTION_LOG_MAX_ENTRIES } from '../shared/constants.js';

/**
 * @typedef {Object} ActionLogEntry
 * @property {string} id
 * @property {'group'|'rename'} type
 * @property {number} timestamp
 * @property {object} data - type-specific payload
 * @property {boolean} undone
 */

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function logGroupAction({ tabId, groupId, groupName, wasNewGroup }) {
  return appendEntry({
    type: 'group',
    data: { tabId, groupId, groupName, wasNewGroup }
  });
}

export async function logRenameAction({ downloadId, originalFilename, newFilename }) {
  return appendEntry({
    type: 'rename',
    data: { downloadId, originalFilename, newFilename }
  });
}

async function appendEntry(partial) {
  const entry = {
    id: makeId(),
    timestamp: Date.now(),
    undone: false,
    ...partial
  };
  await updateLocal(STORAGE_KEYS.ACTION_LOG, [], (log) => {
    const next = [entry, ...log];
    return next.slice(0, ACTION_LOG_MAX_ENTRIES);
  });
  return entry;
}

export async function getActionLog() {
  return local.get(STORAGE_KEYS.ACTION_LOG, []);
}

export async function markUndone(entryId) {
  return updateLocal(STORAGE_KEYS.ACTION_LOG, [], (log) =>
    log.map((e) => (e.id === entryId ? { ...e, undone: true } : e))
  );
}

/**
 * Undo a single entry. For 'group' entries this actually ungroups the
 * tab. For 'rename' entries the file is already on disk, so this is
 * informational only per §4.4 — the caller (popup) is expected to show
 * the old/new name so the user can rename it back manually.
 */
export async function undoEntry(entry) {
  if (entry.type === 'group') {
    try {
      await chrome.tabs.ungroup(entry.data.tabId);
    } catch (err) {
      // Tab may already be closed/moved — nothing more we can do.
      console.warn('TidyWorkspace: could not ungroup tab', entry.data.tabId, err);
    }
  }
  // rename: no-op, informational only.
  await markUndone(entry.id);
}
