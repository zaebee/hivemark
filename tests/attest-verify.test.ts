import { describe, expect, it } from "vitest";
import { attestClaim } from "../src/attest/attest.js";
import { loadSigner } from "../src/attest/signer.js";
import { verifyEnvelope } from "../src/attest/verify.js";
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
});
