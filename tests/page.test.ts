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

  it("warns when two identities reviewed near-disjoint corpora", () => {
    const graph = make({ corpus: [["cal_dot_com", 10]] });
    const diff = make({
      identity_id: `0x${"22".repeat(32)}`,
      genome: { ...make().genome, context_mode: "diff-only" },
      corpus: [["keycloak", 4]],
    });
    expect(renderPage([graph, diff]).toLowerCase()).toContain("not a controlled comparison");
  });

  it("omits the warning when identities share their corpus", () => {
    const a = make({ corpus: [["grafana", 5]] });
    const b = make({ identity_id: `0x${"22".repeat(32)}`, corpus: [["grafana", 5]] });
    expect(renderPage([a, b]).toLowerCase()).not.toContain("not a controlled comparison");
  });

  it("escapes model names rather than interpolating them raw", () => {
    const evil = make({ genome: { ...make().genome, finder_model: "<script>x</script>" } });
    const html = renderPage([evil]);
    expect(html).not.toContain("<script>x</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
