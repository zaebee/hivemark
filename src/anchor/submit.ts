import { EAS_CONTRACT } from "../attest/domain.js";
import { ANCHOR_SCHEMA_UID, encodeAnchor } from "./schema.js";
import type { AnchorPlan } from "./plan.js";

export interface AnchorRequest {
  readonly to: `0x${string}`;
  readonly schema: `0x${string}`;
  readonly data: string;
  readonly recipient: `0x${string}`;
  readonly expirationTime: bigint;
  readonly revocable: boolean;
  readonly refUID: `0x${string}`;
  readonly value: bigint;
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
const ZERO_UID = `0x${"00".repeat(32)}` as const;

/**
 * The exact request a human will broadcast.
 *
 * Nothing here sends anything. Building and sending are separated so the thing
 * that spends money is a deliberate act with a reviewable input, rather than a
 * side effect of running the pipeline.
 *
 * There is no recipient: an anchor is a statement about a period, not about
 * anybody, and naming an address would invite the reading that someone endorsed
 * its contents.
 */
export function buildAnchorRequest(plan: AnchorPlan): AnchorRequest {
  return {
    to: EAS_CONTRACT,
    schema: ANCHOR_SCHEMA_UID,
    data: encodeAnchor({
      root: plan.root,
      periodStart: plan.periodStart,
      periodEnd: plan.periodEnd,
      count: plan.count,
    }),
    recipient: ZERO_ADDRESS,
    expirationTime: 0n,
    revocable: true,
    refUID: ZERO_UID,
    value: 0n,
  };
}
