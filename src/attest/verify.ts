import { EAS, Offchain, OffchainAttestationVersion, SchemaEncoder } from "@ethereum-attestation-service/eas-sdk";
import type { AttestationEnvelope } from "./attest.js";
import { CLAIM_SCHEMA } from "./schema.js";

export interface VerificationResult {
  /** Nothing was found wrong. */
  readonly ok: boolean;
  /** A signature verified against the recorded signer. Never implied by `ok`. */
  readonly attested: boolean;
  readonly failures: readonly string[];
  /** What this artifact cannot establish, whatever the signature says. */
  readonly unverifiable: readonly string[];
}

/** Pull one named field out of a schema decode, or throw if the schema shape changed underneath us. */
function decodedField(decoded: ReturnType<SchemaEncoder["decodeData"]>, name: string): string {
  const item = decoded.find((entry) => entry.name === name);
  if (!item) throw new Error(`schema decode did not produce a "${name}" field`);
  return String(item.value.value);
}

/**
 * Check an envelope against the domain it records.
 *
 * The domain is rebuilt from the document rather than taken from today's
 * constants, so an attestation signed under an older domain still verifies. That
 * is not circular: a forger who edits the recorded domain changes the message
 * that gets rebuilt, and recovery then stops matching the recorded signer.
 *
 * The signature alone is not enough. What is actually signed is the ABI-encoded
 * payload in `attestation.message.data` — the envelope's own top-level
 * `identity_id` and `claim_hash` are denormalised copies that sit outside it.
 * A valid signature says nothing about whether those copies still match what
 * was signed, so a valid attestation could otherwise be re-attributed by
 * editing one field and leaving the signature untouched. `attested` reports
 * the signature check alone; `ok` additionally requires the envelope to agree
 * with the payload it claims to summarise, which is what makes the two
 * genuinely independent rather than restatements of one boolean.
 */
export function verifyEnvelope(envelope: AttestationEnvelope): VerificationResult {
  const failures: string[] = [];

  const unverifiable = [
    "whether the finding is correct — the signature covers provenance, not truth",
    "when the attestation was made; the recorded time is the signer's own claim, " +
      "and only an onchain anchor can bound it",
    "whether the reviewer identity corresponds to a run that really happened",
  ];

  try {
    const offchain = new Offchain(
      {
        address: envelope.domain.address,
        chainId: BigInt(envelope.domain.chainId),
        version: envelope.domain.version,
      },
      OffchainAttestationVersion.Version2,
      new EAS(envelope.domain.address),
    );

    const attestation = {
      ...envelope.attestation,
      domain: { ...envelope.attestation.domain, chainId: BigInt(envelope.attestation.domain.chainId) },
      message: {
        ...envelope.attestation.message,
        time: BigInt(envelope.attestation.message.time),
        expirationTime: BigInt(envelope.attestation.message.expirationTime),
      },
    };

    const valid = offchain.verifyOffchainAttestationSignature(envelope.signer, attestation);
    if (!valid) {
      // verifyOffchainAttestationSignature first recomputes the UID from the
      // message fields and rejects on a mismatch before it ever checks the
      // EIP-712 signature, so a tampered payload is caught here, not by a
      // failed signature recovery. The wording covers both causes rather
      // than naming the one this SDK call actually hits, since the two
      // outcomes are the same boolean and cannot be told apart from here.
      failures.push(
        "attestation does not verify: its UID does not match its recomputed content, " +
          "or its signature does not recover to the recorded signer",
      );
    }

    const decoded = new SchemaEncoder(CLAIM_SCHEMA).decodeData(envelope.attestation.message.data);
    const signedIdentityId = decodedField(decoded, "identityId");
    const signedClaimHash = decodedField(decoded, "claimHash");

    if (signedIdentityId.toLowerCase() !== envelope.identity_id.toLowerCase()) {
      failures.push(
        "envelope's identity_id disagrees with the identityId inside the signed payload " +
          "— the envelope contradicts what was actually signed",
      );
    }
    if (signedClaimHash.toLowerCase() !== envelope.claim_hash.toLowerCase()) {
      failures.push(
        "envelope's claim_hash disagrees with the claimHash inside the signed payload " +
          "— the envelope contradicts what was actually signed",
      );
    }

    return { ok: failures.length === 0, attested: valid, failures, unverifiable };
  } catch (cause) {
    failures.push(`envelope could not be checked: ${(cause as Error).message}`);
    return { ok: false, attested: false, failures, unverifiable };
  }
}
