import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { harvest } from "../src/harvest.js";
import { deriveTrackRecords, judgeOf } from "../src/derive.js";
import { providerOf } from "../src/genome.js";
import type { Genome, TrackRecord } from "../src/types.js";

const records = harvest(
  readFileSync("tests/fixtures/martian-reviews.sample.jsonl", "utf8"),
).records;

describe("deriveTrackRecords", () => {
  it("finds more than one identity in the real fixture", () => {
    expect(deriveTrackRecords(records).length).toBeGreaterThan(1);
  });

  it("separates graph from diff-only reviewers", () => {
    const modes = deriveTrackRecords(records).map((t) => t.genome.context_mode);
    expect(modes).toContain("graph");
    expect(modes).toContain("diff-only");
  });

  it("accounts for every claim exactly once", () => {
    const track = deriveTrackRecords(records);
    const byVerdict = track.reduce(
      (n, t) =>
        n + t.skeptic.confirmed + t.skeptic.refuted + t.skeptic.uncertain + t.skeptic.unresolved,
      0,
    );
    expect(byVerdict).toBe(track.reduce((n, t) => n + t.claims, 0));
  });

  it("reports the human axis as unavailable, never inferred", () => {
    for (const t of deriveTrackRecords(records)) expect(t.human.available).toBe(false);
  });

  it("counts a re-reviewed (url, head_sha, identity) only once", () => {
    const first = records[0]!;
    const rerun = { ...first, reviewed_at: "2099-01-01T00:00:00Z" };
    const once = deriveTrackRecords([first]);
    const twice = deriveTrackRecords([first, rerun]);
    const find = (ts: TrackRecord[]) => ts.find((t) => t.identity_id === once[0]!.identity_id)!;
    expect(find(twice).reviews).toBe(find(once).reviews);
    expect(find(twice).claims).toBe(find(once).claims);
  });

  it("resolves a dead-heat rerun the same way whichever order it is read in", () => {
    // Timestamps in this corpus have second resolution, so a corrected rerun
    // written inside the same second as the original is a tie. Under a strict
    // `>` the tie fell to whichever record the file listed first, which made a
    // track record depend on line order — and the design calls it derived from
    // the facts, never stored and never tunable. Order is not a fact about a
    // reviewer.
    const a = { ...records[0]!, reviewed_at: "2026-08-12T12:00:00Z", findings: [] };
    const b = { ...records[0]!, reviewed_at: "2026-08-12T12:00:00Z" };

    const forwards = deriveTrackRecords([a, b]);
    const backwards = deriveTrackRecords([b, a]);
    expect(forwards).toEqual(backwards);
  });

  it("keeps two reviews apart when a delimiter appears inside a field", () => {
    // The dedupe key joined url, head_sha and identity with "|", and neither
    // field's alphabet is constrained by the schema. Two genuinely different
    // reviews could therefore collide on one key, and the loser vanished with no
    // warning — a complete, schema-valid review silently absent from every
    // downstream count.
    const left = { ...records[0]!, url: "https://x/pull/1|abc", head_sha: "def" };
    const right = { ...records[0]!, url: "https://x/pull/1", head_sha: "abc|def", findings: [] };
    expect(deriveTrackRecords([left, right])[0]!.reviews).toBe(2);
  });

  it("orders reruns by instant, not by string form", () => {
    // 14:00+03:00 is 11:00Z — an hour EARLIER than 12:00Z, though it sorts
    // later as a string. Lexicographic comparison fails this; parsing passes it.
    const first = { ...records[0]!, reviewed_at: "2026-08-12T12:00:00+00:00", findings: [] };
    const earlierButSortsLater = { ...records[0]!, reviewed_at: "2026-08-12T14:00:00+03:00" };
    const track = deriveTrackRecords([first, earlierButSortsLater]);
    expect(track).toHaveLength(1);
    expect(track[0]!.claims).toBe(0); // the 12:00Z record won, as it should
  });

  it("keeps the later review when a rerun supersedes", () => {
    const first = records[0]!;
    const rerun = { ...first, reviewed_at: "2099-01-01T00:00:00Z", findings: [] };
    const track = deriveTrackRecords([first, rerun]);
    expect(track).toHaveLength(1);
    expect(track[0]!.claims).toBe(0);
  });

  it("records which projects each identity reviewed", () => {
    const track = deriveTrackRecords(records);
    for (const t of track) {
      expect(t.corpus.length).toBeGreaterThan(0);
      expect(t.corpus.reduce((n, [, count]) => n + count, 0)).toBe(t.reviews);
    }
  });

  it("shows the graph and diff-only reviewers saw near-disjoint corpora", () => {
    // The finding that forced `corpus` to exist: these two identities cannot be
    // compared directly, because they did not review the same projects.
    const track = deriveTrackRecords(records);
    const graph = track.find((t) => t.genome.context_mode === "graph" && t.reviews > 1)!;
    const diff = track.find((t) => t.genome.context_mode === "diff-only")!;
    const names = (t: TrackRecord) => new Set(t.corpus.map(([p]) => p));
    const shared = [...names(graph)].filter((p) => names(diff).has(p));
    expect(shared.length).toBeLessThan(Math.min(names(graph).size, names(diff).size));
  });

  it("gives every identity an owner address derived from its own hash", () => {
    const track = deriveTrackRecords(records);
    const addresses = new Set(track.map((t) => t.owner_address));
    expect(addresses.size).toBe(track.length);
  });

  it("matches a stable snapshot of the real corpus", () => {
    const summary = deriveTrackRecords(records)
      .map((t) => ({
        context_mode: t.genome.context_mode,
        guardian_version: t.genome.guardian_version,
        finder_model: t.genome.finder_model,
        skeptic_model: t.genome.skeptic_model,
        reviews: t.reviews,
        claims: t.claims,
        corpus: t.corpus,
        skeptic: t.skeptic,
      }))
      .sort((a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1));
    expect(summary).toMatchSnapshot();
  });
});

describe("judgeOf", () => {
  const genome = (finder: string, skeptic: string | null): Genome => ({
    schema_version: 1,
    known_fields: ["context_mode", "finder_model", "guardian_version", "provider", "skeptic_model"],
    provider: providerOf(finder),
    finder_model: finder,
    skeptic_model: skeptic,
    context_mode: "graph",
    guardian_version: "d0d807ef",
  });

  it("calls it self-graded when the skeptic is the finder", () => {
    expect(judgeOf(genome("mistral-medium-latest", "mistral-medium-latest"))).toBe("self");
  });

  it("calls it independent when a different model judges", () => {
    expect(judgeOf(genome("gemini-2.5-flash", "gemini-3.5-flash"))).toBe("independent");
  });

  it("distinguishes no skeptic from a self-grading one", () => {
    // Collapsing these would report an unjudged corpus as a self-judged one.
    expect(judgeOf(genome("gemini-2.5-flash", null))).toBe("nobody");
  });

  it("ignores casing, because the two mistakes are not symmetric", () => {
    // Calling these different models publishes a self-graded rate as an
    // independently confirmed one. The opposite error needs two real models
    // whose names differ only in case, which does not happen.
    expect(judgeOf(genome("mistral-medium-latest", "Mistral-Medium-Latest"))).toBe("self");
    expect(judgeOf(genome("mistral-medium-latest", "MISTRAL-MEDIUM-LATEST"))).toBe("self");
  });

  it("does not merely compare providers", () => {
    // Both are mistral, but a different model did the judging. Keying on
    // provider instead of model would call this self-graded and be wrong.
    expect(judgeOf(genome("mistral-medium-latest", "mistral-nemo"))).toBe("independent");
  });
});

describe("the judge reaches the track record", () => {
  // The badge and page tests build fixtures with `judge` already set, so they
  // never exercise the derivation. Without this, judgeOf could return
  // "independent" for everything and the whole suite would stay green while
  // every self-graded badge quietly turned back into a confirmed one.
  it("marks an identity whose skeptic is its own finder", () => {
    const selfGraded = records.map((r) => ({ ...r, skeptic_model: r.finder_model }));
    const tracks = deriveTrackRecords(selfGraded);
    expect(tracks.length).toBeGreaterThan(0);
    for (const t of tracks) expect(t.skeptic.judge).toBe("self");
  });

  it("leaves the real corpus independent, which is what it is", () => {
    for (const t of deriveTrackRecords(records)) expect(t.skeptic.judge).toBe("independent");
  });
});
