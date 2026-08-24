// background/tabSweeper.js
// §4.1 — Tab Sweeper & Grouping Engine

import { local, updateLocal, updateSession } from '../shared/storage.js';
import {
  STORAGE_KEYS,
  SWEEP_ALARM_NAME,
  DEFAULT_SWEEP_PERIOD_MINUTES,
  DEFAULT_EXCLUSION_LIST,
  CHROME_TAB_GROUP_COLORS
} from '../shared/constants.js';
import { isUrlExcluded, extractDomain } from '../shared/domainMatch.js';
import { findSimilarExisting } from '../shared/textSimilarity.js';
import { getActiveAdapter, requestStructured, LLMAdapterError } from './adapters/adapterFactory.js';
import { logGroupAction } from './actionLog.js';
import { notifyPipelinePaused, notifyPipelineResumed } from './notify.js';

// REPLACE lines L18-L25 with this:
const SYSTEM_PROMPT = `You are a browser tab organizer. IMPORTANT: when you respond, output ONLY valid JSON (no prose, no explanation, no markdown, no code fences).
The JSON must match the expected schema: { "decisions": [ { "tabId": number, "existingGroupId": string|null, "newGroupName": string|null, "color": string|null } ] }.
Every candidate tab must appear exactly once in "decisions" with either existingGroupId (string) or newGroupName (string).
If you cannot produce valid JSON for any reason, respond with exactly: {"decisions": [], "error": "UNABLE_TO_GENERATE_VALID_JSON"}.
Group names should be short (1-3 words) and generic categories (e.g. "Shopping", "Research", "Travel").`;

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    decisions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          tabId: { type: 'number' },
          existingGroupId: { type: 'string' },
          newGroupName: { type: 'string' },
          color: { type: 'string', enum: CHROME_TAB_GROUP_COLORS }
        },
        required: ['tabId']
      }
    }
  },
  required: ['decisions']
};

const SYSTEM_PAGE_PREFIXES = ['chrome://', 'chrome-extension://', 'edge://', 'about:', 'devtools://'];

// ---- Public entry points, wired up in background.js ---------------------

export async function onTabCreated(tab) {
  if (!(await isGroupingEnabled())) return;
  if (!tab.id) return;

  // Pending queue lives in session storage (per architecture §3) since it's
  // only meaningful for the current browser session.
  await updateSession(STORAGE_KEYS.PENDING_TABS, [], (pending) =>
    pending.includes(tab.id) ? pending : [...pending, tab.id]
  );

  await ensureSweepAlarmScheduled();
}

export async function onAlarm(alarm) {
  if (alarm.name !== SWEEP_ALARM_NAME) return;
  await runSweep();
}

// ---- Internals ------------------------------------------------------------

async function isGroupingEnabled() {
  return local.get(STORAGE_KEYS.GROUPING_ENABLED, true);
}

async function ensureSweepAlarmScheduled() {
  const existing = await chrome.alarms.get(SWEEP_ALARM_NAME);
  if (existing) return; // already scheduled — do nothing, wait for next tick
  const periodInMinutes = await local.get('tw_sweep_period_minutes', DEFAULT_SWEEP_PERIOD_MINUTES);
  chrome.alarms.create(SWEEP_ALARM_NAME, { periodInMinutes });
}

async function runSweep() {
  if (!(await isGroupingEnabled())) return;

  const paused = await local.get(STORAGE_KEYS.GROUPING_PAUSED, { paused: false });
  if (paused.paused) return; // stays paused until user fixes the key in settings

  const backoffUntil = await local.get('tw_grouping_backoff_until', 0);
  if (Date.now() < backoffUntil) return; // exponential backoff — skip this tick only

  try {
    const candidates = await collectCandidateTabs();
    if (candidates.length === 0) {
      return; // nothing to do, don't burn tokens
    }

    const existingGroups = await getExistingGroups();
    const { adapter, models, reason } = await getActiveAdapter();

    if (!adapter) {
      // No key configured — pipeline effectively inactive; popup already
      // communicates this via STORAGE_KEYS.GROUPING_ENABLED/paused state.
      return;
    }

    const result = await requestStructured(adapter, {
      system: SYSTEM_PROMPT,
      prompt: buildPrompt(existingGroups, candidates),
      responseSchema: RESPONSE_SCHEMA,
      model: models.grouping,
      maxTokens: 2048
    });

    await applyDecisions(result.decisions || [], existingGroups, candidates);
    await clearBackoff();
    await clearPause(STORAGE_KEYS.GROUPING_PAUSED, 'grouping');
    await removeProcessedFromPending(candidates.map((c) => c.id));
  } catch (err) {
    await handleSweepError(err);
  }
}

async function collectCandidateTabs() {
  const exclusionList = await local.get(STORAGE_KEYS.EXCLUSION_LIST, DEFAULT_EXCLUSION_LIST);
  const tabs = await chrome.tabs.query({ 
  currentWindow: true, 
  groupId: chrome.tabGroups.TAB_GROUP_ID_NONE 
});

  const filtered = tabs.filter((tab) => {
    if (!tab.url) return false;
    if (SYSTEM_PAGE_PREFIXES.some((prefix) => tab.url.startsWith(prefix))) return false;
    if (tab.status === 'loading' && !tab.title) return false;
    if (isUrlExcluded(tab.url, exclusionList)) return false;
    return true;
  });

  // Re-verify each candidate still exists, guarding against tabs closed
  // between queueing and sweep.
  const verified = [];
  for (const tab of filtered) {
    try {
      const fresh = await chrome.tabs.get(tab.id);
      if (fresh) {
        verified.push({ id: fresh.id, title: fresh.title || '(untitled)', domain: extractDomain(fresh.url) });
      }
    } catch {
      // Tab closed mid-sweep — silently drop.
    }
  }
  return verified;
}

async function getExistingGroups() {
  const groups = await chrome.tabGroups.query({});
  return groups.map((g) => ({ id: String(g.id), name: g.title || '(untitled group)', color: g.color }));
}

function buildPrompt(existingGroups, candidateTabs) {
  return JSON.stringify({
    existingGroups: existingGroups.map((g) => ({ id: g.id, name: g.name, color: g.color })),
    candidateTabs: candidateTabs.map((t) => ({ id: t.id, title: t.title, domain: t.domain }))
  });
}

async function applyDecisions(decisions, existingGroups, candidates) {
  const existingNames = existingGroups.map((g) => g.name);
  const existingById = new Map(existingGroups.map((g) => [g.id, g]));
  const candidateIds = new Set(candidates.map((c) => c.id));

  for (const decision of decisions) {
    if (!candidateIds.has(decision.tabId)) continue; // ignore hallucinated tab ids

    try {
      if (decision.existingGroupId && existingById.has(decision.existingGroupId)) {
        const groupId = Number(decision.existingGroupId);
        await chrome.tabs.group({ tabIds: [decision.tabId], groupId });
        const group = existingById.get(decision.existingGroupId);
        await logGroupAction({
          tabId: decision.tabId,
          groupId,
          groupName: group.name,
          wasNewGroup: false
        });
        continue;
      }

      if (decision.newGroupName) {
        // Cheap duplicate-group guard: don't trust the model blindly if a
        // near-identical group name already exists.
        const similarExisting = findSimilarExisting(decision.newGroupName, existingNames);
        if (similarExisting) {
          const match = existingGroups.find((g) => g.name === similarExisting);
          if (match) {
            await chrome.tabs.group({ tabIds: [decision.tabId], groupId: Number(match.id) });
            await logGroupAction({
              tabId: decision.tabId,
              groupId: Number(match.id),
              groupName: match.name,
              wasNewGroup: false
            });
            continue;
          }
        }

        const newGroupId = await chrome.tabs.group({ tabIds: [decision.tabId] });
        const color = CHROME_TAB_GROUP_COLORS.includes(decision.color) ? decision.color : undefined;
        await chrome.tabGroups.update(newGroupId, { title: decision.newGroupName, color });
        await logGroupAction({
          tabId: decision.tabId,
          groupId: newGroupId,
          groupName: decision.newGroupName,
          wasNewGroup: true
        });
        // Track the new group so subsequent decisions in this same batch
        // can also match against it.
        existingGroups.push({ id: String(newGroupId), name: decision.newGroupName, color });
        existingById.set(String(newGroupId), { id: String(newGroupId), name: decision.newGroupName, color });
        existingNames.push(decision.newGroupName);
      }
    } catch (err) {
      // A single bad decision (e.g. tab closed between planning and
      // applying) shouldn't abort the whole batch.
      console.warn('TidyWorkspace: failed to apply grouping decision', decision, err);
    }
  }
}

async function removeProcessedFromPending(processedIds) {
  await updateSession(STORAGE_KEYS.PENDING_TABS, [], (pending) =>
    pending.filter((id) => !processedIds.includes(id))
  );
}
// REPLACE lines L235-L251 with this:
async function handleSweepError(err) {
  // Defensive normalization
  const e = err ?? {};
  const message = e.message ?? String(e);
  // Try to find raw model output fields that adapters often include
  const rawOutput =
    e.raw ??
    e.modelOutput ??
    (e.response && (e.response.text || e.response.body || e.response.raw)) ??
    null;

  // If we have raw model output, log a truncated version for debugging.
  if (rawOutput) {
    try {
      const snippet = typeof rawOutput === 'string' ? rawOutput.slice(0, 2000) : JSON.stringify(rawOutput).slice(0, 2000);
      console.error('TidyWorkspace: raw model output (truncated):', snippet);
    } catch (logErr) {
      console.error('TidyWorkspace: failed to stringify raw output for logging', logErr);
    }
  }

  // If it's an adapter-specific error, preserve original handling but be defensive
  const isAdapterError = (typeof LLMAdapterError !== 'undefined' && err instanceof LLMAdapterError) || (e.name === 'LLMAdapterError');

  try {
    if (isAdapterError) {
      if (e.status === 401 || e.status === 403) {
        await local.set({ [STORAGE_KEYS.GROUPING_PAUSED]: { paused: true, reason: 'invalid-key' } });
        await notifyPipelinePaused('grouping', 'Grouping paused — check your API key.');
        return;
      }

      const retriableFlag = Boolean(e.retriable) || (typeof e.retriable === 'function' && e.retriable());
      if (e.status === 429 || retriableFlag) {
        await applyBackoff();
        return;
      }

      // If the adapter failed because the model returned malformed JSON,
      // detect common parse-error messages and log extra context.
      if (/valid JSON|Unexpected token|Expected ','|Unexpected property|JSON/.test(message)) {
        console.warn('TidyWorkspace: grouping sweep failed — model returned malformed/unparseable JSON:', message);
        // Persist a tiny debug snippet so user can inspect later (optional)
        try {
          await local.set({ tw_last_bad_model_output: { time: Date.now(), snippet: typeof rawOutput === 'string' ? rawOutput.slice(0, 2000) : undefined } });
        } catch (e) {
          // ignore persistence errors
        }
        // Backoff to avoid immediate repeats
        await applyBackoff();
        return;
      }

      // Other non-retriable adapter error: log and skip this sweep only
      console.warn('TidyWorkspace: grouping sweep failed', message);
      return;
    }
  } catch (handlerErr) {
    console.error('TidyWorkspace: error while handling sweep error', handlerErr, 'original:', err);
    // fallthrough to final error log below
  }

  console.error('TidyWorkspace: unexpected grouping sweep error', err);
}

async function applyBackoff() {
  const attempts = await local.get('tw_grouping_backoff_attempts', 0);
  const nextAttempts = Math.min(attempts + 1, 6); // cap growth
  const delayMs = Math.min(30_000 * 2 ** nextAttempts, 30 * 60_000); // cap at 30 min
  await local.set({
    tw_grouping_backoff_attempts: nextAttempts,
    tw_grouping_backoff_until: Date.now() + delayMs
  });
}

async function clearBackoff() {
  await local.set({ tw_grouping_backoff_attempts: 0, tw_grouping_backoff_until: 0 });
}

async function clearPause(key, pipelineName) {
  const paused = await local.get(key, { paused: false });
  if (paused.paused) {
    await local.set({ [key]: { paused: false, reason: null } });
    await notifyPipelineResumed(pipelineName);
  }
}
