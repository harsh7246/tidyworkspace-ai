// shared/sanitizeFilename.js

import { ILLEGAL_FILENAME_CHARS } from './constants.js';

/**
 * Split "some.file.name.pdf" -> { base: "some.file.name", ext: "pdf" }.
 * If there's no extension, ext is ''.
 */
export function splitExtension(filename) {
  const idx = filename.lastIndexOf('.');
  if (idx <= 0 || idx === filename.length - 1) {
    return { base: filename, ext: '' };
  }
  return { base: filename.slice(0, idx), ext: filename.slice(idx + 1) };
}

/**
 * Sanitize a model-provided filename candidate. The extension is ALWAYS
 * taken from the original download, never trusted from the model, per
 * architecture §4.2 step 5.
 */
export function sanitizeFilename(candidate, originalFilename) {
  const { ext: originalExt } = splitExtension(originalFilename);

  let base = String(candidate || '').trim();
  // Strip any extension the model may have hallucinated onto the end;
  // we re-append the real one below.
  const { base: candidateBase } = splitExtension(base);
  base = candidateBase || base;

  base = base
    .replace(ILLEGAL_FILENAME_CHARS, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.+$/, ''); // trailing dots are invalid on Windows

  // Guard against empty/garbage results.
  if (!base) {
    return originalFilename;
  }

  // Reasonable length cap so we don't hit filesystem limits.
  const MAX_BASE_LENGTH = 150;
  if (base.length > MAX_BASE_LENGTH) {
    base = base.slice(0, MAX_BASE_LENGTH).trim();
  }

  return originalExt ? `${base}.${originalExt}` : base;
}

/**
 * Append a short suffix (timestamp-based) to disambiguate from a very
 * recent rename with the same resulting name.
 */
export function withDedupeSuffix(filename) {
  const { base, ext } = splitExtension(filename);
  const suffix = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 12);
  return ext ? `${base}_${suffix}.${ext}` : `${base}_${suffix}`;
}
