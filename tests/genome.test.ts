import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { harvest } from "../src/harvest.js";
import { genomeOf, providerOf } from "../src/genome.js";
import type { ReviewRecord } from "../src/schema.js";

const records = harvest(
  readFileSync("tests/fixtures/martian-reviews.sample.jsonl", "utf8"),
).records;

describe("providerOf", () => {
  it("maps known model prefixes", () => {
    expect(providerOf("gemini-2.5-flash")).toBe("gemini");
    expect(providerOf("mistral-medium-latest")).toBe("mistral");
    expect(providerOf("qwen2.5-coder:7b")).toBe("ollama");
  });

  it("refuses an unrecognised model rather than bucketing it", () => {
    expect(() => providerOf("gpt-4o")).toThrow(/unrecognised model/i);
  });
});

describe("genomeOf", () => {
  it("reads context_mode from had_graph", () => {
    const graph = records.find((r) => r.had_graph);
    const diff = records.find((r) => !r.had_graph);
    expect(graph, "fixture must contain a graph review").toBeDefined();
    expect(diff, "fixture must contain a diff-only review").toBeDefined();
    expect(genomeOf(graph!).context_mode).toBe("graph");
    expect(genomeOf(diff!).context_mode).toBe("diff-only");
  });

  it("lists exactly the fields it populated", () => {
    const genome = genomeOf(records[0]!);
    expect(genome.known_fields).toEqual([
      "context_mode",
      "finder_model",
      "guardian_version",
      "provider",
      "skeptic_model",
    ]);
  });

  it("treats an empty skeptic model as no skeptic, not as a second configuration", () => {
    // Both mean the pass did not run, and both publish as an empty field in a
    // birth record — so they must be one identity, or the record would read as
    // contradicting itself.
    const base = records[0]!;
    const nulled = genomeOf({ ...base, skeptic_model: null });
    const empty = genomeOf({ ...base, skeptic_model: "" });
    expect(empty.skeptic_model).toBeNull();
    expect(empty).toEqual(nulled);
  });

  it("produces more than one distinct genome across the real fixture", () => {
    const distinct = new Set(records.map((r) => JSON.stringify(genomeOf(r))));
    expect(distinct.size).toBeGreaterThan(1);
  });
});

describe("whitespace cannot mint an identity", () => {
  // identity_id is a hash of the genome, so "gemini-2.5-flash " and
  // "gemini-2.5-flash" are two entities — two addresses, two track records, two
  // birth attestations, for one reviewer. Upstream reads the model from an
  // environment variable without .strip(), so this is a configuration error that
  // reaches here looking identical to a correct value in every log and diff.
  const padded = (over: Partial<ReviewRecord>): ReviewRecord =>
    ({
      url: "https://github.com/acme/widgets/pull/1",
      project: "acme",
      pr_slice: "graph",
      base_sha: "aaa",
      head_sha: "bbb",
      had_graph: true,
      finder_model: "gemini-2.5-flash",
      skeptic_model: "gemini-3.5-flash",
      findings: [],
      guardian_sha: "d0d807ef01c556b882dc85b9fc0d2851d92aa1e5",
      reviewed_at: "2026-08-12T11:27:57+00:00",
      ...over,
    }) as ReviewRecord;

  it("refuses a trailing space on the finder", () => {
    expect(() => genomeOf(padded({ finder_model: "gemini-2.5-flash " }))).toThrow(/finder_model/);
  });

  it("refuses a leading space on the finder", () => {
    expect(() => genomeOf(padded({ finder_model: " gemini-2.5-flash" }))).toThrow(/whitespace/);
  });

  it("refuses padding on the skeptic", () => {
    expect(() => genomeOf(padded({ skeptic_model: "gemini-3.5-flash " }))).toThrow(/skeptic_model/);
  });

  it("refuses padding on the guardian sha", () => {
    // Also a genome field, so it splits an identity exactly the same way.
    expect(() => genomeOf(padded({ guardian_sha: " d0d807ef" }))).toThrow(/guardian_sha/);
  });

  it("names the value both ways, because the difference is invisible otherwise", () => {
    expect(() => genomeOf(padded({ finder_model: "gemini-2.5-flash " }))).toThrow(
      /"gemini-2\.5-flash "[\s\S]*"gemini-2\.5-flash"/,
    );
  });

  it("refuses a blank-but-present skeptic rather than reading it as absent", () => {
    // `" "` is truthy, so it reaches the check instead of collapsing to null.
    // It means "no skeptic ran" written with a stray space, and the space is
    // the configuration error this exists to surface.
    expect(() => genomeOf(padded({ skeptic_model: " " }))).toThrow(/skeptic_model/);
  });

  it("still accepts a clean record, and an absent skeptic", () => {
    // Without this the tests above pass against a genomeOf that throws always.
    expect(genomeOf(padded({})).finder_model).toBe("gemini-2.5-flash");
    expect(genomeOf(padded({ skeptic_model: "" })).skeptic_model).toBeNull();
    expect(genomeOf(padded({ skeptic_model: null })).skeptic_model).toBeNull();
  });
});
