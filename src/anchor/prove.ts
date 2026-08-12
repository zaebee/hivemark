import type { AnchorRecord } from "./ledger.js";
import type { PeriodId } from "./period.js";
import { proofFor, verifyInclusion } from "./tree.js";

export interface InclusionProof {
  readonly uid: `0x${string}`;
  readonly period: PeriodId;
  readonly root: `0x${string}`;
  readonly proof: `0x${string}`[];
  /** The onchain attestation carrying this root, so a checker can find it. */
  readonly attestation_uid: `0x${string}`;
}

/**
 * Show that an attestation was inside an anchored week.
 *
 * What this establishes is a bound on time and nothing else: the attestation
 * existed no later than the block that carried its root. It says nothing about
 * whether the claim inside it is true — the same separation `verifyEnvelope`
 * maintains, and it has to survive here too.
 */
export function proveInclusion(
  records: readonly AnchorRecord[],
  uid: `0x${string}`,
): InclusionProof | null {
  const record = records.find((r) => r.uids.includes(uid));
  if (!record) return null;

  const uids = record.uids as `0x${string}`[];
  return {
    uid,
    period: record.period,
    root: record.root as `0x${string}`,
    proof: proofFor(uids, uid),
    attestation_uid: record.attestation_uid as `0x${string}`,
  };
}

export function checkInclusion(proof: InclusionProof): boolean {
  return verifyInclusion(proof.root, proof.uid, proof.proof);
}
