// background/adapters/openaiAdapter.js
//
// OpenAI adapter. Uses response_format: { type: 'json_schema', ... } for
// structured output (Chat Completions API) when a schema is supplied.

import { LLMAdapter, LLMAdapterError } from './adapter.interface.js';

const API_URL = 'https://api.openai.com/v1/chat/completions';

export class OpenAIAdapter extends LLMAdapter {
  async complete({ system, prompt, responseSchema, maxTokens = 1024, model, signal }) {
    if (!this.apiKey) {
      throw new LLMAdapterError('Missing OpenAI API key', { retriable: false });
    }

    const body = {
      model: model || 'gpt-4o-mini',
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt }
      ]
    };

    if (responseSchema) {
      body.response_format = {
        type: 'json_schema',
        json_schema: {
          name: 'tidyworkspace_result',
          schema: responseSchema,
          strict: true
        }
      };
    }

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
      throw new LLMAdapterError(`OpenAI network error: ${err.message}`, { retriable: true, cause: err });
    }

    if (!response.ok) {
      const retriable = response.status === 429 || response.status >= 500;
      const text = await response.text().catch(() => '');
      throw new LLMAdapterError(`OpenAI API error ${response.status}: ${text}`, {
        status: response.status,
        retriable
      });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (content === undefined) {
      throw new LLMAdapterError('OpenAI response missing message content', { retriable: false });
    }
    return content;
  }
}
