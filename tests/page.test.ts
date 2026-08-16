import { describe, expect, it } from "vitest";
import { renderPage } from "../src/publish/page.js";
import type { TrackRecord } from "../src/types.js";

// Typed as the interface rather than `as const`, so a test can override a
// single field without every literal narrowing to itself.
const BASE_SKEPTIC: TrackRecord["skeptic"] = {
  judge: "independent",
  confirmed: 15,
  refuted: 3,
  uncertain: 2,
  unresolved: 0,
  mean_impact: 4.1,
  by_severity: [
    { severity: "critical", claims: 0, resolved: 0, confirmed: 0, uncertain: 0 },
    { severity: "major", claims: 0, resolved: 0, confirmed: 0, uncertain: 0 },
    { severity: "minor", claims: 0, resolved: 0, confirmed: 0, uncertain: 0 },
  ],
};

function make(over: Partial<TrackRecord> = {}): TrackRecord {
  return {
    identity_id: `0x${"11".repeat(32)}`,
    owner_address: "0x0000000000000000000000000000000000000001",
    genome: {
      schema_version: 1,
      known_fields: ["context_mode", "finder_model", "finder_provider", "review_fingerprint", "skeptic_model", "skeptic_provider"],
      finder_provider: "gemini",

      skeptic_provider: "gemini",
      finder_model: "gemini-2.5-flash",
      skeptic_model: "gemini-3.5-flash",
      context_mode: "graph",
      review_fingerprint: "d0d807ef",
    },
    reviews: 10,
    unparseable: 0,
    errored: 0,
    claims: 20,
    corpus: [["cal_dot_com", 10]],
    skeptic: BASE_SKEPTIC,
    human: { available: false },
    ...over,
  };
}

describe("renderPage", () => {
  it("states that nothing here measures what was missed", () => {
    // Asserted on the substance rather than the word "survivorship". The text
    // that used the word also claimed Guardian records nothing for a failed
    // review, which is false — so a test pinned to the vocabulary would have
    // kept the wrong sentence alive.
    expect(renderPage([make()]).toLowerCase()).toContain("how much was missed");
  });

  it("marks the human axis as having no data", () => {
    expect(renderPage([make()])).toMatch(/human[\s\S]{0,240}no data/i);
  });

  it("shows the owner address so it can be recomputed independently", () => {
    expect(renderPage([make()])).toContain(make().owner_address);
  });

  it("lists the corpus each identity actually reviewed", () => {
    expect(renderPage([make()])).toContain("cal_dot_com");
  });

  it("quantifies the overlap rather than issuing a bare warning", () => {
    const graph = make({ corpus: [["cal_dot_com", 10]] });
    const diff = make({
      identity_id: `0x${"22".repeat(32)}`,
      genome: { ...make().genome, context_mode: "diff-only" },
      corpus: [["keycloak", 4]],
    });
    const html = renderPage([graph, diff]);
    expect(html).toContain("share 0 of the 2 projects");
    expect(html.toLowerCase()).toContain("not a controlled comparison");
  });

  it("still reports a high overlap, letting the number carry the severity", () => {
    // No threshold suppresses this: 3 of 4 is mild, and the reader can see that.
    const a = make({ corpus: [["grafana", 5], ["sentry", 2], ["keycloak", 1]] });
    const b = make({
      identity_id: `0x${"22".repeat(32)}`,
      corpus: [["grafana", 5], ["sentry", 2], ["keycloak", 1], ["discourse", 3]],
    });
    expect(renderPage([a, b])).toContain("share 3 of the 4 projects");
  });

  it("caveats a subset, which an overlap-against-the-smaller check would miss", () => {
    // The larger reviewer saw projects the smaller never touched — the confound
    // is present even though every project of A appears in B.
    const a = make({ corpus: [["grafana", 5]] });
    const b = make({
      identity_id: `0x${"22".repeat(32)}`,
      corpus: [["grafana", 5], ["keycloak", 4]],
    });
    expect(renderPage([a, b])).toContain("share 1 of the 2 projects");
  });

  it("omits the caveat entirely when corpora are identical", () => {
    const a = make({ corpus: [["grafana", 5]] });
    const b = make({ identity_id: `0x${"22".repeat(32)}`, corpus: [["grafana", 9]] });
    expect(renderPage([a, b]).toLowerCase()).not.toContain("not a controlled comparison");
  });

  it("names the worst-overlapping pair when several exist", () => {
    const shared = make({ corpus: [["grafana", 5]] });
    const alsoShared = make({ identity_id: `0x${"22".repeat(32)}`, corpus: [["grafana", 5]] });
    const stranger = make({
      identity_id: `0x${"33".repeat(32)}`,
      genome: { ...make().genome, context_mode: "diff-only" },
      corpus: [["keycloak", 4]],
    });
    expect(renderPage([shared, alsoShared, stranger])).toContain("share 0 of the 2 projects");
  });

  it("escapes markup inside a model name it does accept", () => {
    // The dangerous string is not one the finder_provider table rejects — that one
    // never reaches the page. It is a name that passes as gemini and still
    // carries markup, since the value comes straight from the artifact.
    const evil = make({
      genome: { ...make().genome, finder_model: "gemini-2.5-flash<script>alert(1)</script>" },
    });
    const html = renderPage([evil]);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("renders a reviewer the old prefix table could not place", () => {
    // The reverse of what this asserted. A page refusing to render because a
    // model name did not match a prefix was #15 reaching the publishing layer:
    // gpt-4o was unclassifiable and therefore fatal. The producer states the
    // provider now, and an unfamiliar model is just an unfamiliar model.
    const exotic = make({
      genome: { ...make().genome, finder_provider: "openai", finder_model: "gpt-4o" },
    });
    expect(() => renderPage([exotic])).not.toThrow();
    expect(renderPage([exotic])).toContain("openai");
  });
});

describe("a self-graded identity on the page", () => {
  const selfGraded = (): TrackRecord =>
    make({
      genome: {
        schema_version: 1,
        known_fields: ["context_mode", "finder_model", "finder_provider", "review_fingerprint", "skeptic_model", "skeptic_provider"],
        finder_provider: "mistral",

        skeptic_provider: "mistral",
        finder_model: "mistral-medium-latest",
        skeptic_model: "mistral-medium-latest",
        context_mode: "graph",
        review_fingerprint: "4d1fe6a1234567",
      },
      skeptic: { ...BASE_SKEPTIC, judge: "self" },
    });

  it("warns beside the skeptic that it is the finder", () => {
    expect(renderPage([selfGraded()])).toMatch(/grades its own work/);
  });

  it("relabels the rate, so the compared number carries the caveat", () => {
    const html = renderPage([selfGraded()]);
    expect(html).toMatch(/self-graded rate/);
    expect(html).not.toMatch(/>confirmed rate</);
  });

  it("leaves an independently judged card unmarked", () => {
    // Without this the two above pass against an implementation that warns on
    // every card.
    const html = renderPage([make()]);
    expect(html).not.toMatch(/grades its own work/);
    expect(html).toMatch(/confirmed rate/);
  });
});

describe("unparseable runs on the page", () => {
  it("says so beside the reviews count when there are any", () => {
    // Beside the number it qualifies, not a row away: the reviews count is what
    // a reader uses to weigh everything else on the card.
    const html = renderPage([make({ reviews: 10, unparseable: 2 })]);
    expect(html).toMatch(/reviews<\/dt><dd>10.*2 further runs produced no readable output/);
  });

  it("says nothing when every run parsed", () => {
    // Absent rather than "0", so the note never becomes furniture a reader
    // learns to skip.
    expect(renderPage([make({ reviews: 10, unparseable: 0 })])).not.toContain("readable output");
  });

  it("uses the singular for one", () => {
    expect(renderPage([make({ reviews: 10, unparseable: 1 })])).toContain("1 further run produced");
  });

  it("no longer claims Guardian records nothing for a failed review", () => {
    // It does record them — `error` and `parse_failed` are on every review row.
    // The page said otherwise until this was checked against the data.
    expect(renderPage([make()])).not.toContain("writes no record");
  });
});

describe("runs that failed before producing output", () => {
  it("are named as their own failure, not as unreadable output", () => {
    const html = renderPage([make({ reviews: 10, errored: 2 })]);
    expect(html).toContain("2 runs failed before producing output");
    expect(html).not.toContain("readable output");
  });

  it("appear alongside unparseable runs when both happened", () => {
    const html = renderPage([make({ reviews: 10, unparseable: 1, errored: 3 })]);
    expect(html).toMatch(
      /1 further run produced no readable output, 3 runs failed before producing output/,
    );
  });

  it("say nothing when every run produced something", () => {
    expect(renderPage([make({ reviews: 10 })])).not.toContain("failed before producing");
  });
});

describe("mean impact", () => {
  it("states the scale, since 6.31 alone does not say whether that is high", () => {
    expect(renderPage([make({ skeptic: { ...BASE_SKEPTIC, mean_impact: 6.31 } })])).toContain(
      "6.31 / 10",
    );
  });

  it("is labelled self-graded when the skeptic is the finder", () => {
    // Upstream assigns impact_score in the skeptic stage. When the skeptic is
    // the same model as the finder, the number is a model scoring the
    // importance of its own findings — the same fact the confirmation rate
    // already renames itself for.
    const html = renderPage([
      make({
        genome: { ...make().genome, skeptic_model: "gemini-2.5-flash" },
        skeptic: { ...BASE_SKEPTIC, judge: "self", mean_impact: 6.31 },
      }),
    ]);
    expect(html).toContain("self-graded mean impact");
  });

  it("is not labelled self-graded when a different model judged", () => {
    const html = renderPage([make({ skeptic: { ...BASE_SKEPTIC, mean_impact: 6.31 } })]);
    expect(html).toContain("<dt>mean impact</dt>");
    expect(html).not.toContain("self-graded mean impact");
  });

  it("says no data rather than a scale when nothing scored", () => {
    const html = renderPage([make({ skeptic: { ...BASE_SKEPTIC, mean_impact: null } })]);
    expect(html).not.toContain("/ 10");
  });
});

describe("the ablation section", () => {
  const study = {
    pairs: [
      { url: "u1", project: "p", finder_model: "m", withoutGraph: 1, withGraph: 3, difference: 2 },
      { url: "u2", project: "q", finder_model: "m", withoutGraph: 4, withGraph: 2, difference: -2 },
    ],
    projects: ["p", "q"],
    graphFoundMore: 1,
    graphFoundFewer: 1,
    tied: 0,
    meanDifference: 0,
    lowest: -2,
    highest: 2,
  };

  it("is absent when the corpus contains no ablation", () => {
    // The ordinary case. An empty section asserting nothing is worse than none.
    expect(renderPage([make()])).not.toContain("graph removed on purpose");
  });

  it("leads with the split, not the averages", () => {
    // Two arms whose means match can differ on every PR, and only the split
    // tells those apart.
    const html = renderPage([make()], { ablation: study });
    // Pinned as the whole term, not a prefix: `toContain("graph found more")`
    // also matches "graph found more later", so it cannot fail on a renamed
    // label — the same looseness flagged on #58.
    expect(html).toContain("<dt>graph found more</dt>");
    expect(html).toContain("<dt>graph found fewer</dt>");
    expect(html.indexOf("<dt>graph found more</dt>")).toBeLessThan(
      html.indexOf("<dt>findings per review</dt>"),
    );
  });

  it("states n beside every count", () => {
    const html = renderPage([make()], { ablation: study });
    expect(html).toMatch(/1 of 2/);
    expect(html).toContain("2, across p, q");
  });

  it("refuses to read the null result as evidence of no effect", () => {
    const html = renderPage([make()], { ablation: study });
    expect(html).toContain("not evidence the graph does nothing");
  });

  it("is not a track record card", () => {
    // The ablated runs already sit inside the diff-only identity. Presenting
    // them as a fourth reviewer would count them twice.
    const html = renderPage([make()], { ablation: study });
    const cards = html.split('<section class="card">').length - 1;
    expect(cards).toBe(1);
  });
});

describe("the severity breakdown on a card", () => {
  // `claims` deliberately exceeds `resolved` in every band. With them equal a
  // rate taken over the wrong denominator produces the same number, and the
  // assertions below cannot tell the two apart.
  const bands = (over: Partial<Record<string, number>>[] = []) => [
    { severity: "critical" as const, claims: 13, resolved: 10, confirmed: 5, uncertain: 0, ...over[0] },
    { severity: "major" as const, claims: 40, resolved: 34, confirmed: 29, uncertain: 0, ...over[1] },
    { severity: "minor" as const, claims: 25, resolved: 20, confirmed: 16, uncertain: 0, ...over[2] },
  ];

  it("sits under the rate it qualifies, not somewhere else on the card", () => {
    // The rate is the number a reader takes away; the breakdown is the reason
    // not to take it at face value. A row away and it is a footnote.
    const html = renderPage([make({ skeptic: { ...BASE_SKEPTIC, by_severity: bands() } })]);
    const rate = html.indexOf("confirmed rate");
    const sev = html.indexOf("<dt>by severity</dt>");
    expect(sev).toBeGreaterThan(rate);
    expect(sev - rate).toBeLessThan(200);
  });

  it("shows each band as a rate over what was resolved", () => {
    const html = renderPage([make({ skeptic: { ...BASE_SKEPTIC, by_severity: bands() } })]);
    expect(html).toContain("critical 50% of 10");
    expect(html).toContain("major 85% of 34");
    expect(html).toContain("minor 80% of 20");
  });

  it("says none rather than 0% when a band has nothing resolved", () => {
    // 0% would assert the reviewer got every critical finding wrong. It raised
    // none — a different statement, and the opposite one.
    const html = renderPage([
      make({ skeptic: { ...BASE_SKEPTIC, by_severity: bands([{ claims: 0, resolved: 0, confirmed: 0 }]) } }),
    ]);
    expect(html).toContain("critical <span class=\"nodata\">none</span>");
    expect(html).not.toContain("critical 0% of 0");
  });
});

describe("the unverifiable-claims caveat", () => {
  const axis = (over: Partial<typeof BASE_SKEPTIC> = {}) => ({ ...BASE_SKEPTIC, ...over });

  it("names the denominator and what an uncertain verdict actually means", () => {
    const html = renderPage([make({ skeptic: axis({ confirmed: 50, refuted: 8, uncertain: 6 }) })]);
    expect(html).toContain("could not check the claim");
    expect(html).toContain("not that the claim was wrong");
  });

  it("carries the size of the choice, computed rather than asserted", () => {
    // 50/(50+8+6) = 78.1%, 50/(50+8) = 86.2% — an 8-point swing behind an
    // unnamed decision. Without the number the caveat is a shrug.
    const html = renderPage([make({ skeptic: axis({ confirmed: 50, refuted: 8, uncertain: 6 }) })]);
    expect(html).toMatch(/6 of 64 judged findings/);
    expect(html).toMatch(/by 8 to 8 points/);
  });

  it("says nothing when no verdict was uncertain", () => {
    // Absent rather than "0 findings", so the caveat never becomes furniture.
    const html = renderPage([make({ skeptic: axis({ uncertain: 0 }) })]);
    expect(html).not.toContain("could not check the claim");
  });
});

describe("the unverifiable share per band", () => {
  const band = (uncertain: number) => [
    { severity: "critical" as const, claims: 34, resolved: 34, confirmed: 17, uncertain },
    { severity: "major" as const, claims: 40, resolved: 34, confirmed: 29, uncertain: 0 },
    { severity: "minor" as const, claims: 25, resolved: 20, confirmed: 16, uncertain: 0 },
  ];

  it("shows how many the skeptic could not verify, beside the band's rate", () => {
    const html = renderPage([make({ skeptic: { ...BASE_SKEPTIC, by_severity: band(11) } })]);
    expect(html).toContain("critical 50% of 34 <span class=\"nodata\">(11 unverifiable)</span>");
  });

  it("says nothing for a band where every judged claim got a verdict either way", () => {
    // Absent rather than "(0 unverifiable)", so the note marks a real fact
    // rather than becoming punctuation on every band.
    const html = renderPage([make({ skeptic: { ...BASE_SKEPTIC, by_severity: band(0) } })]);
    expect(html).not.toContain("(0 unverifiable)");
    expect(html).toContain("critical 50% of 34");
  });
});

describe("the caveat when a reviewer has nothing decided either way", () => {
  it("prints no NaN, and no range it cannot compute", () => {
    // Reachable: every judged claim came back uncertain. Unguarded this
    // rendered a literal "NaN to NaN points" — verified by rendering it, not
    // reasoned about.
    const html = renderPage([
      make({ skeptic: { ...BASE_SKEPTIC, confirmed: 0, refuted: 0, uncertain: 5 } }),
    ]);
    expect(html).not.toContain("NaN");
    expect(html).toContain("5 of 5 judged findings");
    // Pinned to the sentence, not the bare word: the bee's SVG carries a
    // `points` attribute, so `not.toContain("points")` fails for a reason that
    // has nothing to do with this note.
    expect(html).not.toMatch(/would raise the rates below/);
  });

  it("still gives a range when at least one reviewer has one", () => {
    // The undefined track is skipped, not allowed to poison the range.
    const html = renderPage([
      make({ skeptic: { ...BASE_SKEPTIC, confirmed: 0, refuted: 0, uncertain: 5 } }),
      make({ skeptic: { ...BASE_SKEPTIC, confirmed: 50, refuted: 8, uncertain: 6 } }),
    ]);
    expect(html).not.toContain("NaN");
    expect(html).toMatch(/by 8 to 8 points/);
  });
});
