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

**Milestone 2, step 2 (this):** one Merkle root per calendar week, published as
an EAS onchain attestation, so an attestation can be shown to have existed no
later than a given block. Run by hand — see `docs/anchoring.md`. A skipped week
stays a gap and is never backfilled, because an anchor published late would
assert that its contents existed by a date that has now passed.

**Milestone 2, step 3 (this):** each identity is announced once as an EAS birth
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
bun src/cli.ts tests/fixtures/martian-reviews.sample.jsonl dist
```

Bun executes the TypeScript sources directly, resolving the `.js` import
specifiers TypeScript requires — so there is no build step and `tsc` is kept
only for type checking. Tests still run on vitest; moving them to `bun test` is
a separate decision, not a consequence of this one.

## What the first run showed

From 35 real reviews and 112 claims:

| identity | reviews | claims | confirmed | refuted | uncertain | mean impact |
|---|---|---|---|---|---|---|
| graph | 13 | 43 | 32 | 2 | 9 | 4.74 |
| diff-only | 21 | 68 | 53 | 7 | 8 | 3.90 |
| graph (older Guardian) | 1 | 1 | 0 | 0 | 1 | 2.00 |

**Do not read that as a controlled comparison.** The two reviewers saw almost
disjoint corpora — graph reviewed cal.com and sentry, diff-only reviewed
discourse and keycloak, overlapping only on grafana. A difference between the
rows may be a difference between codebases rather than between reviewers. The
generated page says so on its face, and the corpus is printed on every card.

## Honest limits

- Guardian writes no record for a review that fails, so every track record here
  is survivorship-biased and systematically optimistic.
- The human axis (`findings_applied`) has no data in benchmark artifacts and is
  never inferred from the skeptic.
- The corpus uses a single finder/skeptic pair, so cross-provider comparison is
  not yet possible.

## Drift guard

Both halves of the artifact are published contracts as of `codegraph-brain`
0.11.0, and both JSON Schemas are vendored and checked in the test suite.

```bash
pip install codegraph-brain==0.11.0
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
