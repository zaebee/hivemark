import { keccak256, toHex } from "viem";
import { canonicalJson } from "./canonical.js";
import { genomeOf } from "./genome.js";
import { identityId } from "./identity.js";
import type { RawFinding, ReviewRecord } from "./schema.js";
import type { Claim } from "./types.js";

/**
 * Hash the finding together with the review that produced it.
 *
 * The review coordinates are included so the same text found in two different
 * pull requests is two claims, not one. Every field of the finding takes part —
 * prose especially, since that is what a reader would dispute.
 */
function claimHash(record: ReviewRecord, finding: RawFinding): `0x${string}` {
  return keccak256(
    toHex(
      canonicalJson({
        url: record.url,
        head_sha: record.head_sha,
        guardian_sha: record.guardian_sha,
        finder_model: record.finder_model,
        skeptic_model: record.skeptic_model,
        finding,
      }),
    ),
  );
}

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
    claim_hash: claimHash(record, finding),
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
