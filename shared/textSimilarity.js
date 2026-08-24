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

/**
 * Given a candidate name and a list of existing names, return the
 * existing name with the highest similarity if it's above threshold,
 * otherwise null.
 */
export function findSimilarExisting(candidateName, existingNames, threshold = 0.72) {
  let best = null;
  let bestScore = 0;
  for (const name of existingNames) {
    const score = similarity(candidateName, name);
    if (score > bestScore) {
      bestScore = score;
      best = name;
    }
  }
  return bestScore >= threshold ? best : null;
}
