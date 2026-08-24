// background/adapters/geminiAdapter.js
//
// Google Gemini adapter. Uses generationConfig.responseMimeType +
// responseSchema for structured output when a schema is supplied.

import { LLMAdapter, LLMAdapterError } from './adapter.interface.js';

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

export class GeminiAdapter extends LLMAdapter {
  async complete({ system, prompt, responseSchema, maxTokens = 3000, model, signal }) {
    if (!this.apiKey) {
      throw new LLMAdapterError('Missing Gemini API key', { retriable: false });
    }

    const modelId = model || 'gemini-3.6-flash';
    const url = `${BASE_URL}/${modelId}:generateContent?key=${encodeURIComponent(this.apiKey)}`;

    const generationConfig = { maxOutputTokens: maxTokens };
    if (responseSchema) {
      generationConfig.responseMimeType = 'application/json';
      generationConfig.responseSchema = responseSchema;
    }

    const body = {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig
    };

    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal
      });
    } catch (err) {
      throw new LLMAdapterError(`Gemini network error: ${err.message}`, { retriable: true, cause: err });
    }

    if (!response.ok) {
      const retriable = response.status === 429 || response.status >= 500;
      const text = await response.text().catch(() => '');
      throw new LLMAdapterError(`Gemini API error ${response.status}: ${text}`, {
        status: response.status,
        retriable
      });
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('');
    if (text === undefined) {
      throw new LLMAdapterError('Gemini response missing candidate text', { retriable: false });
    }
    return text;
  }
}
