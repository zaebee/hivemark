import type { ReviewRecord } from "./schema.js";
import type { Genome } from "./types.js";

/**
 * Bump when the genome's field set changes.
 *
 * Part of the hash, so a bump forks every identity — deliberately. A widened
 * genome describes reviewers the old one could not tell apart, and pretending
 * the two are the same subject is the one error this design cannot detect after
 * the fact.
 */
export const GENOME_SCHEMA_VERSION = 2;

/** Fields this version populates, sorted so the value itself is stable. */
const KNOWN_FIELDS = [
  "context_mode",
  "finder_model",
  "finder_provider",
  "review_fingerprint",
  "skeptic_model",
  "skeptic_provider",
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
 * resolved. Comparison is a different matter: `judgeOf`
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
  // Whitespace is refused before anything is hashed. A trailing space makes a
  // second identity that is invisible in every log and diff a human will read,
  // and the record is permanent once a birth is announced.
  return {
    schema_version: GENOME_SCHEMA_VERSION,
    known_fields: KNOWN_FIELDS,
    // Read, never derived. A prefix table used to guess this from the model
    // name and refuse what it could not classify, which stopped the pipeline on
    // codellama, mixtral, gemma3 and four others. The producer states it now,
    // and a guess breaks on the first model whose name does not carry its
    // vendor.
    finder_provider: exactly(record.finder_provider, "finder_provider"),
    // Absent and null both mean no skeptic ran. The published contract leaves
    // this field optional while requiring `finder_provider`, so absent is a
    // state the producer is entitled to emit and this must not treat it as an
    // error.
    skeptic_provider: !record.skeptic_provider
      ? null
      : exactly(record.skeptic_provider, "skeptic_provider"),
    finder_model: exactly(record.finder_model, "finder_model"),
    // An empty string and null both mean "no skeptic ran", and the upstream
    // schema admits either. Collapsed so one configuration cannot become two
    // identities. A blank-but-present `" "` is truthy and reaches `exactly`,
    // which refuses it — that is "no skeptic ran" written with a stray space,
    // and the space is the configuration error this function exists to surface.
    skeptic_model: !record.skeptic_model ? null : exactly(record.skeptic_model, "skeptic_model"),
    // `had_graph`, not `pr_slice`, and not `arm`. The design doc named two
    // sources and set no rule, so this is the rule — and it agrees with
    // upstream, whose own test is called
    // `test_had_graph_is_recorded_not_inferred_from_the_slice`: "ingest can fail
    // on a PR the plan called graph-enabled ... such a row must not count as
    // evidence for graph context".
    //
    // The genome describes how a review was performed, and the prompt builder
    // branches on whether a graph section exists, not on the plan. So a run
    // without a graph really did behave as diff-only, whatever it was planned
    // as.
    //
    // What this loses is worth stating. 19 records in the corpus are
    // `arm: "ablated"` — the same PRs reviewed with the graph deliberately
    // withheld, to measure what it contributes — and they land in the same
    // identity as 26 runs that were never planned for a graph at all. A
    // controlled removal and a plain diff-only run are one bee here. `harvest`
    // says so; separating them would mint a fourth identity, and the three that
    // exist are already born on chain.
    context_mode: record.had_graph ? "graph" : "diff-only",
    // Replaces guardian_version. `guardian_sha` stays on the record as
    // provenance and leaves the genome: one identity now spans several commits,
    // so there is no single value to record.
    review_fingerprint: exactly(record.review_fingerprint, "review_fingerprint"),
  };
}
