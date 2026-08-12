import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { harvest } from "../src/harvest.js";
import { claimsOf } from "../src/claims.js";
import type { ReviewRecord } from "../src/schema.js";

const records = harvest(
  readFileSync("tests/fixtures/martian-reviews.sample.jsonl", "utf8"),
).records;

function withFindings(base: ReviewRecord, findings: ReviewRecord["findings"]): ReviewRecord {
  return { ...base, findings };
}

describe("claimsOf", () => {
  it("produces one claim per finding across the real fixture", () => {
    const claims = records.flatMap(claimsOf);
    const findings = records.reduce((n, r) => n + r.findings.length, 0);
    expect(claims.length).toBe(findings);
    expect(claims.length).toBeGreaterThan(0);
  });

  it("maps a missing verdict to unresolved, never to confirmed", () => {
    const base = records[0]!;
    const finding = { ...base.findings[0]!, verdict: undefined };
    expect(claimsOf(withFindings(base, [finding]))[0]!.verdict).toBe("unresolved");
  });

  it("maps an explicitly null verdict to unresolved too", () => {
    const base = records[0]!;
    const finding = { ...base.findings[0]!, verdict: null };
    expect(claimsOf(withFindings(base, [finding]))[0]!.verdict).toBe("unresolved");
  });

  it("preserves a real verdict unchanged", () => {
    const base = records[0]!;
    const finding = { ...base.findings[0]!, verdict: "refuted" as const };
    expect(claimsOf(withFindings(base, [finding]))[0]!.verdict).toBe("refuted");
  });

  it("carries the identity of the reviewer that produced it", () => {
    expect(claimsOf(records[0]!)[0]!.identity_id).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("never invents a line number", () => {
    const base = records[0]!;
    const finding = { ...base.findings[0]!, line: undefined };
    expect(claimsOf(withFindings(base, [finding]))[0]!.line).toBeNull();
  });
});
