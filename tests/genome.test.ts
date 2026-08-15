import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { harvest } from "../src/harvest.js";
import { genomeOf } from "../src/genome.js";
import { identityId } from "../src/identity.js";
import type { ReviewRecord } from "../src/schema.js";

const records = harvest(
  readFileSync("tests/fixtures/martian-reviews.sample.jsonl", "utf8"),
).records;

describe("the provider guess is gone", () => {
  it("no longer exports providerOf", async () => {
    // #15 existed because providerOf refused codellama, mixtral, gemma3, phi4,
    // starcoder2, granite-code and command-r — stopping the pipeline on models
    // the producer could have named. The producer names them now, so the table
    // and its refusal are deleted rather than extended.
    const genome = await import("../src/genome.js");
    expect(genome).not.toHaveProperty("providerOf");
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
      "finder_provider",
      "review_fingerprint",
      "skeptic_model",
      "skeptic_provider",
    ]);
    // Sorted, so the value itself is stable regardless of declaration order —
    // and it is part of the hashed genome, so an unstable one would mint a new
    // identity for the same reviewer.
    expect([...genome.known_fields].sort()).toEqual([...genome.known_fields]);
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
      review_fingerprint: "1a2884400bd7",
      finder_provider: "gemini",
      skeptic_provider: "gemini",
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

  it("refuses padding on the review fingerprint", () => {
    // Now the field identity is keyed on, so it splits an identity exactly the
    // way guardian_sha used to. guardian_sha itself is no longer in the genome
    // and padding it can no longer mint anything.
    expect(() => genomeOf(padded({ review_fingerprint: " 1a2884400bd7" }))).toThrow(
      /review_fingerprint/,
    );
  });

  it("refuses padding on a stated provider", () => {
    expect(() => genomeOf(padded({ finder_provider: "gemini " }))).toThrow(/finder_provider/);
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

describe("identity keyed on the review fingerprint", () => {
  const rec = (over: Partial<ReviewRecord> = {}): ReviewRecord =>
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
      guardian_sha: "d0d807ef",
      reviewed_at: "2026-08-12T11:27:57+00:00",
      parse_failed: false,
      review_fingerprint: "1a2884400bd7",
      finder_provider: "gemini",

      skeptic_provider: "gemini",
      ...over,
    }) as ReviewRecord;

  it("gives two guardian revisions one identity when the fingerprint agrees", () => {
    // The whole point. Under guardian_sha these were two reviewers with two
    // fragmentary records; the review path did not move between them.
    expect(identityId(genomeOf(rec({ guardian_sha: "4d1fe6a8" })))).toBe(
      identityId(genomeOf(rec({ guardian_sha: "112e4373" }))),
    );
  });

  it("separates two reviewers when the fingerprint differs", () => {
    expect(identityId(genomeOf(rec({ review_fingerprint: "1a2884400bd7" })))).not.toBe(
      identityId(genomeOf(rec({ review_fingerprint: "eebfdf98419c" }))),
    );
  });

  it("carries no guardian_version, because one identity spans several commits", () => {
    expect(genomeOf(rec())).not.toHaveProperty("guardian_version");
  });

  it("reads both providers from the record rather than deriving one", () => {
    // Model names providerOf would refuse outright.
    const g = genomeOf(
      rec({
        finder_model: "codellama:13b",
        finder_provider: "ollama",

        skeptic_model: "claude-sonnet-5",
        skeptic_provider: "anthropic",
      }),
    );
    expect(g.finder_provider).toBe("ollama");
    expect(g.skeptic_provider).toBe("anthropic");
  });

  it("treats an absent skeptic provider as none, matching the contract", () => {
    const { skeptic_provider: _drop, ...without } = rec({ skeptic_model: null });
    expect(genomeOf(without as ReviewRecord).skeptic_provider).toBeNull();
  });

  it("declares genome schema version 2", () => {
    expect(genomeOf(rec()).schema_version).toBe(2);
  });

  it("still refuses whitespace in a field identity is keyed on", () => {
    // The guard from #31 must survive the rewrite: "1a2884400bd7 " and
    // "1a2884400bd7" would be two entities, invisibly.
    expect(() => genomeOf(rec({ review_fingerprint: "1a2884400bd7 " }))).toThrow(/whitespace/);
    expect(() => genomeOf(rec({ finder_provider: " gemini" }))).toThrow(/whitespace/);
  });
});
