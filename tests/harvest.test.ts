import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { harvest } from "../src/harvest.js";

describe("harvest", () => {
  it("returns every record from the real fixture with no warnings", () => {
    const result = harvest(readFileSync("tests/fixtures/martian-reviews.sample.jsonl", "utf8"));
    expect(result.records).toHaveLength(35);
    expect(result.warnings).toEqual([]);
  });

  it("skips a truncated final line with a warning instead of throwing", () => {
    const result = harvest(readFileSync("tests/fixtures/truncated.jsonl", "utf8"));
    expect(result.records).toHaveLength(3);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("line 4");
  });

  it("ignores blank lines", () => {
    const result = harvest("\n\n");
    expect(result.records).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("refuses an unparseable reviewed_at at the boundary", () => {
    const record = JSON.parse(
      readFileSync("tests/fixtures/martian-reviews.sample.jsonl", "utf8").split("\n")[0]!,
    ) as Record<string, unknown>;
    const result = harvest(JSON.stringify({ ...record, reviewed_at: "whenever" }));
    expect(result.records).toEqual([]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("reviewed_at");
  });

  it("skips a well-formed line that fails the schema, naming the line", () => {
    const result = harvest('{"url":"u","project":"p"}');
    expect(result.records).toEqual([]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("line 1");
    expect(result.warnings[0]).toContain("schema");
  });
});

describe("pr_slice disagreeing with had_graph", () => {
  const row = (over: Record<string, unknown>) =>
    JSON.stringify({
      url: "https://github.com/o/r/pull/1",
      project: "r",
      base_sha: "a",
      head_sha: "b",
      guardian_sha: "1111111111111111",
      reviewed_at: "2026-08-12T10:00:00+00:00",
      finder_model: "gemini-2.5-flash",
      skeptic_model: "gemini-3.5-flash",
      had_graph: true,
      pr_slice: "graph",
      parse_failed: false,
      findings: [],
      review_fingerprint: "aaaa11111111",
      finder_provider: "gemini",
      skeptic_provider: "gemini",
      ...over,
    });

  it("warns when a graph-labelled run reports no graph", () => {
    // context_mode follows had_graph, so such a run is counted as diff-only —
    // a different identity from the one its own label implies. Resolving that
    // silently is the thing worth refusing to do.
    const { warnings } = harvest(row({ had_graph: false }));
    expect(warnings.join(" ")).toMatch(/1 record.*pr_slice.*graph.*had_graph/i);
  });

  it("counts them once, not once per line", () => {
    // Nineteen such rows exist in the real corpus. Nineteen warnings would be
    // noise nobody reads; one with a count is a fact.
    const text = [row({ had_graph: false }), row({ had_graph: false, head_sha: "c" })].join("\n");
    const disagreements = harvest(text).warnings.filter((w) => /pr_slice/.test(w));
    expect(disagreements).toHaveLength(1);
    expect(disagreements[0]).toContain("2 records");
  });

  it("warns in the other direction too", () => {
    const { warnings } = harvest(row({ pr_slice: "diff-only", had_graph: true }));
    expect(warnings.join(" ")).toMatch(/pr_slice/i);
  });

  it("says nothing when the two agree", () => {
    const text = [row({}), row({ pr_slice: "diff-only", had_graph: false, head_sha: "c" })].join("\n");
    expect(harvest(text).warnings.filter((w) => /pr_slice/.test(w))).toHaveLength(0);
  });
});
