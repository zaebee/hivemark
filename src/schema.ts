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
  guardian_sha: z.string().nullable().optional(),
  // Validated here rather than trusted downstream: dedupe orders reviews by this
  // field, and an unparseable value would otherwise reach Date.parse as NaN,
  // where every comparison is false and the first record silently wins.
  reviewed_at: z
    .string()
    .refine((s) => Number.isFinite(Date.parse(s)), "reviewed_at is not a parseable timestamp"),
  finder_model: z.string(),
  skeptic_model: z.string().nullable().optional(),
  had_graph: z.boolean(),
  pr_slice: z.string(),
  parse_failed: z.boolean(),
  error: z.string().nullable().optional(),
  findings: z.array(RawFindingSchema),
});

export type RawFinding = z.infer<typeof RawFindingSchema>;
export type ReviewRecord = z.infer<typeof ReviewRecordSchema>;
