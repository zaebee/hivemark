# Measured Morphology and Individual Variation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the bee's hand-chosen `RATIO` table with published measurements of *Apis mellifera* workers, and give each identity its own build by hashing individual genome slots.

**Architecture:** Three modules with one job each. `morphology.ts` holds measured characters in millimetres with a citation per value and a published range per varying character. `variation.ts` turns one genome slot into one character's millimetres, reading a fixed byte of that slot's keccak digest. `body.ts` composes the two with the drawing conventions nobody measured, and emits absolute coordinates so `avatar.ts` invents none.

**Tech Stack:** TypeScript, bun (runs sources directly, `.js` import specifiers), vitest, viem (`keccak256`, `toHex` — already a dependency).

**Spec:** `docs/superpowers/specs/2026-08-12-morphology-design.md`

## Global Constraints

- **Proportions read the genome and never the track record.** No `confirmed`, `refuted` or `impact_score` may reach any module in this plan. The constraint is from the design's §Badge.
- **A measurement carries a citation.** Any number in `morphology.ts` without a source key is a bug, enforced by a test.
- **A character varies only with two published means.** One source means one value and no range, enforced by a test.
- **Drawing conventions are marked as conventions.** Anything in `DRAWING` is explicitly not a measurement, and none of it varies between bees.
- **Determinism survives.** Identical genomes render byte-identical SVG; existing tests assert this and must keep passing.
- Test command: `bun run test`. Type check: `bun run typecheck`. Both must pass before each commit.
- Work on branch `feat/morphology`, which already exists and carries the spec commit.

## Reference: the numbers this plan installs

Primary source, Pathania A, Kumar A, Dhiman S (2022), *JEZS* 10(3):105–109, worker row of Tables 1 and 2, in millimetres:

| character | mm | published range | second source |
|---|---|---|---|
| headHeight | 2.45 | 2.45 – 3.19 | Sharma 1990 |
| headWidth | 3.62 | 3.62 – 3.78 | Sharma 1990 |
| thoraxLength | 3.72 | none | — |
| abdomenLength | 6.63 | none | — |
| forewingLength | 9.27 | 7.64 – 9.70 | Dyer & Seeley 1987 |
| forewingWidth | 2.98 | none | — |
| hindwingLength | 6.20 | 6.20 – 6.43 | Sharma 1990 |
| hindwingWidth | 1.82 | 1.82 – 1.925 | Sharma 1990 |

Drawing conventions, converted from today's `RATIO` at the current scale (head radius 26 user units ↔ 1.81 mm, so 1 unit ↔ 0.0696 mm) so the refactor does not silently restyle the bee:

| convention | mm or fraction | was |
|---|---|---|
| `antennaSpaceMm` | 1.810 | `antennaSpace: 1.0` |
| `antennaReachMm` | 1.410 | `antennaReach: 0.78` |
| `antennaSpreadMm` | 2.080 | `antennaSpread: 1.15` |
| `antennaTipMm` | 0.244 | `antennaTip: 0.135` |
| `antennaRootOffsetMm` | 0.832 | `antennaRootOffset: 0.46` |
| `antennaControlOffsetMm` | 1.410 | `antennaControlOffset: 0.78` |
| `antennaControlDropMm` | 0.543 | `antennaControlDrop: 0.3` |
| `headThoraxOverlapMm` | 0.181 | `headThoraxOverlap: 0.1` |
| `thoraxAbdomenOverlapMm` | 0.905 | `thoraxAbdomenOverlap: 0.5` |
| `stingerLengthMm` | 1.540 | `stingerLength: 0.85` |
| `stingerHalfWidthMm` | 0.489 | `stingerHalfWidth: 0.27` |
| `rearWingDropMm` | 1.123 | `rearWingDrop: 0.62` |
| `eyeOffsetMm` | 0.832 | `eyeOffset: 0.46` |
| `eyeRiseMm` | 0.145 | `eyeRise: 0.08` |
| `eyeRoundMm` | 0.489 | `eyeRound: 0.27` |
| `eyeWideRxMm` | 0.697 | `eyeWideRx: 0.385` |
| `eyeWideRyMm` | 0.489 | `eyeWideRy: 0.27` |
| `eyeNarrowRxMm` | 0.344 | `eyeNarrowRx: 0.19` |
| `eyeNarrowRyMm` | 0.634 | `eyeNarrowRy: 0.35` |
| `strokeWidthMm` | 0.174 | `strokeWidth: 0.096` |
| `marginMm` | 0.507 | `margin: 0.28` |
| `thoraxWidthOfLength` | 1.087 | `thoraxRx/thoraxRy` |
| `abdomenWidthOfLength` | 0.711 | `abdomenRx/abdomenRy` |
| `wingAttach` | 0.35 | unchanged |
| `wingClear` | 0.5 | unchanged |
| `bandSpan` | 0.62 | unchanged |
| `wingOpacity` | 0.75 | unchanged |
| `rearWingOpacity` | 0.55 | unchanged |

`thoraxWidthOfLength` and `abdomenWidthOfLength` are the two widths the primary source does not measure. They are conventions, expressed as a fraction of the measured length so they scale with it.

### Pre-flight: the geometry was computed before it was planned

These conventions were run against the formulas in Task 4 at both ends of every
published range, rather than argued about. Results, in millimetres:

| | low end | high end |
|---|---|---|
| head–thorax overlap | 0.181 | 0.181 |
| thorax–abdomen overlap | 0.905 | 0.905 |
| antenna reaches to y | 0.400 | 0.400 |
| eyes fit the head (both shapes) | yes | yes |
| body length | 12.80 | 13.54 |
| canvas | 16.52 × 15.57 | 19.61 × 16.31 |

Every invariant Task 4 tests already holds, so a failure there is a real defect
rather than a convention that was never going to fit. The aspect ratio moves
from today's tall-and-narrow to 1.06–1.20 — slightly wider than tall.

**One prediction to check against the plate, not to design around.** Measured forewings are long — 9.27 mm against a 12.80 mm body — so the badge will read wider and more spread-winged than today. If it reads badly, the convention to adjust is `wingClear` (how far a wing clears the body it attaches to), which no one measured. Adjusting a measured character to make the picture nicer is the one move this whole change exists to prevent.

---

### Task 1: Verify the secondary citations, and try to widen the corpus

Every range above rests on values read through Pathania et al.'s discussion rather than from the originals. The spec flags them provisional; this task resolves what it can and records the rest.

**Files:**
- Create: `docs/morphology-sources.md`

**Interfaces:**
- Produces: the verified table that Task 2 encodes. No code.

- [ ] **Step 1: Attempt the originals**

For each of the three secondary values, try to reach the original and compare:

| value | claim to check | where |
|---|---|---|
| head height 3.19, head width 3.78 | Sharma SK (1990), M.Sc. thesis, HPKV Palampur | unpublished thesis; likely unreachable |
| forewing length 9.33 | Ruttner F (2013), *Biogeography and Taxonomy of Honeybees*, Springer | book |
| forewing length 7.64–9.70 | Dyer FC & Seeley TD (1987), *J Exp Biol* 127:1–26 | open archive at journals.biologists.com |
| hindwing 6.43 × 1.925 | Sharma SK (1990) | as above |

Three outcomes, and they are not the same outcome:

- **Verified** — the original says this. Keep the value, drop the "read through" caveat.
- **Contradicted** — the original says something else. The value is wrong: remove it, and the character loses its range and stops varying.
- **Unreachable** — the original could not be opened. Keep the value with the caveat intact. Being unable to check is not evidence against a number, and the spec already labels these provisional.

- [ ] **Step 2: Search for a second mean for thorax length and abdomen length**

These two are the largest masses in the silhouette and currently cannot vary, because Pathania et al. state theirs is the first published measurement of them for this population. Search for any other published mean for *A. mellifera* **workers**, for example:

```
"Apis mellifera" worker morphometry "abdomen length" mean mm
"Apis mellifera" worker "thorax length" morphometric characters table
Apis mellifera syriaca / jemenitica / Kwara Nigeria morphometrics abdomen thorax
```

Accept a value only if: *A. mellifera* (not *cerana*, not *florea*), workers (not queens or drones), a mean in millimetres, and a character defined the same way. Record every search tried, including the ones that found nothing — a failed search recorded is what makes "no second measurement exists" a finding rather than a shrug.

- [ ] **Step 3: Write `docs/morphology-sources.md`**

One row per character: value, source key, verification outcome, and for a range, both endpoints with their sources. Include the searches from Step 2 verbatim. State at the top that this file is the input to `src/morphology.ts` and that the two must agree.

- [ ] **Step 4: Commit**

```bash
git add docs/morphology-sources.md
git commit -m "docs: verify the morphology citations, and record what could not be verified"
```

---

### Task 2: `src/morphology.ts` — the measured characters

**Files:**
- Create: `src/morphology.ts`
- Test: `tests/morphology.test.ts`

**Interfaces:**
- Consumes: the table settled in Task 1.
- Produces:
  - `type CharacterName = "headHeight" | "headWidth" | "thoraxLength" | "abdomenLength" | "forewingLength" | "forewingWidth" | "hindwingLength" | "hindwingWidth"`
  - `type SourceKey = keyof typeof SOURCES`
  - `interface Character { readonly mm: number; readonly range: readonly [low: number, high: number] | null; readonly sources: readonly SourceKey[] }`
  - `const MORPHOLOGY: Record<CharacterName, Character>`
  - `const SOURCES: Record<string, string>`
  - `const BODY_LENGTH_MM: readonly [number, number]`

- [ ] **Step 1: Write the failing test**

Create `tests/morphology.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { BODY_LENGTH_MM, MORPHOLOGY, SOURCES, type CharacterName } from "../src/morphology.js";

const names = Object.keys(MORPHOLOGY) as CharacterName[];

describe("every number is attributable", () => {
  it("cites at least one published source per character", () => {
    for (const name of names) {
      expect(MORPHOLOGY[name].sources.length).toBeGreaterThan(0);
    }
  });

  it("resolves every source key to a full citation", () => {
    for (const name of names) {
      for (const key of MORPHOLOGY[name].sources) {
        expect(SOURCES[key]).toBeTypeOf("string");
        expect(SOURCES[key]!.length).toBeGreaterThan(40);
      }
    }
  });
});

describe("a character varies only when the literature disagrees", () => {
  it("gives a range exactly to the characters with two or more sources", () => {
    // The rule the whole design rests on: one measurement is a value, not a
    // range. A range invented from a single paper would be taste wearing a
    // citation.
    for (const name of names) {
      const { range, sources } = MORPHOLOGY[name];
      expect(range === null).toBe(sources.length < 2);
    }
  });

  it("orders every range and contains the primary mean inside it", () => {
    for (const name of names) {
      const { range, mm } = MORPHOLOGY[name];
      if (range === null) continue;
      const [low, high] = range;
      expect(low).toBeLessThan(high);
      expect(mm).toBeGreaterThanOrEqual(low);
      expect(mm).toBeLessThanOrEqual(high);
    }
  });
});

describe("the model is still an animal", () => {
  it("sums the segment lengths into the published body length", () => {
    // A cheap standing check: three characters that were measured separately
    // must still add up to a bee. If a future edit drifts, this fails.
    const total =
      MORPHOLOGY.headHeight.mm + MORPHOLOGY.thoraxLength.mm + MORPHOLOGY.abdomenLength.mm;
    expect(total).toBeGreaterThanOrEqual(BODY_LENGTH_MM[0]);
    expect(total).toBeLessThanOrEqual(BODY_LENGTH_MM[1]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `bun run test tests/morphology.test.ts`
Expected: FAIL — `Cannot find module '../src/morphology.js'`.

- [ ] **Step 3: Write `src/morphology.ts`**

Adjust the table to whatever Task 1 settled; the code below encodes the pre-verification state.

```ts
/**
 * Measured morphology of the worker Apis mellifera, in millimetres.
 *
 * Every number here is a claim about an animal and carries a citation, which is
 * the entire point of the module: `abdomenLength: 6.63` can be checked against a
 * paper, where the `abdomenRy: 2.25` it replaces could only be checked against
 * someone's taste.
 *
 * Nothing here knows it will be drawn. Conventions of the drawing — overlaps,
 * margins, the curve of an antenna — live in `body.ts` and are marked as
 * conventions, because nobody measured them and nobody will.
 */

export const SOURCES = {
  "pathania-2022":
    "Pathania A, Kumar A, Dhiman S (2022). Morphometrics of Apis mellifera in " +
    "North-Western Himalayan region of Himachal Pradesh, India. Journal of " +
    "Entomology and Zoology Studies 10(3):105-109. doi:10.22271/j.ento.2022.v10.i3b.8997",
  "sharma-1990":
    "Sharma SK (1990). Biometric and developmental biology of Apis mellifera L. " +
    "workers. M.Sc. thesis, Department of Entomology, HPKV, Palampur, India.",
  "dyer-seeley-1987":
    "Dyer FC, Seeley TD (1987). Interspecific comparisons of endothermy in " +
    "honey-bees (Apis): deviations from the expected size-related patterns. " +
    "Journal of Experimental Biology 127:1-26.",
} as const;

export type SourceKey = keyof typeof SOURCES;

export type CharacterName =
  | "headHeight"
  | "headWidth"
  | "thoraxLength"
  | "abdomenLength"
  | "forewingLength"
  | "forewingWidth"
  | "hindwingLength"
  | "hindwingWidth";

export interface Character {
  /** The primary source's mean for a worker. */
  readonly mm: number;
  /**
   * Smallest and largest published mean, or null when only one exists.
   *
   * The bound is the spread of the literature rather than a standard deviation:
   * the primary source reports a pooled standard error, not a dispersion, and
   * converting one into the other would invent precision. Every value inside
   * this interval was reported by somebody about a real bee.
   */
  readonly range: readonly [low: number, high: number] | null;
  readonly sources: readonly SourceKey[];
}

export const MORPHOLOGY: Record<CharacterName, Character> = {
  headHeight: { mm: 2.45, range: [2.45, 3.19], sources: ["pathania-2022", "sharma-1990"] },
  headWidth: { mm: 3.62, range: [3.62, 3.78], sources: ["pathania-2022", "sharma-1990"] },
  // Pathania et al. state theirs is the first published measurement of thorax
  // and abdomen length for this population, so there is no second mean to bound
  // a range with. These do not vary until one exists — see the spec's
  // "The corpus is thin", which records that outcome in advance.
  thoraxLength: { mm: 3.72, range: null, sources: ["pathania-2022"] },
  abdomenLength: { mm: 6.63, range: null, sources: ["pathania-2022"] },
  forewingLength: { mm: 9.27, range: [7.64, 9.70], sources: ["pathania-2022", "dyer-seeley-1987"] },
  forewingWidth: { mm: 2.98, range: null, sources: ["pathania-2022"] },
  hindwingLength: { mm: 6.20, range: [6.20, 6.43], sources: ["pathania-2022", "sharma-1990"] },
  hindwingWidth: { mm: 1.82, range: [1.82, 1.925], sources: ["pathania-2022", "sharma-1990"] },
};

/**
 * Worker body length, as a sanity bound rather than a drawn dimension.
 *
 * Weaker than everything above it: taken from reference material rather than a
 * measurement paper, and marked so rather than left looking equally solid.
 */
export const BODY_LENGTH_MM: readonly [number, number] = [10, 15];
```

- [ ] **Step 4: Run the tests and the type check**

Run: `bun run test tests/morphology.test.ts && bun run typecheck`
Expected: PASS, 5 tests.

- [ ] **Step 5: Prove the range rule is really guarded**

Temporarily give `thoraxLength` a `range: [3.5, 3.9]` while leaving its single source. Run `bun run test tests/morphology.test.ts`.
Expected: FAIL on "gives a range exactly to the characters with two or more sources". Revert the edit and confirm the suite is green again.

- [ ] **Step 6: Commit**

```bash
git add src/morphology.ts tests/morphology.test.ts
git commit -m "feat: the bee's proportions as measured characters, each cited"
```

---

### Task 3: `src/variation.ts` — one slot, one character

**Files:**
- Create: `src/variation.ts`
- Test: `tests/variation.test.ts`

**Interfaces:**
- Consumes: `MORPHOLOGY`, `CharacterName` from Task 2.
- Produces:
  - `type Slot = "finder_model" | "skeptic_model" | "context_mode" | "guardian_version"`
  - `const DRIVEN_BY: Record<CharacterName, Slot>`
  - `function characterMm(name: CharacterName, genome: Genome): number`

- [ ] **Step 1: Write the failing test**

Create `tests/variation.test.ts`:

```ts
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
  const finders = ["gemini-2.5-flash", "gemini-3.5-pro", "mistral-medium-latest", "qwen2.5-coder:7b", "llama3.1:70b"];
  const skeptics = [null, "gemini-3.5-flash", "mistral-medium-latest"];
  const modes = ["graph", "diff-only"] as const;
  const versions = ["d0d807ef01c556b882dc85b9fc0d2851d92aa1e5", "1ecd9629f46cab10b907dae285d0f58b0eef5e21", "0000000000000000000000000000000000000000"];
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

  it("reaches both ends of a range across enough genomes", () => {
    // A variation that never moves would pass every bound check above. This is
    // the test that would catch a byte window stuck on one value.
    const seen = [...genomes()].map((g) => characterMm("headHeight", g));
    const [low, high] = MORPHOLOGY.headHeight.range!;
    const span = high - low;
    expect(Math.min(...seen)).toBeLessThan(low + span * 0.25);
    expect(Math.max(...seen)).toBeGreaterThan(high - span * 0.25);
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
        slot === "context_mode" ? "diff-only" : slot === "skeptic_model" ? "mistral-medium-latest" : "something-else-entirely";
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
    const noisy = { ...base, schema_version: 99, known_fields: ["provider"], provider: "ollama" as const };
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
```

- [ ] **Step 2: Run it and watch it fail**

Run: `bun run test tests/variation.test.ts`
Expected: FAIL — `Cannot find module '../src/variation.js'`.

- [ ] **Step 3: Write `src/variation.ts`**

```ts
import { keccak256, toHex } from "viem";
import { MORPHOLOGY, type CharacterName } from "./morphology.js";
import type { Genome } from "./types.js";

/**
 * Individual variation, derived from the genome's slots one at a time.
 *
 * Each character reads a fixed byte of the keccak digest of a single genome
 * field. Hashing the fields separately rather than the whole genome is what
 * makes a body heritable: change one slot and only the part that slot builds
 * moves, so an offspring that inherited a parent's finder has that parent's
 * head exactly.
 *
 * What this cannot do, and no implementation could: interpolate. A hash has no
 * order, so a child of two parents gets a third value for any character, never
 * a value between theirs. The design spec strikes the earlier claim that it
 * would.
 *
 * The genome is the only input. Nothing from the track record reaches here,
 * because a body that answered to confirmations would show a fixed identity as
 * mutable.
 */

export type Slot = "finder_model" | "skeptic_model" | "context_mode" | "guardian_version";

/**
 * Which slot builds which part.
 *
 * No new associations are invented: the body already reads these four slots as
 * discrete traits — eyes from the finder, the rear wing pair from the context
 * mode, the stinger from the skeptic, band count from the Guardian revision —
 * and the continuous characters follow the same map.
 */
export const DRIVEN_BY: Record<CharacterName, Slot> = {
  headHeight: "finder_model",
  headWidth: "finder_model",
  thoraxLength: "guardian_version",
  abdomenLength: "skeptic_model",
  forewingLength: "context_mode",
  forewingWidth: "context_mode",
  hindwingLength: "context_mode",
  hindwingWidth: "context_mode",
};

/**
 * The byte of its slot's digest each character reads.
 *
 * Distinct per character so two parts of one region do not move in lockstep —
 * a head that grew taller and wider together would be a scale change wearing
 * the costume of two characters.
 */
const BYTE: Record<CharacterName, number> = {
  headHeight: 0,
  headWidth: 1,
  thoraxLength: 2,
  abdomenLength: 3,
  forewingLength: 4,
  forewingWidth: 5,
  hindwingLength: 6,
  hindwingWidth: 7,
};

/** One character's value for one genome, in millimetres. */
export function characterMm(name: CharacterName, genome: Genome): number {
  const character = MORPHOLOGY[name];
  if (character.range === null) return character.mm;

  const slot = genome[DRIVEN_BY[name]];
  // An absent slot builds nothing, so its region keeps the base measurement.
  if (slot === null) return character.mm;

  const digest = keccak256(toHex(slot));
  const at = 2 + BYTE[name] * 2; // skip "0x", two hex chars per byte
  const byte = Number.parseInt(digest.slice(at, at + 2), 16);

  const [low, high] = character.range;
  return low + (byte / 255) * (high - low);
}
```

- [ ] **Step 4: Run the tests and the type check**

Run: `bun run test tests/variation.test.ts && bun run typecheck`
Expected: PASS, 8 tests.

- [ ] **Step 5: Prove locality is really guarded**

Temporarily change `DRIVEN_BY.headHeight` to `"guardian_version"` while leaving `headWidth` on `finder_model`. Run `bun run test tests/variation.test.ts`.
Expected: FAIL on "changes a character only when its own slot changes". Revert and confirm green.

Then temporarily make `characterMm` hash the whole genome — `keccak256(toHex(JSON.stringify(genome)))` — instead of one slot.
Expected: FAIL on both "changes a character only when its own slot changes" and "reads no field outside its own slot". This is the test that a digest-derived body could not be inherited. Revert and confirm green.

- [ ] **Step 6: Commit**

```bash
git add src/variation.ts tests/variation.test.ts
git commit -m "feat: individual variation from one genome slot at a time"
```

---

### Task 4: `src/body.ts` on measured morphology, with variation wired in

The plan does not stage this in two commits. `bodyPlan` reads `characterMm`, which returns the base value for every character with no range, so a version "without variation" would differ only by a function call — not a deliverable a reviewer could accept or reject on its own.

**Files:**
- Modify: `src/body.ts` (whole file)
- Modify: `tests/body.test.ts`

**Interfaces:**
- Consumes: `characterMm` (Task 3), `MORPHOLOGY` (Task 2).
- Produces the new `BodyPlan`, which Task 5 renders:

```ts
export interface BodyPlan {
  readonly unit: number;        // user units per millimetre
  readonly width: number;
  readonly height: number;
  readonly axis: number;
  readonly strokeWidth: number;

  readonly head: { cy: number; rx: number; ry: number };   // was { cy, r }
  readonly thorax: { cy: number; rx: number; ry: number };
  readonly abdomen: { cy: number; rx: number; ry: number };
  readonly wing: { cy: number; rx: number; ry: number; offset: number };      // was reach
  readonly rearWing: { cy: number; rx: number; ry: number; offset: number } | null;
  readonly stinger: { from: number; to: number; halfWidth: number } | null;
  readonly antenna: {
    fromY: number; toY: number; spread: number; tip: number;
    rootDx: number; controlDx: number; controlY: number;
  };
  readonly eye: { dx: number; cy: number; rx: number; ry: number };  // replaces `eyes`
  readonly bands: number;
}
export { DRAWING };   // replaces the RATIO export
```

`offset` is the distance from the axis to a wing's centre, so the renderer adds it rather than recomputing a clearance. `eye` carries final radii, so the `EYE_SHAPE` table moves out of `avatar.ts`.

- [ ] **Step 1: Write the failing tests**

Replace `tests/body.test.ts` with the version below. It keeps the existing properties, renames what the interface renamed, and adds the extremes.

```ts
import { describe, expect, it } from "vitest";
import { bodyPlan } from "../src/body.js";
import { BODY_LENGTH_MM, MORPHOLOGY } from "../src/morphology.js";
import type { Genome } from "../src/types.js";

const genome: Genome = {
  schema_version: 1,
  known_fields: ["context_mode", "finder_model", "guardian_version", "provider", "skeptic_model"],
  provider: "gemini",
  finder_model: "gemini-2.5-flash",
  skeptic_model: "gemini-3.5-flash",
  context_mode: "graph",
  guardian_version: "d0d807ef01c556b882dc85b9fc0d2851d92aa1e5",
};

/**
 * Bodies across the whole trait space, not one fixture.
 *
 * The gap this closes has caught us three times: a property is described in the
 * spec, listed in the plan, and then never exercised because the single fixture
 * made the case unreachable.
 */
function* plans() {
  const finders = ["gemini-2.5-flash", "gemini-3.5-pro", "mistral-medium-latest", "qwen2.5-coder:7b", "llama3.1:70b"];
  const skeptics = [null, "gemini-3.5-flash", "mistral-medium-latest"];
  const modes = ["graph", "diff-only"] as const;
  const versions = ["d0d807ef01c556b882dc85b9fc0d2851d92aa1e5", "1ecd9629f46cab10b907dae285d0f58b0eef5e21", "0000000000000000000000000000000000000000"];
  for (const finder_model of finders)
    for (const skeptic_model of skeptics)
      for (const context_mode of modes)
        for (const guardian_version of versions)
          yield bodyPlan({ ...genome, finder_model, skeptic_model, context_mode, guardian_version });
}

describe("bodyPlan scales", () => {
  it("doubles every dimension when the unit doubles", () => {
    // The property a table of coordinates cannot have: one number governs the
    // whole figure, so nothing can drift out of proportion with the rest.
    const small = bodyPlan(genome, 10);
    const large = bodyPlan(genome, 20);

    expect(large.width).toBeCloseTo(small.width * 2, 6);
    expect(large.height).toBeCloseTo(small.height * 2, 6);
    expect(large.head.cy).toBeCloseTo(small.head.cy * 2, 6);
    expect(large.head.rx).toBeCloseTo(small.head.rx * 2, 6);
    expect(large.abdomen.cy).toBeCloseTo(small.abdomen.cy * 2, 6);
    expect(large.wing.cy).toBeCloseTo(small.wing.cy * 2, 6);
    expect(large.eye.dx).toBeCloseTo(small.eye.dx * 2, 6);
    expect(large.stinger!.to).toBeCloseTo(small.stinger!.to * 2, 6);
  });

  it("is deterministic for one genome", () => {
    expect(bodyPlan(genome)).toEqual(bodyPlan({ ...genome }));
  });
});

describe("the segments form one body, across the whole trait space", () => {
  it("joins head to thorax with an overlap, not a gap", () => {
    for (const plan of plans()) {
      expect(plan.thorax.cy - plan.thorax.ry).toBeLessThan(plan.head.cy + plan.head.ry);
    }
  });

  it("joins thorax to abdomen with an overlap, not a gap", () => {
    for (const plan of plans()) {
      expect(plan.abdomen.cy - plan.abdomen.ry).toBeLessThan(plan.thorax.cy + plan.thorax.ry);
    }
  });

  it("runs the segments top to bottom in order", () => {
    for (const plan of plans()) {
      expect(plan.head.cy).toBeLessThan(plan.thorax.cy);
      expect(plan.thorax.cy).toBeLessThan(plan.abdomen.cy);
    }
  });

  it("starts the stinger inside the abdomen so it is not a spike resting on it", () => {
    for (const plan of plans()) {
      if (plan.stinger === null) continue;
      const abdomenBottom = plan.abdomen.cy + plan.abdomen.ry;
      expect(plan.stinger.from).toBeLessThan(abdomenBottom);
      expect(plan.stinger.to).toBeGreaterThan(abdomenBottom);
    }
  });

  it("attaches the wings to the thorax, not to empty space", () => {
    for (const plan of plans()) {
      expect(plan.wing.cy).toBeGreaterThan(plan.thorax.cy - plan.thorax.ry);
      expect(plan.wing.cy).toBeLessThan(plan.thorax.cy + plan.thorax.ry);
    }
  });

  it("keeps the eyes on the head", () => {
    for (const plan of plans()) {
      expect(plan.eye.dx + plan.eye.rx).toBeLessThanOrEqual(plan.head.rx);
      expect(Math.abs(plan.eye.cy - plan.head.cy) + plan.eye.ry).toBeLessThanOrEqual(plan.head.ry);
    }
  });
});

describe("the canvas follows the body", () => {
  it("contains the whole figure, including antennae and wings", () => {
    for (const plan of plans()) {
      expect(plan.antenna.toY).toBeGreaterThanOrEqual(0);
      expect(plan.abdomen.cy + plan.abdomen.ry).toBeLessThanOrEqual(plan.height);
      if (plan.stinger !== null) expect(plan.stinger.to).toBeLessThanOrEqual(plan.height);
      expect(plan.axis + plan.abdomen.rx).toBeLessThanOrEqual(plan.width);
      expect(plan.axis + plan.wing.offset + plan.wing.rx).toBeLessThanOrEqual(plan.width);
      expect(plan.axis + plan.antenna.spread + plan.antenna.tip).toBeLessThanOrEqual(plan.width);
    }
  });

  it("is shorter for a bee with no stinger", () => {
    const withSting = bodyPlan(genome);
    const without = bodyPlan({ ...genome, skeptic_model: null });
    expect(without.height).toBeLessThan(withSting.height);
  });
});

describe("the body is the measured animal", () => {
  it("draws the head wider than tall, as measured", () => {
    // A circle was the drawing's habit; the measurement says otherwise.
    expect(bodyPlan(genome).head.rx).toBeGreaterThan(bodyPlan(genome).head.ry);
  });

  it("keeps the drawn segments summing to a published body length", () => {
    for (const plan of plans()) {
      const mm = (v: number) => v / plan.unit;
      const total = mm(2 * plan.head.ry + 2 * plan.thorax.ry + 2 * plan.abdomen.ry);
      expect(total).toBeGreaterThanOrEqual(BODY_LENGTH_MM[0]);
      expect(total).toBeLessThanOrEqual(BODY_LENGTH_MM[1]);
    }
  });

  it("varies the head between identities and leaves the abdomen fixed", () => {
    // Not an aspiration: this is what today's published corpus supports, and
    // the spec records it in advance so the result cannot be reframed later.
    const a = bodyPlan(genome);
    const b = bodyPlan({ ...genome, finder_model: "mistral-medium-latest" });
    expect(a.head.ry).not.toBe(b.head.ry);
    expect(MORPHOLOGY.abdomenLength.range).toBeNull();
    expect(a.abdomen.ry).toBe(b.abdomen.ry);
  });
});

describe("traits reach the plan and nothing else does", () => {
  it("gives a graph reviewer a rear wing pair and diff-only none", () => {
    expect(bodyPlan(genome).rearWing).not.toBeNull();
    expect(bodyPlan({ ...genome, context_mode: "diff-only" }).rearWing).toBeNull();
  });

  it("drops the stinger when no skeptic judged the findings", () => {
    expect(bodyPlan({ ...genome, skeptic_model: null }).stinger).toBeNull();
  });

  it("counts bands from the Guardian revision", () => {
    const a = bodyPlan(genome).bands;
    const b = bodyPlan({ ...genome, guardian_version: "1ecd9629f46cab10b907dae285d0f58b0eef5e21" }).bands;
    expect(a).not.toBe(b);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `bun run test tests/body.test.ts`
Expected: FAIL — `plan.head.rx` is undefined, `plan.eye` is undefined, `plan.wing.offset` is undefined.

- [ ] **Step 3: Rewrite `src/body.ts`**

```ts
/**
 * The bee's geometry, computed from measurements rather than from taste.
 *
 * Two kinds of number meet here and are kept apart on purpose. `MORPHOLOGY`
 * holds measured characters of Apis mellifera, in millimetres, each with a
 * citation; `DRAWING` holds the conventions of a picture — overlaps, margins,
 * the curve of an antenna — which nobody measured and nobody will. Mixing them
 * under one table, as `RATIO` did, made a claim about an animal and a choice
 * about a drawing look like the same kind of statement.
 *
 * `unit` is user units per millimetre, so one number still governs the whole
 * figure and nothing can drift out of proportion with the rest.
 *
 * Proportions may be read from the genome and never from the track record. A
 * body that responded to confirmations would make a fixed identity look mutable
 * — the constraint from the design's §Badge, which survives this change too.
 */

import { MORPHOLOGY, type CharacterName } from "./morphology.js";
import type { Genome } from "./types.js";
import { characterMm } from "./variation.js";

/**
 * Conventions of the drawing. Not measurements, and none of them vary.
 *
 * Lengths are in millimetres so they compose with the measured characters
 * without a reference length to convert through; the `Mm` suffix says which is
 * which. A convention in millimetres is still a convention.
 */
const DRAWING = {
  /** Room above the head for the antennae to reach into. */
  antennaSpaceMm: 1.81,
  antennaReachMm: 1.41,
  antennaSpreadMm: 2.08,
  antennaTipMm: 0.244,
  antennaRootOffsetMm: 0.832,
  antennaControlOffsetMm: 1.41,
  antennaControlDropMm: 0.543,

  /** How far the thorax rides up into the head, so they read as joined. */
  headThoraxOverlapMm: 0.181,
  thoraxAbdomenOverlapMm: 0.905,

  stingerLengthMm: 1.54,
  stingerHalfWidthMm: 0.489,

  eyeOffsetMm: 0.832,
  /** Eyes sit slightly above the head's centre, where a face reads as a face. */
  eyeRiseMm: 0.145,
  eyeRoundMm: 0.489,
  eyeWideRxMm: 0.697,
  eyeWideRyMm: 0.489,
  eyeNarrowRxMm: 0.344,
  eyeNarrowRyMm: 0.634,

  strokeWidthMm: 0.174,
  /** Breathing room either side of the widest part. */
  marginMm: 0.507,

  /**
   * Thorax and abdomen widths, as fractions of their measured lengths.
   *
   * NOT MEASURED. The primary source records the lengths of both and the width
   * of neither, so these are the drawing's own guess, expressed as a fraction
   * so they at least scale with the part they belong to. They gain a range and
   * begin to vary the day a published width appears — see the spec's
   * "The corpus is thin".
   */
  thoraxWidthOfLength: 1.087,
  abdomenWidthOfLength: 0.711,

  /** Where on the thorax the wings attach, from its top. */
  wingAttach: 0.35,
  /** How far a wing's near edge clears the body it attaches to. */
  wingClear: 0.5,
  rearWingDropMm: 1.123,
  /** Fraction of the abdomen's height the bands occupy. */
  bandSpan: 0.62,
  /** Wing opacity: the rear pair reads as underneath. */
  wingOpacity: 0.75,
  rearWingOpacity: 0.55,
} as const;

/** User units per millimetre. A rendering choice; the viewBox scales anyway. */
const UNIT = 20;

export interface BodyPlan {
  readonly unit: number;
  readonly width: number;
  readonly height: number;
  readonly axis: number;
  readonly strokeWidth: number;

  readonly head: { cy: number; rx: number; ry: number };
  readonly thorax: { cy: number; rx: number; ry: number };
  readonly abdomen: { cy: number; rx: number; ry: number };
  readonly wing: { cy: number; rx: number; ry: number; offset: number };
  readonly rearWing: { cy: number; rx: number; ry: number; offset: number } | null;
  readonly stinger: { from: number; to: number; halfWidth: number } | null;
  readonly antenna: {
    fromY: number;
    toY: number;
    spread: number;
    tip: number;
    rootDx: number;
    controlDx: number;
    controlY: number;
  };
  readonly eye: { dx: number; cy: number; rx: number; ry: number };
  readonly bands: number;
}

/** Generation marker: a Guardian revision maps to a band count. */
function bandCount(guardianVersion: string): number {
  const head = Number.parseInt(guardianVersion.slice(0, 2), 16);
  return Number.isNaN(head) ? 1 : 2 + (head % 3);
}

type EyeShape = "round" | "wide" | "narrow";

/** Which model does the finding — a shape, so it reads within any palette. */
function eyeShape(finderModel: string): EyeShape {
  const m = finderModel.toLowerCase();
  if (m.includes("flash")) return "round";
  if (m.includes("pro") || m.includes("medium") || m.includes("70b")) return "wide";
  return "narrow";
}

/**
 * Eye radii per shape, in millimetres.
 *
 * A table rather than a chain of conditionals: which shape a model gets is a
 * fact about eyes, not a decision the renderer makes, and adding a fourth means
 * adding a row instead of another branch.
 */
const EYE: Record<EyeShape, { readonly rxMm: number; readonly ryMm: number }> = {
  round: { rxMm: DRAWING.eyeRoundMm, ryMm: DRAWING.eyeRoundMm },
  wide: { rxMm: DRAWING.eyeWideRxMm, ryMm: DRAWING.eyeWideRyMm },
  narrow: { rxMm: DRAWING.eyeNarrowRxMm, ryMm: DRAWING.eyeNarrowRyMm },
};

/**
 * Lay out a body for a genome.
 *
 * The vertical chain runs head → thorax → abdomen → stinger, each segment
 * placed against the previous one rather than at a remembered coordinate. The
 * canvas is then sized to whatever that chain produced, so a longer abdomen
 * cannot silently overflow a fixed viewBox.
 */
export function bodyPlan(genome: Genome, unit: number = UNIT): BodyPlan {
  const measured = (name: CharacterName) => characterMm(name, genome) * unit;
  const drawn = (mm: number) => mm * unit;

  const headRy = measured("headHeight") / 2;
  const headRx = measured("headWidth") / 2;
  const headCy = drawn(DRAWING.antennaSpaceMm) + headRy;

  const thoraxLength = measured("thoraxLength");
  const thoraxRy = thoraxLength / 2;
  const thoraxRx = (thoraxLength * DRAWING.thoraxWidthOfLength) / 2;
  const thoraxCy = headCy + headRy + thoraxRy - drawn(DRAWING.headThoraxOverlapMm);

  const abdomenLength = measured("abdomenLength");
  const abdomenRy = abdomenLength / 2;
  const abdomenRx = (abdomenLength * DRAWING.abdomenWidthOfLength) / 2;
  const abdomenCy = thoraxCy + thoraxRy + abdomenRy - drawn(DRAWING.thoraxAbdomenOverlapMm);

  const hasStinger = genome.skeptic_model !== null;
  const abdomenBottom = abdomenCy + abdomenRy;
  const stinger = hasStinger
    ? {
        // Starts inside the abdomen so the two read as one body, not a spike
        // resting against a wall.
        from: abdomenBottom - drawn(DRAWING.stingerHalfWidthMm),
        to: abdomenBottom + drawn(DRAWING.stingerLengthMm),
        halfWidth: drawn(DRAWING.stingerHalfWidthMm),
      }
    : null;

  const wingCy = thoraxCy - thoraxRy + DRAWING.wingAttach * 2 * thoraxRy;
  const wingRx = measured("forewingLength") / 2;
  const wingRy = measured("forewingWidth") / 2;
  const wing = {
    cy: wingCy,
    rx: wingRx,
    ry: wingRy,
    offset: thoraxRx + wingRx * DRAWING.wingClear,
  };

  const seesStructure = genome.context_mode === "graph";
  const rearRx = measured("hindwingLength") / 2;
  const rearWing = seesStructure
    ? {
        cy: wingCy + drawn(DRAWING.rearWingDropMm),
        rx: rearRx,
        ry: measured("hindwingWidth") / 2,
        offset: thoraxRx + rearRx * DRAWING.wingClear,
      }
    : null;

  const eyeRatio = EYE[eyeShape(genome.finder_model)];
  const eye = {
    dx: drawn(DRAWING.eyeOffsetMm),
    cy: headCy - drawn(DRAWING.eyeRiseMm),
    rx: drawn(eyeRatio.rxMm),
    ry: drawn(eyeRatio.ryMm),
  };

  const antennaToY = headCy - headRy - drawn(DRAWING.antennaReachMm);

  // The canvas follows the body, never the other way round.
  const widest = Math.max(
    abdomenRx,
    wing.offset + wing.rx,
    rearWing === null ? 0 : rearWing.offset + rearWing.rx,
    drawn(DRAWING.antennaSpreadMm) + drawn(DRAWING.antennaTipMm),
  );
  const width = 2 * (widest + drawn(DRAWING.marginMm));
  const height = (stinger ? stinger.to : abdomenBottom) + drawn(DRAWING.marginMm);

  return {
    unit,
    width,
    height,
    axis: width / 2,
    strokeWidth: drawn(DRAWING.strokeWidthMm),

    head: { cy: headCy, rx: headRx, ry: headRy },
    thorax: { cy: thoraxCy, rx: thoraxRx, ry: thoraxRy },
    abdomen: { cy: abdomenCy, rx: abdomenRx, ry: abdomenRy },
    wing,
    rearWing,
    stinger,
    antenna: {
      fromY: headCy - headRy,
      toY: antennaToY,
      spread: drawn(DRAWING.antennaSpreadMm),
      tip: drawn(DRAWING.antennaTipMm),
      rootDx: drawn(DRAWING.antennaRootOffsetMm),
      controlDx: drawn(DRAWING.antennaControlOffsetMm),
      controlY: antennaToY + drawn(DRAWING.antennaControlDropMm),
    },
    eye,
    bands: bandCount(genome.guardian_version),
  };
}

export { DRAWING, MORPHOLOGY };
```

- [ ] **Step 4: Run and iterate**

Run: `bun run test tests/body.test.ts && bun run typecheck`

Expected: PASS. If "keeps the eyes on the head" fails, the eye conventions no longer fit the measured head — the head is now 2.45 mm tall against the 3.62 mm circle they were chosen for. Fix by adjusting `eyeOffsetMm`, `eyeRiseMm` or the eye radii, all conventions. Do **not** adjust `headHeight`.

Record whichever conventions you changed and why, in the commit message.

- [ ] **Step 5: Prove the extremes test is really guarded**

Temporarily set `DRAWING.thoraxAbdomenOverlapMm` to `0`. Run `bun run test tests/body.test.ts`.
Expected: FAIL on "joins thorax to abdomen with an overlap, not a gap" — the segments touch but do not overlap. Revert and confirm green.

Then temporarily set `MORPHOLOGY.headHeight.range` to `[2.45, 12]` — an absurd upper end.
Expected: FAIL on "keeps the drawn segments summing to a published body length", because a 12 mm head puts the animal past 15 mm. This is the test that proves the range bounds are what keep a bee a bee, rather than luck. Revert and confirm green.

- [ ] **Step 6: Commit**

```bash
git add src/body.ts tests/body.test.ts
git commit -m "feat: build the bee from measured morphology, varied per genome slot"
```

---

### Task 5: `src/avatar.ts` renders the plan and invents nothing

**Files:**
- Modify: `src/avatar.ts`
- Modify: `tests/avatar.test.ts`

**Interfaces:**
- Consumes: `BodyPlan` and `DRAWING` from Task 4.
- Produces: no signature change. `avatarSvg(genome: Genome, size = 120): string` as before.

- [ ] **Step 1: Add the failing test**

Append to `tests/avatar.test.ts`:

```ts
describe("the renderer invents no coordinate", () => {
  it("draws the head as the measured ellipse, not a circle", () => {
    const svg = avatarSvg(base);
    const head = svg.match(/<ellipse cx="[\d.]+" cy="[\d.]+" rx="([\d.]+)" ry="([\d.]+)"[^>]*fill="#E3AE3C"/g);
    expect(head).not.toBeNull();
    // At least one body-coloured ellipse must be wider than tall: the head.
    const wider = (head ?? []).some((tag) => {
      const rx = Number(tag.match(/rx="([\d.]+)"/)![1]);
      const ry = Number(tag.match(/ry="([\d.]+)"/)![1]);
      return rx > ry;
    });
    expect(wider).toBe(true);
  });

  it("gives two identities with different finders different heads", () => {
    // Variation reaches the picture, not only the plan.
    const a = avatarSvg(base);
    const b = avatarSvg({ ...base, finder_model: "gemini-3.5-pro" });
    expect(a).not.toBe(b);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `bun run test tests/avatar.test.ts`
Expected: FAIL on the head ellipse — before Task 5's edit the renderer still passes `head.r` twice, and after Task 4 that property no longer exists, so it renders `undefined`.

- [ ] **Step 3: Rewrite the coordinate-computing parts of `avatar.ts`**

Change the import, the docstring, and the four functions that computed positions:

```ts
import { bodyPlan, DRAWING, type BodyPlan } from "./body.js";
```

Correct the file docstring — its first claim stops being true:

```ts
/**
 * A reviewer's badge: a bee assembled from its genome.
 *
 * Every visible trait is read from a genome field. Its build is read from the
 * genome too, by hashing individual slots — so a body is inherited slot by slot
 * rather than redrawn from scratch. Nothing comes from the track record:
 * identity is fixed while the record grows, so a body that responded to
 * confirmations would make identity look mutable. When a track record is shown,
 * it belongs to a layer drawn outside this SVG.
 *
 * Geometry lives in `body.ts` and this file only draws it. The split is what
 * keeps positions out of the renderer: nothing here may invent a coordinate,
 * because every one it needs is already on the plan.
 */
```

Replace `wings`, `bands`, `eyes` and `antennae` bodies:

```ts
function wings(plan: BodyPlan, palette: Palette): string {
  const pairs = plan.rearWing === null ? [plan.wing] : [plan.rearWing, plan.wing];
  return pairs
    .flatMap((pair, index) => {
      // The rear pair sits behind and is drawn first, so it reads as underneath.
      const opacity =
        index === 0 && plan.rearWing !== null ? DRAWING.rearWingOpacity : DRAWING.wingOpacity;
      return (["l", "r"] as const).map((side) => {
        const cx = plan.axis + (side === "l" ? -1 : 1) * pair.offset;
        return (
          `<ellipse class="hm-wing hm-wing-${side}" cx="${n(cx)}" cy="${n(pair.cy)}" ` +
          `rx="${n(pair.rx)}" ry="${n(pair.ry)}" fill="${palette.wing}" ` +
          `fill-opacity="${opacity}" stroke="${INK}" stroke-width="${n(plan.strokeWidth)}"/>`
        );
      });
    })
    .join("");
}

function bands(plan: BodyPlan, palette: Palette): string {
  const { abdomen, bands: count } = plan;
  // Bands share the abdomen's vertical span, inset so the first and last do not
  // sit on its rim. Their thickness follows from how many there are.
  const span = abdomen.ry * 2 * DRAWING.bandSpan;
  const top = abdomen.cy - span / 2;
  const thickness = span / (count * 2 - 1);

  return Array.from({ length: count }, (_, i) => {
    const y = top + i * thickness * 2;
    return (
      `<rect class="hm-band" x="${n(plan.axis - abdomen.rx)}" y="${n(y)}" ` +
      `width="${n(abdomen.rx * 2)}" height="${n(thickness)}" fill="${palette.dark}" opacity="0.92"/>`
    );
  }).join("");
}

function eyes(plan: BodyPlan): string {
  const { eye, axis } = plan;
  return (["l", "r"] as const)
    .map((side) => {
      const cx = axis + (side === "l" ? -eye.dx : eye.dx);
      return `<ellipse cx="${n(cx)}" cy="${n(eye.cy)}" rx="${n(eye.rx)}" ry="${n(eye.ry)}" fill="${INK}"/>`;
    })
    .join("");
}

function antennae(plan: BodyPlan): string {
  const { antenna, axis } = plan;
  return (["l", "r"] as const)
    .map((side) => {
      const dir = side === "l" ? -1 : 1;
      const fromX = axis + dir * antenna.rootDx;
      const toX = axis + dir * antenna.spread;
      const midX = axis + dir * antenna.controlDx;
      return (
        `<path d="M${n(fromX)} ${n(antenna.fromY)} Q${n(midX)} ${n(antenna.controlY)} ${n(toX)} ${n(antenna.toY)}" ` +
        `fill="none" stroke="${INK}" stroke-width="${n(plan.strokeWidth)}" stroke-linecap="round"/>` +
        `<circle cx="${n(toX)}" cy="${n(antenna.toY)}" r="${n(antenna.tip)}" fill="${INK}"/>`
      );
    })
    .join("");
}
```

Delete the `EYE_SHAPE` table — it moved to `body.ts`. In `avatarSvg`, replace the head ellipse call:

```ts
    ellipse(plan.axis, plan.head.cy, plan.head.rx, plan.head.ry, palette.body, plan) +
```

- [ ] **Step 4: Run the whole suite**

Run: `bun run test && bun run typecheck`
Expected: PASS. `tests/page.test.ts` and `tests/shields.test.ts` embed avatars; if either asserts on literal coordinates, update the assertion — a changed coordinate is the intended outcome here, a changed *structure* is not.

- [ ] **Step 5: Prove the renderer no longer invents coordinates**

Run: `grep -n "plan.unit\|DRAWING\." src/avatar.ts`
Expected: only `DRAWING.wingOpacity`, `DRAWING.rearWingOpacity` and `DRAWING.bandSpan` — opacities and a fraction, none of them a position. Any `plan.unit` left in the renderer means a coordinate is still being computed there.

- [ ] **Step 6: Commit**

```bash
git add src/avatar.ts tests/avatar.test.ts
git commit -m "refactor: the renderer draws the plan and computes no position"
```

---

### Task 6: Regenerate the plate and publish it

**Files:**
- Modify: `scripts/plate.ts`

**Interfaces:**
- Consumes: `avatarSvg`, unchanged in signature.
- Produces: an HTML plate and a published artifact.

- [ ] **Step 1: Add a morphology row to the plate**

`scripts/plate.ts` already renders collected identities, hypotheticals and crossings. Add one section before the crossings that answers the question a reader will actually have — *is it still a bee at the edges?* For each varying character, render three bees: the low end of its published range, the primary measurement, and the high end.

Build them by reaching for genomes whose slot hashes land near each end, not by calling `bodyPlan` with hand-made numbers — the plate must show what the pipeline produces, which is the property that keeps it from drifting from the implementation.

```ts
import { MORPHOLOGY, type CharacterName } from "../src/morphology.js";
import { characterMm } from "../src/variation.js";

/** Search the hypothetical space for the genome that pushes one character furthest. */
function extreme(name: CharacterName, want: "low" | "high"): Genome {
  const finders = ["gemini-2.5-flash", "gemini-3.5-pro", "mistral-medium-latest", "qwen2.5-coder:7b", "llama3.1:70b", "mistral-small-latest"];
  const candidates: Genome[] = [];
  for (const finder_model of finders) {
    for (const context_mode of ["graph", "diff-only"] as const) {
      for (const skeptic_model of [null, "gemini-3.5-flash"]) {
        candidates.push(hypothetical({ finder_model, context_mode, skeptic_model }));
      }
    }
  }
  return candidates.sort((a, b) =>
    want === "low"
      ? characterMm(name, a) - characterMm(name, b)
      : characterMm(name, b) - characterMm(name, a),
  )[0]!;
}
```

Render each pair side by side with the character's name, its published interval and both citations from `SOURCES`. Add a line of prose stating plainly that the thorax and abdomen do not vary and why — a reader who notices the abdomen never changing should find the reason on the page, not conclude the feature is broken.

- [ ] **Step 2: Generate it**

Run: `bun scripts/plate.ts /tmp/claude-1001/-home-zaebee-projects-hivemark/f0f04b8a-06a5-41b4-b2e5-7513f771d303/scratchpad/plate.html`
Expected: an HTML file, no warnings beyond harvest's own.

- [ ] **Step 3: Publish to the existing artifact**

Publish with the `Artifact` tool, passing `url: "https://claude.ai/code/artifact/c6f4d218-3e38-46d0-b457-1da4545160c7"` so it updates in place instead of creating a second plate. Keep the title and favicon stable.

- [ ] **Step 4: Stop and get a visual verdict**

The measured bee is wider and more spread-winged than the drawn one. Only the human partner can judge whether it reads as a bee. Present the artifact link and wait.

If the verdict is that it reads badly, the conventions available to adjust are `wingClear`, `thoraxWidthOfLength`, `abdomenWidthOfLength` and the antenna and eye conventions. The measured characters are not available to adjust, and neither are the published ranges.

- [ ] **Step 5: Commit**

```bash
git add scripts/plate.ts
git commit -m "feat(plate): show the published range at both ends, and what does not vary"
```

---

### Task 7: Record the corrections in the specs

**Files:**
- Modify: `docs/superpowers/specs/2026-08-12-hivemark-design.md` (§Out of scope for phase 1)
- Modify: `README.md`

**Interfaces:**
- Consumes: nothing. Documentation only.

- [ ] **Step 1: Strike the interpolation claim in the main spec**

In §Out of scope for phase 1, the parametric body paragraph claims crossbreeding "could interpolate rather than pick a slot per trait, so an offspring could be genuinely intermediate instead of a patchwork". Strike it in the style the document already uses — the retraction stays visible, the reasoning replaces it:

```markdown
**~~Crossbreeding could interpolate rather than pick a slot per trait.~~
Struck 2026-08-12, on implementing it.** A hash has no order. Variation derived
from hashing a model name can be inherited but never blended: a child whose
finder came from one parent and whose skeptic came from the other gets a third
value for any character, not a value between its parents'. A genuinely
intermediate build would need a numeric axis along which one model lies between
two others, and no such axis exists. What the parametric body buys is
**heritability** — an offspring's head is its finder-parent's head exactly — and
that is worth having under its own name. See
`docs/superpowers/specs/2026-08-12-morphology-design.md`.
```

Also update the agreed-direction paragraph: it says variation comes "from bits of `identity_id`". It comes from per-slot hashes, and the reason is the same one — the digest of a whole genome cannot be inherited in pieces.

- [ ] **Step 2: Add a README line**

Under the bee badge material, state that proportions are measured *Apis mellifera* morphology with a citation per character, that individual build comes from hashing genome slots, and that the track record reaches none of it. Link `docs/morphology-sources.md`.

- [ ] **Step 3: Full verification**

Run: `bun run test && bun run typecheck`
Expected: PASS, all tests. Confirm the count against the 253 the branch started from, and state the new number rather than "tests pass".

Run: `git diff main --stat`
Expected: only the files this plan names.

- [ ] **Step 4: Commit**

```bash
git add README.md docs/superpowers/specs/2026-08-12-hivemark-design.md
git commit -m "docs: strike the interpolation claim, and say where the proportions come from"
```

---

## Self-review

**Spec coverage.** Primary source and character table → Task 2. Standard-error finding → encoded as the range rule in Task 2 and its comment. Published-range bounds → Task 2, verified in Task 1. Thin-corpus outcome → stated in Task 2's comments, tested in Task 4 ("varies the head... leaves the abdomen fixed"), shown to readers in Task 6. `MORPHOLOGY`/`DRAWING` split → Task 4. Per-slot hashing → Task 3. Slot→region table → Task 3. Inheritance-not-interpolation retraction → Task 3's docstring and Task 7. Third source refused → Global Constraints, tested in Task 3 ("reads no field outside its own slot"). Testing section → Tasks 2–5, each with a step that watches the guard fail. `avatar.ts` docstring correction → Task 5.

**Gap found and closed.** The spec's testing section asks for "identical genomes render identical SVG"; that assertion already exists in `tests/avatar.test.ts` and Task 5 keeps it rather than restating it.

**Type consistency.** `characterMm(name, genome)` is defined in Task 3 and called with that argument order in Tasks 4 and 6. `BodyPlan.wing.offset` replaces `reach` in Task 4 and is consumed under that name in Task 5. `plan.eye` replaces `plan.eyes` in Task 4 and is consumed in Task 5. `DRAWING` replaces the `RATIO` export in Task 4 and is imported in Task 5. `CharacterName` and `SourceKey` are defined in Task 2 and used in Tasks 3, 4 and 6.
