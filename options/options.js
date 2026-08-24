// options/options.js

import { local } from '../shared/storage.js';
import {
  STORAGE_KEYS,
  PROVIDERS,
  DEFAULT_MODELS,
  DEFAULT_EXCLUSION_LIST,
  DEFAULT_SWEEP_PERIOD_MINUTES
} from '../shared/constants.js';
import { GeminiAdapter } from '../background/adapters/geminiAdapter.js';
import { OpenAIAdapter } from '../background/adapters/openaiAdapter.js';
import { ClaudeAdapter } from '../background/adapters/claudeAdapter.js';
import { DeepSeekAdapter } from '../background/adapters/deepseekAdapter.js';
import { OllamaAdapter } from '../background/adapters/ollamaAdapter.js';

const ADAPTER_CLASSES = {
  [PROVIDERS.GEMINI]: GeminiAdapter,
  [PROVIDERS.OPENAI]: OpenAIAdapter,
  [PROVIDERS.CLAUDE]: ClaudeAdapter,
  [PROVIDERS.DEEPSEEK]: DeepSeekAdapter,
  [PROVIDERS.OLLAMA]: OllamaAdapter
};

const providerSelect = document.getElementById('providerSelect');
const apiKeyInput = document.getElementById('apiKeyInput');
const ollamaUrlInput = document.getElementById('ollamaUrlInput');
const apiKeyField = document.getElementById('apiKeyField');
const ollamaUrlField = document.getElementById('ollamaUrlField');
const testConnectionBtn = document.getElementById('testConnectionBtn');
const saveKeyBtn = document.getElementById('saveKeyBtn');
const testResult = document.getElementById('testResult');

const groupingModelInput = document.getElementById('groupingModelInput');
const renamingModelInput = document.getElementById('renamingModelInput');
const saveModelsBtn = document.getElementById('saveModelsBtn');

const groupingEnabled = document.getElementById('groupingEnabled');
const renamingEnabled = document.getElementById('renamingEnabled');
const sweepIntervalInput = document.getElementById('sweepIntervalInput');
const saveSweepBtn = document.getElementById('saveSweepBtn');

const exclusionListInput = document.getElementById('exclusionListInput');
const saveExclusionBtn = document.getElementById('saveExclusionBtn');

const groupingRulesInput = document.getElementById('groupingRulesInput');
const saveRulesBtn = document.getElementById('saveRulesBtn');

const clearLogBtn = document.getElementById('clearLogBtn');
const savedToast = document.getElementById('savedToast');

async function init() {
  const provider = await local.get(STORAGE_KEYS.PROVIDER, PROVIDERS.CLAUDE);
  providerSelect.value = provider;

  const apiKeys = await local.get(STORAGE_KEYS.API_KEYS, {});
  apiKeyInput.value = apiKeys[provider] || '';

  const ollamaUrls = await local.get(STORAGE_KEYS.OLLAMA_URLS, {});
  ollamaUrlInput.value = ollamaUrls[provider] || '';

  await loadModelInputsForProvider(provider);
  updateProviderUI(provider);

  groupingEnabled.checked = await local.get(STORAGE_KEYS.GROUPING_ENABLED, true);
  renamingEnabled.checked = await local.get(STORAGE_KEYS.RENAMING_ENABLED, true);
  sweepIntervalInput.value = await local.get('tw_sweep_period_minutes', DEFAULT_SWEEP_PERIOD_MINUTES);

  const exclusionList = await local.get(STORAGE_KEYS.EXCLUSION_LIST, DEFAULT_EXCLUSION_LIST);
  exclusionListInput.value = exclusionList.join('\n');

  const groupingRules = await local.get(STORAGE_KEYS.GROUPING_RULES, []);
  groupingRulesInput.value = formatRulesForDisplay(groupingRules);

  providerSelect.addEventListener('change', async () => {
    const apiKeysNow = await local.get(STORAGE_KEYS.API_KEYS, {});
    apiKeyInput.value = apiKeysNow[providerSelect.value] || '';
    const ollamaUrlsNow = await local.get(STORAGE_KEYS.OLLAMA_URLS, {});
    ollamaUrlInput.value = ollamaUrlsNow[providerSelect.value] || '';
    testResult.textContent = '';
    await loadModelInputsForProvider(providerSelect.value);
    updateProviderUI(providerSelect.value);
  });
}

function updateProviderUI(provider) {
  const isOllama = provider === PROVIDERS.OLLAMA;
  apiKeyField.style.display = isOllama ? 'none' : 'block';
  ollamaUrlField.style.display = isOllama ? 'block' : 'none';
}

async function loadModelInputsForProvider(provider) {
  const modelChoices = await local.get(STORAGE_KEYS.MODEL_CHOICES, {});
  const defaults = DEFAULT_MODELS[provider] || {};
  const overrides = modelChoices[provider] || {};
  groupingModelInput.value = overrides.grouping || defaults.grouping || '';
  renamingModelInput.value = overrides.renaming || defaults.renaming || '';
  groupingModelInput.placeholder = defaults.grouping || '';
  renamingModelInput.placeholder = defaults.renaming || '';
}

testConnectionBtn.addEventListener('click', async () => {
  const provider = providerSelect.value;
  const isOllama = provider === PROVIDERS.OLLAMA;
  const key = isOllama ? '' : apiKeyInput.value.trim();
  const ollamaUrl = isOllama ? ollamaUrlInput.value.trim() || 'http://localhost:11434' : '';

  testResult.textContent = 'Testing…';
  testResult.className = 'test-result';

  if (!isOllama && !key) {
    testResult.textContent = 'Enter an API key first.';
    testResult.className = 'test-result error';
    return;
  }

  const AdapterClass = ADAPTER_CLASSES[provider];
  const adapter = isOllama ? new AdapterClass('', ollamaUrl) : new AdapterClass(key);

  const modelChoices = await local.get(STORAGE_KEYS.MODEL_CHOICES, {});
  const overrides = modelChoices[provider] || {};
  const model = overrides.renaming || (DEFAULT_MODELS[provider] || {}).renaming;

  try {
    await adapter.complete({
      system: 'Reply with the single word OK and nothing else.',
      prompt: 'Connection test.',
      maxTokens: 200000,
      model
    });
    testResult.textContent = 'Connected successfully.';
    testResult.className = 'test-result ok';
  } catch (err) {
    testResult.textContent = `Failed: ${err.message}`;
    testResult.className = 'test-result error';
  }
});

saveKeyBtn.addEventListener('click', async () => {
  const provider = providerSelect.value;
  const isOllama = provider === PROVIDERS.OLLAMA;
  const key = isOllama ? '' : apiKeyInput.value.trim();
  const ollamaUrl = isOllama ? ollamaUrlInput.value.trim() || 'http://localhost:11434' : '';

  const apiKeys = await local.get(STORAGE_KEYS.API_KEYS, {});
  apiKeys[provider] = key;

  const ollamaUrls = await local.get(STORAGE_KEYS.OLLAMA_URLS, {});
  ollamaUrls[provider] = ollamaUrl;

  await local.set({
    [STORAGE_KEYS.PROVIDER]: provider,
    [STORAGE_KEYS.API_KEYS]: apiKeys,
    [STORAGE_KEYS.OLLAMA_URLS]: ollamaUrls,
    // Saving a (presumably fixed) key clears any previous pause state so
    // the pipelines get a fresh chance rather than waiting for the next
    // failure/success cycle.
    [STORAGE_KEYS.GROUPING_PAUSED]: { paused: false, reason: null },
    [STORAGE_KEYS.RENAMING_PAUSED]: { paused: false, reason: null }
  });

  showToast('Provider & settings saved.');
});

saveModelsBtn.addEventListener('click', async () => {
  const provider = providerSelect.value;
  const modelChoices = await local.get(STORAGE_KEYS.MODEL_CHOICES, {});
  modelChoices[provider] = {
    grouping: groupingModelInput.value.trim() || undefined,
    renaming: renamingModelInput.value.trim() || undefined
  };
  await local.set({ [STORAGE_KEYS.MODEL_CHOICES]: modelChoices });
  showToast('Model choices saved.');
});

groupingEnabled.addEventListener('change', async () => {
  await local.set({ [STORAGE_KEYS.GROUPING_ENABLED]: groupingEnabled.checked });
});

renamingEnabled.addEventListener('change', async () => {
  await local.set({ [STORAGE_KEYS.RENAMING_ENABLED]: renamingEnabled.checked });
});

saveSweepBtn.addEventListener('click', async () => {
  const minutes = Math.max(0.5, parseFloat(sweepIntervalInput.value) || DEFAULT_SWEEP_PERIOD_MINUTES);
  sweepIntervalInput.value = minutes;
  await local.set({ tw_sweep_period_minutes: minutes });

  // Re-create the alarm with the new period immediately rather than
  // waiting for it to naturally lapse.
  try {
    await chrome.alarms.clear('sweep-alarm');
  } catch {
    // ignore
  }
  showToast('Sweep interval saved. It applies from the next tab opened.');
});

saveExclusionBtn.addEventListener('click', async () => {
  const list = exclusionListInput.value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  await local.set({ [STORAGE_KEYS.EXCLUSION_LIST]: list });
  showToast('Exclusion list saved.');
});

saveRulesBtn.addEventListener('click', async () => {
  const rules = parseRulesFromDisplay(groupingRulesInput.value);
  await local.set({ [STORAGE_KEYS.GROUPING_RULES]: rules });
  showToast('Grouping rules saved.');
});

clearLogBtn.addEventListener('click', async () => {
  await local.set({ [STORAGE_KEYS.ACTION_LOG]: [] });
  showToast('Activity log cleared.');
});

let toastTimeout;
function showToast(message) {
  savedToast.textContent = message;
  savedToast.classList.add('visible');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => savedToast.classList.remove('visible'), 2200);
}

/**
 * Parse rules from display format: "domain-or-keyword → Group Name: color"
 * Returns array of { pattern, group, color } objects.
 */
function parseRulesFromDisplay(text) {
  const rules = [];
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    // Support both → and -> arrow separators
    const parts = line.split(/→|->/);
    if (parts.length < 2) continue;
    const pattern = parts[0].trim();
    const rest = parts[1].trim();
    // Check for optional color after colon
    let group = rest;
    let color = null;
    const colonIdx = rest.lastIndexOf(':');
    if (colonIdx > 0) {
      const maybeColor = rest.slice(colonIdx + 1).trim().toLowerCase();
      const VALID_COLORS = ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'];
      if (VALID_COLORS.includes(maybeColor)) {
        color = maybeColor;
        group = rest.slice(0, colonIdx).trim();
      }
    }
    if (pattern && group) {
      rules.push({ pattern, group, color });
    }
  }
  return rules;
}

/**
 * Format rules array back to display string for the textarea.
 */
function formatRulesForDisplay(rules) {
  if (!rules || rules.length === 0) return '';
  return rules.map((r) => {
    let line = `${r.pattern} → ${r.group}`;
    if (r.color) line += `: ${r.color}`;
    return line;
  }).join('\n');
}

init();
