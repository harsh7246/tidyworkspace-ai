// shared/constants.js
// Central place for enums, defaults, and tunable timeouts so nothing is a
// magic number scattered across modules.

export const CHROME_TAB_GROUP_COLORS = [
  'grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'
];

export const PROVIDERS = {
  GEMINI: 'gemini',
  OPENAI: 'openai',
  CLAUDE: 'claude',
  DEEPSEEK: 'deepseek',
  OLLAMA: 'ollama'
};

export const PROVIDER_LABELS = {
  [PROVIDERS.GEMINI]: 'Google Gemini',
  [PROVIDERS.OPENAI]: 'OpenAI',
  [PROVIDERS.CLAUDE]: 'Anthropic Claude',
  [PROVIDERS.DEEPSEEK]: 'DeepSeek',
  [PROVIDERS.OLLAMA]: 'Ollama (Local)'
};

// Reasonable default models per provider per feature. User can override in
// options if a "model choice per feature" is exposed there.
export const DEFAULT_MODELS = {
  [PROVIDERS.GEMINI]: { grouping: 'gemini-3.6-flash', renaming: 'gemini-3.6-flash' },
  [PROVIDERS.OPENAI]: { grouping: 'gpt-4o-mini', renaming: 'gpt-4o-mini' },
  [PROVIDERS.CLAUDE]: { grouping: 'claude-sonnet-4-6', renaming: 'claude-haiku-4-5-20251001' },
  [PROVIDERS.DEEPSEEK]: { grouping: 'deepseek-chat', renaming: 'deepseek-chat' },
  [PROVIDERS.OLLAMA]: { grouping: 'qwen2.5:14b', renaming: 'qwen2.5:14b' }
};

export const SWEEP_ALARM_NAME = 'sweep-alarm';
export const DEFAULT_SWEEP_PERIOD_MINUTES = 0.5; // ~30s, Chrome's practical minimum
export const RENAME_TIMEOUT_MS = 2500;
export const ACTION_LOG_MAX_ENTRIES = 20;
export const MAX_BATCH_SIZE = 25; // max tabs per LLM request to avoid token overflow

// Sensible starting exclusion list. User-editable in options.
export const DEFAULT_EXCLUSION_LIST = [
  'localhost',
  '127.0.0.1',
  'bankofamerica.com',
  'chase.com',
  'wellsfargo.com',
  'paypal.com',
  'venmo.com',
  '*.internal',
  '*.local'
];

export const ILLEGAL_FILENAME_CHARS = /[\\/:*?"<>|]/g;

export const STORAGE_KEYS = {
  PROVIDER: 'tw_provider',
  API_KEYS: 'tw_api_keys', // { [provider]: key }
  OLLAMA_URLS: 'tw_ollama_urls', // { [provider]: url }
  MODEL_CHOICES: 'tw_model_choices', // { [provider]: { grouping, renaming } }
  EXCLUSION_LIST: 'tw_exclusion_list',
  GROUPING_ENABLED: 'tw_grouping_enabled',
  RENAMING_ENABLED: 'tw_renaming_enabled',
  ACTION_LOG: 'tw_action_log',
  PENDING_TABS: 'tw_pending_tabs', // session storage
  GROUPING_PAUSED: 'tw_grouping_paused', // { paused: bool, reason: string }
  RENAMING_PAUSED: 'tw_renaming_paused',
  RECENT_RENAMES: 'tw_recent_renames', // for dedupe-suffix heuristic
  GROUPING_RULES: 'tw_grouping_rules' // [{ pattern: string, group: string, color?: string }]
};
