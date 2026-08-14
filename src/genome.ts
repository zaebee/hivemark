import type { ReviewRecord } from "./schema.js";
import type { Genome, Provider } from "./types.js";

/**
 * Bump when the genome's field set changes.
 *
 * Part of the hash, so a bump forks every identity — deliberately. A widened
 * genome describes reviewers the old one could not tell apart, and pretending
 * the two are the same subject is the one error this design cannot detect after
 * the fact.
 */
export const GENOME_SCHEMA_VERSION = 1;

const PROVIDER_PREFIXES: ReadonlyArray<readonly [string, Provider]> = [
  ["gemini-", "gemini"],
  ["mistral-", "mistral"],
  ["qwen", "ollama"],
  ["llama", "ollama"],
  ["deepseek", "ollama"],
];

/**
 * Map a model name to its provider.
 *
 * Throws on an unknown name. An "other" bucket would merge genuinely different
 * reviewers into one identity, silently and irreversibly.
 */
export function providerOf(model: string): Provider {
  const lower = model.toLowerCase();
  for (const [prefix, provider] of PROVIDER_PREFIXES) {
    if (lower.startsWith(prefix)) return provider;
  }
  throw new Error(
    `unrecognised model "${model}" — add it to PROVIDER_PREFIXES rather than bucketing it`,
  );
}

/** Fields this version populates, sorted so the value itself is stable. */
const KNOWN_FIELDS = [
  "context_mode",
  "finder_model",
  "guardian_version",
  "provider",
  "skeptic_model",
] as const;

/**
 * Refuse a value that carries surrounding whitespace into an identity.
 *
 * `identity_id` is a hash of the genome, so `"gemini-2.5-flash "` and
 * `"gemini-2.5-flash"` are two entities: two owner addresses, two track records,
 * two birth attestations, for one reviewer. Upstream reads the model from an
 * environment variable and passes it through without `.strip()`, so a repo
 * variable set with a trailing space produces exactly that.
 *
 * Refused rather than trimmed, which is the opposite of what happens to
 * `skeptic_model` two lines below. The distinction is whether the input is a
 * legitimate alternative spelling or an error. An empty string and null both
 * genuinely mean "no skeptic ran" and the upstream schema admits either, so
 * collapsing them is correct. Padding means somebody's configuration is wrong,
 * and silently repairing it lets the same broken value go on to do something
 * else later, somewhere that does not repair it.
 *
 * Not lowercased, deliberately. A model name is an identifier and not a label —
 * ollama tags can be case-sensitive — and the genome's `finder_model` is
 * published verbatim in a birth attestation. Normalising the case of an
 * identifier for storage risks a permanent record naming a model that cannot be
 * resolved. Comparison is a different matter: `providerOf` above and `judgeOf`
 * in `derive.ts` both compare case-insensitively, which is free because neither
 * stores the result.
 */
function exactly(value: string, field: string): string {
  if (value !== value.trim()) {
    throw new Error(
      `${field} has surrounding whitespace: ${JSON.stringify(value)} — ` +
        `this would mint an identity distinct from ${JSON.stringify(value.trim())}, ` +
        `permanently once a birth is announced. Fix the value at the source rather than trimming here.`,
    );
  }
  return value;
}

export function genomeOf(record: ReviewRecord): Genome {
  // Checked before `providerOf` runs, so the diagnosis is the true one. A
  // leading space already broke prefix matching, but it reported "unrecognised
  // model" — which points a reader at PROVIDER_PREFIXES, where adding an entry
  // would be exactly the wrong repair. A trailing space passed prefix matching
  // and reached identity untouched.
  const finder = exactly(record.finder_model, "finder_model");

  return {
    schema_version: GENOME_SCHEMA_VERSION,
    known_fields: KNOWN_FIELDS,
    provider: providerOf(finder),
    finder_model: finder,
    // An empty string and null both mean "no skeptic ran", and the upstream
    // schema admits either. Collapsed here so one configuration cannot become
    // two identities — and so a published birth record, where both encode to
    // the same empty field, cannot read as self-contradictory.
    // `!` covers exactly the reachable falsy values. The schema is
    // `z.string().nullable()` and not optional, so a record missing the field
    // fails to parse and `undefined` cannot arrive here — an explicit check for
    // it would imply a state that cannot occur.
    //
    // A blank-but-present `" "` is truthy and therefore reaches `exactly`,
    // which refuses it. That is deliberate: it means "no skeptic ran" written
    // with a stray space, and the space is the configuration error this
    // function exists to surface.
    skeptic_model: !record.skeptic_model ? null : exactly(record.skeptic_model, "skeptic_model"),
    context_mode: record.had_graph ? "graph" : "diff-only",
    guardian_version: exactly(record.guardian_sha, "guardian_sha"),
  };
}
