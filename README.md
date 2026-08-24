# TidyWorkspace AI

A Manifest V3 Chrome extension with two independent, BYOK AI pipelines:

1. **Tab Sweeper & Grouping Engine** — periodically batches ungrouped tabs and asks your chosen LLM to sort them into existing or new tab groups.
2. **Download Auto-Renamer** — intercepts downloads and asks a fast LLM to produce a clean, descriptive filename before the file is saved.

Supports cloud providers (Gemini, OpenAI, Claude, DeepSeek) and local models via **Ollama**.

See `architecture.md`-derived design notes in code comments throughout — every module maps to a section of the original architecture doc (`§4.1`, `§4.2`, etc.).

## Load it in Chrome

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select this folder (`tidyworkspace-ai/`).
4. Click the extension icon → the gear icon → opens **Settings**.
5. Pick a provider (Gemini / OpenAI / Claude / DeepSeek / Ollama), paste your API key (or enter your Ollama URL for local models), click **Test connection**, then **Save**.
6. Both pipelines are on by default. Toggle them from the popup or settings.

## Notes

- **No data leaves your machine except to the provider you choose**, using your own key. Nothing is sent to any TidyWorkspace-run server (there isn't one). With Ollama, everything stays fully local.
- The default sweep interval is 30 seconds (Chrome's practical minimum for reliable alarms) — configurable in Settings.
- Tab titles/domains and download filenames/MIME/page-title/domain are the only data sent to the LLM. Full URLs (with query params) are never sent for grouping. See the **Privacy & data sent** section in Settings, and the domain exclusion list to keep specific sites out of both pipelines entirely.
- Icons are placeholder art — swap `icons/icon16.png`, `icon48.png`, `icon128.png` for your own branding whenever you like.
- The action log (last 20 actions) is in the popup, with one-click undo for tab groupings. Renames can't be undone automatically (the file's already on disk) — the log shows the old name so you can rename it back by hand.

## Open questions from the architecture doc — resolved defaults (change anytime)

- **Multi-window scope:** the sweeper currently queries `chrome.tabs.query({ grouped: false })` across all windows, not just the focused one. If you'd rather scope it to the current window only, that's a one-line change in `background/tabSweeper.js` (`collectCandidateTabs`).
- **Action log persistence:** persists across browser restarts (`chrome.storage.local`), capped at the last 20 entries.
- **Sweep interval:** fixed default of 30s, but user-configurable in Settings (§3 of the settings page).
