// background/adapters/adapter.interface.js
//
// Unified interface every provider adapter implements. Keeping this as a
// lightweight base class (rather than a TS interface, since this is plain
// JS) gives callers a single shape to depend on and a shared error type.

export class LLMAdapterError extends Error {
  constructor(message, { status, retriable = false, cause } = {}) {
    super(message);
    this.name = 'LLMAdapterError';
    this.status = status;
    this.retriable = retriable; // true for 429 / 5xx style failures
    this.cause = cause;
  }
}

/**
 * @typedef {Object} CompleteParams
 * @property {string} system - system prompt
 * @property {string} prompt - user prompt
 * @property {object} [responseSchema] - JSON schema for structured output, where supported
 * @property {number} [maxTokens]
 * @property {string} [model] - provider-specific model id
 * @property {AbortSignal} [signal] - for timeout/cancellation
 */

export class LLMAdapter {
  /** @param {string} apiKey */
  constructor(apiKey) {
    if (new.target === LLMAdapter) {
      throw new Error('LLMAdapter is abstract; use a concrete provider adapter.');
    }
    this.apiKey = apiKey;
  }

  /**
   * @param {CompleteParams} params
   * @returns {Promise<string>} raw text or JSON string returned by the model
   */
  // eslint-disable-next-line no-unused-vars
  async complete(params) {
    throw new Error('complete() not implemented');
  }
}
