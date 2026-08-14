/**
 * Escape text for HTML and for XML attributes.
 *
 * At the root rather than under `publish/`, because `avatar.ts` needs it and
 * `publish/hive.ts` imports `avatar.ts` — a shared helper under `publish/` would
 * make that a cycle. This module depends on nothing, so nobody can create one
 * through it.
 *
 * Both quote characters are escaped alongside the three HTML ones. `avatarSvg`
 * builds an `aria-label` by interpolation, where an unescaped quote ends the
 * attribute and everything after it becomes markup — that is not theoretical,
 * it was a live hole in this file's first version. `'` is covered too: every
 * attribute here is double-quoted today, and the cost of covering the other
 * quote is a character nobody sees rendered.
 *
 * `replaceAll` with plain strings rather than global regexes: same result, one
 * fewer thing to read as a pattern.
 */
export const esc = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
