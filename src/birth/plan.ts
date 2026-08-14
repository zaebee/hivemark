import { byCodeUnit } from "../canonical.js";
import { dedupe } from "../derive.js";
import { genomeOf } from "../genome.js";
import { identityId, ownerAddress } from "../identity.js";
import type { ReviewRecord } from "../schema.js";
import type { Genome } from "../types.js";
import { announced, type BirthRecord } from "./ledger.js";

export interface BirthPlan {
  readonly identity_id: `0x${string}`;
  readonly entity: `0x${string}`;
  readonly genome: Genome;
  readonly firstSeen: number;
  /**
   * Whether this identity's earliest review is also the corpus's earliest.
   *
   * `firstSeen` is a minimum over whatever file was handed in, and a birth is
   * permanent — an earlier review surfacing later makes the announced date wrong
   * with no way to revise it. An identity first seen in the middle of the corpus
   * has reviews on both sides of it, which is evidence the boundary is not
   * cutting it off. One sitting exactly on the earliest edge has no such
   * evidence, and is the one to check before broadcasting.
   *
   * A true value is not a defect. It is the expected state for the identity that
   * genuinely came first, and this cannot distinguish that from a truncated
   * corpus — which is the point: only a human knows whether more exists.
   */
  readonly atCorpusEdge: boolean;
}

export interface CorpusSpan {
  readonly earliest: number;
  readonly latest: number;
  readonly records: number;
}

/**
 * When the corpus starts and ends, so an operator can see what window a birth
 * date was drawn from before making it permanent.
 */
export function corpusSpan(records: readonly ReviewRecord[]): CorpusSpan | null {
  if (records.length === 0) return null;
  const times = records.map((r) => Math.floor(Date.parse(r.reviewed_at) / 1000));
  return { earliest: Math.min(...times), latest: Math.max(...times), records: records.length };
}

/**
 * Which identities have no birth record yet.
 *
 * `firstSeen` is the earliest review the identity produced, not the moment this
 * runs. The record should say when the entity first acted, and a wall clock
 * would make the same corpus announce different dates on different days — the
 * same correction an attestation's `time` needed.
 */
export function planBirths(
  records: readonly ReviewRecord[],
  births: readonly BirthRecord[],
): BirthPlan[] {
  const earliest = new Map<`0x${string}`, { genome: Genome; firstSeen: number }>();

  // The same dedupe the track record applies. Without it a superseded re-run
  // could set an identity's birth date while `derive` ignores that very row, so
  // the two would disagree about a review that no longer counts.
  for (const record of dedupe(records)) {
    const genome = genomeOf(record);
    const id = identityId(genome);
    const seenAt = Math.floor(Date.parse(record.reviewed_at) / 1000);
    const held = earliest.get(id);
    // Every review sharing an identity has an identical genome by construction —
    // that is what identity means here — so only the date can differ.
    if (!held || seenAt < held.firstSeen) {
      earliest.set(id, { genome, firstSeen: seenAt });
    }
  }

  // The corpus edge is taken over every record, not only the deduplicated ones:
  // the question is where the *file* starts, and a superseded run still shows
  // that reviews existed at that moment.
  const span = corpusSpan(records);

  return [...earliest.entries()]
    .filter(([id]) => !announced(births, id))
    .map(([id, { genome, firstSeen }]) => ({
      identity_id: id,
      entity: ownerAddress(id),
      genome,
      firstSeen,
      atCorpusEdge: span !== null && firstSeen === span.earliest,
    }))
    // Ordered by identity so two runs over the same corpus propose the same
    // sequence regardless of the order the reviews were read in.
    .sort((a, b) => byCodeUnit(a.identity_id, b.identity_id));
}
