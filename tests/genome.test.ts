import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { harvest } from "../src/harvest.js";
import { genomeOf, providerOf } from "../src/genome.js";

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

  it("produces more than one distinct genome across the real fixture", () => {
    const distinct = new Set(records.map((r) => JSON.stringify(genomeOf(r))));
    expect(distinct.size).toBeGreaterThan(1);
  });
});
