import { describe, expect, it } from "vitest";
import { renderPage } from "../src/publish/page.js";
import type { TrackRecord } from "../src/types.js";

function make(over: Partial<TrackRecord> = {}): TrackRecord {
  return {
    identity_id: `0x${"11".repeat(32)}`,
    owner_address: "0x0000000000000000000000000000000000000001",
    genome: {
      schema_version: 1,
      known_fields: [
        "context_mode",
        "finder_model",
        "guardian_version",
        "provider",
        "skeptic_model",
      ],
      provider: "gemini",
      finder_model: "gemini-2.5-flash",
      skeptic_model: "gemini-3.5-flash",
      context_mode: "graph",
      guardian_version: "d0d807ef",
    },
    reviews: 10,
    claims: 20,
    corpus: [["cal_dot_com", 10]],
    skeptic: { confirmed: 15, refuted: 3, uncertain: 2, unresolved: 0, mean_impact: 4.1 },
    human: { available: false },
    ...over,
  };
}

describe("renderPage", () => {
  it("states the survivorship bias disclaimer", () => {
    expect(renderPage([make()]).toLowerCase()).toContain("survivorship");
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
    // The dangerous string is not one the provider table rejects — that one
    // never reaches the page. It is a name that passes as gemini and still
    // carries markup, since the value comes straight from the artifact.
    const evil = make({
      genome: { ...make().genome, finder_model: "gemini-2.5-flash<script>alert(1)</script>" },
    });
    const html = renderPage([evil]);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("refuses to render a reviewer whose model cannot be placed", () => {
    const unplaceable = make({ genome: { ...make().genome, finder_model: "gpt-4o" } });
    expect(() => renderPage([unplaceable])).toThrow(/unrecognised model/i);
  });
});
