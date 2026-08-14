/**
 * Escape text for HTML and for XML attributes.
 *
 * At the root rather than under `publish/`, because `avatar.ts` needs it and
 * `publish/hive.ts` imports `avatar.ts` — a shared helper under `publish/` would
 * make that a cycle. This module depends on nothing, so nobody can create one
 * through it.
 *
 * `"` is escaped as well as the three HTML characters: `avatarSvg` builds an
 * `aria-label` attribute by interpolation, where an unescaped quote ends the
 * attribute and everything after it becomes markup.
 */
export const esc = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
