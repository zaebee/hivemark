# hivemark

Cumulative, independently verifiable track records for code-review agents.

Guardian (in [codegraph-brain](https://github.com/zaebee/codegraph-brain)) already
resolves its own claims — findings carry `confirmed` / `refuted` / `uncertain`
verdicts from a skeptic pass. What it lacks is a reviewer that persists across
runs. hivemark supplies that and nothing else: it does not review code, does not
judge findings, and does not modify Guardian.

A reviewer's identity is the hash of its genome — provider, finder and skeptic
models, context mode and Guardian revision — so changing any of them births a
new entity automatically. Its badge is soulbound to an address derived from that
same hash, for which no private key exists.

## Status

**Milestone 1 (done):** offchain track records, page, shields badges,
genome-derived bee badges. No wallet, no contract, no gas.

**Milestone 2, step 1 (done):** every claim is signed as an EAS-format offchain
attestation bound to the Base mainnet domain, and verifies against the public key
alone — no wallet, no transaction, no key in CI.

**Milestone 2, step 2:** one Merkle root per calendar week, published as
an EAS onchain attestation, so an attestation can be shown to have existed no
later than a given block. Run by hand — see `docs/anchoring.md`. A skipped week
stays a gap and is never backfilled, because an anchor published late would
assert that its contents existed by a date that has now passed.

**Milestone 2, step 3:** each identity is announced once as an EAS birth
attestation carrying its whole genome, so an outsider can recompute the entity —
its id, its address and its bee — from the record alone. Run by hand, see
`docs/birth.md`.

**Milestone 2 is complete.** A soulbound token was specified and dropped:
identity is content-addressed, so a token cannot confer existence, and one minted
later would attach to the same entities retroactively. The reasoning is in the
spec's §Badge.

An attestation's `time` is the moment the **review** happened, not the moment it
was signed — a deliberate departure from how EAS reads that field, because the
weekly anchor buckets by it and a signing timestamp would file old reviews under
whichever week the pipeline last ran. See `docs/anchoring.md`.

### Breeding

`bun run breed <corpus.jsonl>...` names the reviewer configurations nobody has
run yet, reachable by recombining the ones who have — closing the loop from
track records back to new reviews. A proposal has an identity but no
claims and no birth: it becomes an entity only by being run. See
`docs/breeding.md`.

### The bee

Proportions are the measured morphology of *Apis mellifera* workers, in
millimetres, with a citation per character — head 2.45 × 3.62, thorax 3.72,
abdomen 6.63, forewing 9.27 × 2.98. A character varies between identities only
where two published means disagree, and then only between them, so every bee
drawn coincides with a bee somebody measured — the ends of each range are named
populations, four Himachal apiaries or two subspecies, never an error bar. A
character with one published value does not vary at all. See
`docs/morphology-sources.md`, which lists the two citations that did not survive
being checked and the one that had to be opened by hand.

Individual build comes from hashing the genome's slots one at a time, so a part
moves only when the field that governs it moves and an offspring inherits its
parents' parts. It cannot be interpolated — a hash has no order — so a crossbred
bee recombines rather than blends. Nothing here reads the track record: identity
is fixed while the record grows.

### What a signature does and does not say

The publisher signs, not the reviewer — reviewers hold no keys by construction.
An attestation asserts that this hivemark instance observed a claim and the
verdict its skeptic reached. It does **not** assert the finding is correct, and
`verifyEnvelope` returns an `unverifiable` list saying so in as many words.

Signing is optional. With no `HIVEMARK_SIGNING_KEY` in the environment, hivemark
produces claims and a page and signs nothing. See `docs/attestation-signers.md`.

## Run

```bash
bun install
bun run test
bun run typecheck
bun src/cli.ts corpus.json dist
```

Bun executes the TypeScript sources directly, resolving the `.js` import
specifiers TypeScript requires — so there is no build step and `tsc` is kept
only for type checking. Tests still run on vitest; moving them to `bun test` is
a separate decision, not a consequence of this one.

## What the first run showed

From 35 real reviews and 112 claims:

| identity | reviews | claims | confirmed | refuted | uncertain | mean impact |
|---|---|---|---|---|---|---|
| graph | 13 | 43 | 32 | 2 | 9 | 4.74 / 10 |
| diff-only | 21 | 68 | 53 | 7 | 8 | 3.90 / 10 |
| graph (older Guardian) | 1 | 1 | 0 | 0 | 1 | 2.00 / 10 |

`impact_score` is an integer 0-10 assigned upstream **by the skeptic**, so where
the skeptic is the finder it is a model rating the importance of its own
findings — the page labels that case `self-graded mean impact`. Upstream has
also measured the axis as largely a restatement of `verdict` rather than an
independent signal (codegraph-brain#271), so read it as provisional.

**Do not read that as a controlled comparison.** The two reviewers saw almost
disjoint corpora — graph reviewed cal.com and sentry, diff-only reviewed
discourse and keycloak, overlapping only on grafana. A difference between the
rows may be a difference between codebases rather than between reviewers. The
generated page says so on its face, and the corpus is printed on every card.

## Where the corpus stood on 2026-08-12

A dated snapshot, kept because the reasoning below it still reads. These are
**generation-1 identities**, keyed on `guardian_sha` — the genome has since
moved to the review fingerprint (`GENOME_SCHEMA_VERSION` 2), collapsing the
eight rows into three; `docs/anchoring.md` records how one W33 root covers
both generations. The numbers are not maintained in prose: the generated page
recomputes them from whatever `corpus.json` names, and a second copy here
would only drift.

108 deduplicated reviews, 800 claims, 8 identities across two providers.

| identity | reviews | claims | resolved | rate | judged by |
|---|---|---|---|---|---|
| gemini · diff-only · `d0d807e` | 26 | 88 | 88 | 69% | another model |
| gemini · diff-only · `f9c36f5` | 19 | 63 | 63 | 71% | another model |
| mistral · graph · `aeebde9` | 19 | 289 | 289 | 85% | **itself** |
| gemini · graph · `d0d807e` | 18 | 59 | 59 | 75% | another model |
| mistral · graph · `112e437` | 11 | 166 | 166 | 80% | **itself** |
| mistral · graph · `4d1fe6a` | 8 | 108 | 108 | 92% | **itself** |
| gemini · graph · `f9c36f5` | 6 | 26 | 26 | 81% | another model |
| gemini · graph · `1ecd962` | 1 | 1 | 1 | 0% | another model |

**Eight rows, three configurations.** Five of these exist only because
`guardian_sha` is part of the genome and a commit landed mid-run — including the
last row, whose entire track record is one review. That is
[an upstream problem](https://github.com/zaebee/codegraph-brain/issues/375), and
until it is fixed the row count overstates how many distinct reviewers were run.

**The `judged by` column is load-bearing.** A rate awarded by the finder to
itself is not the same measurement as one awarded by a different model, and the
92% is the former.

## Honest limits

- Every rate here is measured over claims that were made. A defect no reviewer
  mentioned leaves no row anywhere, so nothing here says how much was missed,
  and a reviewer that says less is not distinguishable from one that misses
  less. Recall is measured upstream against golden findings, in
  `benchmarks/guardian/calibration.jsonl`, but those rows carry no reviewer
  fingerprint and share no `guardian_sha` with this corpus — so it cannot be
  attributed to any identity here. Asked for upstream in codegraph-brain#390.
- Runs whose output could not be parsed are counted separately from reviews and
  shown on the card. They used to be counted as reviews that found nothing.
- The human axis (`findings_applied`) has no data in benchmark artifacts and is
  never inferred from the skeptic.
- Cross-provider comparison is now partly possible and partly not. Matched on
  `graph` mode and the three projects both providers reviewed, mistral produces
  **14.8 claims per review against gemini's 3.4**, and the gap holds on every
  shared project — so it is a difference between reviewers, not between
  codebases. The confirmation rates are **not** comparable: mistral's skeptic is
  the same model as its finder, so its 84.7% is self-assessment, while gemini's
  75.6% was awarded by a different model. Cards and badges mark that; the
  numbers must not be read side by side without it.
- The two providers also ran under different Guardian revisions, which is an
  unresolved confound even on the claims rate.

## Drift guard

Both halves of the artifact are published contracts as of `codegraph-brain`
0.13.0, and both JSON Schemas are vendored and checked in the test suite.

```bash
pip install codegraph-brain==0.13.0
python -c "import json;from cgis.guardian.findings import Finding;\
  print(json.dumps(Finding.model_json_schema(),indent=2,sort_keys=True))" \
  > tests/fixtures/finding.schema.json
python -c "import json;from cgis.guardian.martian import ReviewRecord;\
  print(json.dumps(ReviewRecord.model_json_schema(),indent=2,sort_keys=True))" \
  > tests/fixtures/reviewrecord.schema.json
```

The two guards assert different things on purpose. `Finding` is checked for
**equality** — hivemark models every field of it. `ReviewRecord` is checked as a
**projection**: hivemark reads a subset and never touches token counts or
durations, so requiring them would break the pipeline over data it does not use.
What the projection guard enforces is that hivemark invents no field and
requires nothing the contract leaves optional.

Aligning with the published `ReviewRecord` tightened two fields that had been
guessed too loosely: `guardian_sha` is required and non-nullable upstream, so a
genome always knows its generation, and `skeptic_model` is required but nullable
— which is what makes a badge without a stinger reachable.

See `docs/superpowers/specs/2026-08-12-hivemark-design.md`.
