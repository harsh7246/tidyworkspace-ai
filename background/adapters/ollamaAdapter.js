// background/adapters/ollamaAdapter.js
//
// Ollama adapter for local models. Uses Ollama's native /api/chat endpoint.
// The Origin header is stripped by declarativeNetRequest rules to avoid
// Ollama's CORS block on chrome-extension:// origins.

import { LLMAdapter, LLMAdapterError } from './adapter.interface.js';

const DEFAULT_BASE_URL = 'http://localhost:11434';

export class OllamaAdapter extends LLMAdapter {
  constructor(apiKey, baseUrl = DEFAULT_BASE_URL) {
    super(apiKey);
    // Strip trailing slash and any /v1 suffix since we use the native API
    this.baseUrl = baseUrl.replace(/\/+$/, '').replace(/\/v1$/, '');
  }

  async complete({ system, prompt, responseSchema, maxTokens = 1024, model, signal }) {
    const url = `${this.baseUrl}/api/chat`;

    let effectiveSystem = system;
    const body = {
      model: model || 'qwen2.5:14b',
      messages: [],
      stream: false,
      options: {
        num_predict: maxTokens
      }
    };

    if (responseSchema) {
      effectiveSystem =
        `${system}\n\nYou MUST respond with a single JSON object only — no markdown fences, ` +
        `no commentary. It must conform to this JSON schema:\n${JSON.stringify(responseSchema)}`;
      body.format = responseSchema;
    }

    body.messages = [
      { role: 'system', content: effectiveSystem },
      { role: 'user', content: prompt }
    ];

    const headers = {
      'Content-Type': 'application/json'
    };

    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal
      });
    } catch (err) {
      throw new LLMAdapterError(`Ollama network error: ${err.message}. Is Ollama running at ${this.baseUrl}?`, { retriable: true, cause: err });
    }

    if (!response.ok) {
      const retriable = response.status === 429 || response.status >= 500;
      const text = await response.text().catch(() => '');
      throw new LLMAdapterError(`Ollama API error ${response.status}: ${text}`, {
        status: response.status,
        retriable
      });
    }

    const data = await response.json();
    const content = data.message?.content;
    if (content === undefined) {
      throw new LLMAdapterError('Ollama response missing message content', { retriable: false });
    }
    return content;
  }
}
