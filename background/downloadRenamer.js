// background/downloadRenamer.js
// §4.2 — Download Auto-Renamer

import { local, updateLocal } from '../shared/storage.js';
import { STORAGE_KEYS, DEFAULT_EXCLUSION_LIST, RENAME_TIMEOUT_MS } from '../shared/constants.js';
import { isUrlExcluded } from '../shared/domainMatch.js';
import { sanitizeFilename, withDedupeSuffix, splitExtension } from '../shared/sanitizeFilename.js';
import { getActiveAdapter, requestStructured, LLMAdapterError } from './adapters/adapterFactory.js';
import { logRenameAction } from './actionLog.js';
import { notifyPipelinePaused, notifyPipelineResumed } from './notify.js';

const SYSTEM_PROMPT = `You are a file-renaming assistant. Given a downloaded file's original name,
MIME type, and the source page's title and domain, produce a short, clean,
descriptive filename WITHOUT an extension. Use underscores or hyphens
instead of spaces if that suits the content, keep it under 60 characters,
and never include illegal filesystem characters. Do not guess at content
you cannot infer from the given metadata — prefer being conservative over
inventing details.`;

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    filename: { type: 'string' }
  },
  required: ['filename']
};

const RECENT_RENAME_WINDOW_MS = 60_000;

/**
 * Registered as the chrome.downloads.onDeterminingFilename listener.
 * IMPORTANT: `suggest` must be called exactly once, synchronously or
 * asynchronously (Chrome will wait), or the download stalls. We
 * guarantee this by tracking whether we've called it and always falling
 * back on any error path.
 */
export function onDeterminingFilename(downloadItem, suggest) {
  let suggested = false;
  const safeSuggest = (result) => {
    if (suggested) return;
    suggested = true;
    try {
      suggest(result);
    } catch (err) {
      console.error('TidyWorkspace: suggest() threw', err);
    }
  };

  handleDownload(downloadItem, safeSuggest).catch((err) => {
    console.error('TidyWorkspace: unexpected renamer error, falling back to original name', err);
    safeSuggest(); // undefined -> Chrome uses the original filename
  });

  // Returning true tells Chrome we'll call suggest() asynchronously.
  return true;
}

async function handleDownload(downloadItem, suggest) {
  const originalFilename = downloadItem.filename || '';
  const enabled = await local.get(STORAGE_KEYS.RENAMING_ENABLED, true);
  if (!enabled) {
    suggest();
    return;
  }

  const paused = await local.get(STORAGE_KEYS.RENAMING_PAUSED, { paused: false });
  if (paused.paused) {
    suggest();
    return;
  }

  const sourceUrl = downloadItem.url || downloadItem.finalUrl || '';
  const exclusionList = await local.get(STORAGE_KEYS.EXCLUSION_LIST, DEFAULT_EXCLUSION_LIST);
  if (isUrlExcluded(sourceUrl, exclusionList)) {
    suggest({ filename: originalFilename });
    return;
  }

  let sourceTab = null;
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    sourceTab = tabs[0] || null;
  } catch {
    // No active tab context available — proceed without it.
  }

  const { adapter, models, reason } = await getActiveAdapter();
  if (!adapter) {
    suggest({ filename: originalFilename }); // no key configured — fail safe
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RENAME_TIMEOUT_MS);

  try {
    const result = await Promise.race([
      requestStructured(adapter, {
        system: SYSTEM_PROMPT,
        prompt: JSON.stringify({
          originalFilename,
          mimeType: downloadItem.mime || '',
          sourcePageTitle: sourceTab?.title || '',
          sourceDomain: safeDomain(sourceTab?.url || sourceUrl)
        }),
        responseSchema: RESPONSE_SCHEMA,
        model: models.renaming,
        maxTokens: 200,
        signal: controller.signal
      }),
      timeoutRejection(controller.signal)
    ]);

    clearTimeout(timeout);

    let finalName = sanitizeFilename(result.filename, originalFilename);
    if (await looksLikeRecentDuplicate(finalName)) {
      finalName = withDedupeSuffix(finalName);
    }
    await rememberRecentRename(finalName);

    await logRenameAction({
      downloadId: downloadItem.id,
      originalFilename,
      newFilename: finalName
    });
    await clearPause();

    suggest({ filename: finalName });
  } catch (err) {
    clearTimeout(timeout);
    await handleRenameError(err);
    suggest({ filename: originalFilename }); // never leave a download hanging
  }
}

function safeDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function timeoutRejection(signal) {
  return new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(new LLMAdapterError('Renaming timed out', { retriable: false })));
  });
}

async function looksLikeRecentDuplicate(candidateName) {
  const recents = await local.get(STORAGE_KEYS.RECENT_RENAMES, []);
  const now = Date.now();
  const { base } = splitExtension(candidateName);
  return recents.some((r) => r.base === base && now - r.timestamp < RECENT_RENAME_WINDOW_MS);
}

async function rememberRecentRename(finalName) {
  const { base } = splitExtension(finalName);
  await updateLocal(STORAGE_KEYS.RECENT_RENAMES, [], (recents) => {
    const now = Date.now();
    const pruned = recents.filter((r) => now - r.timestamp < RECENT_RENAME_WINDOW_MS);
    return [...pruned, { base, timestamp: now }].slice(-50);
  });
}

async function handleRenameError(err) {
  if (err instanceof LLMAdapterError && (err.status === 401 || err.status === 403)) {
    const paused = await local.get(STORAGE_KEYS.RENAMING_PAUSED, { paused: false });
    if (!paused.paused) {
      await local.set({ [STORAGE_KEYS.RENAMING_PAUSED]: { paused: true, reason: 'invalid-key' } });
      await notifyPipelinePaused('renaming', 'Renaming paused — check your API key.');
    }
    return;
  }
  // Timeout, malformed JSON, rate limit, or any other error: this single
  // download just falls back to its original name (handled by caller).
  console.warn('TidyWorkspace: rename failed, using original filename', err.message);
}

async function clearPause() {
  const paused = await local.get(STORAGE_KEYS.RENAMING_PAUSED, { paused: false });
  if (paused.paused) {
    await local.set({ [STORAGE_KEYS.RENAMING_PAUSED]: { paused: false, reason: null } });
    await notifyPipelineResumed('renaming');
  }
}
