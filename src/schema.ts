import { z } from "zod";

export const VERDICT_VALUES = ["confirmed", "refuted", "uncertain"] as const;

/**
 * One finding, mirroring Guardian's `cgis.guardian.findings.Finding`.
 *
 * That model is a published contract: codegraph-brain 0.10.0 on PyPI ships a
 * byte-identical `findings.py`. `tests/schema.test.ts` compares this schema
 * against the model's own JSON Schema, so a drift upstream fails the build
 * rather than corrupting a track record.
 */
export const RawFindingSchema = z.object({
  file: z.string(),
  line: z.number().int().min(1).nullable().optional(),
  anchor: z.string().nullable().optional(),
  severity: z.enum(["critical", "major", "minor"]),
  category: z.enum(["logic", "contract", "tests", "types", "ontology", "security"]),
  title: z.string(),
  evidence: z.string(),
  problem: z.string(),
  fix: z.string(),
  confidence: z.number().int().min(0).max(100),
  verdict: z.enum(VERDICT_VALUES).nullable().optional(),
  skeptic_note: z.string().nullable().optional(),
  impact_score: z.number().int().min(0).max(10).nullable().optional(),
});

/**
 * One review, as written to `benchmarks/martian-reviews.jsonl`.
 *
 * Unlike the finding above, this shape has no published contract yet:
 * `cgis.guardian.martian.ReviewRecord` exists in the repository but postdates
 * the v0.10.0 tag, so it is absent from the wheel. Until a release carries it,
 * runtime validation is the guard — which suits a shape still under change.
 */
export const ReviewRecordSchema = z.object({
  url: z.string(),
  project: z.string(),
  base_sha: z.string(),
  head_sha: z.string(),
  // Required and non-nullable in the published contract. Modelled that way here
  // too: a record without it would yield an identity that cannot say which
  // Guardian produced it, and a generation marker guessed from nothing is worse
  // than a refusal.
  guardian_sha: z.string(),
  // Validated here rather than trusted downstream: dedupe orders reviews by this
  // field, and an unparseable value would otherwise reach Date.parse as NaN,
  // where every comparison is false and the first record silently wins.
  reviewed_at: z
    .string()
    .refine((s) => Number.isFinite(Date.parse(s)), "reviewed_at is not a parseable timestamp"),
  finder_model: z.string(),
  // Required but nullable: null means the skeptic pass did not run, which is a
  // real configuration and the reason a badge can lack a stinger.
  skeptic_model: z.string().nullable(),
  /**
   * The digest of the code that actually decides a review — prompts, context
   * assembly, the selected provider — as opposed to `guardian_sha`, which moves
   * on any commit at all, including a README edit.
   *
   * Required, with no fallback to `guardian_sha`. A corpus where some rows key
   * on one and some on the other makes a single reviewer appear as two entities
   * depending on which run it came from, which is worse than either scheme
   * alone.
   */
  review_fingerprint: z.string(),
  /**
   * Stated by the producer rather than inferred from a model-name prefix.
   *
   * `providerOf` guesses from the name and refuses what it does not recognise,
   * which stops the pipeline on codellama, mixtral, gemma3, phi4, starcoder2,
   * granite-code and command-r. The producer knows, and a guess breaks on the
   * first model whose name does not carry its vendor.
   */
  finder_provider: z.string(),
  /**
   * Nullable *and* optional, unlike `skeptic_model` directly above it.
   *
   * The published contract leaves this one optional — verified against
   * codegraph-brain 0.13.0, where `review_fingerprint` and `finder_provider` are
   * required and this is not. Requiring it here would reject a record the
   * producer is entitled to emit, so the drift guard refuses it and is right to.
   * `genomeOf` collapses absent and null to the same thing: no skeptic ran.
   */
  skeptic_provider: z.string().nullable().optional(),
  had_graph: z.boolean(),
  pr_slice: z.string(),
  /**
   * Which arm produced this review: `"graph"` is the normal run, `"ablated"` is
   * the same PR reviewed with the graph **deliberately** withheld.
   *
   * Optional because rows predating the field exist in the corpus. Read here
   * because without it an ablation and an ingest failure are the same row — and
   * upstream added the field precisely so they would not be. Not reading it
   * once led this project to describe 19 deliberate ablations as a degraded
   * run that had lost its graph.
   */
  arm: z.enum(["graph", "ablated"]).optional(),
  parse_failed: z.boolean(),
  error: z.string().nullable().optional(),
  findings: z.array(RawFindingSchema),
});

export type RawFinding = z.infer<typeof RawFindingSchema>;
export type ReviewRecord = z.infer<typeof ReviewRecordSchema>;
