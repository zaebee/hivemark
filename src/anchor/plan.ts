import { byCodeUnit } from "../canonical.js";
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
  now: number = Math.floor(Date.now() / 1000),
): AnchorPlan | null {
  if (recordFor(records, period)) {
    throw new Error(`period is already anchored: ${period}`);
  }

  // A week that is still running cannot be anchored, because one anchor per
  // period is enforced: every review made in the days remaining would fall into
  // a week that can never be anchored again. That is worse than a missed week —
  // a gap is visible in `gapsIn` and honest about having no time bound, while a
  // half-covered week looks finished and is not.
  //
  // `now` is a parameter rather than a clock read inside the arithmetic. This
  // project has already shipped one bug from time taken off the clock, and a
  // guard about time that cannot be tested at a chosen instant is not a guard.
  const bounds = periodBounds(period);
  if (now < bounds.end) {
    throw new Error(
      `period ${period} is still running until ${new Date(bounds.end * 1000).toISOString()}: ` +
        `anchoring now would leave every later review in it uncoverable`,
    );
  }

  // Deduplicated before anything counts them. Two byte-identical findings in one
  // review produce the same claim_hash, hence the same salt and the same time,
  // hence one uid twice. None appear in the current corpus, but a repeated leaf
  // would let `count` overstate what the anchor covers — the record would claim
  // more evidence than exists.
  const inPeriod = envelopes
    .filter(
      (e) =>
        periodOf(new Date(Number(e.attestation.message.time) * 1000).toISOString()) === period,
    )
    .map((e) => e.attestation.uid as `0x${string}`);

  // Sorted so the root depends on the set, not on the order it was read in.
  //
  // Explicitly by code unit, never `localeCompare`: this ordering decides a
  // Merkle root, and locale-aware collation varies with the ICU data the runtime
  // happens to carry. Two machines could then publish different roots for
  // identical input.
  const uids = [...new Set(inPeriod)].sort(byCodeUnit);

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
