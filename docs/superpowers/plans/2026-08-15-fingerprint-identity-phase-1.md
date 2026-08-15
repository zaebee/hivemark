# Identity on the review fingerprint, phase 1

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Key `identity_id` on `review_fingerprint` instead of `guardian_sha`, collapsing eight identities into the three configurations that were actually run — far enough to re-sign every attestation before the 2026-W33 anchor window opens.

**Architecture:** Three fields become required on `ReviewRecord`, `genomeOf` swaps `guardian_version` for `review_fingerprint` and reads the two stated providers instead of deriving one, and every fixture is regenerated from the real corpus because none carries the new fields. Nothing downstream of the genome changes in this phase — signatures depend on the genome and nothing else, so this is the whole of what the anchor needs.

**Tech Stack:** TypeScript run directly by Bun, vitest, zod for the record schema, viem for hashing.

**Spec:** `docs/superpowers/specs/2026-08-15-fingerprint-identity-design.md`

## Global Constraints

- **Every `identity_id` and `owner_address` changes.** That is the deliverable, not a side effect. Anything asserting a specific pre-existing identity must be updated deliberately, never deleted to make a suite green.
- **No optional field with a fallback to `guardian_sha`.** Two identity schemes coexisting in one corpus means one reviewer appears as two entities depending on which run it came from — worse than either scheme alone. (spec §3)
- **`review_fingerprint_source` does not enter the genome.** It says how a digest was obtained, not what a reviewer is. (spec §2)
- **`guardian_sha` stays on `ReviewRecord` and leaves `Genome`.** One identity now spans several commits, so there is no single value to record as provenance. (spec §2)
- **`GENOME_SCHEMA_VERSION` becomes 2.** It is a version, not a migration: nothing rewrites version 1 records. (spec §7)
- **Phase 2 is out of scope here** — birth schema registration, `providerOf` deletion, palette and hive changes, and the births themselves. (spec §6)

---

### Task 1: Require the three fields on a review record

**Files:**
- Modify: `src/schema.ts:46-63` (the `ReviewRecordSchema` object)
- Test: `tests/schema.test.ts` (append)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `ReviewRecord` gains `review_fingerprint: string`, `finder_provider: string`, `skeptic_provider: string | null`. Task 2 reads all three.

- [ ] **Step 1: Write the failing test**

Append to `tests/schema.test.ts`:

```ts
describe("the fields identity is keyed on", () => {
  const row = (over: Record<string, unknown> = {}): unknown => ({
    url: "https://github.com/acme/widgets/pull/1",
    project: "acme",
    pr_slice: "graph",
    base_sha: "aaa",
    head_sha: "bbb",
    had_graph: true,
    finder_model: "gemini-2.5-flash",
    skeptic_model: "gemini-3.5-flash",
    findings: [],
    guardian_sha: "d0d807ef",
    reviewed_at: "2026-08-12T11:27:57+00:00",
    parse_failed: false,
    review_fingerprint: "1a2884400bd7",
    finder_provider: "gemini",
    skeptic_provider: "gemini",
    ...over,
  });

  it("accepts a record carrying all three", () => {
    expect(ReviewRecordSchema.safeParse(row()).success).toBe(true);
  });

  it("refuses a record without a fingerprint", () => {
    // Optional-with-a-fallback was rejected in the spec: a corpus where some
    // rows key on a fingerprint and some on guardian_sha makes one reviewer
    // two entities depending on which run it came from.
    const { review_fingerprint: _drop, ...without } = row() as Record<string, unknown>;
    const result = ReviewRecordSchema.safeParse(without);
    expect(result.success).toBe(false);
  });

  it("refuses a record without a stated finder provider", () => {
    const { finder_provider: _drop, ...without } = row() as Record<string, unknown>;
    expect(ReviewRecordSchema.safeParse(without).success).toBe(false);
  });

  it("accepts a null skeptic provider, because a skeptic can be absent", () => {
    expect(
      ReviewRecordSchema.safeParse(row({ skeptic_model: null, skeptic_provider: null })).success,
    ).toBe(true);
  });

  it("refuses a skeptic provider that is absent rather than null", () => {
    // Required-but-nullable, matching skeptic_model directly above it. Absent
    // and null are different claims: null says no skeptic ran, absent says the
    // producer did not tell us.
    const { skeptic_provider: _drop, ...without } = row() as Record<string, unknown>;
    expect(ReviewRecordSchema.safeParse(without).success).toBe(false);
  });
});
```

Add `ReviewRecordSchema` to the file's imports if it is not already there.

- [ ] **Step 2: Run it to make sure it fails**

Run: `bun run test tests/schema.test.ts`
Expected: the three "refuses" tests FAIL — the schema currently ignores unknown keys and requires none of these.

- [ ] **Step 3: Write the implementation**

In `src/schema.ts`, inside `ReviewRecordSchema`, after `skeptic_model`:

```ts
  /**
   * The digest of the code that actually decides a review — prompts, context
   * assembly, the selected provider — as opposed to `guardian_sha`, which moves
   * on any commit at all.
   *
   * Required, with no fallback to `guardian_sha`. A corpus where some rows key
   * on one and some on the other makes a single reviewer appear as two entities
   * depending on which run it came from, which is worse than either scheme
   * alone.
   */
  review_fingerprint: z.string(),
  /**
   * Stated by the producer rather than inferred from a model-name prefix.
   *
   * `providerOf` guesses from the name and refuses what it does not recognise,
   * which stops the pipeline on codellama, mixtral, gemma3, phi4, starcoder2,
   * granite-code and command-r. The producer knows, and a guess breaks on the
   * first model whose name does not carry its vendor.
   */
  finder_provider: z.string(),
  /** Required but nullable, exactly as `skeptic_model` is: null means none ran. */
  skeptic_provider: z.string().nullable(),
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `bun run test tests/schema.test.ts`
Expected: PASS.

- [ ] **Step 5: See what it breaks, and confirm it breaks loudly**

Run: `bun run test`
Expected: roughly 43 failures across 9 files, all tracing to fixtures that lack the new fields. This is the intended state and Task 2 fixes it. Record the actual count — a much smaller number means the fixtures are not as widely used as believed, and that is worth knowing before continuing.

- [ ] **Step 6: Commit**

```bash
git add src/schema.ts tests/schema.test.ts
git commit -m "feat: require the fields identity will be keyed on"
```

The suite is red at this commit, deliberately. Task 2 restores it.

---

### Task 2: Regenerate the fixtures from the real corpus

**Files:**
- Modify: `tests/fixtures/martian-reviews.sample.jsonl`, `tests/fixtures/breedable.sample.jsonl`, `tests/fixtures/truncated.jsonl`
- Modify: `tests/harvest.test.ts` (the pinned record counts)

**Interfaces:**
- Consumes: the tightened `ReviewRecordSchema` from Task 1.
- Produces: fixtures every test can parse. No new exports.

- [ ] **Step 1: Look at what each fixture is for before touching it**

```bash
wc -l tests/fixtures/*.jsonl
grep -rln "martian-reviews.sample\|breedable.sample\|truncated" tests/
```

`martian-reviews.sample.jsonl` is the shared corpus sample. `breedable.sample.jsonl` feeds the breeding tests. `truncated.jsonl` deliberately ends mid-line to exercise the partial-write path — **its damaged last line must stay damaged**.

- [ ] **Step 2: Regenerate the shared sample, preserving its size**

The sample is 35 records. Take the same count from the head of the real corpus so the pinned count in `harvest.test.ts` still means something:

```bash
head -n 35 ../ownima/codegraph-brain/benchmarks/martian-reviews.jsonl \
  > tests/fixtures/martian-reviews.sample.jsonl
wc -l tests/fixtures/martian-reviews.sample.jsonl   # expect 35
```

- [ ] **Step 3: Regenerate the breeding sample**

Read which identities `tests/breed-*.test.ts` expects, then take rows covering the same configurations:

```bash
grep -n "breedable" tests/breed-*.test.ts | head
head -n 2 ../ownima/codegraph-brain/benchmarks/martian-p3-run1.jsonl \
  > tests/fixtures/breedable.sample.jsonl
```

`tests/breed-propose.test.ts` builds its vocabulary by hand and is unaffected by
this fixture. `tests/breed-cli.test.ts` reads it and asserts `written.length > 0`
plus the standing text, so it survives a change in row count. If a proposal count
does move, confirm the new number against the vocabulary the proposals come from
before pinning it — a count updated to match the output is not a test.

- [ ] **Step 4: Regenerate the truncated fixture, keeping it truncated**

```bash
head -n 2 ../ownima/codegraph-brain/benchmarks/martian-reviews.jsonl \
  > tests/fixtures/truncated.jsonl
# Chop the last line mid-JSON so the partial-write path still has something to skip
truncate -s -40 tests/fixtures/truncated.jsonl
tail -c 60 tests/fixtures/truncated.jsonl   # must not be valid JSON
```

- [ ] **Step 5: Run the suite and fix the counts the fixtures changed**

Run: `bun run test`

`harvest.test.ts` pins exact record and warning counts. Those pins are load-bearing — they are what makes an emptied fixture fail 43 tests rather than pass silently — so update them to the new true values rather than loosening them to `toBeGreaterThan`.

- [ ] **Step 6: Commit**

```bash
git add tests/fixtures/ tests/harvest.test.ts
git commit -m "test: regenerate fixtures with the fields identity needs"
```

---

### Task 3: Key the genome on the fingerprint

**Files:**
- Modify: `src/types.ts:11-20` (the `Genome` interface)
- Modify: `src/genome.ts:38-45` (`KNOWN_FIELDS`), `src/genome.ts:88-108` (`genomeOf`)
- Test: `tests/genome.test.ts` (append)

**No literal identity or address is pinned anywhere** — verified across `tests/`,
`src/` and `docs/`. So nothing asserts a specific `identity_id` that must be
recomputed by hand; what moves is derived counts, and each is named below.

**Interfaces:**
- Consumes: `ReviewRecord` from Task 1, fixtures from Task 2.
- Produces: `Genome` with `finder_provider: string`, `skeptic_provider: string | null`, `review_fingerprint: string`, and **without** `provider` or `guardian_version`. `GENOME_SCHEMA_VERSION` is `2`.

- [ ] **Step 1: Write the failing test**

Append to `tests/genome.test.ts`:

```ts
describe("identity keyed on the review fingerprint", () => {
  const record = (over: Partial<ReviewRecord> = {}): ReviewRecord =>
    ({
      url: "https://github.com/acme/widgets/pull/1",
      project: "acme",
      pr_slice: "graph",
      base_sha: "aaa",
      head_sha: "bbb",
      had_graph: true,
      finder_model: "gemini-2.5-flash",
      skeptic_model: "gemini-3.5-flash",
      findings: [],
      guardian_sha: "d0d807ef",
      reviewed_at: "2026-08-12T11:27:57+00:00",
      parse_failed: false,
      review_fingerprint: "1a2884400bd7",
      finder_provider: "gemini",
      skeptic_provider: "gemini",
      ...over,
    }) as ReviewRecord;

  it("gives two guardian revisions one identity when the fingerprint agrees", () => {
    // The whole point. Under guardian_sha these were two reviewers with two
    // fragmentary records; the review path did not move between them.
    const a = identityId(genomeOf(record({ guardian_sha: "4d1fe6a8" })));
    const b = identityId(genomeOf(record({ guardian_sha: "112e4373" })));
    expect(a).toBe(b);
  });

  it("separates two reviewers when the fingerprint differs", () => {
    const a = identityId(genomeOf(record({ review_fingerprint: "1a2884400bd7" })));
    const b = identityId(genomeOf(record({ review_fingerprint: "eebfdf98419c" })));
    expect(a).not.toBe(b);
  });

  it("carries no guardian_version, because one identity spans several commits", () => {
    expect(genomeOf(record())).not.toHaveProperty("guardian_version");
  });

  it("reads both providers from the record rather than deriving one", () => {
    // A model name that providerOf would refuse outright.
    const g = genomeOf(
      record({
        finder_model: "codellama:13b",
        finder_provider: "ollama",
        skeptic_model: "claude-sonnet-5",
        skeptic_provider: "anthropic",
      }),
    );
    expect(g.finder_provider).toBe("ollama");
    expect(g.skeptic_provider).toBe("anthropic");
  });

  it("keeps a null skeptic provider null", () => {
    const g = genomeOf(record({ skeptic_model: null, skeptic_provider: null }));
    expect(g.skeptic_model).toBeNull();
    expect(g.skeptic_provider).toBeNull();
  });

  it("declares genome schema version 2", () => {
    expect(genomeOf(record()).schema_version).toBe(2);
  });

  it("still refuses whitespace in a field identity is keyed on", () => {
    // The guard from #31 must survive the rewrite: "1a2884400bd7 " and
    // "1a2884400bd7" would be two entities, invisibly.
    expect(() => genomeOf(record({ review_fingerprint: "1a2884400bd7 " }))).toThrow(/whitespace/);
  });
});
```

Add to the file's imports: `identityId` from `../src/identity.js`, and `ReviewRecord` from `../src/schema.js` if not already present.

- [ ] **Step 2: Run it to make sure it fails**

Run: `bun run test tests/genome.test.ts`
Expected: FAIL — `schema_version` is 1, `guardian_version` is present, `finder_provider` is not.

- [ ] **Step 3: Change the Genome type**

In `src/types.ts`, replace the `Genome` interface:

```ts
export interface Genome {
  readonly schema_version: number;
  readonly known_fields: readonly string[];
  /**
   * Stated by the producer, not derived from a model-name prefix. Two fields
   * rather than one: a single `provider` taken from the finder was wrong for
   * every bee judged by another vendor.
   */
  readonly finder_provider: string;
  readonly skeptic_provider: string | null;
  readonly finder_model: string;
  readonly skeptic_model: string | null;
  readonly context_mode: "graph" | "diff-only";
  /**
   * A digest over the code that decides a review, replacing `guardian_version`.
   *
   * `guardian_sha` moved on any commit — a README edit minted a new entity with
   * an empty track record. Eight identities existed where three configurations
   * were run; this is what collapses them.
   */
  readonly review_fingerprint: string;
}
```

`Provider` is no longer referenced by `Genome`. Leave the type where it is — phase 2 deletes it with `providerOf`.

- [ ] **Step 4: Change genomeOf**

In `src/genome.ts`:

```ts
export const GENOME_SCHEMA_VERSION = 2;

/** Fields this version populates, sorted so the value itself is stable. */
const KNOWN_FIELDS = [
  "context_mode",
  "finder_model",
  "finder_provider",
  "review_fingerprint",
  "skeptic_model",
  "skeptic_provider",
] as const;

export function genomeOf(record: ReviewRecord): Genome {
  // Whitespace is refused before anything is hashed, for the reason in #31: a
  // trailing space makes a second identity that is invisible in every log and
  // diff a human will read.
  const finder = exactly(record.finder_model, "finder_model");

  return {
    schema_version: GENOME_SCHEMA_VERSION,
    known_fields: KNOWN_FIELDS,
    finder_provider: exactly(record.finder_provider, "finder_provider"),
    skeptic_provider: !record.skeptic_provider
      ? null
      : exactly(record.skeptic_provider, "skeptic_provider"),
    finder_model: finder,
    skeptic_model: !record.skeptic_model ? null : exactly(record.skeptic_model, "skeptic_model"),
    context_mode: record.had_graph ? "graph" : "diff-only",
    review_fingerprint: exactly(record.review_fingerprint, "review_fingerprint"),
  };
}
```

`providerOf` is now unused by `genomeOf` but still used by `avatar.ts`, `hive.ts`, `breed/propose.ts` and `birth/submit.ts`. Leave it exported and leave those callers alone — phase 2 removes them together.

- [ ] **Step 5: Run the suite**

Run: `bun run typecheck && bun run test`

Expect type errors wherever `genome.provider` or `genome.guardian_version` is read. Each one is a real decision, not a mechanical rename:

- `avatar.ts`, `hive.ts` — read `finder_provider` / `skeptic_provider` directly instead of calling `providerOf`.
- `birth/submit.ts` — the consistency check comparing `providerOf(finder_model)` against `genome.provider` **is deleted**, not rewritten. It compares two producer-stated fields, which catches a producer contradicting itself and not a producer that is confidently wrong. That job moved upstream, where the closure fails loudly on a provider it cannot map.
- `breed/propose.ts` — its vocabulary is built from genome slots; `guardian_version` becomes `review_fingerprint`.
- `publish/page.ts` — the card prints `guardian` and `provider`; print the fingerprint and both providers.
- `body.ts` / `variation.ts` — `DRIVEN_BY` maps `guardian_version` to the thorax and the band count. Rename the slot to `review_fingerprint`. **The mapping is unchanged**: the same slot drives the same characters, so bees keep the shape their configuration gives them.

- [ ] **Step 6: Fix each call site, then run again**

Run: `bun run typecheck && bun run test`
Expected: PASS.

Snapshot and identity assertions will have moved. Update them to the new values **after** confirming the new value is right — `deriveTrackRecords` should now produce **3** track records from the real corpus, not 8.

- [ ] **Step 7: Verify the collapse on the real corpus**

```bash
bun -e 'import { loadCorpus } from "./src/corpus.js";
import { harvest } from "./src/harvest.js";
import { deriveTrackRecords } from "./src/derive.js";
const t = deriveTrackRecords(harvest(loadCorpus("corpus.json").text).records);
console.log(t.length, "identities");
for (const x of t) console.log(" ", x.reviews, "reviews", x.genome.finder_provider, x.genome.context_mode, x.genome.review_fingerprint);'
```

Expected: **3 identities** — 45 gemini diff-only, 45 mistral graph, 25 gemini graph.

- [ ] **Step 8: Probe the collapse**

```bash
cp src/genome.ts /tmp/g.bak
sed -i 's|review_fingerprint: exactly(record.review_fingerprint, "review_fingerprint")|review_fingerprint: exactly(record.guardian_sha, "guardian_sha")|' src/genome.ts

# The collapse test must fail: two guardian revisions become two identities again.
bun run test tests/genome.test.ts

# And the corpus must go back to 8.
bun -e 'import { loadCorpus } from "./src/corpus.js";
import { harvest } from "./src/harvest.js";
import { deriveTrackRecords } from "./src/derive.js";
console.log(deriveTrackRecords(harvest(loadCorpus("corpus.json").text).records).length, "identities");'

cp /tmp/g.bak src/genome.ts
bun run test   # green again
```

Expected: the probe fails `gives two guardian revisions one identity` and reports
8 identities; restoring gives 3 and a green suite.

- [ ] **Step 9: Commit**

```bash
bun run typecheck && bun run test
git add src/types.ts src/genome.ts src/variation.ts src/body.ts src/avatar.ts \
        src/publish/ src/breed/ src/birth/ tests/
git commit -m "feat: key identity on the review fingerprint"
```

---

### Task 4: Re-sign, and see both generations in one anchor

**Files:**
- No source changes. This task runs the pipeline and records what it produced.
- Modify: `docs/anchoring.md` (the W33 note)

**Interfaces:**
- Consumes: everything above.
- Produces: `dist/attestations.json` under genome 2, and a recorded plan for anchoring both generations.

- [ ] **Step 1: Keep generation 1 before overwriting it**

```bash
cp dist/attestations.json /tmp/attestations-genome-1.json
cp dist/provenance.json /tmp/provenance-genome-1.json
wc -c /tmp/attestations-genome-1.json
```

The anchor covers both generations, so generation 1 must survive this step. `dist/` is gitignored and about to be rewritten.

- [ ] **Step 2: Re-harvest and re-sign**

```bash
HIVEMARK_SIGNING_KEY=… bun src/cli.ts corpus.json dist
```

Expected: 3 identities, and an attestation count in the same range as before — the claims are the same claims, only their `identityId` changed.

- [ ] **Step 3: Confirm the two generations are disjoint**

```bash
bun -e 'import { readFileSync } from "node:fs";
const one = JSON.parse(readFileSync("/tmp/attestations-genome-1.json","utf8"));
const two = JSON.parse(readFileSync("dist/attestations.json","utf8"));
const a = new Set(one.map((e:any)=>e.attestation.uid));
const b = new Set(two.map((e:any)=>e.attestation.uid));
const shared = [...a].filter(u=>b.has(u));
console.log("gen 1:", a.size, " gen 2:", b.size, " shared uids:", shared.length);'
```

Expected: **0 shared uids.** A shared uid would mean an identity did not actually change, and the anchor would double-count it.

- [ ] **Step 4: Plan the anchor over both**

```bash
bun -e 'import { readFileSync } from "node:fs";
const both = [...JSON.parse(readFileSync("/tmp/attestations-genome-1.json","utf8")),
              ...JSON.parse(readFileSync("dist/attestations.json","utf8"))];
import { planAnchor } from "./src/anchor/plan.js";
import { periodId } from "./src/anchor/period.js";
const p = planAnchor(both, [], periodId("2026-W33"), Date.UTC(2026,7,17)/1000);
console.log("covers", p!.count, "attestations, root", p!.root);'
```

Expected: the sum of both counts, and a root. This is a dry computation — nothing is sent, and the window has not opened.

- [ ] **Step 5: Record it in the runbook**

Add to `docs/anchoring.md`, under the W33 heading:

```markdown
### 2026-W33 covers two generations

The genome changed on 2026-08-15 (`GENOME_SCHEMA_VERSION` 1 → 2), so the same
115 reviews are signed twice under different identities. Both sets are anchored
by one root.

An anchor asserts its contents existed no later than the block carrying it, and
both sets do exist — so the claim is true of both and nothing false is
published. The alternative was forced: an attestation's period comes from
`reviewed_at`, so re-signed attestations land in W33 as well, and one anchor per
period is enforced. A root over generation 1 alone would foreclose generation 2
for that week permanently, and the whole corpus is 2026-08-12.

Anchor with both files concatenated, not with `dist/attestations.json` alone.
```

- [ ] **Step 6: Commit**

```bash
git add docs/anchoring.md
git commit -m "docs: 2026-W33 anchors both genome generations"
```

---

## What this plan does not do

All of phase 2, per spec §6, and none of it is blocked on anything here:

- registering birth schema version 2 (`guardianVersion` → `reviewFingerprint`, `provider` → `finderProvider` + `skepticProvider`)
- deleting `providerOf` and `PROVIDER_PREFIXES`, closing #15
- announcing the three births
- the hive's near-twin note, which stays a suspicion until the page reads the fingerprint
