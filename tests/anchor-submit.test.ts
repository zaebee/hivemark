import { describe, expect, it } from "vitest";
import { periodId } from "../src/anchor/period.js";
import { SchemaEncoder } from "@ethereum-attestation-service/eas-sdk";
import { buildAnchorRequest } from "../src/anchor/submit.js";
import { ANCHOR_SCHEMA, ANCHOR_SCHEMA_UID } from "../src/anchor/schema.js";
import { EAS_CONTRACT } from "../src/attest/domain.js";
import type { AnchorPlan } from "../src/anchor/plan.js";

const plan: AnchorPlan = {
  period: periodId("2026-W33"),
  root: `0x${"ab".repeat(32)}`,
  count: 2,
  uids: [`0x${"11".repeat(32)}`, `0x${"22".repeat(32)}`],
  periodStart: 1_754_956_800,
  periodEnd: 1_755_561_600,
  // Reported to the human before broadcast, and deliberately not part of the
  // request: the anchor asserts a claim about a calendar week, so narrowing its
  // bounds to the newest thing inside it would change what is being claimed.
  newestCovered: 1_755_000_000,
};

describe("buildAnchorRequest", () => {
  it("targets the EAS contract on Base", () => {
    expect(buildAnchorRequest(plan).to).toBe(EAS_CONTRACT);
  });

  it("carries the anchor schema and a decodable payload", () => {
    const request = buildAnchorRequest(plan);
    expect(request.schema).toBe(ANCHOR_SCHEMA_UID);
    const decoded = new SchemaEncoder(ANCHOR_SCHEMA).decodeData(request.data);
    const byName = Object.fromEntries(decoded.map((d) => [d.name, d.value.value]));
    expect(String(byName.root)).toBe(plan.root);
    expect(Number(byName.count)).toBe(2);
  });

  it("sends no value — an anchor pays gas and nothing else", () => {
    expect(buildAnchorRequest(plan).value).toBe(0n);
  });

  it("never expires, because the claim it makes is about the past", () => {
    expect(buildAnchorRequest(plan).expirationTime).toBe(0n);
  });

  it("names no recipient, so nobody appears to have endorsed the contents", () => {
    expect(buildAnchorRequest(plan).recipient).toBe(
      "0x0000000000000000000000000000000000000000",
    );
  });
});
