# Hive view, phase 1 — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the vertical stack of cards on `dist/index.html` with a hive — bees grouped into provider families, each bee two-toned to show who judged it — while keeping every existing caveat on the same page.

**Architecture:** Three seams, in order. A new `src/palette.ts` derives a palette from a provider's name, replacing the hand-picked `Record<Provider, Palette>`. `src/avatar.ts` then takes two palettes instead of one: the finder's for head, thorax and wings, the skeptic's for the abdomen. A new `src/publish/hive.ts` groups track records into families and renders the overview, which `src/publish/page.ts` emits above the existing cards. Nothing reads a track record into a body.

**Tech Stack:** TypeScript run directly by Bun, vitest, `keccak256`/`toHex` from viem (already used for the same purpose in `src/variation.ts`), inline SVG with no external assets.

**Spec:** `docs/superpowers/specs/2026-08-14-hive-view-design.md`

## Global Constraints

- **Proportions and colour come only from the genome, never from a track record.** A bee that responded to confirmations would show an unchangeable identity as changeable. Track record may be rendered beside a bee, never inside it. (spec §9)
- **`avatarSvg` output must stay self-contained.** It is written to `dist/avatar-*.svg` as standalone files, so no palette may move into page CSS. (spec §5)
- **Hue depends only on the provider's own name, never on the set of known providers.** (spec §5)
- **Saturation is fixed** across providers; hue and lightness vary. (spec §5)
- Every bee in the hive carries a text label. Shape conveys family and kinship, never identity. (spec §4)
- The hive wraps into rows; it never scrolls sideways. (spec §2)
- `scripts/plate.ts` is not modified by this plan.

---

### Task 1: Derive palettes from the provider's name

**Files:**
- Create: `src/palette.ts`
- Modify: `src/avatar.ts:21-31` (remove `Palette` and `PALETTES`), `src/avatar.ts:135`
- Test: `tests/palette.test.ts` (create), `tests/avatar.test.ts:74-90` (update pinned values)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `Palette` (interface with readonly `body`, `dark`, `wing`, all `string`), `paletteFor(provider: string): Palette`, `UNJUDGED: Palette`. Task 2 imports all three.

- [ ] **Step 1: Write the failing test**

Create `tests/palette.test.ts`:

```ts
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

  it("separates providers on lightness when their hues land close", () => {
    // Hue alone is probabilistic. Two names within a few degrees must still be
    // told apart, so lightness is drawn from a different part of the digest.
    const many = Array.from({ length: 200 }, (_, i) => paletteFor(`provider-${i}`));
    const parsed = many.map((p) => {
      const [, h, , l] = /hsl\((\d+) (\d+)% (\d+)%/.exec(p.body)!;
      return { hue: Number(h), light: Number(l) };
    });
    const collisions = parsed.filter((a, i) =>
      parsed.some((b, j) => j !== i && Math.abs(a.hue - b.hue) < 8 && a.light === b.light),
    );
    expect(collisions.length / parsed.length).toBeLessThan(0.35);
  });

  it("gives an unjudged abdomen a colourless palette", () => {
    expect(/hsl\(0 0%/.test(UNJUDGED.body)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `bun run test tests/palette.test.ts`
Expected: FAIL — `Cannot find module '../src/palette.js'`

- [ ] **Step 3: Write the implementation**

Create `src/palette.ts`:

```ts
import { keccak256, toHex } from "viem";

/**
 * A provider's colours, derived from its name.
 *
 * Replaces a hand-picked `Record<Provider, Palette>` of three entries. The
 * exhaustiveness check that table gave up is acceptable here and nowhere else in
 * this codebase: colour is not identity-bearing, so a wrong one misleads a reader
 * for a moment, where a wrong `PROVIDER_PREFIXES` entry merges two reviewers
 * forever. Loud failure earns its friction only where the failure is
 * unrecoverable.
 *
 * Hue comes from the provider's own name and never from its position among known
 * providers. Spreading hues across a sorted list would separate them better and
 * would repaint gemini the day kimi appears — two renderings of one bee
 * disagreeing because of an unrelated third party.
 */
export interface Palette {
  readonly body: string;
  readonly dark: string;
  readonly wing: string;
}

/** Fixed across providers: a bee that varies on every channel stops reading as a bee. */
const SATURATION = 62;

/**
 * Lightness steps, drawn from a different part of the digest than the hue.
 *
 * This is what recovers separation when two names land close in hue. Three steps
 * rather than a continuum, so the difference is decisive at a glance instead of
 * being a shade nobody notices.
 */
const LIGHTNESS = [45, 55, 65] as const;

export function paletteFor(provider: string): Palette {
  const digest = keccak256(toHex(provider)).slice(2);
  const hue = Number.parseInt(digest.slice(0, 4), 16) % 360;
  const light = LIGHTNESS[Number.parseInt(digest.slice(4, 6), 16) % LIGHTNESS.length]!;

  return {
    body: `hsl(${hue} ${SATURATION}% ${light}%)`,
    // Derived from the same hue rather than drawn independently, so a family
    // reads as one family.
    dark: `hsl(${hue} ${SATURATION + 4}% ${Math.round(light * 0.42)}%)`,
    wing: `hsl(${hue} 26% 86%)`,
  };
}

/**
 * The abdomen of a bee no skeptic judged.
 *
 * Colourless rather than a colour, and the same neutral the badge uses for an
 * unjudged identity, so the page says one thing in two places.
 */
export const UNJUDGED: Palette = {
  body: "hsl(0 0% 78%)",
  dark: "hsl(0 0% 52%)",
  wing: "hsl(0 0% 88%)",
};
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `bun run test tests/palette.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Point `avatar.ts` at it**

In `src/avatar.ts`, delete the `Palette` interface and the `PALETTES` constant (lines 21-31), add the import, and change line 135:

```ts
import { paletteFor, type Palette } from "./palette.js";
```

```ts
  const palette = paletteFor(providerOf(genome.finder_model));
```

- [ ] **Step 6: Replace the pinned hex values in the avatar test**

`tests/avatar.test.ts:74-90` pins the three literal palettes. That test exists because an earlier version passed with every palette collapsed onto gemini's — do not delete it, re-pin it. Print the new values and paste them in:

```bash
bun -e 'import { paletteFor } from "./src/palette.js";
for (const p of ["gemini","mistral","ollama"]) console.log(p, JSON.stringify(paletteFor(p)));'
```

Replace the literal map in the test with the printed values, keeping the assertion shape — all nine channels pinned, not just `body`.

- [ ] **Step 7: Probe that the re-pinned test still catches a collapse**

```bash
# Make every provider share one palette, which is the bug the test exists for.
sed -i 's|const hue = Number.parseInt(digest.slice(0, 4), 16) % 360;|const hue = 40;|' src/palette.ts
bun run test tests/avatar.test.ts   # expect: the palette test FAILS
git checkout src/palette.ts
bun run test                         # expect: all pass again
```

- [ ] **Step 8: Run the whole suite and commit**

```bash
bun run typecheck && bun run test
git add src/palette.ts src/avatar.ts tests/palette.test.ts tests/avatar.test.ts
git commit -m "feat: derive a provider's palette from its name"
```

---

### Task 2: The bee wears its judge

**Files:**
- Modify: `src/avatar.ts:53` (`wings`), `src/avatar.ts:72` (`bands`), `src/avatar.ts:134-165` (`avatarSvg`)
- Test: `tests/avatar.test.ts` (append)

**Interfaces:**
- Consumes: `paletteFor`, `UNJUDGED`, `Palette` from Task 1.
- Produces: `avatarSvg(genome: Genome, size?: number): string` keeps its signature. Task 3 calls it unchanged.

- [ ] **Step 1: Write the failing test**

Append to `tests/avatar.test.ts`:

```ts
describe("the bee wears its judge", () => {
  const withSkeptic = (finder: string, skeptic: string | null): Genome => ({
    ...base,
    provider: providerOf(finder),
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
    // Not a separate code path: same provider, same palette, and the visual
    // state falls out of the rule rather than out of a branch.
    const svg = avatarSvg(withSkeptic("mistral-medium-latest", "mistral-medium-latest"));
    const only = paletteFor("mistral").body;
    expect(svg).toContain(only);
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
});
```

Add to the imports at the top of the file:

```ts
import { paletteFor, UNJUDGED } from "../src/palette.js";
import { providerOf } from "../src/genome.js";
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `bun run test tests/avatar.test.ts`
Expected: FAIL — the two-toned test finds only the finder's colour, because one palette still paints everything.

- [ ] **Step 3: Write the implementation**

In `src/avatar.ts`, replace the body of `avatarSvg` up to the `return`:

```ts
export function avatarSvg(genome: Genome, size = 120): string {
  const finder = paletteFor(providerOf(genome.finder_model));

  // Head, thorax and wings from the finder; abdomen from whoever judged it.
  // `DRIVEN_BY` already gives the head to `finder_model` and the abdomen to
  // `skeptic_model`, so the body distinguished the two roles and only the colour
  // did not. The three visual states are one rule, not three branches: a skeptic
  // of the same provider yields the same palette, so a self-graded bee comes out
  // one colour without anything testing for it.
  const skeptic =
    genome.skeptic_model === null ? UNJUDGED : paletteFor(providerOf(genome.skeptic_model));
```

Then in the returned string, swap the palette used for the abdomen and its bands:

```ts
    wings(plan, finder) +
    stinger(plan) +
    ellipse(plan.axis, plan.abdomen.cy, plan.abdomen.rx, plan.abdomen.ry, skeptic.body, plan) +
    `<g clip-path="url(#${clipId})">${bands(plan, skeptic)}</g>` +
    ellipse(plan.axis, plan.abdomen.cy, plan.abdomen.rx, plan.abdomen.ry, "none", plan) +
    ellipse(plan.axis, plan.thorax.cy, plan.thorax.rx, plan.thorax.ry, finder.dark, plan) +
    antennae(plan) +
    ellipse(plan.axis, plan.head.cy, plan.head.rx, plan.head.ry, finder.body, plan) +
```

Update the `aria-label` so a screen reader gets the same fact the colour carries:

```ts
  const judged =
    genome.skeptic_model === null
      ? "judged by nobody"
      : genome.skeptic_model === genome.finder_model
        ? "grading its own work"
        : `judged by ${providerOf(genome.skeptic_model)}`;

  const label =
    `${providerOf(genome.finder_model)} reviewer, ` +
    `${genome.context_mode} context, ` +
    `${judged}`;
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `bun run test tests/avatar.test.ts`
Expected: PASS.

- [ ] **Step 5: Probe each half separately**

```bash
# Abdomen falls back to the finder — the two-toned and banding tests must fail.
sed -i 's|genome.skeptic_model === null ? UNJUDGED : paletteFor(providerOf(genome.skeptic_model));|finder;|' src/avatar.ts
bun run test tests/avatar.test.ts
git checkout src/avatar.ts

# Wings follow the skeptic — the wing test must fail and nothing else.
sed -i 's|wings(plan, finder)|wings(plan, skeptic)|' src/avatar.ts
bun run test tests/avatar.test.ts
git checkout src/avatar.ts
```

Expected: the first probe fails the two-toned, banding and unjudged tests; the second fails only the wing test.

- [ ] **Step 6: Regenerate and eyeball**

```bash
bun src/cli.ts corpus.json dist
bun scripts/plate.ts /tmp/plate.html
```

All eight identities are same-provider pairs today, so every bee should be one colour. Open `/tmp/plate.html` and confirm the bees still look like bees at the new saturation.

- [ ] **Step 7: Run the whole suite and commit**

```bash
bun run typecheck && bun run test
git add src/avatar.ts tests/avatar.test.ts
git commit -m "feat: colour the abdomen by whoever judged the bee"
```

---

### Task 3: The hive, above the cards

**Files:**
- Create: `src/publish/hive.ts`
- Modify: `src/publish/page.ts:10-45` (insert the hive between the notes and the cards, add CSS)
- Test: `tests/hive.test.ts` (create)

**Interfaces:**
- Consumes: `avatarSvg` from Task 2, `TrackRecord` from `src/types.js`.
- Produces: `familiesOf(tracks: readonly TrackRecord[]): Family[]` where `Family` is `{ readonly provider: string; readonly members: readonly TrackRecord[] }`, and `renderHive(tracks: readonly TrackRecord[]): string`. Task 4 modifies `renderHive`.

- [ ] **Step 1: Write the failing test**

Create `tests/hive.test.ts`:

```ts
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
    const names = (t: TrackRecord[]) => familiesOf(t).flatMap((f) => f.members.map((m) => m.genome.guardian_version));
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
    const html = renderHive([track({}), track({ finder_model: "mistral-medium-latest", provider: "mistral" })]);
    expect(html).toContain("gemini");
    expect(html).toContain("mistral");
  });

  it("renders one bee per identity", () => {
    const html = renderHive([track({}), track({ guardian_version: "cccc" }), track({ guardian_version: "dddd" })]);
    expect((html.match(/<svg/g) ?? []).length).toBe(3);
  });

  it("wraps rather than scrolling sideways", () => {
    expect(renderHive([track({})])).toMatch(/flex-wrap|grid-template-columns/);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `bun run test tests/hive.test.ts`
Expected: FAIL — `Cannot find module '../src/publish/hive.js'`

- [ ] **Step 3: Write the implementation**

Create `src/publish/hive.ts`:

```ts
import { avatarSvg } from "../avatar.js";
import { byCodeUnit } from "../canonical.js";
import { providerOf } from "../genome.js";
import type { TrackRecord } from "../types.js";

/**
 * The population, arranged so kinship is visible.
 *
 * A family is the **finder's** provider: the finder did the reviewing, so the bee
 * belongs to it and wears where it went for judgement. A cross-provider bee is
 * not in two families.
 *
 * Within a family, order is by what distinguishes members — `context_mode` first,
 * then `guardian_version` — because those are the slots `DRIVEN_BY` maps to the
 * wings, the thorax and the abdomen bands. The arrangement makes difference
 * legible as shape.
 *
 * Shape shows kinship and never identity. Two identities differing only in
 * `guardian_version` measure at bands 4/4 and thorax within 4%, which nobody
 * will tell apart by looking — so every bee carries its label.
 */
export interface Family {
  readonly provider: string;
  readonly members: readonly TrackRecord[];
}

export function familiesOf(tracks: readonly TrackRecord[]): Family[] {
  const byProvider = new Map<string, TrackRecord[]>();
  for (const track of tracks) {
    const provider = providerOf(track.genome.finder_model);
    const held = byProvider.get(provider);
    if (held) held.push(track);
    else byProvider.set(provider, [track]);
  }

  // Sorted explicitly by code unit, never `localeCompare`: the same input must
  // produce the same page on any machine, and locale-aware collation varies with
  // whatever ICU data the runtime carries.
  return [...byProvider.entries()]
    .sort(([a], [b]) => byCodeUnit(a, b))
    .map(([provider, members]) => ({
      provider,
      members: [...members].sort((a, b) => {
        const mode = byCodeUnit(a.genome.context_mode, b.genome.context_mode);
        return mode !== 0 ? mode : byCodeUnit(a.genome.guardian_version, b.genome.guardian_version);
      }),
    }));
}

const esc = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function bee(track: TrackRecord): string {
  const g = track.genome;
  const judged =
    g.skeptic_model === null
      ? "unjudged"
      : g.skeptic_model === g.finder_model
        ? "self-graded"
        : `judged by ${providerOf(g.skeptic_model)}`;

  return (
    `<figure class="hm-bee">${avatarSvg(g, 96)}` +
    `<figcaption><code>${esc(g.guardian_version.slice(0, 7))}</code>` +
    `<span>${esc(g.context_mode)}</span>` +
    `<span>${esc(judged)}</span>` +
    `<span>${track.reviews} reviews</span></figcaption></figure>`
  );
}

export function renderHive(tracks: readonly TrackRecord[]): string {
  const families = familiesOf(tracks)
    .map(
      (family) =>
        `<section class="hm-family"><h3>${esc(family.provider)}</h3>` +
        `<div class="hm-row">${family.members.map(bee).join("")}</div></section>`,
    )
    .join("");

  return `<div class="hm-hive">${families}</div>`;
}
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `bun run test tests/hive.test.ts`
Expected: 7 tests PASS, except `wraps rather than scrolling sideways`, which fails until the CSS lands in the next step.

- [ ] **Step 5: Put the hive on the page**

In `src/publish/page.ts`, add the import and insert the hive after the notes and before the cards:

```ts
import { renderHive } from "./hive.js";
```

```ts
${notes.join("\n")}
${renderHive(tracks)}
${tracks.map(card).join("\n")}
```

Add to the `<style>` block, after the `.card` rule:

```css
.hm-hive{margin:1.5rem 0 0}
.hm-family h3{margin:1rem 0 .5rem;font-size:1rem;color:var(--muted);font-weight:600}
.hm-row{display:flex;flex-wrap:wrap;gap:1rem}
.hm-bee{margin:0;width:7rem;text-align:center}
.hm-bee svg{width:100%;height:auto;aspect-ratio:1}
.hm-bee figcaption{font-size:.72rem;color:var(--muted);line-height:1.35;
display:flex;flex-direction:column;word-break:break-word}
```

- [ ] **Step 6: Run the tests and make sure they pass**

Run: `bun run test`
Expected: all pass, including `wraps rather than scrolling sideways`.

- [ ] **Step 7: Probe the ordering and the grouping**

```bash
# Group by the skeptic instead of the finder — the cross-provider test must fail.
sed -i 's|providerOf(track.genome.finder_model)|providerOf(track.genome.skeptic_model ?? track.genome.finder_model)|' src/publish/hive.ts
bun run test tests/hive.test.ts
git checkout src/publish/hive.ts

# Drop the within-family ordering — the ordering and determinism tests must fail.
# Edited by hand rather than by sed: replace the two lines inside the members
# comparator with `return 0;`, run, then restore.
bun run test tests/hive.test.ts
git checkout src/publish/hive.ts
```

Expected: the first probe fails the grouping test; the second fails `orders within a family` and `is deterministic regardless of input order`, and nothing else.

- [ ] **Step 8: Regenerate and look at it**

```bash
bun src/cli.ts corpus.json dist
```

Open `dist/index.html`. Expect two families, `gemini` with five bees and `mistral` with three, each bee labelled with its short guardian sha. Confirm the three mistral bees sit together and look nearly identical — that is the finding, not a bug.

- [ ] **Step 9: Commit**

```bash
bun run typecheck && bun run test
git add src/publish/hive.ts src/publish/page.ts tests/hive.test.ts
git commit -m "feat: render the hive above the cards"
```

---

### Task 4: Say when a family is probably one reviewer

**Files:**
- Modify: `src/publish/hive.ts` (add `nearTwinsIn`, call it from `renderHive`)
- Test: `tests/hive.test.ts` (append)

**Interfaces:**
- Consumes: `Family` and `familiesOf` from Task 3.
- Produces: `nearTwinsIn(family: Family): TrackRecord[][]` — groups of two or more members differing in nothing but `guardian_version`.

- [ ] **Step 1: Write the failing test**

Append to `tests/hive.test.ts`:

```ts
describe("near twins", () => {
  it("finds members differing in nothing but guardian_version", () => {
    const family = familiesOf([
      track({ guardian_version: "aaaa" }),
      track({ guardian_version: "bbbb" }),
      track({ context_mode: "diff-only", guardian_version: "cccc" }),
    ])[0]!;
    const groups = nearTwinsIn(family);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(2);
  });

  it("does not call a lone member a twin", () => {
    const family = familiesOf([track({ guardian_version: "aaaa" })])[0]!;
    expect(nearTwinsIn(family)).toHaveLength(0);
  });

  it("does not group across a differing skeptic", () => {
    // A different skeptic is a different reviewer, not a version bump.
    const family = familiesOf([
      track({ guardian_version: "aaaa", skeptic_model: "gemini-3.5-flash" }),
      track({ guardian_version: "bbbb", skeptic_model: null }),
    ])[0]!;
    expect(nearTwinsIn(family)).toHaveLength(0);
  });

  it("states it as a suspicion, not a finding", () => {
    // Whether these are one reviewer is upstream's to confirm — it is what
    // codegraph-brain#375 measures — so the page must not assert it.
    const html = renderHive([track({ guardian_version: "aaaa" }), track({ guardian_version: "bbbb" })]);
    expect(html).toMatch(/probably|likely|may be/i);
    expect(html).not.toMatch(/\bare the same reviewer\b/);
  });

  it("says nothing when a family has no twins", () => {
    const html = renderHive([track({ guardian_version: "aaaa" })]);
    expect(html).not.toMatch(/probably|likely|may be/i);
  });
});
```

Add `nearTwinsIn` to the import at the top of the file.

- [ ] **Step 2: Run it to make sure it fails**

Run: `bun run test tests/hive.test.ts`
Expected: FAIL — `nearTwinsIn is not exported`.

- [ ] **Step 3: Write the implementation**

Add to `src/publish/hive.ts`:

```ts
/**
 * Members of a family that differ in nothing but `guardian_version`.
 *
 * Reported as a suspicion and never as a finding. Whether two such identities are
 * really one reviewer is upstream's to confirm — it is exactly what
 * codegraph-brain#375 measures by fingerprinting the review path — so this page
 * may say they probably are and may not say they are.
 */
export function nearTwinsIn(family: Family): TrackRecord[][] {
  const groups = new Map<string, TrackRecord[]>();
  for (const member of family.members) {
    const g = member.genome;
    const key = JSON.stringify([g.finder_model, g.skeptic_model, g.context_mode]);
    const held = groups.get(key);
    if (held) held.push(member);
    else groups.set(key, [member]);
  }
  return [...groups.values()].filter((members) => members.length > 1);
}
```

And in `renderHive`, add the note under a family that has any:

```ts
export function renderHive(tracks: readonly TrackRecord[]): string {
  const families = familiesOf(tracks)
    .map((family) => {
      const twins = nearTwinsIn(family);
      const note =
        twins.length === 0
          ? ""
          : `<p class="hm-twins">${twins.map((g) => g.length).join(" and ")} of these differ ` +
            `only in Guardian revision, so they are probably one reviewer counted more than once. ` +
            `Confirming that is upstream work.</p>`;

      return (
        `<section class="hm-family"><h3>${esc(family.provider)}</h3>` +
        `<div class="hm-row">${family.members.map(bee).join("")}</div>${note}</section>`
      );
    })
    .join("");

  return `<div class="hm-hive">${families}</div>`;
}
```

Add to the `<style>` block in `src/publish/page.ts`:

```css
.hm-twins{margin:.5rem 0 0;font-size:.8rem;color:var(--muted);font-style:italic}
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `bun run test tests/hive.test.ts`
Expected: PASS.

- [ ] **Step 5: Probe it**

```bash
# Treat a differing skeptic as a version bump — that test must fail.
sed -i 's|JSON.stringify(\[g.finder_model, g.skeptic_model, g.context_mode\])|JSON.stringify([g.finder_model, g.context_mode])|' src/publish/hive.ts
bun run test tests/hive.test.ts
git checkout src/publish/hive.ts

# Report a lone member as a twin — that test must fail.
sed -i 's|.filter((members) => members.length > 1)|.filter((members) => members.length > 0)|' src/publish/hive.ts
bun run test tests/hive.test.ts
git checkout src/publish/hive.ts
```

Expected: each probe fails exactly the test that covers it.

- [ ] **Step 6: Regenerate and read the note**

```bash
bun src/cli.ts corpus.json dist
```

Open `dist/index.html`. The mistral family should carry the note, since `4d1fe6a8`, `112e4373` and `aeebde9c` differ only in Guardian revision. Confirm the wording says "probably" and never asserts it.

- [ ] **Step 7: Commit**

```bash
bun run typecheck && bun run test
git add src/publish/hive.ts src/publish/page.ts tests/hive.test.ts
git commit -m "feat: say when a family is probably one reviewer counted twice"
```

---

## What this plan does not do

Both are deferred in spec §8 and neither is blocked on anything in this plan.

- **The attestation-backed builder** (spec §6) waits on births being announced, which waits on codegraph-brain#375. The seam it needs already exists: `renderPage` and `renderHive` both take `TrackRecord[]` and neither learns where the records came from.
- **GitHub Pages** (spec §7) waits on #34, since there is no CI at all, and ideally on the builder above so the published page reads public data rather than a private corpus.
