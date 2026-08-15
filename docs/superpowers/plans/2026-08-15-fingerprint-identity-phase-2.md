# Identity on the review fingerprint, phase 2

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Register a birth schema that can represent genome 2, delete the provider-guessing table that phase 1 made redundant, and announce the three identities that survived the collapse.

**Architecture:** `BIRTH_SCHEMA` gains `finderProvider`, `skepticProvider` and `reviewFingerprint` in place of `provider` and `guardianVersion`, which changes its text and therefore its UID — a new registration, not an edit. That removes the guard phase 1 put in `encodeBirth` and unskips two CLI tests. Separately, `providerOf` and `PROVIDER_PREFIXES` become dead once nothing derives a provider from a model name, and deleting them closes #15.

**Tech Stack:** TypeScript run directly by Bun, vitest, EAS SchemaEncoder, viem for hashing, `scripts/send-schemas.ts` for the one registration transaction.

**Spec:** `docs/superpowers/specs/2026-08-15-fingerprint-identity-design.md`

## Global Constraints

- **Birth schema 1 stays registered.** It is not revoked and not reused; nothing was ever signed against it. (spec §4)
- **A schema's UID derives from its text**, so changing a field name is a new registration and never an edit. `scripts/send-schemas.ts` verifies each UID against a literal before sending and refuses all three on any mismatch.
- **No birth may be broadcast until the new schema is registered on Base.** The guard in `encodeBirth` comes off only when the UID it names exists.
- **`review_fingerprint_source` does not enter the genome or the birth record.** It says how a digest was obtained, not what a reviewer is. (spec §2)
- **Announcing a birth is irreversible.** One per identity, `firstSeen` is a minimum over the corpus handed in, and it cannot be revised. (#14)
- **Every probe must run where the plan is read.** `sed -i` differs between GNU and BSD, so a probe written with it silently does not run on macOS — and a probe that does not run is a probe that was not performed, which is the failure this project keeps finding. `perl -pi -e` behaves identically on both.

---

### Task 1: A birth schema that can represent genome 2

**Files:**
- Modify: `src/birth/schema.ts:14-17` (`BIRTH_SCHEMA`), `src/birth/schema.ts:27-45` (`encodeBirth`)
- Test: `tests/birth-schema.test.ts`, `tests/schema-uids.test.ts`

**Interfaces:**
- Consumes: `Genome` with `finder_provider`, `skeptic_provider`, `review_fingerprint` from phase 1.
- Produces: `BIRTH_SCHEMA` (new text), `BIRTH_SCHEMA_UID` (new value), `encodeBirth(genome: Genome, firstSeen: number): string` with the genome-2 guard removed. Task 2 registers the UID; Task 4 encodes with it.

- [ ] **Step 1: Write the failing test**

Replace the three tests added in phase 1 (`refuses a genome this schema cannot represent`, `names both provider fields in the refusal`, `still encodes a genome 1 record`) in `tests/birth-schema.test.ts` with the round trip they were standing in for:

```ts
  it("publishes enough to recompute the identity it names", () => {
    // The promise this schema exists to make: a reader holding only the record
    // rebuilds the genome, hashes it, and gets the identity the record claims.
    // Phase 1 could not keep it — one provider field where the genome has two —
    // and that is why this schema is being replaced rather than edited.
    const byName = decode(encodeBirth(genome, FIRST_SEEN));
    const rebuilt: Genome = {
      schema_version: Number(byName.genomeSchemaVersion),
      known_fields: String(byName.knownFields).split(","),
      finder_provider: String(byName.finderProvider),
      skeptic_provider: String(byName.skepticProvider) === "" ? null : String(byName.skepticProvider),
      finder_model: String(byName.finderModel),
      skeptic_model: String(byName.skepticModel) === "" ? null : String(byName.skepticModel),
      context_mode: String(byName.contextMode) as Genome["context_mode"],
      review_fingerprint: String(byName.reviewFingerprint),
    };
    expect(identityId(rebuilt)).toBe(String(byName.identityId));
  });

  it("recomputes the identity for a skeptic-less genome too", () => {
    // Both empty fields decode back to null, so "no skeptic ran" survives the
    // round trip rather than becoming an empty-string provider.
    const none = { ...genome, skeptic_model: null, skeptic_provider: null };
    const byName = decode(encodeBirth(none, FIRST_SEEN));
    const rebuilt: Genome = {
      schema_version: Number(byName.genomeSchemaVersion),
      known_fields: String(byName.knownFields).split(","),
      finder_provider: String(byName.finderProvider),
      skeptic_provider: String(byName.skepticProvider) === "" ? null : String(byName.skepticProvider),
      finder_model: String(byName.finderModel),
      skeptic_model: String(byName.skepticModel) === "" ? null : String(byName.skepticModel),
      context_mode: String(byName.contextMode) as Genome["context_mode"],
      review_fingerprint: String(byName.reviewFingerprint),
    };
    expect(identityId(rebuilt)).toBe(String(byName.identityId));
  });

  it("carries no field the genome does not have", () => {
    // guardianVersion is gone because guardian_sha left the genome: one identity
    // now spans several commits, so there is no single value to publish.
    expect(BIRTH_SCHEMA).not.toMatch(/guardianVersion/);
    expect(BIRTH_SCHEMA).not.toMatch(/string provider\b/);
  });
```

Delete `legacyGenome` and the two tests that used it — schema 1 is no longer the one this module encodes.

- [ ] **Step 2: Run it to make sure it fails**

Run: `bun run test tests/birth-schema.test.ts`
Expected: FAIL — `encodeBirth` still refuses genome 2, and `byName.finderProvider` is undefined because the field does not exist.

- [ ] **Step 3: Write the implementation**

In `src/birth/schema.ts`, replace the schema text:

```ts
/**
 * The genome in full, not its hash.
 *
 * A hash would let a reader confirm a genome they already have; publishing the
 * fields lets them obtain one. With this record alone an outsider recomputes the
 * identity, the address and the bee.
 *
 * Version 2. Version 1 named a single `provider` and a `guardianVersion`, and
 * neither survives genome 2: the genome carries a provider for the finder and
 * one for the skeptic, and `guardian_sha` left it entirely because one identity
 * now spans several commits. A schema's UID derives from its text, so this is a
 * new registration rather than an edit — cheap here only because no birth was
 * ever announced against version 1, which stays registered and unrevoked.
 */
export const BIRTH_SCHEMA =
  "bytes32 identityId,address entity,string finderProvider,string skepticProvider," +
  "string finderModel,string skepticModel,string contextMode,string reviewFingerprint," +
  "string knownFields,uint16 genomeSchemaVersion,uint64 firstSeen";
```

Remove the genome-2 guard added in phase 1, and encode the new fields:

```ts
export function encodeBirth(genome: Genome, firstSeen: number): string {
  const id = identityId(genome);
  return new SchemaEncoder(BIRTH_SCHEMA).encodeData([
    { name: "identityId", type: "bytes32", value: id },
    { name: "entity", type: "address", value: ownerAddress(id) },
    { name: "finderProvider", type: "string", value: genome.finder_provider },
    // Empty string means "ran without a skeptic", matching skepticModel below.
    // The field is always present, so its absence can never be mistaken for it.
    { name: "skepticProvider", type: "string", value: genome.skeptic_provider ?? "" },
    { name: "finderModel", type: "string", value: genome.finder_model },
    { name: "skepticModel", type: "string", value: genome.skeptic_model ?? "" },
    { name: "contextMode", type: "string", value: genome.context_mode },
    { name: "reviewFingerprint", type: "string", value: genome.review_fingerprint },
    { name: "knownFields", type: "string", value: genome.known_fields.join(",") },
    { name: "genomeSchemaVersion", type: "uint16", value: genome.schema_version },
    { name: "firstSeen", type: "uint64", value: firstSeen },
  ]);
}
```

- [ ] **Step 4: Run the tests and print the new UID**

```bash
bun run test tests/birth-schema.test.ts
bun -e 'import { BIRTH_SCHEMA, BIRTH_SCHEMA_UID } from "./src/birth/schema.js";
console.log("uid:  " + BIRTH_SCHEMA_UID);
console.log("text: " + BIRTH_SCHEMA);'
```

Expected: PASS, and a UID different from `0x6ca5f932f49e5ac467c1ca24c5af39800a12df874d3856b4afdd54800c07ed02`.

- [ ] **Step 5: Re-pin the UID everywhere it is pinned as a literal**

Three places pin it deliberately, and each must be updated with the printed value rather than by importing the constant — importing would make the check compare the code to itself:

```bash
grep -rn "6ca5f932f49e5ac467c1ca24c5af39800a12df874d3856b4afdd54800c07ed02" \
  tests/ scripts/ docs/
```

Update `tests/schema-uids.test.ts` (both the UID and the pinned schema text), `scripts/send-schemas.ts` (`EXPECTED.birth`), and the table in `docs/anchoring.md`. In `docs/anchoring.md`, add a row rather than replacing one: schema 1 stays registered, and the table records what exists on chain.

- [ ] **Step 6: Run the whole suite**

Run: `bun run typecheck && bun run test`
Expected: PASS, including the two birth CLI tests once Task 3 unskips them — they will still be skipped here.

- [ ] **Step 7: Probe that the UID pin still catches a drifting schema**

```bash
cp src/birth/schema.ts /tmp/bs.bak
perl -pi -e 's/string finderProvider/string finder_provider/' src/birth/schema.ts
bun run test tests/schema-uids.test.ts   # must FAIL on both uid and text
bun scripts/send-schemas.ts              # must refuse all three, exit 1
cp /tmp/bs.bak src/birth/schema.ts
bun run test                             # green again
```

- [ ] **Step 8: Commit**

```bash
git add src/birth/schema.ts tests/ scripts/send-schemas.ts docs/anchoring.md
git commit -m "feat: a birth schema that can represent genome 2"
```

---

### Task 2: Register it on Base

**Files:**
- No source changes. This task broadcasts one transaction and records it.
- Modify: `docs/anchoring.md` (the registration table)

**Interfaces:**
- Consumes: `BIRTH_SCHEMA_UID` from Task 1.
- Produces: a registered schema on Base, so Task 4 can broadcast births.

- [ ] **Step 1: Dry run**

```bash
bun scripts/send-schemas.ts
```

Expected: claim and anchor report `already registered — nothing to send`; birth reports `not registered → will send N bytes` with the new UID. If birth also says already registered, stop — the UID exists and something is wrong with the derivation.

- [ ] **Step 2: Check the UID on easscan before spending**

A UID is global. If the identical text with the same resolver and revocable flag was registered by anyone, it already exists and no transaction is needed. `send-schemas.ts` checks this against the chain, which is why step 1 is the check — but confirm the UID reported matches the one Task 1 printed.

- [ ] **Step 3: Broadcast**

This step is performed by the user, not by an agent — the key is theirs and lives outside the repository:

```
bun scripts/send-schemas.ts --send
```

Expected: one transaction, roughly 260,000 gas, confirmed by a `Registered` event carrying the expected UID. The script verifies that from the receipt's own logs rather than by a follow-up read.

- [ ] **Step 4: Record it**

Add the transaction hash to the registration table in `docs/anchoring.md`, as a new row beside schema 1 with a note that 1 is superseded and unrevoked.

- [ ] **Step 5: Commit**

```bash
git add docs/anchoring.md
git commit -m "docs: birth schema 2 is registered on Base"
```

---

### Task 3: Delete the provider guess

**Files:**
- Modify: `src/genome.ts` (delete `providerOf`, `PROVIDER_PREFIXES`), `src/types.ts` (delete `Provider`)
- Modify: `src/avatar.ts`, `src/publish/hive.ts`, `src/breed/propose.ts`, `src/palette.ts` as the deletion requires
- Modify: `tests/birth-cli.test.ts` (unskip two tests)
- Test: `tests/genome.test.ts` (remove the `providerOf` tests, add one that the table is gone)

**Interfaces:**
- Consumes: `Genome.finder_provider` and `Genome.skeptic_provider` from phase 1.
- Produces: nothing new. `providerOf` and `Provider` cease to exist.

- [ ] **Step 1: Find every caller**

```bash
grep -rn "providerOf\|PROVIDER_PREFIXES\|Provider\b" src/ tests/ scripts/
```

Each is a decision, not a rename. `avatar.ts` and `hive.ts` derive a provider from a model name and should read the stated field. `breed/propose.ts` builds a proposed genome and must state both providers from the models it is recombining — the only place where a derivation is still needed, because a proposed configuration has never run.

- [ ] **Step 2: Write the failing test**

In `tests/genome.test.ts`, delete the `providerOf` describe block and add:

```ts
it("no longer guesses a provider from a model name", async () => {
  // #15 existed because providerOf refused codellama, mixtral, gemma3, phi4,
  // starcoder2, granite-code and command-r — stopping the pipeline on models
  // the producer could have named. The producer names them now, so the table
  // and its refusal are gone rather than extended.
  const genome = await import("../src/genome.js");
  expect(genome).not.toHaveProperty("providerOf");
});
```

- [ ] **Step 3: Run it to make sure it fails**

Run: `bun run test tests/genome.test.ts`
Expected: FAIL — `providerOf` is still exported.

- [ ] **Step 4: Delete, and follow the type errors**

Remove `providerOf` and `PROVIDER_PREFIXES` from `src/genome.ts` and `Provider` from `src/types.ts`. Then:

```bash
bun run typecheck
```

Fix each site by reading the stated field:

- `src/avatar.ts` — `paletteFor(genome.finder_provider)` for the finder. The
  skeptic keeps its three-state rule and cannot be passed straight in, because
  `skeptic_provider` is `string | null` while `paletteFor` takes `string`:

  ```ts
  const skeptic =
    genome.skeptic_provider === null ? UNJUDGED : paletteFor(genome.skeptic_provider);
  ```

  The aria-label's `judged by` reads `genome.skeptic_provider`, and its
  self-graded branch compares `skeptic_model` to `finder_model` as before —
  comparing providers instead would call two different models from one vendor
  self-graded, which is exactly the distinction #13 exists to make.
- `src/publish/hive.ts` — `familiesOf` groups on `track.genome.finder_provider`; `bee()`'s `judged` reads `g.skeptic_provider`.
- `src/breed/propose.ts` — a proposed genome needs providers for models being recombined. Take them from the observed genome that contributed each model rather than deriving: `vocabulary.existing` already holds them, so build a model → provider map from it. A model in the vocabulary always came from a real record, so the map is total by construction.

- [ ] **Step 5: Unskip the two birth CLI tests**

```bash
perl -pi -e 's/it\.skip\(/it(/g' tests/birth-cli.test.ts
```

Delete the "Skipped until phase 2" comments above them — the reason is gone. Their assertions describe three identities now, not eight; update the counts to what the code produces after confirming three is right.

- [ ] **Step 6: Run the whole suite**

Run: `bun run typecheck && bun run test`
Expected: PASS with **zero** skipped.

- [ ] **Step 7: Probe that a previously-refused model now works end to end**

```bash
bun -e 'import { genomeOf } from "./src/genome.js";
import { avatarSvg } from "./src/avatar.js";
const r = { url:"u", project:"p", pr_slice:"graph", base_sha:"a", head_sha:"b", had_graph:true,
  finder_model:"codellama:13b", finder_provider:"ollama",
  skeptic_model:"claude-sonnet-5", skeptic_provider:"anthropic",
  findings:[], guardian_sha:"d0", reviewed_at:"2026-08-12T11:27:57+00:00",
  parse_failed:false, review_fingerprint:"1a2884400bd7" };
const g = genomeOf(r as never);
console.log("genome:", g.finder_provider, "/", g.skeptic_provider);
console.log("renders:", avatarSvg(g).length > 0, "— two-toned:", avatarSvg(g).includes("hsl"));'
```

Expected: it works. Before this task, `providerOf("codellama:13b")` threw and stopped the pipeline.

- [ ] **Step 8: Commit and close #15**

```bash
git add -A
git commit -m "feat: delete the provider guess, closing #15"
```

---

### Task 4: Announce three births

**Files:**
- No source changes. This task broadcasts transactions and records them.
- Modify: `births.json` (the ledger)

**Interfaces:**
- Consumes: the registered schema from Task 2, `encodeBirth` from Task 1.
- Produces: three birth records on Base, and a ledger row for each.

- [ ] **Step 1: Re-harvest, because the corpus moves**

```bash
bun src/cli.ts corpus.json dist
```

The corpus changed five times on 2026-08-14. Check the printed digest against what `dist/provenance.json` last recorded; if it moved, that is the state being announced from.

- [ ] **Step 2: Dry run the births**

```bash
bun src/cli-birth.ts corpus.json births.json
```

Expected: three identities, each with its `first seen` and the corpus span above them. Read the span: an identity whose `first seen` sits on the corpus's earliest edge is the one whose date is least trustworthy, and the CLI marks it.

- [ ] **Step 3: Answer the corpus-edge question before broadcasting**

For any identity marked `← the corpus starts here`, check whether an earlier review of it exists outside the five files:

Both fingerprints in the corpus are known, so check both rather than only the
one the CLI marked — recursively, because the ratchet's blind spot was a
subdirectory:

```bash
python3 -c "
import json, glob
for target in ['1a2884400bd7', 'eebfdf98419c']:
    rows = []
    for p in glob.glob('../ownima/codegraph-brain/benchmarks/**/*.jsonl', recursive=True):
        for line in open(p, encoding='utf-8'):
            if not line.strip(): continue
            try:
                r = json.loads(line)
                if isinstance(r, dict) and r.get('review_fingerprint') == target and r.get('reviewed_at'):
                    rows.append((r['reviewed_at'], p.split('benchmarks/')[-1]))
            except Exception:
                continue
    rows.sort()
    print(f'{target}: {len(rows)} rows, earliest {rows[0] if rows else None}')"
```

A birth date cannot be revised. If an earlier review exists anywhere, stop and widen the corpus first.

- [ ] **Step 4: Broadcast**

Performed by the user. Three transactions, roughly 780,000 gas each — about seven cents in total at the gas price measured on 2026-08-14.

- [ ] **Step 5: Record each in the ledger**

Append to `births.json`: `identity_id`, `entity`, `first_seen`, `tx_hash`, `attestation_uid`, `announced_at`. `loadBirths` validates that `entity` is the address derived from `identity_id` and refuses a row where they disagree, so a transcription error fails loudly.

- [ ] **Step 6: Verify from the chain, not from the receipt**

```bash
bun src/cli-birth.ts corpus.json births.json
```

Expected: `every identity in this corpus already has a birth record`. That is the ledger and the corpus agreeing, which is the check worth having.

- [ ] **Step 7: Commit**

```bash
git add births.json
git commit -m "feat: three identities are born on Base"
```

---

## What this plan does not do

- **GitHub Pages.** Unblocked now that the repository is public, but it is deployment rather than identity and belongs in its own change. The attestation-backed builder that would make the published page reproducible by a stranger is spec §6 and still unbuilt.
- **The 2026-W33 anchor.** Independent of everything here: births are their own schema and their own transactions, and the anchor covers claim attestations. The window opens 2026-08-17T00:00Z regardless of whether this plan has landed.
