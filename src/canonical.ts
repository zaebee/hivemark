/**
 * Order strings by code unit, and never by locale.
 *
 * Lives beside canonical JSON because it answers the same question: how to make
 * output independent of incidental order. `localeCompare` would not — its
 * collation depends on the ICU data a runtime happens to carry, and one of these
 * orderings decides a Merkle root, so two machines could publish different roots
 * for identical input.
 */
export function byCodeUnit(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * Deterministic JSON: recursively sorted keys, no insignificant whitespace,
 * `undefined` omitted.
 *
 * The hash of this string is an identity, so its input must not depend on
 * property insertion order or on a serialiser's whims.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}
