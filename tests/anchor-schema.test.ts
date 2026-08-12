import { describe, expect, it } from "vitest";
import { SchemaEncoder } from "@ethereum-attestation-service/eas-sdk";
import { ANCHOR_SCHEMA, ANCHOR_SCHEMA_UID, encodeAnchor } from "../src/anchor/schema.js";
import { CLAIM_SCHEMA_UID } from "../src/attest/schema.js";
import { LEAF_DOMAIN } from "../src/anchor/tree.js";

const payload = {
  root: `0x${"ab".repeat(32)}`,
  periodStart: 1_754_956_800,
  periodEnd: 1_755_561_600,
  count: 112,
} as const;

describe("ANCHOR_SCHEMA", () => {
  it("has a 32-byte UID distinct from the claim schema's", () => {
    expect(ANCHOR_SCHEMA_UID).toMatch(/^0x[0-9a-f]{64}$/);
    expect(ANCHOR_SCHEMA_UID).not.toBe(CLAIM_SCHEMA_UID);
  });

  it("records the leaf domain, so a reader can reproduce the root", () => {
    expect(ANCHOR_SCHEMA).toContain("leafDomain");
  });
});

describe("encodeAnchor", () => {
  it("round-trips through the EAS schema encoder", () => {
    const decoded = new SchemaEncoder(ANCHOR_SCHEMA).decodeData(encodeAnchor(payload));
    const byName = Object.fromEntries(decoded.map((d) => [d.name, d.value.value]));
    expect(String(byName.root)).toBe(payload.root);
    expect(Number(byName.count)).toBe(112);
    expect(String(byName.leafDomain)).toBe(LEAF_DOMAIN);
  });

  it("keeps the period bounds exactly, since they are the claim being made", () => {
    const decoded = new SchemaEncoder(ANCHOR_SCHEMA).decodeData(encodeAnchor(payload));
    const byName = Object.fromEntries(decoded.map((d) => [d.name, d.value.value]));
    expect(Number(byName.periodStart)).toBe(payload.periodStart);
    expect(Number(byName.periodEnd)).toBe(payload.periodEnd);
  });
});
