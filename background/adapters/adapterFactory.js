// background/adapters/adapterFactory.js

import { local } from '../../shared/storage.js';
import { PROVIDERS, STORAGE_KEYS, DEFAULT_MODELS } from '../../shared/constants.js';
import { GeminiAdapter } from './geminiAdapter.js';
import { OpenAIAdapter } from './openaiAdapter.js';
import { ClaudeAdapter } from './claudeAdapter.js';
import { DeepSeekAdapter } from './deepseekAdapter.js';
import { OllamaAdapter } from './ollamaAdapter.js';
import { LLMAdapterError } from './adapter.interface.js';

const ADAPTER_CLASSES = {
  [PROVIDERS.GEMINI]: GeminiAdapter,
  [PROVIDERS.OPENAI]: OpenAIAdapter,
  [PROVIDERS.CLAUDE]: ClaudeAdapter,
  [PROVIDERS.DEEPSEEK]: DeepSeekAdapter,
  [PROVIDERS.OLLAMA]: OllamaAdapter
};

/**
 * Reads the active provider + its key from chrome.storage.local and
 * returns a ready-to-use adapter instance, plus the resolved model ids
 * for each feature.
 */
export async function getActiveAdapter() {
  const provider = await local.get(STORAGE_KEYS.PROVIDER, null);
  if (!provider || !ADAPTER_CLASSES[provider]) {
    return { adapter: null, provider: null, models: null, reason: 'no-provider-selected' };
  }

  const apiKeys = await local.get(STORAGE_KEYS.API_KEYS, {});
  const apiKey = apiKeys[provider];

  // For Ollama, API key is optional (empty string is fine), but we need the base URL
  const isOllama = provider === PROVIDERS.OLLAMA;
  if (!isOllama && !apiKey) {
    return { adapter: null, provider, models: null, reason: 'no-api-key' };
  }

  const ollamaUrls = await local.get(STORAGE_KEYS.OLLAMA_URLS, {});
  const ollamaUrl = ollamaUrls[provider] || 'http://localhost:11434';

  const modelChoices = await local.get(STORAGE_KEYS.MODEL_CHOICES, {});
  const models = {
    ...DEFAULT_MODELS[provider],
    ...(modelChoices[provider] || {})
  };

  const AdapterClass = ADAPTER_CLASSES[provider];
  const adapter = isOllama ? new AdapterClass('', ollamaUrl) : new AdapterClass(apiKey);
  return { adapter, provider, models, reason: null };
}

/**
 * Calls adapter.complete() with a JSON schema and parses the result,
 * uniformly across providers that natively guarantee valid JSON
 * (Claude/OpenAI/Gemini) and DeepSeek's best-effort mode. Throws
 * LLMAdapterError on any failure so callers have one error type to
 * handle.
 */
export async function requestStructured(adapter, { system, prompt, responseSchema, maxTokens, model, signal }) {
  const raw = await adapter.complete({ system, prompt, responseSchema, maxTokens, model, signal });

  let cleaned = raw.trim();
  // Strip markdown code fences some providers add despite instructions.
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(json)?/i, '').replace(/```$/, '').trim();
  }

  try {
    return JSON.parse(cleaned);
  } catch (err) {
    throw new LLMAdapterError(`Model response was not valid JSON: ${err.message}`, {
      retriable: false,
      cause: err
    });
  }
}

export { LLMAdapterError };
