import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { harvest } from "../src/harvest.js";
import { dedupe, deriveTrackRecords, judgeOf } from "../src/derive.js";
import type { Genome, TrackRecord } from "../src/types.js";

/** The vendor a model name belongs to, for building fixtures only. */
const familyOf = (model: string): string =>
  model.startsWith("gemini") ? "gemini" : model.startsWith("mistral") ? "mistral" : "ollama";


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
    //
    // Asserted against `dedupe` rather than through `deriveTrackRecords`: usable
    // runs are now averaged rather than deduplicated, but `dedupe` still decides
    // which failed run counts and which record a birth is planned from, so the
    // ordering still has to be right.
    const first = { ...records[0]!, reviewed_at: "2026-08-12T12:00:00+00:00", findings: [] };
    const earlierButSortsLater = { ...records[0]!, reviewed_at: "2026-08-12T14:00:00+03:00" };
    const kept = dedupe([first, earlierButSortsLater]);
    expect(kept).toHaveLength(1);
    expect(kept[0]!.findings).toHaveLength(0); // the 12:00Z record won, as it should
  });

  it("keeps the later review when a rerun supersedes", () => {
    // Still true of `dedupe`, which the failed-run classes and `planBirths`
    // both rely on. It is no longer true of the published rates: a repeat of a
    // usable run is another sample and is averaged, not discarded.
    const first = records[0]!;
    const rerun = { ...first, reviewed_at: "2099-01-01T00:00:00Z", findings: [] };
    const kept = dedupe([first, rerun]);
    expect(kept).toHaveLength(1);
    expect(kept[0]!.findings).toHaveLength(0);
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
        review_fingerprint: t.genome.review_fingerprint,
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
    known_fields: ["context_mode", "finder_model", "finder_provider", "review_fingerprint", "skeptic_model", "skeptic_provider"],
    finder_provider: familyOf(finder),
    skeptic_provider: skeptic === null ? null : familyOf(skeptic),
    finder_model: finder,
    skeptic_model: skeptic,
    context_mode: "graph",
    review_fingerprint: "d0d807ef",
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
    // finder_provider instead of model would call this self-graded and be wrong.
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

describe("a review whose output could not be parsed", () => {
  const parsed = records.find((r) => r.findings.length > 0)!;

  it("is not counted among the reviews", () => {
    // Counting it would credit the reviewer with having reviewed, when what
    // happened is that its output could not be read.
    const failed = { ...parsed, parse_failed: true, findings: [] };
    expect(deriveTrackRecords([failed])[0]!.reviews).toBe(0);
  });

  it("is counted separately rather than dropped", () => {
    // Silently discarding it would hide that a run happened at all, which is
    // the information a reader needs to weigh the rest.
    const failed = { ...parsed, parse_failed: true, findings: [] };
    expect(deriveTrackRecords([failed])[0]!.unparseable).toBe(1);
  });

  it("does not supersede an earlier successful review of the same PR", () => {
    // `dedupe` treats a rerun as a correction. A run that produced nothing
    // readable corrects nothing, so letting it win would discard real findings
    // because a parser failed.
    const later = {
      ...parsed,
      parse_failed: true,
      findings: [],
      reviewed_at: "2099-01-01T00:00:00Z",
    };
    const track = deriveTrackRecords([parsed, later])[0]!;
    expect(track.reviews).toBe(1);
    expect(track.claims).toBe(parsed.findings.length);
    expect(track.unparseable).toBe(1);
  });

  it("does not appear in the corpus this identity reviewed", () => {
    // The corpus line says which projects were reviewed. An unreadable run did
    // not review one.
    const failed = { ...parsed, parse_failed: true, findings: [], project: "ghost_project" };
    const track = deriveTrackRecords([parsed, failed])[0]!;
    expect(track.corpus.map(([p]) => p)).not.toContain("ghost_project");
  });

  it("counts two failed runs of one PR as one failure", () => {
    // Deduplicated within their own class, on the same rule the reviews use:
    // one run per (url, head_sha, identity). Otherwise a PR that is retried
    // until it parses accumulates failures faster than reviews.
    const failed = { ...parsed, parse_failed: true, findings: [] };
    const again = { ...failed, reviewed_at: "2099-01-01T00:00:00Z" };
    expect(deriveTrackRecords([failed, again])[0]!.unparseable).toBe(1);
  });

  it("reports zero when every review parsed", () => {
    // The ordinary state, and the degenerate case for a counter.
    for (const t of deriveTrackRecords(records)) expect(t.unparseable).toBe(0);
  });
});

describe("a run that failed before producing output", () => {
  const parsed = records.find((r) => r.findings.length > 0)!;
  const errored = { ...parsed, error: "429 RESOURCE_EXHAUSTED", findings: [] };

  it("is not counted among the reviews", () => {
    // A provider outage is not a reviewer that looked and saw nothing wrong.
    expect(deriveTrackRecords([errored])[0]!.reviews).toBe(0);
  });

  it("is counted apart from an unparseable run, not lumped with it", () => {
    // The two failures differ in what they say: one produced output nobody
    // could read, the other produced none at all. "No readable output" is
    // simply false about a 429.
    const t = deriveTrackRecords([errored])[0]!;
    expect(t.errored).toBe(1);
    expect(t.unparseable).toBe(0);
  });

  it("does not supersede an earlier successful review of the same PR", () => {
    const later = { ...errored, reviewed_at: "2099-01-01T00:00:00Z" };
    const t = deriveTrackRecords([parsed, later])[0]!;
    expect(t.reviews).toBe(1);
    expect(t.claims).toBe(parsed.findings.length);
    expect(t.errored).toBe(1);
  });

  it("counts as errored, not unparseable, when it is both", () => {
    // The parse failure is downstream of the call failing, so the error is the
    // thing that happened. Counting it twice would report two failed runs.
    const both = { ...errored, parse_failed: true };
    const t = deriveTrackRecords([both])[0]!;
    expect(t.errored).toBe(1);
    expect(t.unparseable).toBe(0);
  });

  it("reports zero when no run errored", () => {
    for (const t of deriveTrackRecords(records)) expect(t.errored).toBe(0);
  });
});

describe("the confirmed rate broken out by severity", () => {
  const claim = (severity: string, verdict: string) => ({
    file: "f.ts",
    severity,
    category: "logic",
    title: "t",
    evidence: "e",
    problem: "p",
    fix: "x",
    confidence: 80,
    verdict,
  });
  const withFindings = (...fs: unknown[]) =>
    ({ ...records[0]!, findings: fs }) as (typeof records)[0];

  it("reports every severity band in order of how much it matters", () => {
    // Not alphabetical. A reader scanning for the number that matters most
    // should find it first.
    const t = deriveTrackRecords([withFindings(claim("minor", "confirmed"))])[0]!;
    expect(t.skeptic.by_severity.map((b) => b.severity)).toEqual(["critical", "major", "minor"]);
    // Worth knowing that this assertion is currently weak: for these three
    // names, alphabetical order and severity order coincide, so a `.sort()`
    // slipped in here would not fail it. It fails on a reordering, and it
    // starts earning its place the day a band whose name breaks the
    // coincidence is added — `blocker`, say.
  });

  it("counts resolved separately from claimed within a band", () => {
    const t = deriveTrackRecords([
      withFindings(
        claim("critical", "confirmed"),
        claim("critical", "refuted"),
        claim("critical", "unresolved"),
      ),
    ])[0]!;
    const critical = t.skeptic.by_severity.find((b) => b.severity === "critical")!;
    expect(critical).toMatchObject({ claims: 3, resolved: 2, confirmed: 1 });
  });

  it("shows a band with no claims rather than dropping it", () => {
    // A reviewer that never raised a critical finding is saying something, and
    // an absent row looks like a rendering gap rather than a fact.
    const t = deriveTrackRecords([withFindings(claim("minor", "confirmed"))])[0]!;
    expect(t.skeptic.by_severity.find((b) => b.severity === "critical")).toMatchObject({
      claims: 0,
      resolved: 0,
      confirmed: 0,
    });
  });

  it("counts uncertain within the band, apart from confirmed", () => {
    // The share the skeptic could not verify differs between reviewers by more
    // than the rate does — 32%, 10% and 6% on critical across the three
    // published identities — and no choice of denominator can express that.
    const t = deriveTrackRecords([
      withFindings(
        claim("critical", "confirmed"),
        claim("critical", "uncertain"),
        claim("critical", "uncertain"),
        claim("critical", "refuted"),
      ),
    ])[0]!;
    const critical = t.skeptic.by_severity.find((b) => b.severity === "critical")!;
    expect(critical).toMatchObject({ resolved: 4, confirmed: 1, uncertain: 2 });
  });

  it("separates the bands rather than pooling them", () => {
    // The whole point: an identity can look strong overall and be a coin flip
    // on the findings that matter. Both gemini identities confirm 50% of their
    // critical claims behind headline rates of 78% and 70%.
    const t = deriveTrackRecords([
      withFindings(
        claim("critical", "refuted"),
        claim("minor", "confirmed"),
        claim("minor", "confirmed"),
      ),
    ])[0]!;
    const band = (s: string) => t.skeptic.by_severity.find((b) => b.severity === s)!;
    expect(band("critical").confirmed).toBe(0);
    expect(band("minor").confirmed).toBe(2);
  });
});

describe("repeated runs of one subject are sampled, not corrected", () => {
  const finding = (verdict: string, severity = "major") => ({
    file: "f.ts", severity, category: "logic", title: "t", evidence: "e",
    problem: "p", fix: "x", confidence: 80, verdict,
  });
  const run = (over: Record<string, unknown>) =>
    ({ ...records[0]!, findings: [], ...over }) as (typeof records)[0];

  it("leaves a subject with one run exactly as it was", () => {
    // The regression that matters: 45 of the diff-only bee's reviews were never
    // re-run, and averaging must not move a number that had nothing to average.
    const t = deriveTrackRecords([run({ findings: [finding("confirmed"), finding("refuted")] })])[0]!;
    expect(t.skeptic).toMatchObject({ confirmed: 1, refuted: 1 });
    expect(t.claims).toBe(2);
    expect(t.reviews).toBe(1);
  });

  it("averages the runs of a subject instead of picking one", () => {
    // Two samples of the same review at temperature 0.7: one found two
    // confirmed, the other none. The subject contributes their mean, not
    // whichever ran last.
    const t = deriveTrackRecords([
      run({ findings: [finding("confirmed"), finding("confirmed")], reviewed_at: "2026-08-12T09:00:00Z" }),
      run({ findings: [], reviewed_at: "2026-08-12T18:00:00Z" }),
    ])[0]!;
    expect(t.claims).toBe(1);
    expect(t.skeptic.confirmed).toBe(1);
  });

  it("counts the subject once however many times it was run", () => {
    // `reviews` answers how many pull requests were reviewed. Three samples of
    // one PR are one review, and were under the old rule too.
    const t = deriveTrackRecords([
      run({ reviewed_at: "2026-08-12T09:00:00Z" }),
      run({ reviewed_at: "2026-08-12T12:00:00Z" }),
      run({ reviewed_at: "2026-08-12T18:00:00Z" }),
    ])[0]!;
    expect(t.reviews).toBe(1);
  });

  it("does not let a re-run subject outweigh a singly-run one", () => {
    // The failure the old rule had in the other direction: pooling would give a
    // thrice-sampled PR three times the weight of one reviewed once.
    const thrice = ["09", "12", "18"].map((h) =>
      run({ findings: [finding("confirmed")], reviewed_at: `2026-08-12T${h}:00:00Z` }),
    );
    const once = run({ head_sha: "other", findings: [finding("refuted")] });
    const t = deriveTrackRecords([...thrice, once])[0]!;
    expect(t.skeptic).toMatchObject({ confirmed: 1, refuted: 1 });
  });

  it("counts a repeated subject once in the corpus line", () => {
    // The corpus answers which projects were reviewed, so three samples of one
    // pull request are one entry. Counting runs would inflate a project purely
    // by how often it was re-sampled.
    const t = deriveTrackRecords([
      run({ project: "alpha", reviewed_at: "2026-08-12T09:00:00Z" }),
      run({ project: "alpha", reviewed_at: "2026-08-12T12:00:00Z" }),
      run({ project: "alpha", reviewed_at: "2026-08-12T18:00:00Z" }),
    ])[0]!;
    expect(t.corpus).toEqual([["alpha", 1]]);
  });

  it("weights a band's claim count, not only its verdicts", () => {
    // `claims` and `resolved` are different denominators and both are shown;
    // weighting one and not the other would make a band's own numbers
    // inconsistent with each other.
    const t = deriveTrackRecords([
      run({ findings: [finding("confirmed", "critical"), finding("confirmed", "critical")], reviewed_at: "2026-08-12T09:00:00Z" }),
      run({ findings: [finding("confirmed", "critical")], reviewed_at: "2026-08-12T18:00:00Z" }),
    ])[0]!;
    expect(t.skeptic.by_severity.find((b) => b.severity === "critical")!.claims).toBe(1.5);
  });

  it("weights impact too, so a re-sampled review does not pull the mean", () => {
    // Two samples: one scored 10, the other 2. The subject contributes 6, not
    // a mean dragged toward whichever side had more runs.
    const scored = (impact: number, at: string) =>
      run({ findings: [{ ...finding("confirmed"), impact_score: impact }], reviewed_at: at });
    const t = deriveTrackRecords([
      scored(10, "2026-08-12T09:00:00Z"),
      scored(2, "2026-08-12T18:00:00Z"),
    ])[0]!;
    expect(t.skeptic.mean_impact).toBe(6);
  });

  it("averages the severity bands the same way", () => {
    const t = deriveTrackRecords([
      run({ findings: [finding("confirmed", "critical"), finding("confirmed", "critical")], reviewed_at: "2026-08-12T09:00:00Z" }),
      run({ findings: [finding("refuted", "critical")], reviewed_at: "2026-08-12T18:00:00Z" }),
    ])[0]!;
    const critical = t.skeptic.by_severity.find((b) => b.severity === "critical")!;
    expect(critical.confirmed).toBe(1);
    expect(critical.resolved).toBe(1.5);
  });
});
