import type { AttestationEnvelope } from "../attest/attest.js";
import { periodBounds, periodOf, type PeriodId } from "./period.js";
import { recordFor, type AnchorRecord } from "./ledger.js";
import { rootOf } from "./tree.js";

export interface AnchorPlan {
  readonly period: PeriodId;
  readonly root: `0x${string}`;
  readonly count: number;
  readonly uids: `0x${string}`[];
  readonly periodStart: number;
  readonly periodEnd: number;
}

/**
 * What a given week's anchor would cover, or null if there is nothing to anchor.
 *
 * The period's own bounds are reported rather than the span of its contents: the
 * claim being made is about a calendar week, and narrowing it to the first and
 * last attestation would quietly change what the anchor asserts.
 */
export function planAnchor(
  envelopes: readonly AttestationEnvelope[],
  records: readonly AnchorRecord[],
  period: PeriodId,
): AnchorPlan | null {
  if (recordFor(records, period)) {
    throw new Error(`period is already anchored: ${period}`);
  }

  const uids = envelopes
    .filter(
      (e) =>
        periodOf(new Date(Number(e.attestation.message.time) * 1000).toISOString()) === period,
    )
    .map((e) => e.attestation.uid as `0x${string}`)
    // Sorted so the root depends on the set, not on the order it was read in.
    .sort();

  if (uids.length === 0) return null;

  const { start, end } = periodBounds(period);
  return {
    period,
    root: rootOf(uids),
    count: uids.length,
    uids,
    periodStart: start,
    periodEnd: end,
  };
}
