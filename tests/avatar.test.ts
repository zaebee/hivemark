import { describe, expect, it } from "vitest";
import { avatarSvg } from "../src/avatar.js";
import type { Genome } from "../src/types.js";

const base: Genome = {
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
  guardian_version: "d0d807ef01c556b882dc85b9fc0d2851d92aa1e5",
};

const countOf = (svg: string, re: RegExp) => (svg.match(re) ?? []).length;

/**
 * Compare the drawing, not the identity stamped into it.
 *
 * The clip id is scoped to the genome's identity so many bees can be inlined in
 * one document. Two genomes may therefore render the same picture under
 * different ids — which is correct: they look alike but are not the same
 * subject. Normalising the id is how a test asks about appearance alone.
 */
const drawing = (svg: string) => svg.replace(/hm-abdomen-[0-9a-f]+/g, "hm-abdomen");

describe("avatarSvg", () => {
  it("is deterministic", () => {
    expect(avatarSvg(base)).toBe(avatarSvg({ ...base }));
  });

  it("emits a self-contained svg that loads nothing", () => {
    const svg = avatarSvg(base);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("</svg>");
    // The xmlns declaration is an identifier, not a fetch, so "no http" would be
    // the wrong assertion. What must be absent is anything that loads.
    expect(svg).not.toMatch(/href=/i);
    expect(svg).not.toMatch(/<image|<script|<foreignObject/i);
    // `url(#id)` is a same-document fragment reference and loads nothing;
    // only a url() pointing anywhere else would fetch.
    expect(svg).not.toMatch(/url\((?!#)/i);
  });

  it("takes its outline from a theme token, with the literal only as a fallback", () => {
    const svg = avatarSvg(base);
    // A fixed dark outline disappears against a dark card, so the token leads.
    // The literal must survive inside var()'s fallback — an embedder that
    // defines no token still gets a visible bee — but never as a bare value.
    expect(svg).toContain("var(--hivemark-ink, #191B16)");
    expect(svg).not.toMatch(/(?:fill|stroke)="#191B16"/i);
  });
});

describe("traits read from the genome", () => {
  it("gives a graph reviewer two wing pairs and diff-only one", () => {
    const graph = countOf(avatarSvg(base), /class="hm-wing/g);
    const diff = countOf(avatarSvg({ ...base, context_mode: "diff-only" }), /class="hm-wing/g);
    expect(graph).toBe(4);
    expect(diff).toBe(2);
  });

  it("gives a stinger only when a skeptic judged the findings", () => {
    expect(avatarSvg(base)).toContain('class="hm-stinger"');
    expect(avatarSvg({ ...base, skeptic_model: null })).not.toContain('class="hm-stinger"');
  });

  it("changes the palette with the provider", () => {
    // Assert the colours, not merely that the two pictures differ. The earlier
    // version compared a gemini bee against a qwen one that also differed in eye
    // shape, head build and stinger — so it passed with all three palettes
    // collapsed onto gemini's, which a probe confirmed. Nothing pinned a hex.
    const bodyOf = { gemini: "#E3AE3C", mistral: "#DC6B3E", ollama: "#8098AC" } as const;
    const finderOf = {
      gemini: "gemini-2.5-flash",
      mistral: "mistral-medium-latest",
      ollama: "qwen2.5-coder:7b",
    } as const;

    for (const [provider, body] of Object.entries(bodyOf)) {
      const svg = avatarSvg({
        ...base,
        provider: provider as keyof typeof bodyOf,
        finder_model: finderOf[provider as keyof typeof finderOf],
      });
      expect(svg, `${provider} should paint ${body}`).toContain(body);
      for (const [other, otherBody] of Object.entries(bodyOf)) {
        if (other === provider) continue;
        expect(svg, `${provider} must not paint ${other}'s ${otherBody}`).not.toContain(otherBody);
      }
    }
  });

  it("marks a different Guardian revision as a different generation", () => {
    const a = countOf(avatarSvg(base), /class="hm-band"/g);
    const b = countOf(
      avatarSvg({ ...base, guardian_version: "1ecd9629f46cab10b907dae285d0f58b0eef5e21" }),
      /class="hm-band"/g,
    );
    expect(a).not.toBe(b);
  });

  it("ignores fields that are not part of the body", () => {
    // Track record must never reach the body: identity is fixed, the record grows.
    // Only genome fields exist here, so the guard is that two genomes equal in
    // every visible trait render identically even when schema_version differs.
    const withOtherVersion = { ...base, schema_version: 99 };
    expect(drawing(avatarSvg(withOtherVersion))).toBe(drawing(avatarSvg(base)));
  });
});

describe("the renderer draws the measured animal", () => {
  const bodyEllipses = (svg: string) =>
    [...svg.matchAll(/<ellipse cx="[\d.]+" cy="[\d.]+" rx="([\d.]+)" ry="([\d.]+)"[^>]*fill="#E3AE3C"/g)].map(
      (m) => ({ rx: Number(m[1]), ry: Number(m[2]) }),
    );

  it("draws the head as the measured ellipse, not a circle", () => {
    // A worker's head is wider than it is tall — 3.62 by 2.45 mm. The drawing's
    // habit of a circle was a habit, not an observation.
    const heads = bodyEllipses(avatarSvg(base)).filter((e) => e.rx > e.ry);
    expect(heads.length).toBeGreaterThan(0);
  });

  it("gives two identities with different finders different heads", () => {
    // Both finders are gemini and both carry "flash", so palette and eye shape
    // are identical and the pictures can differ only in the head's geometry.
    //
    // An earlier version of this test compared against gemini-3.5-pro and
    // proved nothing: that model changes the eye shape too, so the SVGs
    // differed even with variation switched off entirely. The fixture made the
    // case unreachable, which is the failure this suite exists to avoid.
    expect(drawing(avatarSvg(base))).not.toBe(
      drawing(avatarSvg({ ...base, finder_model: "gemini-3.5-flash" })),
    );
  });
});

describe("provider is derived, not trusted", () => {
  it("reads the palette from finder_model when provider disagrees", () => {
    // provider is an expression of finder_model. A genome carrying a mistral
    // finder must render as mistral even if the field says otherwise — the
    // crossbreeding study produced exactly this inconsistency.
    const lying = { ...base, provider: "gemini" as const, finder_model: "mistral-medium-latest" };
    const honest = { ...base, provider: "mistral" as const, finder_model: "mistral-medium-latest" };
    // Same picture; different identities, because the genomes differ. The clip
    // id follows identity, so only the drawing is compared here.
    expect(drawing(avatarSvg(lying))).toBe(drawing(avatarSvg(honest)));
    expect(avatarSvg(lying)).not.toBe(avatarSvg(honest));
  });

  it("scopes its clip id to the identity so inlined bees cannot collide", () => {
    const a = avatarSvg(base);
    const b = avatarSvg({ ...base, context_mode: "diff-only" });
    const idOf = (svg: string) => svg.match(/id="(hm-abdomen-[0-9a-f]+)"/)?.[1];
    expect(idOf(a)).toBeDefined();
    expect(idOf(a)).not.toBe(idOf(b));
    // Same genome, same id — the SVG stays byte-identical.
    expect(idOf(avatarSvg({ ...base }))).toBe(idOf(a));
  });

  it("refuses a model it cannot place", () => {
    expect(() => avatarSvg({ ...base, finder_model: "gpt-4o" })).toThrow(/unrecognised model/i);
  });
});
