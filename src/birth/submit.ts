import { EAS_CONTRACT } from "../attest/domain.js";
import { identityId, ownerAddress } from "../identity.js";
import { BIRTH_SCHEMA_UID, encodeBirth } from "./schema.js";
import type { BirthPlan } from "./plan.js";

export interface BirthRequest {
  readonly to: `0x${string}`;
  readonly schema: `0x${string}`;
  readonly data: string;
  readonly recipient: `0x${string}`;
  readonly expirationTime: bigint;
  readonly revocable: boolean;
  readonly refUID: `0x${string}`;
  readonly value: bigint;
}

const ZERO_UID = `0x${"00".repeat(32)}` as const;

/**
 * The exact request a human will broadcast.
 *
 * The recipient is the entity itself — unlike an anchor, which is about a period
 * and names nobody, a birth is about this identity, and its derived address is
 * who it concerns.
 *
 * The two consistency checks are not defensive padding. A record whose published
 * genome hashes to a different identity than it names, or which addresses an
 * entity that is not that identity's address, is a contradiction nothing can
 * correct once it is on a chain — and it would break the single property this
 * schema exists to provide, that a reader can recompute the entity from the
 * record.
 */
export function buildBirthRequest(plan: BirthPlan): BirthRequest {
  const derived = identityId(plan.genome);
  if (derived !== plan.identity_id) {
    throw new Error(
      `birth plan names ${plan.identity_id} but does not match its genome, which hashes to ${derived}`,
    );
  }

  const entity = ownerAddress(derived);
  if (entity.toLowerCase() !== plan.entity.toLowerCase()) {
    throw new Error(
      `birth plan names entity ${plan.entity}, but that identity's address is ${entity}`,
    );
  }

  // The provider consistency check that stood here is deleted rather than
  // rewritten, and the distinction matters.
  //
  // It compared `genome.provider` against `providerOf(finder_model)` — two
  // values the producer supplies, one of them derived from the other. That
  // catches a producer contradicting itself and never a producer that is
  // confidently wrong, which is the case worth catching. A check that cannot
  // fail independently of the thing it checks is not a check.
  //
  // The job moved upstream, where it can fail on evidence: the review-path
  // closure is computed per provider and raises on a provider name it cannot
  // map to a module. Rebuilding a weaker version here would restore the comfort
  // without the guarantee.

  return {
    to: EAS_CONTRACT,
    schema: BIRTH_SCHEMA_UID,
    data: encodeBirth(plan.genome, plan.firstSeen),
    recipient: entity,
    expirationTime: 0n,
    revocable: true,
    refUID: ZERO_UID,
    value: 0n,
  };
}
