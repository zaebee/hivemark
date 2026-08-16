import { describe, expect, it } from "vitest";
import { familiesOf, nearTwinsIn, renderHive } from "../src/publish/hive.js";
import type { Genome, TrackRecord } from "../src/types.js";

const genome = (over: Partial<Genome>): Genome => ({
  schema_version: 1,
  known_fields: ["context_mode", "finder_model", "finder_provider", "review_fingerprint", "skeptic_model", "skeptic_provider"],
  finder_provider: "gemini",

  skeptic_provider: "gemini",
  finder_model: "gemini-2.5-flash",
  skeptic_model: "gemini-3.5-flash",
  context_mode: "graph",
  review_fingerprint: "d0d807ef01c556b882dc85b9fc0d2851d92aa1e5",
  ...over,
});

let seq = 0;
const track = (over: Partial<Genome>): TrackRecord => {
  seq += 1;
  return {
    identity_id: `0x${String(seq).padStart(64, "0")}`,
    owner_address: `0x${String(seq).padStart(40, "0")}`,
    genome: genome(over),
    unparseable: 0,
    reviews: 3,
    claims: 9,
    corpus: [["cal_dot_com", 3]],
    skeptic: { judge: "independent", confirmed: 6, refuted: 1, uncertain: 2, unresolved: 0, mean_impact: 4 },
    human: { available: false },
  } as TrackRecord;
};

describe("familiesOf", () => {
  it("groups by the finder's finder_provider, not the skeptic's", () => {
    // A cross-finder_provider bee belongs to the reviewer that did the reviewing and
    // wears where it went for judgement.
    const families = familiesOf([
      track({}),
      track({ finder_model: "mistral-medium-latest", finder_provider: "mistral", skeptic_model: "gemini-3.5-flash" }),
    ]);
    expect(families.map((f) => f.provider).sort()).toEqual(["gemini", "mistral"]);
    expect(families.find((f) => f.provider === "mistral")!.members).toHaveLength(1);
  });

  it("orders within a family by context_mode, then guardian_version", () => {
    const family = familiesOf([
      track({ context_mode: "graph", review_fingerprint: "ffff" }),
      track({ context_mode: "diff-only", review_fingerprint: "bbbb" }),
      track({ context_mode: "graph", review_fingerprint: "aaaa" }),
    ])[0]!;
    expect(family.members.map((m) => `${m.genome.context_mode}/${m.genome.review_fingerprint}`)).toEqual([
      "diff-only/bbbb",
      "graph/aaaa",
      "graph/ffff",
    ]);
  });

  it("orders members that agree on both sorted fields", () => {
    // One finder_provider covers many finder models, so two members of a family can
    // share context_mode and guardian_version and still be different reviewers.
    // Without a final fallback the comparator returns 0 for them and the input
    // order decides — which the test below claims cannot happen.
    const pair = [
      track({ finder_model: "gemini-3.5-pro" }),
      track({ finder_model: "gemini-2.5-flash" }),
    ];
    const ids = (t: TrackRecord[]) => familiesOf(t)[0]!.members.map((m) => m.identity_id);
    expect(ids(pair)).toEqual(ids([...pair].reverse()));
  });

  it("is deterministic regardless of input order", () => {
    const a = [track({ review_fingerprint: "aaaa" }), track({ review_fingerprint: "bbbb" })];
    const names = (t: TrackRecord[]) =>
      familiesOf(t).flatMap((f) => f.members.map((m) => m.genome.review_fingerprint));
    expect(names(a)).toEqual(names([...a].reverse()));
  });
});

describe("renderHive", () => {
  it("labels every bee, because shape does not identify", () => {
    // Two identities differing only in guardian_version are near-indistinguishable
    // by eye — measured at bands 4/4 and thorax within 4% — so the text is what
    // says which one this is.
    const html = renderHive([
      track({ review_fingerprint: "4d1fe6a8aaaa" }),
      track({ review_fingerprint: "112e4373bbbb" }),
    ]);
    expect(html).toContain("4d1fe6a");
    expect(html).toContain("112e437");
  });

  it("names each family", () => {
    const html = renderHive([
      track({}),
      track({ finder_model: "mistral-medium-latest", finder_provider: "mistral" }),
    ]);
    expect(html).toContain("gemini");
    expect(html).toContain("mistral");
  });

  it("renders one bee per identity", () => {
    const html = renderHive([
      track({}),
      track({ review_fingerprint: "cccc" }),
      track({ review_fingerprint: "dddd" }),
    ]);
    expect(html.match(/<svg/g) ?? []).toHaveLength(3);
  });

  it("escapes what it prints, because a genome field is not trusted markup", () => {
    // The guardian label is sliced to seven characters before escaping, so the
    // closing tag never reaches the output — assert the property that matters,
    // which is that no genome text arrives as live markup, rather than a
    // specific escaped string.
    const html = renderHive([track({ review_fingerprint: "<script>alert(1)</script>" })]);
    expect(html).toContain("&lt;script");
    expect(html).not.toMatch(/<script/);
  });

  it("escapes a field it prints whole, not only the one it truncates", () => {
    // context_mode is not sliced, so this covers the other path through `esc`.
    const html = renderHive([track({ context_mode: "<img src=x onerror=1>" as never })]);
    expect(html).toContain("&lt;img src=x onerror=1&gt;");
    expect(html).not.toMatch(/<img/);
  });
});

describe("near twins", () => {
  it("finds members differing in nothing but guardian_version", () => {
    const family = familiesOf([
      track({ review_fingerprint: "aaaa" }),
      track({ review_fingerprint: "bbbb" }),
      track({ context_mode: "diff-only", review_fingerprint: "cccc" }),
    ])[0]!;
    const groups = nearTwinsIn(family);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(2);
  });

  it("does not call a lone member a twin", () => {
    const family = familiesOf([track({ review_fingerprint: "aaaa" })])[0]!;
    expect(nearTwinsIn(family)).toHaveLength(0);
  });

  it("does not group across a differing skeptic", () => {
    // A different skeptic is a different reviewer, not a version bump.
    const family = familiesOf([
      track({ review_fingerprint: "aaaa", skeptic_model: "gemini-3.5-flash" }),
      track({ review_fingerprint: "bbbb", skeptic_model: null }),
    ])[0]!;
    expect(nearTwinsIn(family)).toHaveLength(0);
  });

  it("states it as a suspicion, not a finding", () => {
    // Whether these are one reviewer is upstream's to confirm — it is what
    // codegraph-brain#375 measures — so the page must not assert it.
    const html = renderHive([track({ review_fingerprint: "aaaa" }), track({ review_fingerprint: "bbbb" })]);
    expect(html).toMatch(/probably/i);
    expect(html).not.toMatch(/\bare one reviewer\b/);
  });

  it("says nothing when a family has no twins", () => {
    expect(renderHive([track({ review_fingerprint: "aaaa" })])).not.toMatch(/probably/i);
  });
});
