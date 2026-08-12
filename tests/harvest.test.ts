import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { harvest } from "../src/harvest.js";

describe("harvest", () => {
  it("returns every record from the real fixture with no warnings", () => {
    const result = harvest(readFileSync("tests/fixtures/martian-reviews.sample.jsonl", "utf8"));
    expect(result.records.length).toBe(35);
    expect(result.warnings).toEqual([]);
  });

  it("skips a truncated final line with a warning instead of throwing", () => {
    const result = harvest(readFileSync("tests/fixtures/truncated.jsonl", "utf8"));
    expect(result.records.length).toBe(3);
    expect(result.warnings.length).toBe(1);
    expect(result.warnings[0]).toContain("line 4");
  });

  it("ignores blank lines", () => {
    const result = harvest("\n\n");
    expect(result.records).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("skips a well-formed line that fails the schema, naming the line", () => {
    const result = harvest('{"url":"u","project":"p"}');
    expect(result.records).toEqual([]);
    expect(result.warnings.length).toBe(1);
    expect(result.warnings[0]).toContain("line 1");
    expect(result.warnings[0]).toContain("schema");
  });
});
