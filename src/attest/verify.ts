import { EAS, Offchain, OffchainAttestationVersion, SchemaEncoder } from "@ethereum-attestation-service/eas-sdk";
import { fromStoredAttestation } from "./attest.js";
import type { AttestationEnvelope } from "./attest.js";
import { CLAIM_SCHEMA, CLAIM_SCHEMA_UID } from "./schema.js";
import { ownerAddress } from "../identity.js";

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

  // The envelope is untrusted JSON, not a value TypeScript actually checked — the
  // `1` literal type only binds the writer in attest.ts. A future format change
  // is only detectable at all if something reads this field, so an unrecognised
  // version is rejected here rather than silently interpreted as today's shape.
  if ((envelope.envelope_version as number) !== 1) {
    failures.push(
      `envelope_version ${String(envelope.envelope_version)} is not one this verifier understands (expected 1)`,
    );
  }

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

    const attestation = fromStoredAttestation(envelope.attestation);

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

    // The signature covers `message.schema` too, so a forger cannot swap it without
    // re-signing — but nothing upstream of this function refuses a well-signed
    // attestation for a *different* schema. Decoding `message.data` as hivemark's
    // CLAIM_SCHEMA is meaningless (and may throw on unrelated bytes) unless the
    // attestation itself claims to use that schema, so this is checked, and the
    // decode skipped, before any decode is attempted.
    if (envelope.attestation.message.schema.toLowerCase() !== CLAIM_SCHEMA_UID.toLowerCase()) {
      failures.push(
        `attestation claims schema ${envelope.attestation.message.schema}, not hivemark's ` +
          `${CLAIM_SCHEMA_UID} — decoding its data as a claim would be meaningless`,
      );
    } else {
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

      // `recipient` is what makes the attestation be *about* the reviewer (see
      // attest.ts's doc comment on attestClaim) — it is bound at signing time to
      // ownerAddress(claim.identity_id) and is itself covered by the signature, so
      // a forger cannot edit it in place. But nothing previously checked that the
      // *signer* bound it correctly in the first place. Re-derive from the
      // identityId decoded above (signed, and cross-checked against
      // envelope.identity_id just above) rather than from envelope.identity_id
      // directly, which is attacker-controlled on its own.
      const expectedRecipient = ownerAddress(signedIdentityId as `0x${string}`);
      if (expectedRecipient.toLowerCase() !== envelope.attestation.message.recipient.toLowerCase()) {
        failures.push(
          `attestation's recipient ${envelope.attestation.message.recipient} does not match ` +
            `${expectedRecipient}, the owner address derived from the signed identity`,
        );
      }
    }

    return { ok: failures.length === 0, attested: valid, failures, unverifiable };
  } catch (cause) {
    // Some SDK failures carry no message at all — e.g. the eas-sdk's own
    // `InvalidDomain` is thrown as `new InvalidDomain()`, so tampering
    // `attestation.domain.*` produces an Error whose `.message` is `""` — and a
    // non-Error throw has no `.message` in the first place. Either way, printing
    // it verbatim leaves a diagnostic that reads as truncated rather than
    // intentionally withheld, so a fixed description stands in. Still no `cause`
    // chain and no raw value interpolation: whatever was thrown may carry
    // attacker-controlled text (loadSigner has the same rule, for the same reason).
    const detail = cause instanceof Error && cause.message !== "" ? cause.message : "no further detail is available";
    failures.push(`envelope could not be checked: ${detail}`);
    return { ok: false, attested: false, failures, unverifiable };
  }
}
