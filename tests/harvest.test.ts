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

describe("runs counted as diff-only for a reason worth knowing", () => {
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

  it("names an ablation as a deliberate removal, not a failure", () => {
    // Upstream added `arm` so that "a failure and a controlled removal must not
    // look alike in the record". Reading had_graph without it produced exactly
    // the misreading that field exists to prevent.
    const { warnings } = harvest(row({ had_graph: false, arm: "ablated" }));
    expect(warnings.join(" ")).toMatch(/1 record are ablations|1 record .*deliberately withheld/i);
    expect(warnings.join(" ")).not.toMatch(/found no graph/i);
  });

  it("names a graph-planned run that found no graph as a failure", () => {
    const { warnings } = harvest(row({ had_graph: false }));
    expect(warnings.join(" ")).toMatch(/pr_slice=graph but had_graph=false.*found no graph/i);
    expect(warnings.join(" ")).not.toMatch(/ablation/i);
  });

  it("keeps the two apart when both occur", () => {
    const text = [
      row({ had_graph: false, arm: "ablated" }),
      row({ had_graph: false, head_sha: "c" }),
    ].join("\n");
    const w = harvest(text).warnings;
    expect(w.filter((x) => /ablation/i.test(x))).toHaveLength(1);
    expect(w.filter((x) => /found no graph/i.test(x))).toHaveLength(1);
  });

  it("counts them once, not once per line", () => {
    const text = [
      row({ had_graph: false, arm: "ablated" }),
      row({ had_graph: false, arm: "ablated", head_sha: "c" }),
    ].join("\n");
    const w = harvest(text).warnings.filter((x) => /ablation/i.test(x));
    expect(w).toHaveLength(1);
    expect(w[0]).toContain("2 records");
  });

  it("reports the pr_slice it actually read, not an assumed one", () => {
    // The upstream schema is a bare string with a third value, "unknown".
    // Hardcoding "diff-only" in the message would state something false.
    const { warnings } = harvest(row({ pr_slice: "unknown", had_graph: true }));
    expect(warnings.join(" ")).toMatch(/1 record have pr_slice=unknown but had_graph=true/i);
    expect(warnings.join(" ")).not.toContain("pr_slice=diff-only");
  });

  it("says nothing when plan and reality agree", () => {
    const text = [row({}), row({ pr_slice: "diff-only", had_graph: false, head_sha: "c" })].join("\n");
    expect(harvest(text).warnings.filter((w) => /pr_slice|ablation/.test(w))).toHaveLength(0);
  });
});

describe("an arm value from the future", () => {
  const row = (arm: string) =>
    JSON.stringify({
      url: "https://github.com/o/r/pull/1", project: "r", base_sha: "a", head_sha: "b",
      guardian_sha: "1111111111111111", reviewed_at: "2026-08-12T10:00:00+00:00",
      finder_model: "gemini-2.5-flash", skeptic_model: "gemini-3.5-flash", had_graph: true,
      pr_slice: "graph", parse_failed: false, findings: [], review_fingerprint: "aaaa11111111",
      finder_provider: "gemini", skeptic_provider: "gemini", arm,
    });

  it("does not cost us the record it appears on", () => {
    // The contract declares an enum. Typed as one here, a third value rejects
    // the whole row — measured, `records kept: 0`. Losing a review because a
    // metadata field grew a value is the wrong failure for a cumulative record.
    expect(harvest(row("control")).records).toHaveLength(1);
  });

  it("is named rather than passed over", () => {
    expect(harvest(row("control")).warnings.join(" ")).toMatch(
      /1 record have arm=control, which this version does not know/i,
    );
  });

  it("says nothing about the arms it does know", () => {
    const w = [...harvest(row("graph")).warnings, ...harvest(row("ablated")).warnings];
    expect(w.filter((x) => /does not know/.test(x))).toHaveLength(0);
  });
});
