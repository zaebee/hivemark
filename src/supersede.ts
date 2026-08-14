import { decodeAbiParameters } from "viem";
import type { AttestationEnvelope } from "./attest/attest.js";

/**
 * Which attestations came from a review that a later run superseded.
 *
 * Computed from published attestations alone — no corpus, no ledger, no access
 * to whoever generated them. That is the whole point: `deriveTrackRecords` and
 * `planBirths` drop superseded runs, the signing loop does not, and the gap
 * between "attestations covered" and "claims counted" was previously
 * unexplainable to anyone holding only the published record.
 *
 * Signing every run stays correct. An attestation says this identity made this
 * claim at this time, which is true of a superseded run — it happened. Signing
 * only the newest would bake one scoring policy into a permanent record and make
 * re-scoring under another impossible. Since the distinction is recomputable by
 * any reader, nothing is lost by publishing both and marking which is which.
 */

/** The claim schema's field types, in order. Must match `CLAIM_SCHEMA`. */
const CLAIM_TYPES = [
  { type: "bytes32" }, // identityId
  { type: "string" }, //  repo
  { type: "uint32" }, //  pr
  { type: "string" }, //  commitSha
  { type: "string" }, //  file
  { type: "uint32" }, //  line
  { type: "string" }, //  category
  { type: "string" }, //  severity
  { type: "uint8" }, //   confidence
  { type: "uint8" }, //   verdict
  { type: "uint8" }, //   impactScore
  { type: "bytes32" }, // claimHash
] as const;

export interface SupersededSummary {
  /** Distinct review groups — one identity reviewing one commit of one PR. */
  readonly groups: number;
  /** Groups that were reviewed more than once at distinguishable times. */
  readonly repeated: number;
  /** Attestations belonging to a run that a later one superseded. */
  readonly superseded: ReadonlySet<string>;
}

/**
 * The dedupe key, recovered from what the chain carries.
 *
 * Mirrors `dedupe` in `derive.ts`, which keys on url, head_sha and identity.
 * `repo` and `pr` together are the url, and `commitSha` is the head_sha.
 */
function groupKey(identityId: string, repo: string, pr: number, commitSha: string): string {
  return JSON.stringify([identityId, repo, pr, commitSha]);
}

export function supersededIn(envelopes: readonly AttestationEnvelope[]): SupersededSummary {
  const groups = new Map<string, { uid: string; time: number }[]>();

  for (const envelope of envelopes) {
    const message = envelope.attestation.message as { data: `0x${string}`; time: string };
    const [identityId, repo, pr, commitSha] = decodeAbiParameters(CLAIM_TYPES, message.data);
    const key = groupKey(identityId as string, repo as string, Number(pr), commitSha as string);
    const entry = { uid: envelope.attestation.uid as string, time: Number(message.time) };
    const held = groups.get(key);
    if (held) held.push(entry);
    else groups.set(key, [entry]);
  }

  const superseded = new Set<string>();
  let repeated = 0;

  for (const entries of groups.values()) {
    const times = new Set(entries.map((e) => e.time));

    // One distinct time means one run — or two runs that happened to share a
    // `reviewed_at` to the second, which the published record cannot tell apart
    // and this function therefore does not claim to. The corpus breaks that tie
    // on canonical JSON, but that input is never published, so a reader working
    // from attestations alone reaches a floor here rather than a wrong answer.
    if (times.size === 1) continue;

    repeated++;
    const newest = Math.max(...times);
    for (const entry of entries) {
      if (entry.time !== newest) superseded.add(entry.uid);
    }
  }

  return { groups: groups.size, repeated, superseded };
}
