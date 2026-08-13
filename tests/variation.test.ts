import { describe, expect, it } from "vitest";
import { MORPHOLOGY, type CharacterName } from "../src/morphology.js";
import { DRIVEN_BY, characterMm } from "../src/variation.js";
import type { Genome } from "../src/types.js";

const base: Genome = {
  schema_version: 1,
  known_fields: ["context_mode", "finder_model", "guardian_version", "provider", "skeptic_model"],
  provider: "gemini",
  finder_model: "gemini-2.5-flash",
  skeptic_model: "gemini-3.5-flash",
  context_mode: "graph",
  guardian_version: "d0d807ef01c556b882dc85b9fc0d2851d92aa1e5",
};

const names = Object.keys(MORPHOLOGY) as CharacterName[];

/** Many genomes, so no property below can pass by luck of one fixture. */
function* genomes(): Generator<Genome> {
  const finders = [
    "gemini-2.5-flash",
    "gemini-3.5-pro",
    "mistral-medium-latest",
    "qwen2.5-coder:7b",
    "llama3.1:70b",
  ];
  const skeptics = [null, "gemini-3.5-flash", "mistral-medium-latest"];
  const modes = ["graph", "diff-only"] as const;
  const versions = [
    "d0d807ef01c556b882dc85b9fc0d2851d92aa1e5",
    "1ecd9629f46cab10b907dae285d0f58b0eef5e21",
    "0000000000000000000000000000000000000000",
  ];
  for (const finder_model of finders)
    for (const skeptic_model of skeptics)
      for (const context_mode of modes)
        for (const guardian_version of versions)
          yield { ...base, finder_model, skeptic_model, context_mode, guardian_version };
}

describe("a character stays inside what was published", () => {
  it("never leaves its range, for any genome", () => {
    for (const genome of genomes()) {
      for (const name of names) {
        const { range, mm } = MORPHOLOGY[name];
        const value = characterMm(name, genome);
        if (range === null) {
          expect(value).toBe(mm);
        } else {
          expect(value).toBeGreaterThanOrEqual(range[0]);
          expect(value).toBeLessThanOrEqual(range[1]);
        }
      }
    }
  });

  it("reaches both ends of a range across the space of slot values", () => {
    // A variation stuck on one value would pass every bound check above. What
    // is asserted here is a property of the mapping over the space of strings a
    // slot can hold, not of any handful of fixtures: an earlier version sampled
    // five finder models, found nothing in the top quartile, and was measuring
    // its own sample size rather than the function.
    //
    // Only characters on an open-ended slot can be asked this. `context_mode`
    // holds two values, so the wing characters take exactly two values ever —
    // by construction, not by defect.
    const many = Array.from({ length: 200 }, (_, i) => ({ ...base, finder_model: `model-${i}` }));
    const seen = many.map((g) => characterMm("headHeight", g));
    const [low, high] = MORPHOLOGY.headHeight.range!;
    const span = high - low;
    expect(Math.min(...seen)).toBeLessThan(low + span * 0.05);
    expect(Math.max(...seen)).toBeGreaterThan(high - span * 0.05);
  });

  it("gives the wing characters exactly as many values as the slot has", () => {
    // Stated so it is a known consequence rather than a surprise: wings are
    // driven by context_mode, which is binary, so a wing has two builds. The
    // continuous range is real; the number of points drawn from it is not.
    const values = new Set(
      (["graph", "diff-only"] as const).map((context_mode) =>
        characterMm("forewingLength", { ...base, context_mode }),
      ),
    );
    expect(values.size).toBe(2);
  });
});

describe("variation is a function of one slot", () => {
  it("is deterministic", () => {
    for (const name of names) {
      expect(characterMm(name, base)).toBe(characterMm(name, { ...base }));
    }
  });

  it("changes a character only when its own slot changes", () => {
    // Locality is what makes a body heritable: a child that inherited one slot
    // must inherit exactly the part that slot builds, and nothing else.
    const changed: Record<string, Genome> = {
      finder_model: { ...base, finder_model: "mistral-medium-latest" },
      skeptic_model: { ...base, skeptic_model: "mistral-medium-latest" },
      context_mode: { ...base, context_mode: "diff-only" },
      guardian_version: { ...base, guardian_version: "1ecd9629f46cab10b907dae285d0f58b0eef5e21" },
    };
    for (const name of names) {
      if (MORPHOLOGY[name].range === null) continue;
      for (const [slot, genome] of Object.entries(changed)) {
        if (slot === DRIVEN_BY[name]) continue;
        expect(characterMm(name, genome)).toBe(characterMm(name, base));
      }
    }
  });

  it("moves a character when its own slot changes", () => {
    const varying = names.filter((n) => MORPHOLOGY[n].range !== null);
    expect(varying.length).toBeGreaterThan(0);
    for (const name of varying) {
      const slot = DRIVEN_BY[name];
      const other =
        slot === "context_mode"
          ? "diff-only"
          : slot === "skeptic_model"
            ? "mistral-medium-latest"
            : "something-else-entirely";
      const moved = { ...base, [slot]: other } as Genome;
      expect(characterMm(name, moved)).not.toBe(characterMm(name, base));
    }
  });

  it("takes the base measurement when the slot is null", () => {
    // A reviewer with no skeptic has no stinger and no abdomen of its own:
    // one absence told once, not two facts.
    const noSkeptic = { ...base, skeptic_model: null };
    for (const name of names) {
      if (DRIVEN_BY[name] !== "skeptic_model") continue;
      expect(characterMm(name, noSkeptic)).toBe(MORPHOLOGY[name].mm);
    }
  });

  it("reads no field outside its own slot", () => {
    // Nothing from the track record can reach a body, and neither can genome
    // bookkeeping: schema_version and known_fields are not anatomy.
    const noisy = {
      ...base,
      schema_version: 99,
      known_fields: ["provider"],
      provider: "ollama" as const,
    };
    for (const name of names) {
      expect(characterMm(name, noisy)).toBe(characterMm(name, base));
    }
  });
});

describe("every character is driven by exactly one slot", () => {
  it("assigns a slot to every character", () => {
    for (const name of names) {
      expect(DRIVEN_BY[name]).toBeTypeOf("string");
    }
  });
});
