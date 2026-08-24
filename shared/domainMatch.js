// shared/domainMatch.js
//
// Matches a URL/domain against the user's exclusion list. Supports plain
// domains ("example.com"), subdomain matches ("sub.example.com" matches
// pattern "example.com"), and a simple leading-wildcard form ("*.local").

export function extractDomain(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function patternToRegex(pattern) {
  const escaped = pattern
    .trim()
    .toLowerCase()
    .replace(/[.+^${}()|[\]\\]/g, '\\$&') // escape regex specials except *
    .replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`);
}

export function isDomainExcluded(domain, exclusionList) {
  if (!domain) return false;
  const lowerDomain = domain.toLowerCase();

  return exclusionList.some((rawPattern) => {
    const pattern = rawPattern.trim().toLowerCase();
    if (!pattern) return false;

    if (pattern.includes('*')) {
      return patternToRegex(pattern).test(lowerDomain);
    }
    // Exact match or subdomain match (foo.example.com matches example.com)
    return lowerDomain === pattern || lowerDomain.endsWith(`.${pattern}`);
  });
}

export function isUrlExcluded(url, exclusionList) {
  return isDomainExcluded(extractDomain(url), exclusionList);
}
