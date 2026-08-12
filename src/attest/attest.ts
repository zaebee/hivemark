import { EAS, Offchain, OffchainAttestationVersion } from "@ethereum-attestation-service/eas-sdk";
import type { SignedOffchainAttestation } from "@ethereum-attestation-service/eas-sdk";
import { EAS_CONTRACT, SIGNING_DOMAIN } from "./domain.js";
import { CLAIM_SCHEMA_UID, encodeClaim } from "./schema.js";
import type { Signer } from "./signer.js";
import { ownerAddress } from "../identity.js";
import type { Claim } from "../types.js";

/** The domain as stored — strings, so the envelope survives JSON. */
export interface StoredDomain {
  readonly address: string;
  readonly chainId: string;
  readonly version: string;
}

/**
 * The signed attestation as stored: the SDK's own shape, except the three
 * fields it types as `bigint` — EIP-712 `domain.chainId` and
 * `message.time`/`message.expirationTime` — are stringified.
 *
 * The SDK's object otherwise throws out of `JSON.stringify` (bigints have no
 * default JSON representation). The fix is scoped to these fields rather than
 * patching `BigInt.prototype.toJSON`, which would silently change behaviour
 * for every other consumer of the eas-sdk library sharing this process.
 */
export type StoredAttestation = Omit<SignedOffchainAttestation, "domain" | "message"> & {
  readonly domain: Omit<SignedOffchainAttestation["domain"], "chainId"> & { readonly chainId: string };
  readonly message: Omit<SignedOffchainAttestation["message"], "time" | "expirationTime"> & {
    readonly time: string;
    readonly expirationTime: string;
  };
};

export interface AttestationEnvelope {
  /** Which hivemark wrote this, for future format changes. */
  readonly envelope_version: 1;
  readonly domain: StoredDomain;
  readonly signer: string;
  /** Denormalised so an index can be built without decoding every payload. */
  readonly identity_id: `0x${string}`;
  readonly claim_hash: `0x${string}`;
  readonly attestation: StoredAttestation;
}

/**
 * These two are inverses, and they sit together for that reason rather than for
 * reuse — `fromStoredAttestation` has one caller.
 *
 * The pairing is the point. Every bigint field one of them stringifies, the
 * other has to restore. Kept apart, a field added to the SDK's shape could be
 * handled in one direction and forgotten in the other, and the symptom would be
 * signature verification failing on attestations that are perfectly good.
 */

/** Narrow the SDK's bigint fields to strings so the envelope survives JSON. */
export function toStoredAttestation(attestation: SignedOffchainAttestation): StoredAttestation {
  return {
    ...attestation,
    domain: { ...attestation.domain, chainId: attestation.domain.chainId.toString() },
    message: {
      ...attestation.message,
      time: attestation.message.time.toString(),
      expirationTime: attestation.message.expirationTime.toString(),
    },
  };
}

/** Widen the stored strings back to the bigints the SDK's verifier expects. */
export function fromStoredAttestation(stored: StoredAttestation): SignedOffchainAttestation {
  return {
    ...stored,
    domain: { ...stored.domain, chainId: BigInt(stored.domain.chainId) },
    message: {
      ...stored.message,
      time: BigInt(stored.message.time),
      expirationTime: BigInt(stored.message.expirationTime),
    },
  };
}

/** Constructed without a provider: nothing here touches the network. */
const offchain = new Offchain(
  { address: SIGNING_DOMAIN.address, chainId: SIGNING_DOMAIN.chainId, version: SIGNING_DOMAIN.version },
  OffchainAttestationVersion.Version2,
  new EAS(EAS_CONTRACT),
);

/**
 * Sign one claim.
 *
 * `recipient` is the reviewer's own soulbound address — the attestation is
 * about that identity — while the signer is the publisher. The two are
 * deliberately different: reviewers hold no keys, so nothing they are said to
 * have claimed is signed by them.
 *
 * `expirationTime` is 0 (never expires) and `revocable` is true, matching the
 * schema's own revocability. Revocation itself is an onchain action and belongs
 * to a later milestone; declaring it here only keeps that door open.
 */
export async function attestClaim(
  claim: Claim,
  signer: Signer,
  now: bigint = BigInt(Math.floor(Date.now() / 1000)),
): Promise<AttestationEnvelope> {
  const attestation = await offchain.signOffchainAttestation(
    {
      schema: CLAIM_SCHEMA_UID,
      // The reviewer's own soulbound address, recomputed from its identity.
      recipient: ownerAddress(claim.identity_id),
      time: now,
      expirationTime: 0n,
      revocable: true,
      refUID: `0x${"00".repeat(32)}`,
      data: encodeClaim(claim),
      // EAS's Version2 format defaults to a random salt so an observer cannot
      // confirm an attestation's existence by guessing its content. hivemark
      // publishes its claims outright, so there is nothing to hide, and a
      // random salt costs the one guarantee this pipeline actually needs:
      // the pipeline reruns over the same corpus on every pass, and a fresh
      // random salt would mint a new UID each time for a claim that has not
      // changed, so the output would grow without new information and the
      // milestone-3 Merkle anchor would anchor duplicates of one claim under
      // different identifiers. `claim_hash` is already a unique commitment
      // to the finding and the review that produced it, so passing it
      // through as the salt (rather than hashing it again) makes the UID a
      // stable function of the claim — which is what "the attestation for
      // this claim" has to mean before anything can reference it.
      salt: claim.claim_hash,
    },
    signer.wallet,
    { verifyOnchain: false },
  );

  return {
    envelope_version: 1,
    domain: {
      address: SIGNING_DOMAIN.address,
      chainId: SIGNING_DOMAIN.chainId.toString(),
      version: SIGNING_DOMAIN.version,
    },
    signer: signer.address,
    identity_id: claim.identity_id,
    claim_hash: claim.claim_hash,
    attestation: toStoredAttestation(attestation),
  };
}
