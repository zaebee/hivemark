import { genomeOf } from "./genome.js";
import { identityId } from "./identity.js";
import type { ReviewRecord } from "./schema.js";
import type { Claim } from "./types.js";

/**
 * Turn one review into claims.
 *
 * A finding with no verdict becomes `unresolved`, which is hivemark's own state
 * rather than Guardian's: Guardian leaves `verdict` null when the skeptic did
 * not run, and that absence must never be read as confirmation.
 */
export function claimsOf(record: ReviewRecord): Claim[] {
  const id = identityId(genomeOf(record));

  return record.findings.map((finding) => ({
    identity_id: id,
    url: record.url,
    project: record.project,
    head_sha: record.head_sha,
    reviewed_at: record.reviewed_at,
    file: finding.file,
    line: finding.line ?? null,
    severity: finding.severity,
    category: finding.category,
    title: finding.title,
    confidence: finding.confidence,
    verdict: finding.verdict ?? "unresolved",
    impact_score: finding.impact_score ?? null,
  }));
}
