import { EAS_CONTRACT } from "../attest/domain.js";
import { providerOf } from "../genome.js";
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

  // `provider` is an expression of `finder_model`, not an independent field —
  // the rule `avatar.ts` already enforces when it derives the palette rather
  // than trusting the genome. A record published with the two disagreeing would
  // permanently name a provider the finder contradicts.
  const stated = plan.genome.provider;
  const actual = providerOf(plan.genome.finder_model);
  if (stated !== actual) {
    throw new Error(
      `birth plan states provider ${stated}, but its finder ${plan.genome.finder_model} belongs to ${actual}`,
    );
  }

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
