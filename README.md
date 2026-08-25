# TidyWorkspace AI

A Chrome Manifest V3 extension with two independent, BYOK (Bring Your Own Key) AI pipelines that run entirely under your control:

1. **Tab Sweeper & Grouping Engine** — periodically batches ungrouped tabs and asks your chosen LLM to sort them into existing or new Chrome tab groups.
2. **Download Auto-Renamer** — intercepts downloads and asks a fast LLM to produce a clean, descriptive filename before the file is saved.

Supports **5 AI providers** — Google Gemini, OpenAI, Anthropic Claude, DeepSeek, and local models via **Ollama**. With Ollama, **all data stays fully local** on your machine.

> **Privacy-first:** No data leaves your machine except to the provider you choose, using your own key. Nothing is sent to any TidyWorkspace-run server (there isn't one).

---

## Table of Contents

- [Features](#features)
- [Quick Start](#quick-start)
- [Install in Chrome](#install-in-chrome)
- [AI Provider Setup](#ai-provider-setup)
  - [Google Gemini](#google-gemini)
  - [OpenAI](#openai)
  - [Anthropic Claude](#anthropic-claude)
  - [DeepSeek](#deepseek)
  - [Ollama (Local Models)](#ollama-local-models)
- [Recommended Models by Laptop Specs](#recommended-models-by-laptop-specs)
- [Extension Settings](#extension-settings)
- [How It Works](#how-it-works)
  - [Tab Grouping Pipeline](#tab-grouping-pipeline)
  - [Download Renaming Pipeline](#download-renaming-pipeline)
- [Privacy & Data](#privacy--data)
- [Troubleshooting](#troubleshooting)
- [FAQ](#faq)

---

## Features

| Feature | Description |
|---|---|
| **AI Tab Grouping** | Periodically sorts ungrouped tabs into named, color-coded groups using your LLM |
| **AI Download Renaming** | Renames downloaded files to clean, descriptive names before they hit disk |
| **5 AI Providers** | Gemini, OpenAI, Claude, DeepSeek, or fully local via Ollama |
| **Custom Routing Rules** | Define `domain-or-keyword -> Group Name: color` rules that bypass the LLM |
| **Domain Exclusions** | Exclude domains from both pipelines (banking sites excluded by default) |
| **Fallback Grouping** | Built-in 100+ pattern domain/title mapping works even without an LLM |
| **Duplicate Group Prevention** | Levenshtein similarity + category aliases prevent near-duplicate groups |
| **Color Consistency** | Same category always gets the same color across groups |
| **Activity Log** | Last 20 actions with one-click undo for tab groupings |
| **Pipeline Toggles** | Enable/disable each pipeline independently from the popup |
| **Connection Test** | Verify your API key/endpoint before saving |
| **Auto-Backoff** | Exponential backoff on rate limits (30s up to 30 minutes) |
| **Download Dedup** | Prevents consecutive downloads from getting the same name within 60s |
| **Safe Downloads** | Original filename used on any error — downloads never stall |

---

## Quick Start

**3 steps to get running:**

1. [Install Ollama (local)](#ollama-local-models) or get an API key from [Gemini](#google-gemini) / [OpenAI](#openai) / [Claude](#anthropic-claude) / [DeepSeek](#deepseek)
2. [Load the extension in Chrome](#install-in-chrome)
3. Click the extension icon → gear icon → select your provider → paste API key → **Test connection** → **Save**

Both pipelines are **on by default** and start working immediately.

---

## Install in Chrome

1. Open `chrome://extensions` in your browser.
2. Turn on **Developer mode** (toggle in the top-right corner).
3. Click **Load unpacked**.
4. Select the `tidyworkspace-ai/` folder.
5. The extension icon appears in your toolbar.

---

## AI Provider Setup

### Google Gemini

**Get an API key:**

1. Go to [Google AI Studio](https://aistudio.google.com/apikey).
2. Sign in with your Google account.
3. Click **Create API key**.
4. Copy the key.

**Configure in extension:**

1. Click the extension icon → gear icon (Settings).
2. Select **Google Gemini** from the provider dropdown.
3. Paste your API key.
4. Click **Test connection** → **Save**.

**Default models:** `gemini-3.6-flash` (both grouping and renaming)

**Pricing:** Free tier available. Paid tier at ~$0.075/1M input tokens, $0.30/1M output tokens.

---

### OpenAI

**Get an API key:**

1. Go to [platform.openai.com/api-keys](https://platform.openai.com/api-keys).
2. Sign in or create an account.
3. Click **Create new secret key**.
4. Copy the key (shown only once).

**Configure in extension:**

1. Click the extension icon → gear icon (Settings).
2. Select **OpenAI** from the provider dropdown.
3. Paste your API key.
4. Click **Test connection** → **Save**.

**Default models:** `gpt-4o-mini` (both grouping and renaming)

**Pricing:** ~$0.15/1M input tokens, $0.60/1M output tokens (gpt-4o-mini).

---

### Anthropic Claude

**Get an API key:**

1. Go to [console.anthropic.com](https://console.anthropic.com).
2. Sign in or create an account.
3. Go to **API Keys** in the sidebar.
4. Click **Create Key**.
5. Copy the key (shown only once).

**Configure in extension:**

1. Click the extension icon → gear icon (Settings).
2. Select **Anthropic Claude** from the provider dropdown.
3. Paste your API key.
4. Click **Test connection** → **Save**.

**Default models:** `claude-sonnet-4-6` (grouping), `claude-haiku-4-5-20251001` (renaming)

**Pricing:** Haiku ~$0.80/1M input, $4/1M output. Sonnet ~$3/1M input, $15/1M output.

---

### DeepSeek

**Get an API key:**

1. Go to [platform.deepseek.com](https://platform.deepseek.com).
2. Sign in or create an account.
3. Go to **API Keys**.
4. Click **Create new key**.
5. Copy the key.

**Configure in extension:**

1. Click the extension icon → gear icon (Settings).
2. Select **DeepSeek** from the provider dropdown.
3. Paste your API key.
4. Click **Test connection** → **Save**.

**Default models:** `deepseek-chat` (both grouping and renaming)

**Pricing:** ~$0.14/1M input, $0.28/1M output tokens. Very affordable.

---

### Ollama (Local Models)

> **100% local. No data ever leaves your machine. No API key needed.**

#### Step 1: Install Ollama

**Windows (PowerShell):**

```powershell
winget install Ollama.Ollama
```

Or download the installer from [ollama.com/download](https://ollama.com/download).

**macOS (Terminal):**

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

**Linux (Terminal):**

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

After installation, **restart your terminal** or log out and back in.

#### Step 2: Pull a Model

Open a terminal and run one of the commands below based on your hardware:

**For 8 GB RAM (minimum):**

```bash
ollama pull qwen2.5:3b
```

**For 16 GB RAM:**

```bash
ollama pull qwen2.5:7b
```

**For 24 GB RAM or dedicated GPU (6GB+ VRAM):**

```bash
ollama pull qwen2.5:14b
```

**For 32 GB+ RAM or high-end GPU (12GB+ VRAM):**

```bash
ollama pull qwen2.5:32b
```

**For best quality (48 GB+ RAM, 24GB+ VRAM):**

```bash
ollama pull llama3.1:70b
```

#### Step 3: Start Ollama

```bash
ollama serve
```

Ollama runs at `http://localhost:11434` by default.

#### Step 4: Configure in Extension

1. Click the extension icon → gear icon (Settings).
2. Select **Ollama (Local)** from the provider dropdown.
3. The API key field is hidden (not needed).
4. The Ollama URL field appears — leave it as `http://localhost:11434` unless you changed it.
5. Click **Test connection** → **Save**.

#### Step 5: Set Models (Optional)

In Settings → **Models per Feature**, set your preferred model:

```
Grouping model:  qwen2.5:14b
Renaming model:  qwen2.5:14b
```

Or use a smaller model for renaming (faster) and larger for grouping (smarter):

```
Grouping model:  qwen2.5:14b
Renaming model:  qwen2.5:7b
```

#### Verify Ollama is Running

```bash
curl http://localhost:11434/api/tags
```

You should see a JSON list of your installed models.

---

## Recommended Models by Laptop Specs

### Budget Laptops (8 GB RAM, No Dedicated GPU)

| Setting | Model | Pull Command | RAM Needed |
|---|---|---|---|
| Grouping | `qwen2.5:3b` | `ollama pull qwen2.5:3b` | ~2.5 GB |
| Renaming | `qwen2.5:3b` | (same) | ~2.5 GB |

> Slower but functional. Use for light browsing (< 30 tabs).

### Mid-Range Laptops (16 GB RAM, No Dedicated GPU)

| Setting | Model | Pull Command | RAM Needed |
|---|---|---|---|
| Grouping | `qwen2.5:7b` | `ollama pull qwen2.5:7b` | ~5 GB |
| Renaming | `qwen2.5:3b` | `ollama pull qwen2.5:3b` | ~2.5 GB |

> Good balance of speed and quality. Handles 50+ tabs well.

### High-End Laptops (24 GB+ RAM, 6GB+ VRAM GPU)

| Setting | Model | Pull Command | RAM/VRAM Needed |
|---|---|---|---|
| Grouping | `qwen2.5:14b` | `ollama pull qwen2.5:14b` | ~10 GB |
| Renaming | `qwen2.5:7b` | `ollama pull qwen2.5:7b` | ~5 GB |

> Recommended. Smart grouping with fast renaming. Handles 100+ tabs.

### Desktop Workstation (32 GB+ RAM, 12GB+ VRAM)

| Setting | Model | Pull Command | RAM/VRAM Needed |
|---|---|---|---|
| Grouping | `qwen2.5:32b` | `ollama pull qwen2.5:32b` | ~20 GB |
| Renaming | `qwen2.5:7b` | `ollama pull qwen2.5:7b` | ~5 GB |

> Excellent quality. Near-cloud-level results.

### Cloud-Connected Options (API, No Local Hardware Needed)

| Provider | Recommended Model | Speed | Cost |
|---|---|---|---|
| **Gemini** | `gemini-3.6-flash` | Very fast | Free tier available |
| **OpenAI** | `gpt-4o-mini` | Fast | ~$0.15/1M tokens |
| **DeepSeek** | `deepseek-chat` | Fast | ~$0.14/1M tokens (cheapest) |
| **Claude** | `claude-haiku-4-5-20251001` | Fast | ~$0.80/1M tokens |

---

## Extension Settings

Open via: Extension icon → gear icon

### Provider & API Key

- Select your AI provider from the dropdown
- Paste your API key (hidden when Ollama is selected)
- For Ollama: enter your Ollama URL (default: `http://localhost:11434`)
- Click **Test connection** to verify, then **Save**

> Your key is stored locally in this browser profile only (`chrome.storage.local`) and is never sent anywhere except directly to your chosen provider's API.

### Models per Feature

Override the default model for each pipeline:

- **Grouping model** — a stronger model works better here (e.g., `qwen2.5:14b` or `claude-sonnet-4-6`)
- **Renaming model** — a faster/cheaper model is fine here (e.g., `qwen2.5:7b` or `claude-haiku-4-5-20251001`)

Leave blank to use provider defaults.

### Pipelines

- **Tab grouping** — toggle on/off
- **Download renaming** — toggle on/off
- **Sweep interval** — how often the tab sweeper runs (default: 0.5 minutes / 30 seconds; minimum: 0.5)

### Privacy & Data Sent

- **Domain exclusion list** — one domain per line, supports `*` wildcards
- Default exclusions: `localhost`, `127.0.0.1`, banking sites, `*.internal`, `*.local`
- Excluded domains are never sent to any AI provider

### Grouping Rules

Custom routing rules checked before the LLM:

```
*.jira.company.com -> Work: blue
youtube.com -> Video: red
github.com -> Development: green
```

Format: `domain-or-keyword -> Group Name: color`

Valid colors: `grey`, `blue`, `red`, `yellow`, `green`, `pink`, `purple`, `cyan`, `orange`

---

## How It Works

### Tab Grouping Pipeline

```
New tab created
      │
      ▼
Added to pending queue
      │
      ▼
Sweep alarm fires (every 30s)
      │
      ▼
Collect ungrouped tabs from current window
      │
      ▼
Filter: system pages, loading tabs, excluded domains
      │
      ▼
┌─────────────────────────────────┐
│ Phase 1: Check routing rules    │
│ (user-defined domain mappings)  │
└─────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────┐
│ Phase 2: LLM or local fallback  │
│ Batches of 3 tabs               │
│ Sends: tab titles + domains     │
│ (never full URLs)               │
└─────────────────────────────────┘
      │
      ▼
Apply decisions:
  - Existing group → add tab
  - New group name → check for duplicates → create group
```

### Download Renaming Pipeline

```
Download starts
      │
      ▼
Intercept filename determination
      │
      ▼
Check: renaming enabled? paused? excluded domain?
      │
      ▼
Gather context: filename, MIME type, source page, domain
      │
      ▼
Send to LLM (2.5s timeout)
      │
      ▼
Sanitize response:
  - Strip hallucinated extensions
  - Remove illegal characters
  - Re-apply original extension
  - Cap at 150 chars
      │
      ▼
Dedup check (60s window)
      │
      ▼
Suggest clean filename to Chrome
```

---

## Privacy & Data

**What is sent to the AI:**

| Pipeline | Data Sent |
|---|---|
| Tab Grouping | Tab titles, tab domain names, existing group names |
| Download Renaming | Original filename, MIME type, source page title, source domain |

**What is NEVER sent:**

- Full URLs (query parameters, paths)
- Page content or HTML
- Cookies or authentication tokens
- Browsing history
- Any data to TidyWorkspace servers (none exist)

**Storage:**

- API keys stored in `chrome.storage.local` (your browser profile only)
- Action log stored locally (last 20 entries)
- Pending tab queue in `chrome.storage.session` (cleared on browser restart)

**With Ollama:** All inference happens on `localhost:11434`. No internet connection required. No data leaves your machine.

---

## Troubleshooting

### "No provider configured"

Open Settings (gear icon) and select a provider + enter your API key.

### "Grouping paused" / "Renaming paused"

This usually means an invalid API key. Open Settings, verify your key, click **Test connection**, then **Save**.

### Ollama: "Network error" or connection fails

1. Make sure Ollama is running:

```bash
ollama serve
```

2. Verify Ollama is responding:

```bash
curl http://localhost:11434/api/tags
```

3. Check that the Ollama URL in Settings matches: `http://localhost:11434`

### Ollama: Tabs get stuck grouping

The model may be too slow for real-time use. Try a smaller model:

```bash
ollama pull qwen2.5:7b
```

Then set it as the grouping model in Settings.

### Downloads not being renamed

1. Check that download renaming is enabled (popup toggle or Settings).
2. Some extensions that manage downloads may conflict — try disabling them temporarily.

### Sweep interval too aggressive

The minimum is 30 seconds (Chrome's practical minimum). If you want slower sweeps, increase the interval in Settings.

---

## FAQ

**Q: Does this work with Brave, Edge, or other Chromium browsers?**
A: It should work with any Chromium-based browser that supports Manifest V3 extensions and `chrome.tabGroups`. Tested on Chrome.

**Q: Can I use multiple providers at once?**
A: No, only one provider is active at a time. Switch in Settings.

**Q: What happens if the LLM returns bad JSON?**
A: The extension logs the error, applies backoff, and retries. Downloads always fall back to the original filename — nothing stalls.

**Q: Can I undo a tab grouping?**
A: Yes. Click the extension icon, find the action in the log, and click **Undo**.

**Q: Can I undo a download rename?**
A: No automatic undo (the file is already on disk). The log shows the old name so you can rename it back manually.

**Q: How many tabs can it handle?**
A: Tabs are processed in batches of 3. The sweeper runs every 30 seconds. In practice, it handles 100+ ungrouped tabs over several sweep cycles.

**Q: Is there a way to exclude specific sites?**
A: Yes. Add domains to the exclusion list in Settings (one per line, supports `*` wildcards). Banking sites are excluded by default.

**Q: Can I use custom group names and colors?**
A: Yes. Define routing rules in Settings → Grouping Rules. Format: `domain-or-keyword -> Group Name: color`.

**Q: Does this slow down my browser?**
A: Minimal impact. The extension only wakes up every 30 seconds for a brief sweep. With Ollama, the main cost is RAM for the model. With cloud APIs, network latency is the only overhead.

---

## Project Structure

```
tidyworkspace-ai/
├── manifest.json                  # MV3 manifest, permissions, service worker entry
├── background/
│   ├── background.js              # Entry point, event listeners, CORS rules
│   ├── tabSweeper.js              # Tab grouping pipeline
│   ├── downloadRenamer.js         # Download renaming pipeline
│   ├── actionLog.js               # Action log with undo support
│   ├── notify.js                  # Badge + notification management
│   └── adapters/
│       ├── adapter.interface.js   # Abstract LLM adapter base class
│       ├── adapterFactory.js      # Provider instantiation factory
│       ├── geminiAdapter.js       # Google Gemini adapter
│       ├── openaiAdapter.js       # OpenAI adapter
│       ├── claudeAdapter.js       # Anthropic Claude adapter
│       ├── deepseekAdapter.js     # DeepSeek adapter
│       └── ollamaAdapter.js       # Ollama local adapter
├── shared/
│   ├── constants.js               # Enums, defaults, storage keys
│   ├── storage.js                 # chrome.storage wrappers
│   ├── domainMatch.js             # URL/domain exclusion matching
│   ├── textSimilarity.js          # Levenshtein distance + alias normalization
│   └── sanitizeFilename.js        # Filename sanitization + dedup
├── popup/
│   ├── popup.html                 # Extension popup markup
│   ├── popup.js                   # Popup logic + activity log
│   └── popup.css                  # Popup styles
├── options/
│   ├── options.html               # Settings page markup
│   ├── options.js                 # Settings page logic
│   └── options.css                # Settings page styles
├── rules/
│   └── ollama_cors_rules.json     # Declarative net request rules for Ollama CORS
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## Technical Details

- **Manifest version:** V3
- **Module system:** ES modules (`import`/`export`)
- **Tab batch size:** 3 tabs per LLM request
- **Rename timeout:** 2.5 seconds
- **Action log capacity:** 20 entries
- **Sweep interval:** 30 seconds (configurable, minimum 0.5 min)
- **Download dedup window:** 60 seconds
- **Supported tab group colors:** grey, blue, red, yellow, green, pink, purple, cyan, orange

---

## License

MIT
