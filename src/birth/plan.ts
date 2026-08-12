import { byCodeUnit } from "../canonical.js";
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

  for (const record of records) {
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

  return [...earliest.entries()]
    .filter(([id]) => !announced(births, id))
    .map(([id, { genome, firstSeen }]) => ({
      identity_id: id,
      entity: ownerAddress(id),
      genome,
      firstSeen,
    }))
    // Ordered by identity so two runs over the same corpus propose the same
    // sequence regardless of the order the reviews were read in.
    .sort((a, b) => byCodeUnit(a.identity_id, b.identity_id));
}
