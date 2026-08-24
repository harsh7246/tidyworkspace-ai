// popup/popup.js

import { local } from '../shared/storage.js';
import { STORAGE_KEYS, PROVIDERS } from '../shared/constants.js';
import { getActionLog, undoEntry } from '../background/actionLog.js';

const statusSection = document.getElementById('statusSection');
const groupingToggle = document.getElementById('groupingToggle');
const renamingToggle = document.getElementById('renamingToggle');
const actionLogEl = document.getElementById('actionLog');
const emptyLogEl = document.getElementById('emptyLog');
const openOptionsBtn = document.getElementById('openOptions');

openOptionsBtn.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

async function init() {
  await renderStatus();
  await renderToggles();
  await renderLog();
}

async function renderStatus() {
  statusSection.innerHTML = '';

  const provider = await local.get(STORAGE_KEYS.PROVIDER, null);
  const apiKeys = await local.get(STORAGE_KEYS.API_KEYS, {});
  
  // Allow Ollama to pass status check without an API key
  const hasKey = provider && (provider === PROVIDERS.OLLAMA || apiKeys[provider]);

  if (!hasKey) {
    addBanner('warn', 'Set up your API key to enable TidyWorkspace AI.', true);
    return;
  }

  const groupingPaused = await local.get(STORAGE_KEYS.GROUPING_PAUSED, { paused: false });
  if (groupingPaused.paused) {
    addBanner('warn', 'Grouping paused — check your settings or provider connection.', true);
  }

  const renamingPaused = await local.get(STORAGE_KEYS.RENAMING_PAUSED, { paused: false });
  if (renamingPaused.paused) {
    addBanner('warn', 'Renaming paused — check your settings or provider connection.', true);
  }
}

function addBanner(kind, message, linkToOptions) {
  const div = document.createElement('div');
  div.className = `status-banner ${kind}`;
  const text = document.createElement('span');
  text.textContent = message;
  div.appendChild(text);
  if (linkToOptions) {
    const link = document.createElement('a');
    link.textContent = 'Open settings';
    link.addEventListener('click', () => chrome.runtime.openOptionsPage());
    div.appendChild(document.createTextNode(' — '));
    div.appendChild(link);
  }
  statusSection.appendChild(div);
}

async function renderToggles() {
  groupingToggle.checked = await local.get(STORAGE_KEYS.GROUPING_ENABLED, true);
  renamingToggle.checked = await local.get(STORAGE_KEYS.RENAMING_ENABLED, true);

  groupingToggle.addEventListener('change', async () => {
    await local.set({ [STORAGE_KEYS.GROUPING_ENABLED]: groupingToggle.checked });
  });
  renamingToggle.addEventListener('change', async () => {
    await local.set({ [STORAGE_KEYS.RENAMING_ENABLED]: renamingToggle.checked });
  });
}

async function renderLog() {
  const log = await getActionLog();
  actionLogEl.innerHTML = '';

  if (log.length === 0) {
    emptyLogEl.classList.add('visible');
    return;
  }
  emptyLogEl.classList.remove('visible');

  for (const entry of log) {
    actionLogEl.appendChild(renderEntry(entry));
  }
}

function renderEntry(entry) {
  const li = document.createElement('li');

  const textWrap = document.createElement('div');
  textWrap.className = 'entry-text';

  const title = document.createElement('div');
  title.className = 'entry-title';

  const meta = document.createElement('div');
  meta.className = 'entry-meta';

  if (entry.type === 'group') {
    title.textContent = `Grouped tab → "${entry.data.groupName}"`;
    meta.textContent = entry.data.wasNewGroup ? 'New group created' : 'Added to existing group';
  } else {
    title.textContent = `Renamed download`;
    meta.textContent = `${entry.data.originalFilename} → ${entry.data.newFilename}`;
  }

  textWrap.appendChild(title);
  textWrap.appendChild(meta);

  const undoBtn = document.createElement('button');
  undoBtn.className = 'undo-btn';
  if (entry.undone) {
    undoBtn.textContent = entry.type === 'rename' ? 'Noted' : 'Undone';
    undoBtn.disabled = true;
  } else {
    undoBtn.textContent = 'Undo';
    undoBtn.addEventListener('click', async () => {
      undoBtn.disabled = true;
      undoBtn.textContent = '…';
      await undoEntry(entry);
      await renderLog();
    });
  }

  li.appendChild(textWrap);
  li.appendChild(undoBtn);
  return li;
}

init();