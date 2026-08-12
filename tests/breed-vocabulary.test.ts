import { describe, expect, it } from "vitest";
import { vocabularyOf } from "../src/breed/vocabulary.js";
import type { ReviewRecord } from "../src/schema.js";

const review = (over: Partial<ReviewRecord>): ReviewRecord =>
  ({
    url: "https://github.com/o/r/pull/1",
    project: "r",
    base_sha: "a",
    head_sha: "b",
    guardian_sha: "aaaaaaaaaaaa",
    reviewed_at: "2026-08-01T00:00:00+00:00",
    finder_model: "gemini-2.5-flash",
    skeptic_model: "gemini-3.5-flash",
    had_graph: true,
    pr_slice: "graph",
    parse_failed: false,
    findings: [],
    ...over,
  }) as ReviewRecord;

describe("vocabularyOf", () => {
  it("collects the distinct value of every heritable slot", () => {
    const vocab = vocabularyOf([
      review({}),
      review({ finder_model: "mistral-medium-latest", skeptic_model: "mistral-medium-latest" }),
      review({ had_graph: false }),
    ]);
    expect(vocab.finderModels).toEqual(["gemini-2.5-flash", "mistral-medium-latest"]);
    expect(vocab.skepticModels).toEqual(["gemini-3.5-flash", "mistral-medium-latest"]);
    expect([...vocab.contextModes].sort()).toEqual(["diff-only", "graph"]);
  });

  it("takes the newest revision from reviewed_at, not from sorting the sha", () => {
    // A sha has no chronological order. Sorting them would pick "ffff" here,
    // which is the older run — the exact failure this rule prevents, and one
    // that is silent because both answers look like plausible shas.
    const vocab = vocabularyOf([
      review({ guardian_sha: "ffffffffffff", reviewed_at: "2026-08-01T00:00:00+00:00" }),
      review({ guardian_sha: "000000000000", reviewed_at: "2026-08-09T00:00:00+00:00" }),
    ]);
    expect(vocab.newestGuardian).toBe("000000000000");
  });

  it("lists each existing identity once, however many reviews it produced", () => {
    const vocab = vocabularyOf([review({}), review({ url: "x" }), review({ had_graph: false })]);
    expect(vocab.existing).toHaveLength(2);
  });

  it("orders values deterministically, whatever order the reviews arrive in", () => {
    const records = [review({ finder_model: "mistral-medium-latest" }), review({})];
    expect(vocabularyOf(records).finderModels).toEqual(
      vocabularyOf([...records].reverse()).finderModels,
    );
  });

  it("refuses an empty corpus rather than returning an empty vocabulary", () => {
    // An empty vocabulary would enumerate nothing and report "no proposals",
    // which reads as "everything has been run" — the opposite of the truth.
    expect(() => vocabularyOf([])).toThrow(/no reviews/i);
  });
});
