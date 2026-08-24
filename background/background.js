// background/background.js
// Entry point — registers all top-level Chrome event listeners and
// delegates to the two pipelines. Keep this file thin; logic lives in
// tabSweeper.js and downloadRenamer.js.

import { onTabCreated, onAlarm } from './tabSweeper.js';
import { onDeterminingFilename } from './downloadRenamer.js';
import { local } from '../shared/storage.js';
import { STORAGE_KEYS, DEFAULT_EXCLUSION_LIST, DEFAULT_SWEEP_PERIOD_MINUTES } from '../shared/constants.js';

chrome.runtime.onInstalled.addListener(async (details) => {
  // Seed defaults on first install so options page and pipelines have
  // something sane to read immediately.
  if (details.reason === 'install') {
    const existingExclusion = await local.get(STORAGE_KEYS.EXCLUSION_LIST, null);
    if (existingExclusion === null) {
      await local.set({ [STORAGE_KEYS.EXCLUSION_LIST]: DEFAULT_EXCLUSION_LIST });
    }
    await local.set({
      [STORAGE_KEYS.GROUPING_ENABLED]: true,
      [STORAGE_KEYS.RENAMING_ENABLED]: true,
      tw_sweep_period_minutes: DEFAULT_SWEEP_PERIOD_MINUTES
    });
  }
});

chrome.tabs.onCreated.addListener((tab) => {
  onTabCreated(tab).catch((err) => console.error('TidyWorkspace: onTabCreated failed', err));
});

chrome.alarms.onAlarm.addListener((alarm) => {
  onAlarm(alarm).catch((err) => console.error('TidyWorkspace: sweep alarm handler failed', err));
});

chrome.downloads.onDeterminingFilename.addListener(onDeterminingFilename);
