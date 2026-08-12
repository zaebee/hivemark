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

export function genomeOf(record: ReviewRecord): Genome {
  return {
    schema_version: GENOME_SCHEMA_VERSION,
    known_fields: KNOWN_FIELDS,
    provider: providerOf(record.finder_model),
    finder_model: record.finder_model,
    // An empty string and null both mean "no skeptic ran", and the upstream
    // schema admits either. Collapsed here so one configuration cannot become
    // two identities — and so a published birth record, where both encode to
    // the same empty field, cannot read as self-contradictory.
    skeptic_model: record.skeptic_model === "" ? null : (record.skeptic_model ?? null),
    context_mode: record.had_graph ? "graph" : "diff-only",
    guardian_version: record.guardian_sha,
  };
}
