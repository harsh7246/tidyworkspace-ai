// background/adapters/adapterFactory.js

import { local } from '../../shared/storage.js';
import { PROVIDERS, STORAGE_KEYS, DEFAULT_MODELS } from '../../shared/constants.js';
import { GeminiAdapter } from './geminiAdapter.js';
import { OpenAIAdapter } from './openaiAdapter.js';
import { ClaudeAdapter } from './claudeAdapter.js';
import { DeepSeekAdapter } from './deepseekAdapter.js';
import { LLMAdapterError } from './adapter.interface.js';
import { OllamaAdapter } from './ollamaAdapter.js';

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

  // Allow Ollama to pass through without requiring an API key
  if (!apiKey && provider !== PROVIDERS.OLLAMA) {
    return { adapter: null, provider, models: null, reason: 'no-api-key' };
  }

  const modelChoices = await local.get(STORAGE_KEYS.MODEL_CHOICES, {});
  
  // Guard DEFAULT_MODELS[provider] to prevent errors if Ollama defaults aren't set
  const models = {
    ...(DEFAULT_MODELS[provider] || {}),
    ...(modelChoices[provider] || {})
  };

  const AdapterClass = ADAPTER_CLASSES[provider];
  return { adapter: new AdapterClass(apiKey || ''), provider, models, reason: null };
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

  // Strip <think>...</think> tags emitted by DeepSeek-R1 or other local reasoning models
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

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