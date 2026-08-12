import { describe, expect, it } from "vitest";
import { attestClaim, fromStoredAttestation, toStoredAttestation } from "../src/attest/attest.js";
import { loadSigner } from "../src/attest/signer.js";
import { CLAIM_SCHEMA_UID } from "../src/attest/schema.js";
import type { Claim } from "../src/types.js";

const KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const signer = loadSigner({ HIVEMARK_SIGNING_KEY: KEY })!;

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

describe("attestClaim", () => {
  it("records the domain it signed under, not a pointer to today's constants", async () => {
    const envelope = await attestClaim(claim, signer, 1_755_000_000n);
    expect(envelope.domain.chainId).toBe("8453");
    expect(envelope.domain.address).toBe("0x4200000000000000000000000000000000000021");
    expect(envelope.domain.version).toBe("1.0.1");
  });

  it("names its signer and the schema it used", async () => {
    const envelope = await attestClaim(claim, signer, 1_755_000_000n);
    expect(envelope.signer.toLowerCase()).toBe(signer.address.toLowerCase());
    expect(envelope.attestation.message.schema).toBe(CLAIM_SCHEMA_UID);
  });

  it("keeps the claim hash reachable without decoding the payload", async () => {
    const envelope = await attestClaim(claim, signer, 1_755_000_000n);
    expect(envelope.claim_hash).toBe(claim.claim_hash);
    expect(envelope.identity_id).toBe(claim.identity_id);
  });

  it("is reproducible for the same claim at the same time", async () => {
    const a = await attestClaim(claim, signer, 1_755_000_000n);
    const b = await attestClaim(claim, signer, 1_755_000_000n);
    expect(a.attestation.uid).toBe(b.attestation.uid);
  });

  it("serialises to JSON without losing bigints", async () => {
    const envelope = await attestClaim(claim, signer, 1_755_000_000n);
    expect(() => JSON.stringify(envelope)).not.toThrow();
    expect(JSON.parse(JSON.stringify(envelope)).domain.chainId).toBe("8453");
  });

  it("stores the attestation's bigint fields losslessly, so a verifier can reconstruct them exactly", async () => {
    const envelope = await attestClaim(claim, signer, 1_755_000_000n);
    expect(BigInt(envelope.attestation.domain.chainId)).toBe(8453n);
    expect(BigInt(envelope.attestation.message.time)).toBe(1_755_000_000n);
    expect(BigInt(envelope.attestation.message.expirationTime)).toBe(0n);
  });

  it("stamps the review's time, not the clock, so a rerun mints the same uid", async () => {
    // Two signings with no explicit time. A wall-clock default would give these
    // different uids, which is exactly what broke the anchor's weekly bucketing
    // before this was found.
    const first = await attestClaim(claim, signer);
    const second = await attestClaim(claim, signer);
    expect(first.attestation.uid).toBe(second.attestation.uid);
    expect(first.attestation.message.time).toBe(
      String(Math.floor(Date.parse(claim.reviewed_at) / 1000)),
    );
  });

  it("refuses a claim whose reviewed_at cannot be parsed", async () => {
    await expect(attestClaim({ ...claim, reviewed_at: "whenever" }, signer)).rejects.toThrow(
      /unparseable reviewed_at/i,
    );
  });

  it("restores every field the stored form narrowed, and nothing else", async () => {
    // The invariant the stored/restored pair exists for: a bigint field
    // stringified on the way out has to come back a bigint, or the verifier
    // hands the SDK a wrong-typed message and good attestations fail to verify.
    // Asserting the whole object rather than three named fields is what makes
    // this catch a field added to the SDK's shape and handled in one direction.
    const envelope = await attestClaim(claim, signer, 1_755_000_000n);
    const restored = fromStoredAttestation(envelope.attestation);

    expect(restored.domain.chainId).toBe(8453n);
    expect(restored.message.time).toBe(1_755_000_000n);
    expect(restored.message.expirationTime).toBe(0n);
    expect(typeof restored.uid).toBe("string");

    // Round trip: narrowing what was just restored must reproduce the stored
    // form exactly, so neither direction can quietly drop or add a field.
    expect(JSON.parse(JSON.stringify(toStoredAttestation(restored)))).toEqual(
      JSON.parse(JSON.stringify(envelope.attestation)),
    );
  });
});
