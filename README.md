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
DNA-derived avatars. No wallet, no contract, no gas.

**Milestone 2:** signed attestations, a weekly Merkle anchor, the SBT contract.

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

Guardian's `Finding` model ships in `codegraph-brain` on PyPI, so its JSON Schema
is vendored and the zod schema is checked against it. Regenerate with:

```bash
pip install codegraph-brain==0.10.0
python -c "import json;from cgis.guardian.findings import Finding;\
  print(json.dumps(Finding.model_json_schema(),indent=2,sort_keys=True))" \
  > tests/fixtures/finding.schema.json
```

The outer review record has no published contract yet — `martian.ReviewRecord`
postdates the v0.10.0 tag — so it is guarded by runtime validation instead.

See `docs/superpowers/specs/2026-08-12-hivemark-design.md`.
