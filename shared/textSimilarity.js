// shared/textSimilarity.js
//
// Small, dependency-free Levenshtein distance + a normalized similarity
// score, used by the tab sweeper as a cheap extra guard against the model
// creating a near-duplicate group (e.g. "Shopping" vs "Shop") instead of
// reusing an existing one.

export function levenshtein(a, b) {
  a = a.toLowerCase();
  b = b.toLowerCase();
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1, // deletion
        curr[j - 1] + 1, // insertion
        prev[j - 1] + cost // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

/** Returns a 0..1 similarity score (1 = identical). */
export function similarity(a, b) {
  const normA = a.trim().toLowerCase();
  const normB = b.trim().toLowerCase();
  if (!normA && !normB) return 1;
  if (normA === normB) return 1;
  if (normA.includes(normB) || normB.includes(normA)) return 0.9;

  const maxLen = Math.max(normA.length, normB.length);
  if (maxLen === 0) return 1;
  const dist = levenshtein(normA, normB);
  return 1 - dist / maxLen;
}

// Category alias groups — names in the same group are treated as identical
// for dedup purposes. This prevents "Shop" / "Shopping", "Dev" / "Development",
// "Social" / "Social Media" etc. from becoming separate groups.
const CATEGORY_ALIASES = [
  ['shopping', 'shop', 'store', 'stores', 'ecommerce', 'marketplace'],
  ['development', 'dev', 'coding', 'programming', 'code', 'software', 'engineering'],
  ['social', 'social media', 'social networking', 'networking'],
  ['research', 'researching', 'study', 'studies', 'academic', 'academia'],
  ['news', 'news sites', 'news sources', 'headlines', 'press'],
  ['entertainment', 'fun', 'leisure', 'media'],
  ['travel', 'trips', 'vacation', 'booking', 'flights', 'hotels'],
  ['finance', 'financial', 'banking', 'money', 'investing', 'investment', 'stocks'],
  ['education', 'learning', 'courses', 'tutorials', 'education resources'],
  ['productivity', 'productive', 'task management', 'project management', 'todo'],
  ['music', 'audio', 'songs', 'playlists'],
  ['video', 'videos', 'streaming', 'watch'],
  ['gaming', 'games', 'game', 'esports'],
  ['food', 'cooking', 'recipes', 'restaurants', 'dining'],
  ['health', 'healthcare', 'medical', 'fitness', 'wellness'],
  ['cloud', 'hosting', 'infrastructure', 'devops'],
  ['email', 'mail', 'inbox', 'messages'],
  ['docs', 'documents', 'documentation', 'notes', 'wiki'],
  ['maps', 'navigation', 'directions', 'location'],
  ['ai tools', 'ai', 'artificial intelligence', 'llm', 'chatbot', 'machine learning'],
  ['design', 'ui', 'ux', 'graphics', 'creative', 'art'],
  ['government', 'gov', 'official', 'public sector'],
  ['work', 'workspace', 'office', 'business', 'corporate', 'enterprise']
];

// Build a fast lookup: normalized name -> canonical alias group name
const ALIAS_LOOKUP = new Map();
for (const group of CATEGORY_ALIASES) {
  const canonical = group[0];
  for (const alias of group) {
    ALIAS_LOOKUP.set(alias, canonical);
  }
}

/**
 * Normalize a group name to its canonical alias form.
 * Returns the canonical name if found, otherwise the lowercased trimmed input.
 */
export function normalizeToAlias(name) {
  const lower = name.trim().toLowerCase();
  return ALIAS_LOOKUP.get(lower) || lower;
}

/**
 * Given a candidate name and a list of existing names, return the
 * existing name with the highest similarity if it's above threshold,
 * otherwise null. Now also checks category alias equivalence.
 */
export function findSimilarExisting(candidateName, existingNames, threshold = 0.72) {
  const candidateNorm = normalizeToAlias(candidateName);
  let best = null;
  let bestScore = 0;
  for (const name of existingNames) {
    const nameNorm = normalizeToAlias(name);

    // Alias match — these are semantically identical categories
    if (candidateNorm === nameNorm) {
      return name; // instant match, no need to check further
    }

    const score = similarity(candidateName, name);
    if (score > bestScore) {
      bestScore = score;
      best = name;
    }
  }
  return bestScore >= threshold ? best : null;
}
