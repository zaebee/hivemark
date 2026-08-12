import { describe, expect, it } from "vitest";
import { SchemaEncoder } from "@ethereum-attestation-service/eas-sdk";
import { CLAIM_SCHEMA, CLAIM_SCHEMA_UID, encodeClaim, VERDICT_CODES } from "../src/attest/schema.js";
import type { Claim } from "../src/types.js";

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

describe("CLAIM_SCHEMA", () => {
  it("has a 32-byte UID", () => {
    expect(CLAIM_SCHEMA_UID).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("declares no field hivemark cannot observe", () => {
    // appliedByHuman was removed: the human axis has no data, so signing it
    // would assert an observation never made.
    expect(CLAIM_SCHEMA).not.toContain("applied");
  });
});

describe("encodeClaim", () => {
  it("round-trips through the EAS schema encoder", () => {
    const decoded = new SchemaEncoder(CLAIM_SCHEMA).decodeData(encodeClaim(claim));
    const byName = Object.fromEntries(decoded.map((d) => [d.name, d.value.value]));
    expect(String(byName.identityId)).toBe(claim.identity_id);
    expect(String(byName.claimHash)).toBe(claim.claim_hash);
    expect(String(byName.file)).toBe(claim.file);
    expect(Number(byName.line)).toBe(15);
    expect(Number(byName.confidence)).toBe(90);
  });

  it("encodes a file-level finding as line 0, which the schema can represent", () => {
    const decoded = new SchemaEncoder(CLAIM_SCHEMA).decodeData(
      encodeClaim({ ...claim, line: null }),
    );
    const line = decoded.find((d) => d.name === "line")!;
    expect(Number(line.value.value)).toBe(0);
  });

  it("encodes an unjudged claim as its own verdict code, never as confirmed", () => {
    expect(VERDICT_CODES.unresolved).not.toBe(VERDICT_CODES.confirmed);
    expect(new Set(Object.values(VERDICT_CODES)).size).toBe(4);
  });

  it("encodes a missing impact score as 0 while impact 0 stays 0", () => {
    // Both render as 0 on the wire. The distinction lives in verdict:
    // an unresolved claim is the one whose score was never assigned.
    const none = new SchemaEncoder(CLAIM_SCHEMA).decodeData(
      encodeClaim({ ...claim, impact_score: null }),
    );
    expect(Number(none.find((d) => d.name === "impactScore")!.value.value)).toBe(0);
  });
});
