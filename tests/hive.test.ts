import { describe, expect, it } from "vitest";
import { familiesOf, renderHive } from "../src/publish/hive.js";
import type { Genome, TrackRecord } from "../src/types.js";

const genome = (over: Partial<Genome>): Genome => ({
  schema_version: 1,
  known_fields: ["context_mode", "finder_model", "guardian_version", "provider", "skeptic_model"],
  provider: "gemini",
  finder_model: "gemini-2.5-flash",
  skeptic_model: "gemini-3.5-flash",
  context_mode: "graph",
  guardian_version: "d0d807ef01c556b882dc85b9fc0d2851d92aa1e5",
  ...over,
});

let seq = 0;
const track = (over: Partial<Genome>): TrackRecord => {
  seq += 1;
  return {
    identity_id: `0x${String(seq).padStart(64, "0")}`,
    owner_address: `0x${String(seq).padStart(40, "0")}`,
    genome: genome(over),
    reviews: 3,
    claims: 9,
    corpus: [["cal_dot_com", 3]],
    skeptic: { judge: "independent", confirmed: 6, refuted: 1, uncertain: 2, unresolved: 0, mean_impact: 4 },
    human: { available: false },
  } as TrackRecord;
};

describe("familiesOf", () => {
  it("groups by the finder's provider, not the skeptic's", () => {
    // A cross-provider bee belongs to the reviewer that did the reviewing and
    // wears where it went for judgement.
    const families = familiesOf([
      track({}),
      track({ finder_model: "mistral-medium-latest", provider: "mistral", skeptic_model: "gemini-3.5-flash" }),
    ]);
    expect(families.map((f) => f.provider).sort()).toEqual(["gemini", "mistral"]);
    expect(families.find((f) => f.provider === "mistral")!.members).toHaveLength(1);
  });

  it("orders within a family by context_mode, then guardian_version", () => {
    const family = familiesOf([
      track({ context_mode: "graph", guardian_version: "ffff" }),
      track({ context_mode: "diff-only", guardian_version: "bbbb" }),
      track({ context_mode: "graph", guardian_version: "aaaa" }),
    ])[0]!;
    expect(family.members.map((m) => `${m.genome.context_mode}/${m.genome.guardian_version}`)).toEqual([
      "diff-only/bbbb",
      "graph/aaaa",
      "graph/ffff",
    ]);
  });

  it("is deterministic regardless of input order", () => {
    const a = [track({ guardian_version: "aaaa" }), track({ guardian_version: "bbbb" })];
    const names = (t: TrackRecord[]) =>
      familiesOf(t).flatMap((f) => f.members.map((m) => m.genome.guardian_version));
    expect(names(a)).toEqual(names([...a].reverse()));
  });
});

describe("renderHive", () => {
  it("labels every bee, because shape does not identify", () => {
    // Two identities differing only in guardian_version are near-indistinguishable
    // by eye — measured at bands 4/4 and thorax within 4% — so the text is what
    // says which one this is.
    const html = renderHive([
      track({ guardian_version: "4d1fe6a8aaaa" }),
      track({ guardian_version: "112e4373bbbb" }),
    ]);
    expect(html).toContain("4d1fe6a");
    expect(html).toContain("112e437");
  });

  it("names each family", () => {
    const html = renderHive([
      track({}),
      track({ finder_model: "mistral-medium-latest", provider: "mistral" }),
    ]);
    expect(html).toContain("gemini");
    expect(html).toContain("mistral");
  });

  it("renders one bee per identity", () => {
    const html = renderHive([
      track({}),
      track({ guardian_version: "cccc" }),
      track({ guardian_version: "dddd" }),
    ]);
    expect((html.match(/<svg/g) ?? []).length).toBe(3);
  });

  it("escapes what it prints, because a genome field is not trusted markup", () => {
    // The guardian label is sliced to seven characters before escaping, so the
    // closing tag never reaches the output — assert the property that matters,
    // which is that no genome text arrives as live markup, rather than a
    // specific escaped string.
    const html = renderHive([track({ guardian_version: "<script>alert(1)</script>" })]);
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
