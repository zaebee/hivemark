import { SchemaEncoder } from "@ethereum-attestation-service/eas-sdk";
import { encodePacked, keccak256 } from "viem";
import type { Claim, Verdict } from "../types.js";

/**
 * The attestation schema.
 *
 * `commitSha` is a string rather than bytes32 because a git sha is 20 bytes and
 * padding it would invent four bytes of zeroes that are not part of the commit
 * id. No `appliedByHuman`: the human axis has no data in benchmark artifacts,
 * and a field we could only ever sign as false asserts an observation we never
 * made.
 */
export const CLAIM_SCHEMA =
  "bytes32 identityId,string repo,uint32 pr,string commitSha,string file," +
  "uint32 line,string category,string severity,uint8 confidence,uint8 verdict," +
  "uint8 impactScore,bytes32 claimHash";

/** No resolver, revocable — the two other inputs to a schema's identity. */
const RESOLVER = "0x0000000000000000000000000000000000000000" as const;
const REVOCABLE = true;

/**
 * Derived, not registered.
 *
 * Registering a schema is a transaction, and this milestone spends no gas. The
 * UID is deterministic, so attestations signed today match the schema once it is
 * registered in the `anchor` milestone.
 */
export const CLAIM_SCHEMA_UID: `0x${string}` = keccak256(
  encodePacked(["string", "address", "bool"], [CLAIM_SCHEMA, RESOLVER, REVOCABLE]),
);

/** `unresolved` is ours, not EAS's, and must never share a code with `confirmed`. */
export const VERDICT_CODES: Record<Verdict, number> = {
  unresolved: 0,
  confirmed: 1,
  refuted: 2,
  uncertain: 3,
};

/** Pull request number from a GitHub URL, or 0 when the URL carries none. */
function prNumber(url: string): number {
  const match = /\/pull\/(\d+)/.exec(url);
  return match ? Number(match[1]) : 0;
}

export function encodeClaim(claim: Claim): string {
  return new SchemaEncoder(CLAIM_SCHEMA).encodeData([
    { name: "identityId", type: "bytes32", value: claim.identity_id },
    { name: "repo", type: "string", value: claim.project },
    { name: "pr", type: "uint32", value: prNumber(claim.url) },
    { name: "commitSha", type: "string", value: claim.head_sha },
    { name: "file", type: "string", value: claim.file },
    // 0 means file-level. Line numbers are 1-based upstream, so 0 is unused.
    { name: "line", type: "uint32", value: claim.line ?? 0 },
    { name: "category", type: "string", value: claim.category },
    { name: "severity", type: "string", value: claim.severity },
    { name: "confidence", type: "uint8", value: claim.confidence },
    { name: "verdict", type: "uint8", value: VERDICT_CODES[claim.verdict] },
    { name: "impactScore", type: "uint8", value: claim.impact_score ?? 0 },
    { name: "claimHash", type: "bytes32", value: claim.claim_hash },
  ]);
}
