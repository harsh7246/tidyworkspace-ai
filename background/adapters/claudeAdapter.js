// background/adapters/claudeAdapter.js
//
// Anthropic Claude adapter. Uses forced tool-use as the structured-output
// mechanism: when a responseSchema is supplied we define a single tool
// whose input schema IS that schema, and force the model to call it via
// tool_choice. This guarantees valid JSON matching the schema rather than
// hoping free-text JSON parses cleanly.

import { LLMAdapter, LLMAdapterError } from './adapter.interface.js';

const API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const STRUCTURED_TOOL_NAME = 'emit_result';

export class ClaudeAdapter extends LLMAdapter {
  async complete({ system, prompt, responseSchema, maxTokens = 1024, model, signal }) {
    if (!this.apiKey) {
      throw new LLMAdapterError('Missing Claude API key', { retriable: false });
    }

    const body = {
      model: model || 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: prompt }]
    };

    if (responseSchema) {
      body.tools = [
        {
          name: STRUCTURED_TOOL_NAME,
          description: 'Return the structured result for this request.',
          input_schema: responseSchema
        }
      ];
      body.tool_choice = { type: 'tool', name: STRUCTURED_TOOL_NAME };
    }

    let response;
    try {
      response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify(body),
        signal
      });
    } catch (err) {
      throw new LLMAdapterError(`Claude network error: ${err.message}`, { retriable: true, cause: err });
    }

    if (!response.ok) {
      const retriable = response.status === 429 || response.status >= 500;
      const text = await response.text().catch(() => '');
      throw new LLMAdapterError(`Claude API error ${response.status}: ${text}`, {
        status: response.status,
        retriable
      });
    }

    const data = await response.json();

    if (responseSchema) {
      const toolUse = (data.content || []).find((b) => b.type === 'tool_use' && b.name === STRUCTURED_TOOL_NAME);
      if (!toolUse) {
        throw new LLMAdapterError('Claude did not return the expected tool_use block', { retriable: false });
      }
      return JSON.stringify(toolUse.input);
    }

    const textBlock = (data.content || []).find((b) => b.type === 'text');
    return textBlock ? textBlock.text : '';
  }
}
