import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { harvest } from "../src/harvest.js";
import { deriveTrackRecords } from "../src/derive.js";
import type { TrackRecord } from "../src/types.js";

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
