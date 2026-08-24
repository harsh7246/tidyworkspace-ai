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

const ADAPTER_CLASSES = {
  [PROVIDERS.GEMINI]: GeminiAdapter,
  [PROVIDERS.OPENAI]: OpenAIAdapter,
  [PROVIDERS.CLAUDE]: ClaudeAdapter,
  [PROVIDERS.DEEPSEEK]: DeepSeekAdapter
};

const providerSelect = document.getElementById('providerSelect');
const apiKeyInput = document.getElementById('apiKeyInput');
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

const clearLogBtn = document.getElementById('clearLogBtn');
const savedToast = document.getElementById('savedToast');

async function init() {
  const provider = await local.get(STORAGE_KEYS.PROVIDER, PROVIDERS.CLAUDE);
  providerSelect.value = provider;

  const apiKeys = await local.get(STORAGE_KEYS.API_KEYS, {});
  apiKeyInput.value = apiKeys[provider] || '';

  await loadModelInputsForProvider(provider);

  groupingEnabled.checked = await local.get(STORAGE_KEYS.GROUPING_ENABLED, true);
  renamingEnabled.checked = await local.get(STORAGE_KEYS.RENAMING_ENABLED, true);
  sweepIntervalInput.value = await local.get('tw_sweep_period_minutes', DEFAULT_SWEEP_PERIOD_MINUTES);

  const exclusionList = await local.get(STORAGE_KEYS.EXCLUSION_LIST, DEFAULT_EXCLUSION_LIST);
  exclusionListInput.value = exclusionList.join('\n');

  providerSelect.addEventListener('change', async () => {
    const apiKeysNow = await local.get(STORAGE_KEYS.API_KEYS, {});
    apiKeyInput.value = apiKeysNow[providerSelect.value] || '';
    testResult.textContent = '';
    await loadModelInputsForProvider(providerSelect.value);
  });
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
  const key = apiKeyInput.value.trim();
  testResult.textContent = 'Testing…';
  testResult.className = 'test-result';

  if (!key) {
    testResult.textContent = 'Enter an API key first.';
    testResult.className = 'test-result error';
    return;
  }

  const AdapterClass = ADAPTER_CLASSES[provider];
  const adapter = new AdapterClass(key);
  const model = (DEFAULT_MODELS[provider] || {}).renaming;

  try {
    await adapter.complete({
      system: 'Reply with the single word OK and nothing else.',
      prompt: 'Connection test.',
      maxTokens: 200,
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
  const key = apiKeyInput.value.trim();

  const apiKeys = await local.get(STORAGE_KEYS.API_KEYS, {});
  apiKeys[provider] = key;

  await local.set({
    [STORAGE_KEYS.PROVIDER]: provider,
    [STORAGE_KEYS.API_KEYS]: apiKeys,
    // Saving a (presumably fixed) key clears any previous pause state so
    // the pipelines get a fresh chance rather than waiting for the next
    // failure/success cycle.
    [STORAGE_KEYS.GROUPING_PAUSED]: { paused: false, reason: null },
    [STORAGE_KEYS.RENAMING_PAUSED]: { paused: false, reason: null }
  });

  showToast('Provider & key saved.');
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

init();
