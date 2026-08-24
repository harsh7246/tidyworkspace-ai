// background/adapters/deepseekAdapter.js
//
// DeepSeek adapter. The DeepSeek chat API is OpenAI-compatible and supports
// response_format: { type: 'json_object' } but NOT a full JSON-schema mode,
// so per architecture §4.3 we fall back to a strict prompt instructing JSON
// output, then JSON.parse with try/catch at the call site (see
// llmAdapterFactory's requestStructured helper).

import { LLMAdapter, LLMAdapterError } from './adapter.interface.js';

const API_URL = 'https://api.deepseek.com/chat/completions';

export class DeepSeekAdapter extends LLMAdapter {
  async complete({ system, prompt, responseSchema, maxTokens = 1024, model, signal }) {
    if (!this.apiKey) {
      throw new LLMAdapterError('Missing DeepSeek API key', { retriable: false });
    }

    let effectiveSystem = system;
    const body = {
      model: model || 'deepseek-chat',
      max_tokens: maxTokens,
      messages: [] // filled below
    };

    if (responseSchema) {
      // No native JSON-schema mode: strengthen the prompt and ask for the
      // generic json_object response format, which at least guarantees
      // syntactically valid JSON (schema conformance is best-effort).
      effectiveSystem =
        `${system}\n\nYou MUST respond with a single JSON object only — no markdown fences, ` +
        `no commentary. It must conform to this JSON schema:\n${JSON.stringify(responseSchema)}`;
      body.response_format = { type: 'json_object' };
    }

    body.messages = [
      { role: 'system', content: effectiveSystem },
      { role: 'user', content: prompt }
    ];

    let response;
    try {
      response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(body),
        signal
      });
    } catch (err) {
      throw new LLMAdapterError(`DeepSeek network error: ${err.message}`, { retriable: true, cause: err });
    }

    if (!response.ok) {
      const retriable = response.status === 429 || response.status >= 500;
      const text = await response.text().catch(() => '');
      throw new LLMAdapterError(`DeepSeek API error ${response.status}: ${text}`, {
        status: response.status,
        retriable
      });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (content === undefined) {
      throw new LLMAdapterError('DeepSeek response missing message content', { retriable: false });
    }
    return content;
  }
}
