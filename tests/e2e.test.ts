import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { run } from "../src/cli.js";

const TEXT = readFileSync("tests/fixtures/martian-reviews.sample.jsonl", "utf8");

describe("end-to-end on real Guardian data", () => {
  it("produces artifacts for every identity found", () => {
    const output = run(TEXT);
    expect(output.tracks.length).toBeGreaterThan(1);
    expect(output.files.size).toBe(1 + output.tracks.length * 2);
    expect(output.files.has("index.html")).toBe(true);
  });

  it("accounts for every review in the fixture", () => {
    const output = run(TEXT);
    const reviews = output.tracks.reduce((n, t) => n + t.reviews, 0);
    expect(reviews).toBe(35);
  });

  it("reports harvest warnings rather than hiding them", () => {
    const output = run(`${TEXT}\n{"url":"broken`);
    expect(output.warnings.length).toBe(1);
  });

  it("every badge file is valid shields JSON", () => {
    for (const [name, body] of run(TEXT).files) {
      if (!name.startsWith("badge-")) continue;
      expect(JSON.parse(body).schemaVersion).toBe(1);
    }
  });

  it("every avatar file is an svg", () => {
    for (const [name, body] of run(TEXT).files) {
      if (!name.startsWith("avatar-")) continue;
      expect(body.startsWith("<svg")).toBe(true);
    }
  });
});
