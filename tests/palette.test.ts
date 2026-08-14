import { describe, expect, it } from "vitest";
import { paletteFor, UNJUDGED } from "../src/palette.js";

describe("paletteFor", () => {
  it("is deterministic", () => {
    expect(paletteFor("gemini")).toEqual(paletteFor("gemini"));
  });

  it("gives different providers different palettes", () => {
    expect(paletteFor("gemini").body).not.toBe(paletteFor("mistral").body);
  });

  it("does not depend on which other providers exist", () => {
    // The whole reason hue comes from the name rather than from a position in a
    // sorted list: adding kimi must not repaint gemini, or two renderings of one
    // bee disagree because of an unrelated third party.
    const before = paletteFor("gemini");
    for (const other of ["kimi", "grok", "claude", "gpt", "glm"]) paletteFor(other);
    expect(paletteFor("gemini")).toEqual(before);
  });

  it("keeps saturation fixed so a bee still reads as a bee", () => {
    const saturations = ["gemini", "mistral", "ollama", "kimi", "grok"].map(
      (p) => /hsl\(\d+ (\d+)%/.exec(paletteFor(p).body)![1],
    );
    expect(new Set(saturations).size).toBe(1);
  });

  it("tells every provider we expect apart from every other", () => {
    // Hue alone is probabilistic, so lightness is drawn from a different part of
    // the digest. This asserts the property on the names that will actually
    // exist rather than on an arbitrary count: at 200 synthetic providers
    // collisions are unavoidable for any scheme that keeps hue stable per name,
    // and asserting a rate there measures the birthday problem, not this code.
    //
    // Adding a provider means adding it here. That is a deliberate checkpoint:
    // if a new name is indistinguishable from an existing one, this is where it
    // gets noticed, and the lightness steps are the knob.
    const expected = [
      "gemini", "mistral", "ollama", "glm", "deepseek",
      "qwen", "kimi", "gpt", "grok", "claude",
    ];
    const parsed = expected.map((name) => {
      const [, h, , l] = /hsl\((\d+) (\d+)% (\d+)%/.exec(paletteFor(name).body)!;
      return { name, hue: Number(h), light: Number(l) };
    });

    const indistinguishable = parsed.filter((a, i) =>
      parsed.some((b, j) => j !== i && Math.abs(a.hue - b.hue) < 8 && a.light === b.light),
    );
    expect(indistinguishable.map((p) => p.name)).toEqual([]);
  });

  it("gives an unjudged abdomen a colourless palette", () => {
    expect(/hsl\(0 0%/.test(UNJUDGED.body)).toBe(true);
  });
});
