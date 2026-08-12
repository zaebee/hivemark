import { EAS, Offchain, OffchainAttestationVersion } from "@ethereum-attestation-service/eas-sdk";
import type { AttestationEnvelope } from "./attest.js";

export interface VerificationResult {
  /** Nothing was found wrong. */
  readonly ok: boolean;
  /** A signature verified against the recorded signer. Never implied by `ok`. */
  readonly attested: boolean;
  readonly failures: readonly string[];
  /** What this artifact cannot establish, whatever the signature says. */
  readonly unverifiable: readonly string[];
}

/**
 * Check an envelope against the domain it records.
 *
 * The domain is rebuilt from the document rather than taken from today's
 * constants, so an attestation signed under an older domain still verifies. That
 * is not circular: a forger who edits the recorded domain changes the message
 * that gets rebuilt, and recovery then stops matching the recorded signer.
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
    if (!valid) failures.push("signature does not recover to the recorded signer");

    return { ok: failures.length === 0, attested: valid, failures, unverifiable };
  } catch (cause) {
    failures.push(`envelope could not be checked: ${(cause as Error).message}`);
    return { ok: false, attested: false, failures, unverifiable };
  }
}
