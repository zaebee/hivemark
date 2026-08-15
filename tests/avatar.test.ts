import { describe, expect, it } from "vitest";
import { avatarSvg } from "../src/avatar.js";
import { paletteFor, UNJUDGED } from "../src/palette.js";
import type { Genome } from "../src/types.js";

/** The vendor a model name belongs to, for building fixtures only. */
const familyOf = (model: string): string =>
  model.startsWith("gemini") ? "gemini" : model.startsWith("mistral") ? "mistral" : "ollama";


const base: Genome = {
  schema_version: 1,
  known_fields: ["context_mode", "finder_model", "finder_provider", "review_fingerprint", "skeptic_model", "skeptic_provider"],
  finder_provider: "gemini",

  skeptic_provider: "gemini",
  finder_model: "gemini-2.5-flash",
  skeptic_model: "gemini-3.5-flash",
  context_mode: "graph",
  review_fingerprint: "d0d807ef01c556b882dc85b9fc0d2851d92aa1e5",
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
    // Assert the colours, not merely that the two pictures differ, and assert
    // all three channels of each.
    //
    // Two probes shaped this. The original compared a gemini bee against a qwen
    // one that also differed in eye shape, head build and stinger, so it passed
    // with every palette collapsed onto gemini's. Its replacement pinned only
    // `body`, so thorax, bands and all four wings could wear another provider's
    // colours — mistral's `dark` set to gemini's, and gemini's `wing` set to
    // mistral's, each left the suite green.
    // Derived now rather than hand-picked, so these are the values paletteFor
    // produces — pinned as literals on purpose. Importing paletteFor here would
    // make the assertion compare the function to itself and pass for any
    // palette at all, which is the same defect this test already carries two
    // probes against.
    const PALETTE = {
      gemini: { body: "hsl(309 62% 74%)", dark: "hsl(309 66% 31%)", wing: "hsl(309 26% 86%)" },
      mistral: { body: "hsl(225 62% 47%)", dark: "hsl(225 66% 20%)", wing: "hsl(225 26% 86%)" },
      ollama: { body: "hsl(39 62% 74%)", dark: "hsl(39 66% 31%)", wing: "hsl(39 26% 86%)" },
    } as const;
    // Finder and skeptic from the same finder_provider, so the whole bee is one
    // palette and a foreign colour anywhere is a real fault. A bee judged by
    // another finder_provider is two-toned by design — that is the next describe block,
    // and mixing the two here would make this assertion untestable.
    const FINDER = {
      gemini: "gemini-2.5-flash",
      mistral: "mistral-medium-latest",
      ollama: "qwen2.5-coder:7b",
    } as const;
    const SKEPTIC = {
      gemini: "gemini-3.5-flash",
      mistral: "mistral-medium-latest",
      ollama: "qwen3:8b",
    } as const;

    for (const provider of Object.keys(PALETTE) as (keyof typeof PALETTE)[]) {
      const svg = avatarSvg({
        ...base,
        finder_provider: provider,
        skeptic_provider: provider,
        finder_model: FINDER[provider],
        skeptic_model: SKEPTIC[provider],
      });
      for (const [channel, hex] of Object.entries(PALETTE[provider])) {
        expect(svg, `${provider} should paint its ${channel} ${hex}`).toContain(hex);
      }
      // Nine distinct colours, and none is a substring of another: every one
      // starts at "hsl(" and the digits that follow differ, so a foreign colour
      // found in the document is a real one rather than an accident of matching.
      for (const other of Object.keys(PALETTE) as (keyof typeof PALETTE)[]) {
        if (other === provider) continue;
        for (const [channel, hex] of Object.entries(PALETTE[other])) {
          expect(svg, `${provider} must not paint ${other}'s ${channel} ${hex}`).not.toContain(hex);
        }
      }
    }
  });

  it("marks a different Guardian revision as a different generation", () => {
    const a = countOf(avatarSvg(base), /class="hm-band"/g);
    const b = countOf(
      avatarSvg({ ...base, review_fingerprint: "1ecd9629f46cab10b907dae285d0f58b0eef5e21" }),
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
    [...svg.matchAll(/<ellipse cx="[\d.]+" cy="[\d.]+" rx="([\d.]+)" ry="([\d.]+)"[^>]*fill="hsl\(309 62% 74%\)"/g)].map(
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

describe("the provider is read, not derived", () => {
  it("paints from the stated provider, not from the model name", () => {
    // The reverse of what this asserted until the prefix table was deleted.
    // Deriving the palette from the model name meant guessing a vendor, and the
    // guess refused codellama, mixtral, gemma3 and four others outright. The
    // producer states it now, so two genomes with the same finder model and
    // different stated providers are different reviewers and look it.
    const asGemini = { ...base, finder_provider: "gemini", finder_model: "mistral-medium-latest" };
    const asMistral = { ...base, finder_provider: "mistral", finder_model: "mistral-medium-latest" };
    expect(drawing(avatarSvg(asGemini))).not.toBe(drawing(avatarSvg(asMistral)));
  });

  it("renders a model the old prefix table would have refused", () => {
    // The whole of #15: providerOf("codellama:13b") threw and stopped the
    // pipeline, because "codellama" does not start with "llama".
    const exotic = {
      ...base,
      finder_provider: "ollama",
      finder_model: "codellama:13b",
      skeptic_provider: "anthropic",
      skeptic_model: "claude-sonnet-5",
    };
    const svg = avatarSvg(exotic);
    expect(svg).toContain(paletteFor("ollama").body);
    expect(svg).toContain(paletteFor("anthropic").body);
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

  it("no longer refuses a model it cannot place, because it no longer places any", () => {
    // This asserted a throw until the prefix table was deleted. gpt-4o was
    // unclassifiable and therefore fatal; now the producer says which vendor it
    // is and the renderer takes its word.
    expect(() => avatarSvg({ ...base, finder_provider: "openai", finder_model: "gpt-4o" })).not.toThrow();
  });
});

describe("the bee wears its judge", () => {
  const withSkeptic = (finder: string, skeptic: string | null): Genome => ({
    ...base,
    finder_provider: familyOf(finder),
    // Set explicitly, not inherited from `base`. The palette reads this field
    // now rather than deriving it from the model, so a helper that left it
    // behind would paint every abdomen with base's provider and quietly make
    // the two-toned assertions meaningless.
    skeptic_provider: skeptic === null ? null : familyOf(skeptic),
    finder_model: finder,
    skeptic_model: skeptic,
  });

  it("is two-toned when another provider judged it", () => {
    const svg = avatarSvg(withSkeptic("gemini-2.5-flash", "mistral-medium-latest"));
    const head = paletteFor("gemini").body;
    const abdomen = paletteFor("mistral").body;
    expect(svg).toContain(head);
    expect(svg).toContain(abdomen);
    expect(head).not.toBe(abdomen);
  });

  it("is one colour when it graded its own work", () => {
    // Not a separate code path: same finder_provider, same palette, and the visual
    // state falls out of the rule rather than out of a branch.
    const svg = avatarSvg(withSkeptic("mistral-medium-latest", "mistral-medium-latest"));
    expect(svg).toContain(paletteFor("mistral").body);
    expect(svg).not.toContain(paletteFor("gemini").body);
  });

  it("has a colourless abdomen when nobody judged it", () => {
    const svg = avatarSvg(withSkeptic("gemini-2.5-flash", null));
    expect(svg).toContain(UNJUDGED.body);
    expect(svg).toContain(paletteFor("gemini").body);
  });

  it("keeps the wings with the finder, because the bee belongs to it", () => {
    const svg = avatarSvg(withSkeptic("gemini-2.5-flash", "mistral-medium-latest"));
    expect(svg).toContain(paletteFor("gemini").wing);
    expect(svg).not.toContain(paletteFor("mistral").wing);
  });

  it("bands the abdomen in the skeptic's dark, not the finder's", () => {
    const svg = avatarSvg(withSkeptic("gemini-2.5-flash", "mistral-medium-latest"));
    expect(svg).toContain(`fill="${paletteFor("mistral").dark}"`);
  });

  it("says in the label what the colour says", () => {
    // A screen reader gets the same fact the two tones carry.
    expect(avatarSvg(withSkeptic("gemini-2.5-flash", "mistral-medium-latest"))).toContain("judged by mistral");
    expect(avatarSvg(withSkeptic("mistral-medium-latest", "mistral-medium-latest"))).toContain("grading its own work");
    expect(avatarSvg(withSkeptic("gemini-2.5-flash", null))).toContain("judged by nobody");
  });
});
