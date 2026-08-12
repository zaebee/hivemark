import { EAS, Offchain, OffchainAttestationVersion } from "@ethereum-attestation-service/eas-sdk";
import { describe, expect, it } from "vitest";
import { attestClaim, type AttestationEnvelope } from "../src/attest/attest.js";
import { EAS_CONTRACT, SIGNING_DOMAIN } from "../src/attest/domain.js";
import { CLAIM_SCHEMA_UID, encodeClaim } from "../src/attest/schema.js";
import { loadSigner } from "../src/attest/signer.js";
import { verifyEnvelope } from "../src/attest/verify.js";
import { ownerAddress } from "../src/identity.js";
import type { Claim } from "../src/types.js";

const KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const signer = loadSigner({ HIVEMARK_SIGNING_KEY: KEY })!;

const offchain = new Offchain(
  { address: SIGNING_DOMAIN.address, chainId: SIGNING_DOMAIN.chainId, version: SIGNING_DOMAIN.version },
  OffchainAttestationVersion.Version2,
  new EAS(EAS_CONTRACT),
);

/**
 * Sign an envelope the way `attestClaim` does, except one message field is
 * deliberately wrong *before* signing.
 *
 * Post-hoc tampering can't model a bad `schema` or `recipient`: both are
 * covered by the signature, and `recipient` also feeds the UID, so editing
 * either after signing breaks the UID/signature check itself (`attested`
 * would go false too, along with the check under test). What finding 1 and
 * finding 2 describe is a signer that got the field wrong from the start and
 * then produced a fully self-consistent signature over it — the only way to
 * reproduce that is to sign it that way.
 */
async function signWithOverride(
  claim: Claim,
  overrides: { schema?: `0x${string}`; recipient?: `0x${string}` },
): Promise<AttestationEnvelope> {
  const attestation = await offchain.signOffchainAttestation(
    {
      schema: overrides.schema ?? CLAIM_SCHEMA_UID,
      recipient: overrides.recipient ?? ownerAddress(claim.identity_id),
      time: 1_755_000_000n,
      expirationTime: 0n,
      revocable: true,
      refUID: `0x${"00".repeat(32)}`,
      data: encodeClaim(claim),
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
    attestation: {
      ...attestation,
      domain: { ...attestation.domain, chainId: attestation.domain.chainId.toString() },
      message: {
        ...attestation.message,
        time: attestation.message.time.toString(),
        expirationTime: attestation.message.expirationTime.toString(),
      },
    },
  };
}

const claim: Claim = {
  identity_id: `0x${"ab".repeat(32)}`,
  claim_hash: `0x${"cd".repeat(32)}`,
  url: "https://github.com/getsentry/sentry/pull/80168",
  project: "sentry",
  head_sha: "8422030ef456e3a898415e96475b4d8ddfc7640f",
  reviewed_at: "2026-08-12T11:27:57.981751+00:00",
  file: "src/sentry/incidents/grouptype.py",
  line: 15,
  severity: "critical",
  category: "logic",
  title: "Abstract Method Not Implemented",
  confidence: 90,
  verdict: "confirmed",
  impact_score: 7,
};

describe("verifyEnvelope", () => {
  it("accepts an untouched envelope", async () => {
    const result = verifyEnvelope(await attestClaim(claim, signer, 1_755_000_000n));
    expect(result.ok).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("says attested only when a signature actually verified", async () => {
    const result = verifyEnvelope(await attestClaim(claim, signer, 1_755_000_000n));
    expect(result.attested).toBe(true);
  });

  it("rejects a tampered payload", async () => {
    const envelope = await attestClaim(claim, signer, 1_755_000_000n);
    const tampered = {
      ...envelope,
      attestation: {
        ...envelope.attestation,
        message: { ...envelope.attestation.message, data: "0xdeadbeef" },
      },
    };
    const result = verifyEnvelope(tampered);
    expect(result.ok).toBe(false);
    expect(result.attested).toBe(false);
    expect(result.failures.join(" ")).toMatch(/signature/i);
  });

  it("rejects a rewritten domain, which is why self-description is safe", async () => {
    const envelope = await attestClaim(claim, signer, 1_755_000_000n);
    const moved = { ...envelope, domain: { ...envelope.domain, chainId: "1" } };
    expect(verifyEnvelope(moved).ok).toBe(false);
  });

  it("rejects an envelope whose signer was swapped", async () => {
    const envelope = await attestClaim(claim, signer, 1_755_000_000n);
    const impostor = { ...envelope, signer: "0x000000000000000000000000000000000000dEaD" };
    expect(verifyEnvelope(impostor).ok).toBe(false);
  });

  it("names what a signature cannot establish, even when everything checks out", async () => {
    const result = verifyEnvelope(await attestClaim(claim, signer, 1_755_000_000n));
    const said = result.unverifiable.join(" ").toLowerCase();
    expect(said).toContain("correct");
    expect(said).toContain("time");
    expect(result.unverifiable.length).toBeGreaterThanOrEqual(2);
  });

  it("still calls it attested when only the denormalized identity_id was edited, but not ok", async () => {
    const envelope = await attestClaim(claim, signer, 1_755_000_000n);
    const edited = { ...envelope, identity_id: `0x${"ff".repeat(32)}` as const };
    const result = verifyEnvelope(edited);
    expect(result.attested).toBe(true);
    expect(result.ok).toBe(false);
    expect(result.failures.join(" ")).toMatch(/identity_id/);
  });

  it("still calls it attested when only the denormalized claim_hash was edited, but not ok", async () => {
    const envelope = await attestClaim(claim, signer, 1_755_000_000n);
    const edited = { ...envelope, claim_hash: `0x${"ff".repeat(32)}` as const };
    const result = verifyEnvelope(edited);
    expect(result.attested).toBe(true);
    expect(result.ok).toBe(false);
    expect(result.failures.join(" ")).toMatch(/claim_hash/);
  });

  it("still calls it attested when the attestation was signed for a foreign schema, but not ok", async () => {
    const envelope = await signWithOverride(claim, { schema: `0x${"99".repeat(32)}` });
    const result = verifyEnvelope(envelope);
    expect(result.attested).toBe(true);
    expect(result.ok).toBe(false);
    expect(result.failures.join(" ")).toMatch(/schema/);
  });

  it("still calls it attested when the recipient does not match the signed identity, but not ok", async () => {
    const envelope = await signWithOverride(claim, {
      recipient: "0x000000000000000000000000000000000000dEaD",
    });
    const result = verifyEnvelope(envelope);
    expect(result.attested).toBe(true);
    expect(result.ok).toBe(false);
    expect(result.failures.join(" ")).toMatch(/recipient/);
  });

  it("gives a real diagnostic, not a bare colon, when attestation.domain is tampered", async () => {
    // `version` alone won't do: verifyOffchainAttestationSignature checks the
    // recorded domain non-strictly, patching the expected version to whatever
    // the response claims (that's what lets an attestation signed under an
    // older domain still verify per the module doc comment). `verifyingContract`
    // has no such carve-out, so tampering it hits the eas-sdk's `InvalidDomain`
    // — thrown as `new InvalidDomain()`, an Error with an empty `.message`.
    const envelope = await attestClaim(claim, signer, 1_755_000_000n);
    const tampered = {
      ...envelope,
      attestation: {
        ...envelope.attestation,
        domain: {
          ...envelope.attestation.domain,
          verifyingContract: "0x0000000000000000000000000000000000000000",
        },
      },
    };
    const result = verifyEnvelope(tampered);
    expect(result.ok).toBe(false);
    expect(result.attested).toBe(false);
    const message = result.failures.join(" ");
    // The eas-sdk throws `new InvalidDomain()` here — an Error with an empty
    // `.message` — so a diagnostic that merely forwards it would read exactly
    // "envelope could not be checked: " with nothing after the colon.
    expect(message).not.toBe("envelope could not be checked: ");
    expect(message.trim().endsWith(":")).toBe(false);
  });

  it("rejects an envelope_version this verifier does not understand, but still calls it attested", async () => {
    const envelope = await attestClaim(claim, signer, 1_755_000_000n);
    const futureVersion = { ...envelope, envelope_version: 2 as unknown as 1 };
    const result = verifyEnvelope(futureVersion);
    expect(result.attested).toBe(true);
    expect(result.ok).toBe(false);
    expect(result.failures.join(" ")).toMatch(/envelope_version/);
  });
});
