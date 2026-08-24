// background/notify.js
//
// One-time badge/notification when a pipeline pauses due to an invalid
// key or repeated failures, per §7. We use a Chrome notification (rather
// than repeating it on every sweep) plus the action badge text, and rely
// on STORAGE_KEYS.*_PAUSED to make it "one-time" — callers only invoke
// this when the paused state actually transitions from false -> true.

const NOTIFICATION_ID_PREFIX = 'tidyworkspace-paused-';

export async function notifyPipelinePaused(pipelineName, message) {
  try {
    await chrome.notifications.create(`${NOTIFICATION_ID_PREFIX}${pipelineName}`, {
      type: 'basic',
      iconUrl: '../icons/icon128.png',
      title: 'TidyWorkspace AI',
      message
    });
  } catch (err) {
    console.warn('TidyWorkspace: failed to show pause notification', err);
  }

  try {
    await chrome.action.setBadgeText({ text: '!' });
    await chrome.action.setBadgeBackgroundColor({ color: '#D93025' });
  } catch (err) {
    console.warn('TidyWorkspace: failed to set badge', err);
  }
}

export async function notifyPipelineResumed(pipelineName) {
  try {
    await chrome.notifications.clear(`${NOTIFICATION_ID_PREFIX}${pipelineName}`);
  } catch {
    // ignore
  }
  try {
    await chrome.action.setBadgeText({ text: '' });
  } catch (err) {
    console.warn('TidyWorkspace: failed to clear badge', err);
  }
}
