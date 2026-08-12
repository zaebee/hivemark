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

describe("claim_hash", () => {
  it("commits to the finding's prose, not only its coordinates", () => {
    const base = records[0]!;
    const finding = base.findings[0]!;
    const other = { ...finding, problem: `${finding.problem} — and another thing` };
    const a = claimsOf(withFindings(base, [finding]))[0]!.claim_hash;
    const b = claimsOf(withFindings(base, [other]))[0]!.claim_hash;
    expect(a).not.toBe(b);
  });

  it("distinguishes two findings that share file, line and category", () => {
    const base = records[0]!;
    const f = base.findings[0]!;
    const one = { ...f, title: "first", evidence: "a", problem: "p1", fix: "x" };
    const two = { ...f, title: "second", evidence: "a", problem: "p2", fix: "x" };
    const claims = claimsOf(withFindings(base, [one, two]));
    expect(claims[0]!.claim_hash).not.toBe(claims[1]!.claim_hash);
  });

  it("is stable for the same finding in the same review", () => {
    const base = records[0]!;
    expect(claimsOf(base)[0]!.claim_hash).toBe(claimsOf(base)[0]!.claim_hash);
  });

  it("changes when the same finding is attributed to a different review", () => {
    const base = records[0]!;
    const elsewhere = { ...base, head_sha: "0000000000000000000000000000000000000000" };
    expect(claimsOf(base)[0]!.claim_hash).not.toBe(claimsOf(elsewhere)[0]!.claim_hash);
  });

  it("is a 32-byte hex string", () => {
    expect(claimsOf(records[0]!)[0]!.claim_hash).toMatch(/^0x[0-9a-f]{64}$/);
  });
});
