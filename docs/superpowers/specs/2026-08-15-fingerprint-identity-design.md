# Identity keyed on the review fingerprint

Eight identities exist where three configurations were run. Five of them exist
because `guardian_sha` is part of the genome and a commit landed mid-run — one
has a track record of a single review. Upstream now publishes a fingerprint over
the code that actually decides a review, and adopting it collapses eight to
three.

Supersedes the `guardian_version` slot in `GENOME_SCHEMA_VERSION` 1. Refs #20,
closes #15.

## 1. What changes, measured

| genome | identities |
|---|---|
| today, keyed on `guardian_sha` | **8** |
| keyed on `review_fingerprint` | **3** |
| both fields kept | **8** |

Keeping both achieves nothing: `guardian_sha` goes on fragmenting. This is a
replacement, not an addition.

The three that survive, from the 115-record corpus:

```
45 reviews  gemini-2.5-flash / gemini-3.5-flash          / diff-only / 1a2884400bd7
45 reviews  mistral-medium-latest / mistral-medium-latest / graph     / eebfdf98419c
25 reviews  gemini-2.5-flash / gemini-3.5-flash          / graph     / 1a2884400bd7
```

Every `identity_id` and every `owner_address` changes. That is the point and the
cost.

## 2. The genome, version 2

```
schema_version        1 → 2
known_fields          guardian_version → review_fingerprint, + skeptic_provider
provider              → finder_provider    (read, not derived)
                      + skeptic_provider   (read, not derived)
finder_model          unchanged
skeptic_model         unchanged
context_mode          unchanged
guardian_version      REMOVED
review_fingerprint    NEW
```

**`guardian_sha` leaves the genome entirely rather than staying as provenance.**
One identity now spans several commits — the mistral identity covers
`4d1fe6a8`, `112e4373` and `aeebde91` — so there is no single value to record.
The record retains it; the genome does not.

**Providers are read, not derived.** `providerOf` infers a provider from a model
name prefix and *refuses* an unknown one, which today stops the pipeline on
`codellama`, `mixtral`, `gemma3`, `phi4`, `starcoder2`, `granite-code` and
`command-r`. The producer now states `finder_provider` and `skeptic_provider` on
every row. Reading them dissolves #15 and removes a table that guesses.

**`skeptic_provider` is added because one field was always wrong.** The genome
carried a single `provider` derived from the finder, so a bee judged by another
vendor was recorded under one name. That is the same asymmetry the hive fixed in
colour, where `DRIVEN_BY` distinguished the two roles and the palette did not.

**`review_fingerprint_source` does not enter the genome.** It says how a digest
was obtained, not what a reviewer is. Two reviewers with one fingerprint, one
measured and one reconstructed, are the same reviewer.

## 3. The record schema tightens, and the fixtures move

`review_fingerprint`, `finder_provider` and `skeptic_provider` become **required**
on `ReviewRecord`. No optional field with a fallback to `guardian_sha`: that is
two identity schemes coexisting in one corpus, under which one reviewer appears
as two entities depending on which run it came from. Strictly worse than either
scheme alone, and rejected on those grounds when it arose upstream.

The consequence is concrete: **no fixture carries these fields**, and nine test
files read fixtures. They are regenerated from the real corpus.

That the suite fails loudly here rather than quietly was verified before this was
written — adding a required field the fixtures lack fails 43 tests across 9
files, because `harvest.test.ts` pins the fixture at an exact count.

## 4. A new birth schema, registered while it is free

`BIRTH_SCHEMA` carries `string guardianVersion`. Under version 2 that field would
hold a fingerprint under a name that says otherwise, and a registered schema
cannot be renamed.

**No birth has been announced**, so nothing points at the current schema.
Registering a replacement costs one transaction — about 260,000 gas, a fraction
of a cent — and this is the last moment it costs that. After the first birth,
changing it splits the record across two schema versions permanently.

Version 2 of the birth schema:

```
bytes32 identityId
address entity
string  finderProvider      (was: provider)
string  skepticProvider     (new)
string  finderModel
string  skepticModel
string  contextMode
string  reviewFingerprint   (was: guardianVersion)
string  knownFields
uint16  genomeSchemaVersion
uint64  firstSeen
```

The old schema stays registered. It is not revoked and not reused; anything
signed against it remains valid, and nothing was.

## 5. The 932 signed attestations, and Monday

Every signed claim carries an `identityId` computed under genome 1. Under genome
2 those identities do not exist. Re-signing is free and offchain, and produces a
second, disjoint set — different identity, different claim data, different UID.

**The anchor covers both sets.** An anchor asserts that its contents existed no
later than the block carrying its root, and both sets do exist. Nothing false is
published, and the choice of which generation matters is not forced into a
permanent record.

The timing is not negotiable and the reason is structural. An attestation's
period comes from `reviewed_at`, so re-signed attestations for the same reviews
land in **2026-W33** — the same week. One anchor per period is enforced in
`planAnchor` and again in the ledger. So a root published over generation 1 alone
forecloses generation 2 for that week, permanently.

The whole corpus is 2026-08-12. W33 is therefore the entire history of all three
identities. Missing it means those three have no time bound on anything they have
ever done.

**W33 closes 2026-08-17T00:00Z.**

## 6. Two phases, split by that deadline

**Phase 1 — required before Monday.** The record schema, `genomeOf`, regenerated
fixtures, and the tests around them. Signatures depend on the genome and nothing
else, so this is the whole of what the anchor needs.

**Phase 2 — after, at leisure.** Registering the birth schema, reading the stated
providers in the palette and the hive, deleting `providerOf` and
`PROVIDER_PREFIXES`, announcing three births.

The split exists because identity is the most irreversible thing here and this
project spent a day cataloguing defects that came from plausible reasoning nobody
executed. Rushing the whole adoption into 32 hours would apply that pressure at
exactly the worst point. Phase 1 is two tasks.

**If phase 1 does not land in time**, the fallback is to anchor generation 1
alone and adopt afterwards, accepting that the three surviving identities have no
timestamp for August. That is a real loss and it is the honest one — a late
anchor labelled W33 would assert something untrue.

## 7. What is deliberately not changed

- **The old attestations are not revoked or re-labelled.** They are true
  statements about reviews that happened, made by identities that existed under
  genome 1. `genomeSchemaVersion` in each record says which scheme produced it.
- **`GENOME_SCHEMA_VERSION` is a version, not a migration.** Nothing rewrites
  genome 1 records; the field exists so a reader can tell the two apart.
- **The hive's near-twin note stays** until phase 2, and stays phrased as a
  suspicion until the page reads the fingerprint itself.

## 8. Residual risks

1. **The corpus can move under us.** It changed five times on 2026-08-14. Phase 1
   must re-harvest immediately before signing, and the anchor dry run prints the
   corpus digest and coverage edge for exactly this reason.
2. **`providerOf` is deleted in phase 2, not phase 1.** Between them, the genome
   reads stated providers while `avatar.ts`, `hive.ts` and `breed/propose.ts`
   still derive them. Measured across all 115 rows, derived and stated agree in
   every case, for both the finder and the skeptic — 0 disagreements. So the
   duplication is live but not divergent, and phase 2 closes it. The measurement
   is worth repeating rather than trusting once: the first corpus carrying a
   model whose name does not encode its vendor is where they part.
3. **Three identities is not obviously the end state.** If upstream widens the
   review-path closure again, the fingerprint moves and identities re-mint again.
   That is now caught by a reproducibility test upstream rather than discovered
   downstream, but it is not impossible.
