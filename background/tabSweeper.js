// background/tabSweeper.js
// §4.1 — Tab Sweeper & Grouping Engine

import { local, updateLocal, updateSession } from '../shared/storage.js';
import {
  STORAGE_KEYS,
  SWEEP_ALARM_NAME,
  DEFAULT_SWEEP_PERIOD_MINUTES,
  DEFAULT_EXCLUSION_LIST,
  CHROME_TAB_GROUP_COLORS,
  MAX_BATCH_SIZE
} from '../shared/constants.js';
import { isUrlExcluded, extractDomain } from '../shared/domainMatch.js';
import { findSimilarExisting } from '../shared/textSimilarity.js';
import { getActiveAdapter, requestStructured, LLMAdapterError } from './adapters/adapterFactory.js';
import { logGroupAction } from './actionLog.js';
import { notifyPipelinePaused, notifyPipelineResumed } from './notify.js';

const SYSTEM_PROMPT = `You are a browser tab organizer. Your job is to sort ungrouped tabs into logical groups.

RULES:
1. Output ONLY valid JSON — no prose, no explanation, no markdown, no code fences.
2. Every candidate tab MUST appear exactly once in "decisions".
3. Each decision has either "existingGroupId" (to reuse an existing group) or "newGroupName" (to create a new group). Never both.
4. Group names must be SHORT (1-3 words), LOWERCASE first letter, and GENERIC categories.
5. Prefer REUSING existing groups over creating new ones — check the "existingGroups" list carefully.

GROUPING HEURISTICS (apply in order):
- DOMAIN FAMILIES: Group tabs sharing a root domain or brand together.
  Examples: github.com → "GitHub", docs.google.com + mail.google.com → "Google",
  *.stackoverflow.com + stackexchange.com → "Stack Overflow", *.amazon.com → "Amazon"
- TOPIC/ACTIVITY: Group by the activity or topic, not by the website.
  Good: "Shopping" (for any e-commerce), "Research" (for academic/wiki/docs),
  "Social" (for social media), "News" (for news sites), "Work" (for project/tools)
  Bad: "Amazon Shopping" + "eBay Shopping" (too granular — merge into "Shopping")
- BROAD CATEGORIES (prefer these names when possible):
  Social, Shopping, Work, Research, News, Entertainment, Travel, Finance,
  Development, Design, Education, Productivity, Music, Video, Gaming, Food,
  Health, Government, Cloud, Email, Docs, Maps, AI Tools
- If an existing group matches the tab's category, USE it. Do not create a near-duplicate.

COLOR SUGGESTIONS (pick the most semantically fitting):
  Social → blue, Shopping → yellow, Work → blue, Research → purple,
  News → red, Entertainment → pink, Travel → cyan, Finance → green,
  Development → grey, Design → pink, Education → orange, Productivity → green,
  Music → purple, Video → red, Gaming → red, Food → orange, Health → green,
  Cloud → cyan, Email → blue, Docs → grey, Maps → cyan, AI Tools → purple

SCHEMA: { "decisions": [ { "tabId": number, "existingGroupId": string|null, "newGroupName": string|null, "color": string|null } ] }
If you cannot produce valid JSON, respond with exactly: {"decisions": [], "error": "UNABLE_TO_GENERATE_VALID_JSON"}`;

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    decisions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          tabId: { type: 'number' },
          existingGroupId: { type: 'string' },
          newGroupName: { type: 'string' },
          color: { type: 'string', enum: CHROME_TAB_GROUP_COLORS }
        },
        required: ['tabId']
      }
    }
  },
  required: ['decisions']
};

const SYSTEM_PAGE_PREFIXES = ['chrome://', 'chrome-extension://', 'edge://', 'about:', 'devtools://'];

// Local domain-to-category mapping used as fallback when LLM is unavailable.
// Keys are domain patterns (supports * wildcard at start), values are group names.
const DOMAIN_CATEGORY_MAP = [
  // Development
  { pattern: '*.github.com', group: 'GitHub', color: 'grey' },
  { pattern: 'github.com', group: 'GitHub', color: 'grey' },
  { pattern: '*.gitlab.com', group: 'GitLab', color: 'orange' },
  { pattern: 'gitlab.com', group: 'GitLab', color: 'orange' },
  { pattern: '*.stackoverflow.com', group: 'Stack Overflow', color: 'orange' },
  { pattern: 'stackoverflow.com', group: 'Stack Overflow', color: 'orange' },
  { pattern: '*.stackexchange.com', group: 'Stack Overflow', color: 'orange' },
  { pattern: '*.npmjs.com', group: 'Development', color: 'red' },
  { pattern: '*.pypi.org', group: 'Development', color: 'blue' },
  { pattern: 'developer.mozilla.org', group: 'Development', color: 'grey' },
  { pattern: '*.dev.to', group: 'Development', color: 'green' },
  { pattern: '*.replit.com', group: 'Development', color: 'orange' },
  { pattern: '*.codepen.io', group: 'Development', color: 'green' },
  { pattern: '*.codesandbox.io', group: 'Development', color: 'blue' },
  { pattern: '*.vercel.com', group: 'Development', color: 'grey' },
  { pattern: '*.netlify.com', group: 'Development', color: 'cyan' },
  // Google
  { pattern: '*.google.com', group: 'Google', color: 'blue' },
  { pattern: 'google.com', group: 'Google', color: 'blue' },
  { pattern: '*.google.co.*', group: 'Google', color: 'blue' },
  // Social
  { pattern: '*.facebook.com', group: 'Social', color: 'blue' },
  { pattern: '*.twitter.com', group: 'Social', color: 'blue' },
  { pattern: '*.x.com', group: 'Social', color: 'blue' },
  { pattern: '*.instagram.com', group: 'Social', color: 'pink' },
  { pattern: '*.linkedin.com', group: 'Social', color: 'blue' },
  { pattern: '*.reddit.com', group: 'Social', color: 'orange' },
  { pattern: '*.tiktok.com', group: 'Social', color: 'red' },
  { pattern: '*.threads.net', group: 'Social', color: 'purple' },
  { pattern: '*.mastodon.*', group: 'Social', color: 'purple' },
  { pattern: '*.bsky.app', group: 'Social', color: 'blue' },
  // Shopping
  { pattern: '*.amazon.com', group: 'Shopping', color: 'yellow' },
  { pattern: '*.amazon.co.*', group: 'Shopping', color: 'yellow' },
  { pattern: '*.ebay.com', group: 'Shopping', color: 'red' },
  { pattern: '*.walmart.com', group: 'Shopping', color: 'blue' },
  { pattern: '*.target.com', group: 'Shopping', color: 'red' },
  { pattern: '*.etsy.com', group: 'Shopping', color: 'orange' },
  { pattern: '*.aliexpress.com', group: 'Shopping', color: 'red' },
  { pattern: '*.bestbuy.com', group: 'Shopping', color: 'blue' },
  // News & Media
  { pattern: '*.cnn.com', group: 'News', color: 'red' },
  { pattern: '*.bbc.com', group: 'News', color: 'red' },
  { pattern: '*.bbc.co.uk', group: 'News', color: 'red' },
  { pattern: '*.nytimes.com', group: 'News', color: 'grey' },
  { pattern: '*.washingtonpost.com', group: 'News', color: 'blue' },
  { pattern: '*.reuters.com', group: 'News', color: 'orange' },
  { pattern: '*.theguardian.com', group: 'News', color: 'blue' },
  { pattern: '*.techcrunch.com', group: 'News', color: 'green' },
  { pattern: '*.theverge.com', group: 'News', color: 'purple' },
  { pattern: '*.arstechnica.com', group: 'News', color: 'orange' },
  { pattern: '*.hackernews.com', group: 'News', color: 'orange' },
  { pattern: 'news.ycombinator.com', group: 'News', color: 'orange' },
  // Entertainment
  { pattern: '*.youtube.com', group: 'Video', color: 'red' },
  { pattern: '*.netflix.com', group: 'Entertainment', color: 'red' },
  { pattern: '*.hulu.com', group: 'Entertainment', color: 'green' },
  { pattern: '*.disneyplus.com', group: 'Entertainment', color: 'blue' },
  { pattern: '*.twitch.tv', group: 'Entertainment', color: 'purple' },
  { pattern: '*.spotify.com', group: 'Music', color: 'green' },
  { pattern: '*.soundcloud.com', group: 'Music', color: 'orange' },
  { pattern: '*.imdb.com', group: 'Entertainment', color: 'yellow' },
  // Finance
  { pattern: '*.finance.yahoo.com', group: 'Finance', color: 'purple' },
  { pattern: '*.robinhood.com', group: 'Finance', color: 'green' },
  { pattern: '*.coinbase.com', group: 'Finance', color: 'blue' },
  { pattern: '*.coinmarketcap.com', group: 'Finance', color: 'cyan' },
  { pattern: '*.investing.com', group: 'Finance', color: 'blue' },
  { pattern: '*.mint.com', group: 'Finance', color: 'green' },
  // Travel
  { pattern: '*.booking.com', group: 'Travel', color: 'blue' },
  { pattern: '*.airbnb.com', group: 'Travel', color: 'red' },
  { pattern: '*.tripadvisor.com', group: 'Travel', color: 'green' },
  { pattern: '*.expedia.com', group: 'Travel', color: 'yellow' },
  { pattern: '*.kayak.com', group: 'Travel', color: 'blue' },
  { pattern: '*.google.com/maps*', group: 'Maps', color: 'green' },
  { pattern: '*.maps.google.com', group: 'Maps', color: 'green' },
  // Education
  { pattern: '*.coursera.org', group: 'Education', color: 'blue' },
  { pattern: '*.udemy.com', group: 'Education', color: 'purple' },
  { pattern: '*.edx.org', group: 'Education', color: 'blue' },
  { pattern: '*.khanacademy.org', group: 'Education', color: 'green' },
  { pattern: '*.scholar.google.com', group: 'Education', color: 'blue' },
  { pattern: '*.arxiv.org', group: 'Education', color: 'red' },
  // AI Tools
  { pattern: '*.chat.openai.com', group: 'AI Tools', color: 'green' },
  { pattern: 'chatgpt.com', group: 'AI Tools', color: 'green' },
  { pattern: '*.claude.ai', group: 'AI Tools', color: 'orange' },
  { pattern: '*.anthropic.com', group: 'AI Tools', color: 'orange' },
  { pattern: '*.gemini.google.com', group: 'AI Tools', color: 'blue' },
  { pattern: '*.perplexity.ai', group: 'AI Tools', color: 'cyan' },
  { pattern: '*.huggingface.co', group: 'AI Tools', color: 'yellow' },
  // Cloud & Productivity
  { pattern: '*.notion.so', group: 'Productivity', color: 'grey' },
  { pattern: '*.trello.com', group: 'Productivity', color: 'blue' },
  { pattern: '*.asana.com', group: 'Productivity', color: 'pink' },
  { pattern: '*.slack.com', group: 'Productivity', color: 'purple' },
  { pattern: '*.discord.com', group: 'Social', color: 'blue' },
  { pattern: '*.dropbox.com', group: 'Cloud', color: 'blue' },
  { pattern: '*.drive.google.com', group: 'Docs', color: 'yellow' },
  { pattern: '*.docs.google.com', group: 'Docs', color: 'blue' },
  { pattern: '*.sheets.google.com', group: 'Docs', color: 'green' },
  { pattern: '*.slides.google.com', group: 'Docs', color: 'yellow' },
  { pattern: '*.outlook.live.com', group: 'Email', color: 'blue' },
  { pattern: '*.mail.google.com', group: 'Email', color: 'red' }
];

// Keyword-to-category mapping for title-based fallback grouping
const TITLE_KEYWORD_MAP = [
  { keywords: ['github', 'gitlab', 'bitbucket', 'pull request', 'commit', 'repository', 'code review'], group: 'Development', color: 'grey' },
  { keywords: ['stackoverflow', 'stack overflow', 'stackexchange'], group: 'Stack Overflow', color: 'orange' },
  { keywords: ['youtube', 'video', 'watch', 'stream'], group: 'Video', color: 'red' },
  { keywords: ['spotify', 'music', 'song', 'playlist', 'album'], group: 'Music', color: 'green' },
  { keywords: ['twitter', 'tweet', 'mastodon', 'reddit', 'tiktok', 'instagram', 'facebook', 'linkedin'], group: 'Social', color: 'blue' },
  { keywords: ['amazon', 'ebay', 'walmart', 'target', 'etsy', 'shopping', 'buy', 'cart', 'checkout'], group: 'Shopping', color: 'yellow' },
  { keywords: ['booking', 'airbnb', 'flight', 'hotel', 'travel', 'trip', 'vacation'], group: 'Travel', color: 'cyan' },
  { keywords: ['news', 'article', 'journal', 'times', 'post', 'gazette', 'reuters', 'bbc'], group: 'News', color: 'red' },
  { keywords: ['docs', 'document', 'spreadsheet', 'presentation', 'notion', 'wiki'], group: 'Docs', color: 'grey' },
  { keywords: ['mail', 'email', 'inbox', 'compose', 'outlook', 'gmail'], group: 'Email', color: 'blue' },
  { keywords: ['chat', 'message', 'slack', 'discord', 'teams', 'zoom', 'meeting'], group: 'Productivity', color: 'purple' },
  { keywords: ['design', 'figma', 'sketch', 'canva', 'photoshop', 'illustrator', 'ui', 'ux'], group: 'Design', color: 'pink' },
  { keywords: ['learn', 'course', 'tutorial', 'lesson', 'education', 'university', 'school'], group: 'Education', color: 'orange' },
  { keywords: ['finance', 'bank', 'invest', 'stock', 'crypto', 'bitcoin', 'portfolio'], group: 'Finance', color: 'green' },
  { keywords: ['health', 'fitness', 'medical', 'doctor', 'medicine', 'wellness'], group: 'Health', color: 'red' },
  { keywords: ['game', 'gaming', 'play', 'steam', 'epic', 'twitch'], group: 'Gaming', color: 'red' },
  { keywords: ['recipe', 'food', 'restaurant', 'cook', 'meal', 'pizza'], group: 'Food', color: 'orange' },
  { keywords: ['ai', 'chatgpt', 'claude', 'gemini', 'llm', 'openai', 'anthropic', 'hugging face', 'perplexity'], group: 'AI Tools', color: 'purple' },
  { keywords: ['cloud', 'aws', 'azure', 'gcp', 'docker', 'kubernetes', 'deploy', 'hosting'], group: 'Cloud', color: 'cyan' },
  { keywords: ['map', 'directions', 'location', 'navigate', 'route'], group: 'Maps', color: 'green' }
];

// Color consistency map: canonical group name → preferred color.
// Used to ensure the same category always gets the same color across batches.
const COLOR_CONSISTENCY_MAP = {
  'social': 'blue',
  'shopping': 'yellow',
  'work': 'blue',
  'research': 'purple',
  'news': 'red',
  'entertainment': 'pink',
  'travel': 'cyan',
  'finance': 'green',
  'development': 'grey',
  'design': 'pink',
  'education': 'orange',
  'productivity': 'green',
  'music': 'purple',
  'video': 'red',
  'gaming': 'red',
  'food': 'orange',
  'health': 'green',
  'cloud': 'cyan',
  'email': 'blue',
  'docs': 'grey',
  'maps': 'cyan',
  'ai tools': 'purple',
  'github': 'grey',
  'gitlab': 'orange',
  'stack overflow': 'orange',
  'google': 'blue',
  'amazon': 'yellow'
};

/**
 * Resolve the best color for a new group. Priority:
 * 1. Explicit color from the decision/rule
 * 2. Consistency map based on group name
 * 3. First available color that doesn't collide with existing groups
 */
function resolveGroupColor(groupName, explicitColor, existingGroups) {
  // Priority 1: explicit color from LLM or routing rule
  if (explicitColor && CHROME_TAB_GROUP_COLORS.includes(explicitColor)) {
    return explicitColor;
  }

  // Priority 2: consistency map lookup
  const normalized = (groupName || '').trim().toLowerCase();
  const mappedColor = COLOR_CONSISTENCY_MAP[normalized];
  if (mappedColor && CHROME_TAB_GROUP_COLORS.includes(mappedColor)) {
    return mappedColor;
  }

  // Priority 3: pick first available color not used by existing groups
  const usedColors = new Set(existingGroups.map((g) => g.color).filter(Boolean));
  for (const color of CHROME_TAB_GROUP_COLORS) {
    if (!usedColors.has(color)) return color;
  }

  // All colors used — just return undefined and let Chrome pick
  return undefined;
}

// ---- Public entry points, wired up in background.js ---------------------

/**
 * Local domain-based grouping fallback used when no LLM is available.
 * Matches tab domains against DOMAIN_CATEGORY_MAP, then title keywords.
 * Returns an array of decisions in the same format as the LLM response.
 */
function locallyGroupTabs(candidates, existingGroups) {
  const decisions = [];
  const existingNames = existingGroups.map((g) => g.name);
  const createdGroups = new Map(); // groupName -> groupId (local tracking)

  for (const tab of candidates) {
    const domain = (tab.domain || '').toLowerCase();
    const title = (tab.title || '').toLowerCase();
    let matched = false;

    // Phase 1: Domain pattern matching
    for (const rule of DOMAIN_CATEGORY_MAP) {
      if (domainMatch(domain, rule.pattern)) {
        const existing = findBestExistingGroup(rule.group, existingGroups, createdGroups);
        if (existing) {
          decisions.push({ tabId: tab.id, existingGroupId: existing.id, newGroupName: null, color: null });
        } else {
          decisions.push({ tabId: tab.id, existingGroupId: null, newGroupName: rule.group, color: rule.color });
          createdGroups.set(rule.group, `local_${rule.group}`);
        }
        matched = true;
        break;
      }
    }
    if (matched) continue;

    // Phase 2: Title keyword matching
    for (const rule of TITLE_KEYWORD_MAP) {
      if (rule.keywords.some((kw) => title.includes(kw))) {
        const existing = findBestExistingGroup(rule.group, existingGroups, createdGroups);
        if (existing) {
          decisions.push({ tabId: tab.id, existingGroupId: existing.id, newGroupName: null, color: null });
        } else {
          decisions.push({ tabId: tab.id, existingGroupId: null, newGroupName: rule.group, color: rule.color });
          createdGroups.set(rule.group, `local_${rule.group}`);
        }
        matched = true;
        break;
      }
    }
    if (matched) continue;

    // Phase 3: Fallback — use domain as group name (capitalized)
    const fallbackName = domain.split('.')[0] || 'Other';
    const capitalizedName = fallbackName.charAt(0).toUpperCase() + fallbackName.slice(1);
    const existing = findBestExistingGroup(capitalizedName, existingGroups, createdGroups);
    if (existing) {
      decisions.push({ tabId: tab.id, existingGroupId: existing.id, newGroupName: null, color: null });
    } else {
      decisions.push({ tabId: tab.id, existingGroupId: null, newGroupName: capitalizedName, color: undefined });
      createdGroups.set(capitalizedName, `local_${capitalizedName}`);
    }
  }

  return decisions;
}

/** Check if a domain matches a pattern (supports * wildcard at start). */
function domainMatch(domain, pattern) {
  const p = pattern.toLowerCase();
  if (p.startsWith('*.')) {
    const suffix = p.slice(1); // e.g. ".github.com"
    return domain === p.slice(2) || domain.endsWith(suffix);
  }
  return domain === p;
}

/** Find the best existing group to place a tab into, checking both real and locally-created groups. */
function findBestExistingGroup(groupName, existingGroups, createdGroups) {
  // Check real Chrome groups
  for (const g of existingGroups) {
    if (g.name.toLowerCase() === groupName.toLowerCase()) return g;
  }
  // Check groups created locally in this batch
  if (createdGroups.has(groupName)) {
    return { id: createdGroups.get(groupName), name: groupName };
  }
  return null;
}

/**
 * Apply user-defined routing rules to candidates. Rules are checked first,
 * before the LLM or local fallback. Returns { routed, remaining } where
 * routed is an array of decisions for matched tabs and remaining is the
 * unmatched candidates.
 */
async function applyRoutingRules(candidates, existingGroups) {
  const rules = await local.get(STORAGE_KEYS.GROUPING_RULES, []);
  if (!rules || rules.length === 0) {
    return { routed: [], remaining: candidates };
  }

  const routed = [];
  const remaining = [];
  const existingNames = existingGroups.map((g) => g.name);

  for (const tab of candidates) {
    const domain = (tab.domain || '').toLowerCase();
    const title = (tab.title || '').toLowerCase();
    let matched = false;

    for (const rule of rules) {
      const pattern = (rule.pattern || '').toLowerCase();
      const group = rule.group;
      if (!pattern || !group) continue;

      // Support domain patterns (with * wildcard) and title keyword matching
      const domainMatched = pattern.startsWith('*.')
        ? domain === pattern.slice(2) || domain.endsWith(pattern.slice(1))
        : domain === pattern;
      const titleMatched = !pattern.startsWith('*.') && title.includes(pattern);

      if (domainMatched || titleMatched) {
        // Find or create the target group
        const existing = findBestExistingGroup(group, existingGroups, new Map());
        if (existing) {
          routed.push({ tabId: tab.id, existingGroupId: existing.id, newGroupName: null, color: rule.color || null });
        } else {
          routed.push({ tabId: tab.id, existingGroupId: null, newGroupName: group, color: rule.color || null });
        }
        matched = true;
        break;
      }
    }

    if (!matched) {
      remaining.push(tab);
    }
  }

  return { routed, remaining };
}

export async function onTabCreated(tab) {
  if (!(await isGroupingEnabled())) return;
  if (!tab.id) return;

  // Pending queue lives in session storage (per architecture §3) since it's
  // only meaningful for the current browser session.
  await updateSession(STORAGE_KEYS.PENDING_TABS, [], (pending) =>
    pending.includes(tab.id) ? pending : [...pending, tab.id]
  );

  await ensureSweepAlarmScheduled();
}

export async function onAlarm(alarm) {
  if (alarm.name !== SWEEP_ALARM_NAME) return;
  await runSweep();
}

// ---- Internals ------------------------------------------------------------

async function isGroupingEnabled() {
  return local.get(STORAGE_KEYS.GROUPING_ENABLED, true);
}

async function ensureSweepAlarmScheduled() {
  const existing = await chrome.alarms.get(SWEEP_ALARM_NAME);
  if (existing) return; // already scheduled — do nothing, wait for next tick
  const periodInMinutes = await local.get('tw_sweep_period_minutes', DEFAULT_SWEEP_PERIOD_MINUTES);
  chrome.alarms.create(SWEEP_ALARM_NAME, { periodInMinutes });
}

async function runSweep() {
  if (!(await isGroupingEnabled())) return;

  const paused = await local.get(STORAGE_KEYS.GROUPING_PAUSED, { paused: false });
  if (paused.paused) return; // stays paused until user fixes the key in settings

  const backoffUntil = await local.get('tw_grouping_backoff_until', 0);
  if (Date.now() < backoffUntil) return; // exponential backoff — skip this tick only

  try {
    const candidates = await collectCandidateTabs();
    if (candidates.length === 0) {
      return; // nothing to do, don't burn tokens
    }

    const existingGroups = await getExistingGroups();

    // Phase 1: Apply user-defined routing rules first (highest priority).
    const { routed, remaining } = await applyRoutingRules(candidates, existingGroups);
    if (routed.length > 0) {
      await applyDecisions(routed, existingGroups, candidates);
    }

    if (remaining.length === 0) {
      await clearBackoff();
      await clearPause(STORAGE_KEYS.GROUPING_PAUSED, 'grouping');
      await removeProcessedFromPending(candidates.map((c) => c.id));
      return;
    }

    // Phase 2: Process remaining tabs via LLM or local fallback, with batch splitting.
    const batches = [];
    for (let i = 0; i < remaining.length; i += MAX_BATCH_SIZE) {
      batches.push(remaining.slice(i, i + MAX_BATCH_SIZE));
    }

    const { adapter, models, reason } = await getActiveAdapter();

    if (!adapter) {
      // No LLM available — use local domain-based fallback grouping
      for (const batch of batches) {
        const localDecisions = locallyGroupTabs(batch, existingGroups);
        if (localDecisions.length > 0) {
          await applyDecisions(localDecisions, existingGroups, batch);
        }
      }
      await removeProcessedFromPending(candidates.map((c) => c.id));
      return;
    }

    // Process batches sequentially — each batch may create new groups that
    // subsequent batches should see.
    for (const batch of batches) {
      const result = await requestStructured(adapter, {
        system: SYSTEM_PROMPT,
        prompt: buildPrompt(existingGroups, batch),
        responseSchema: RESPONSE_SCHEMA,
        model: models.grouping,
        maxTokens: 2048
      });

      await applyDecisions(result.decisions || [], existingGroups, batch);
    }

    await clearBackoff();
    await clearPause(STORAGE_KEYS.GROUPING_PAUSED, 'grouping');
    await removeProcessedFromPending(candidates.map((c) => c.id));
  } catch (err) {
    await handleSweepError(err);
  }
}

async function collectCandidateTabs() {
  const exclusionList = await local.get(STORAGE_KEYS.EXCLUSION_LIST, DEFAULT_EXCLUSION_LIST);
  const tabs = await chrome.tabs.query({ 
  currentWindow: true, 
  groupId: chrome.tabGroups.TAB_GROUP_ID_NONE 
});

  const filtered = tabs.filter((tab) => {
    if (!tab.url) return false;
    if (SYSTEM_PAGE_PREFIXES.some((prefix) => tab.url.startsWith(prefix))) return false;
    if (tab.status === 'loading' && !tab.title) return false;
    if (isUrlExcluded(tab.url, exclusionList)) return false;
    return true;
  });

  // Re-verify each candidate still exists, guarding against tabs closed
  // between queueing and sweep.
  const verified = [];
  for (const tab of filtered) {
    try {
      const fresh = await chrome.tabs.get(tab.id);
      if (fresh) {
        verified.push({ id: fresh.id, title: fresh.title || '(untitled)', domain: extractDomain(fresh.url) });
      }
    } catch {
      // Tab closed mid-sweep — silently drop.
    }
  }
  return verified;
}

async function getExistingGroups() {
  const groups = await chrome.tabGroups.query({});
  return groups.map((g) => ({ id: String(g.id), name: g.title || '(untitled group)', color: g.color }));
}

function buildPrompt(existingGroups, candidateTabs) {
  return JSON.stringify({
    existingGroups: existingGroups.map((g) => ({ id: g.id, name: g.name, color: g.color })),
    candidateTabs: candidateTabs.map((t) => ({ id: t.id, title: t.title, domain: t.domain }))
  });
}

async function applyDecisions(decisions, existingGroups, candidates) {
  const existingNames = existingGroups.map((g) => g.name);
  const existingById = new Map(existingGroups.map((g) => [g.id, g]));
  const candidateIds = new Set(candidates.map((c) => c.id));

  for (const decision of decisions) {
    if (!candidateIds.has(decision.tabId)) continue; // ignore hallucinated tab ids

    try {
      if (decision.existingGroupId && existingById.has(decision.existingGroupId)) {
        const groupId = Number(decision.existingGroupId);
        await chrome.tabs.group({ tabIds: [decision.tabId], groupId });
        const group = existingById.get(decision.existingGroupId);
        await logGroupAction({
          tabId: decision.tabId,
          groupId,
          groupName: group.name,
          wasNewGroup: false
        });
        continue;
      }

      if (decision.newGroupName) {
        // Cheap duplicate-group guard: don't trust the model blindly if a
        // near-identical group name already exists.
        const similarExisting = findSimilarExisting(decision.newGroupName, existingNames);
        if (similarExisting) {
          const match = existingGroups.find((g) => g.name === similarExisting);
          if (match) {
            await chrome.tabs.group({ tabIds: [decision.tabId], groupId: Number(match.id) });
            await logGroupAction({
              tabId: decision.tabId,
              groupId: Number(match.id),
              groupName: match.name,
              wasNewGroup: false
            });
            continue;
          }
        }

        const newGroupId = await chrome.tabs.group({ tabIds: [decision.tabId] });
        const color = resolveGroupColor(decision.newGroupName, decision.color, existingGroups);
        await chrome.tabGroups.update(newGroupId, { title: decision.newGroupName, color });
        await logGroupAction({
          tabId: decision.tabId,
          groupId: newGroupId,
          groupName: decision.newGroupName,
          wasNewGroup: true
        });
        // Track the new group so subsequent decisions in this same batch
        // can also match against it.
        existingGroups.push({ id: String(newGroupId), name: decision.newGroupName, color });
        existingById.set(String(newGroupId), { id: String(newGroupId), name: decision.newGroupName, color });
        existingNames.push(decision.newGroupName);
      }
    } catch (err) {
      // A single bad decision (e.g. tab closed between planning and
      // applying) shouldn't abort the whole batch.
      console.warn('TidyWorkspace: failed to apply grouping decision', decision, err);
    }
  }
}

async function removeProcessedFromPending(processedIds) {
  await updateSession(STORAGE_KEYS.PENDING_TABS, [], (pending) =>
    pending.filter((id) => !processedIds.includes(id))
  );
}
// REPLACE lines L235-L251 with this:
async function handleSweepError(err) {
  // Defensive normalization
  const e = err ?? {};
  const message = e.message ?? String(e);
  // Try to find raw model output fields that adapters often include
  const rawOutput =
    e.raw ??
    e.modelOutput ??
    (e.response && (e.response.text || e.response.body || e.response.raw)) ??
    null;

  // If we have raw model output, log a truncated version for debugging.
  if (rawOutput) {
    try {
      const snippet = typeof rawOutput === 'string' ? rawOutput.slice(0, 2000) : JSON.stringify(rawOutput).slice(0, 2000);
      console.error('TidyWorkspace: raw model output (truncated):', snippet);
    } catch (logErr) {
      console.error('TidyWorkspace: failed to stringify raw output for logging', logErr);
    }
  }

  // If it's an adapter-specific error, preserve original handling but be defensive
  const isAdapterError = (typeof LLMAdapterError !== 'undefined' && err instanceof LLMAdapterError) || (e.name === 'LLMAdapterError');

  try {
    if (isAdapterError) {
      if (e.status === 401 || e.status === 403) {
        await local.set({ [STORAGE_KEYS.GROUPING_PAUSED]: { paused: true, reason: 'invalid-key' } });
        await notifyPipelinePaused('grouping', 'Grouping paused — check your API key.');
        return;
      }

      const retriableFlag = Boolean(e.retriable) || (typeof e.retriable === 'function' && e.retriable());
      if (e.status === 429 || retriableFlag) {
        await applyBackoff();
        return;
      }

      // If the adapter failed because the model returned malformed JSON,
      // detect common parse-error messages and log extra context.
      if (/valid JSON|Unexpected token|Expected ','|Unexpected property|JSON/.test(message)) {
        console.warn('TidyWorkspace: grouping sweep failed — model returned malformed/unparseable JSON:', message);
        // Persist a tiny debug snippet so user can inspect later (optional)
        try {
          await local.set({ tw_last_bad_model_output: { time: Date.now(), snippet: typeof rawOutput === 'string' ? rawOutput.slice(0, 2000) : undefined } });
        } catch (e) {
          // ignore persistence errors
        }
        // Backoff to avoid immediate repeats
        await applyBackoff();
        return;
      }

      // Other non-retriable adapter error: log and skip this sweep only
      console.warn('TidyWorkspace: grouping sweep failed', message);
      return;
    }
  } catch (handlerErr) {
    console.error('TidyWorkspace: error while handling sweep error', handlerErr, 'original:', err);
    // fallthrough to final error log below
  }

  console.error('TidyWorkspace: unexpected grouping sweep error', err);
}

async function applyBackoff() {
  const attempts = await local.get('tw_grouping_backoff_attempts', 0);
  const nextAttempts = Math.min(attempts + 1, 6); // cap growth
  const delayMs = Math.min(30_000 * 2 ** nextAttempts, 30 * 60_000); // cap at 30 min
  await local.set({
    tw_grouping_backoff_attempts: nextAttempts,
    tw_grouping_backoff_until: Date.now() + delayMs
  });
}

async function clearBackoff() {
  await local.set({ tw_grouping_backoff_attempts: 0, tw_grouping_backoff_until: 0 });
}

async function clearPause(key, pipelineName) {
  const paused = await local.get(key, { paused: false });
  if (paused.paused) {
    await local.set({ [key]: { paused: false, reason: null } });
    await notifyPipelineResumed(pipelineName);
  }
}
