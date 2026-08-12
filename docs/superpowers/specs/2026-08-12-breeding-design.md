# Breeding — proposing reviewer configurations worth running

**Status:** design, approved 2026-08-12
**Depends on:** the genome and identity model in `2026-08-12-hivemark-design.md`
**Supersedes:** the "Breeding" paragraph in that document's §Out of scope

## What this is

hivemark records which reviewers exist and how their claims fared. Breeding uses
that record for the one thing it is uniquely able to do: name **configurations
that have never been run but could be**, so the loop closes —

> reviews → claims → track records → proposals → reviews

The output is a work item, not an artifact: a list of genomes to hand to
Guardian. Nothing is published to a chain, and nothing is minted.

## A proposal is not an entity

A bred genome has an identity the moment it exists, because identity is derived:
`identity_id = keccak256(canonicalJson(genome))`, with an address and a bee
following from it. What it does **not** have is claims, a track record, or a
birth attestation — that record asserts a genome *was observed producing
reviews*, and a proposal has produced nothing.

A proposal becomes an entity by being run. It then enters the corpus through the
ordinary path, and breeding plays no part in that. The boundary is clean:
**breeding reads the corpus and writes a list. It never publishes.**

Identity and bee are still shown for a proposal, because both are computable
today — a configuration has a face before it has a history. Every proposal is
labelled as having no birth and no claims, so the two cannot be confused.

## Enumeration, not a mask

The `breed_dna` mask from `node-kitty` samples a space too large to enumerate.
This space is not large. With the corpus as of 2026-08-12 it has **eight
points**, so a mask would explore a subset of what enumeration covers entirely,
and add randomness for nothing.

**Heritable slots — three:**

| slot | why |
|---|---|
| `finder_model` | who finds |
| `skeptic_model` | who judges |
| `context_mode` | graph or diff-only |

`provider` is not a slot: it is read from `finder_model`, the rule `avatar.ts`
already enforces. Crossing them independently produces impossible reviewers.

**`guardian_version` is deliberately not heritable.** This is a distinction the
design did not previously have: **identity-forming and heritable are not the
same thing.** Every heritable field is part of identity, but not every identity
field is heritable. A Guardian revision is not a choice about how to review — it
is the version of the tool that happened to be running. Crossing it proposes
"run this on last month's Guardian", which nobody wants, and on the real corpus
it inflates five useful proposals into thirty-three mostly-stale ones.

Proposals therefore pin `guardian_version` to the newest revision observed.

## Lineage, kept without the mask

Enumeration alone loses provenance, which the mask had. It is recovered by
inverting the question: for each proposal, record the pairs of existing
identities whose slots between them cover all of its values — *who could have
been its parents*, rather than *which two did we cross*.

That gives completeness and ancestry at once. A proposal with no such pair
cannot arise from the corpus and is not proposed.

## Distance is the ordering

Each proposal carries the number of slots separating it from the **nearest**
existing identity, **and names which slots those are** — a distance without the
slot names says an experiment is controlled without saying what it controls for.

- **Distance 1** is a controlled experiment: whatever changes in the results is
  attributable to one slot.
- **Distance 2 or more** is confounded — the failure this project already met in
  milestone 1, where `graph` and `diff-only` were compared across near-disjoint
  corpora and the page had to say so.

Ordering is by distance ascending, then by identity, so it does not depend on
the order records were read.

**Parent track records are deliberately not shown.** They are confounded by
corpus — the generated page prints a warning saying exactly that — and placing
them beside a proposal invites the inference the whole project is built to
prevent. Distance orders the list; anyone wanting parent quality can look it up
knowing the caveat.

## Corpus is a vocabulary, not statistics

Breeding needs only which slot values have been observed and which combinations
have been run. It aggregates no claims, so mixing benchmark files from different
experimental arms — `martian-reviews.jsonl`, `martian-p3-run1.jsonl`,
`martian-repeat-reviews.jsonl`, which carry an `arm` field hivemark does not
model — is harmless here. The CLI accepts several paths and takes their union.

Whether mixing arms is sound for *track records* is a real question and a
different one. It is not answered here.

## Output

Derived, therefore not committed — the same rule track records follow, so it
cannot drift from the corpus it came from.

```
bun run breed <corpus.jsonl>...            # prints only
bun run breed --out dist <corpus.jsonl>... # also writes dist/proposals.json
```

Every argument that is not `--out` or its value is a corpus path. Per proposal:

```
finder · skeptic · context           distance 1 from ae9d8013 (skeptic)
  identity   0x…      no birth, no claims — nothing has run yet
  parents    ae9d8013 × 1889b8a4
```

A candidate identical to an existing identity is not a proposal and is omitted.

## What the first run will show

Recorded in advance so the result cannot be reframed afterwards. From the corpus
of 2026-08-12 — 83 reviews across three files, 7 identities, which are really 3
configurations run on 5 Guardian revisions:

- **5 proposals**, of which **4 are cross-provider** — a finder from one house
  with a skeptic from another, the combination the specimen plate could only
  show as hypothetical.
- **Every one of the five sits at distance 1.** That was not expected when the
  ordering was chosen, and it is the most useful fact here: each proposal is a
  controlled experiment against something already run, so whatever its results
  show can be attributed to a single slot. The ordering by distance therefore
  does no work on this corpus — it will, once a proposal is two slots out.

Verified against the corpus before this document was committed, rather than
predicted and hoped for.

**Confirmed on implementation.** The corpus had grown to 89 reviews by then, and
the count held: five proposals, four cross-provider, all at distance 1. It only
held after two bugs were found by running — subtraction keyed on identity rather
than configuration, which returned two already-run configurations as proposals,
and a CLI that dropped its first argument.

If those five turn out uninteresting, that is the honest outcome and it cost
nothing to learn.

## Failure modes

| situation | behaviour |
|---|---|
| a candidate matches a configuration already run | omitted — it is a fact, not a proposal. Matched on the three heritable slots, not on the identity hash: the same configuration under an older revision hashes differently and would otherwise return as a proposal at distance 0 |
| no parent pair covers a candidate | not proposed; it is unreachable from this corpus |
| corpus contains one identity | no proposals, and that is correct, not an error |
| a model name outside the provider table | refused by `providerOf`, as everywhere else |
| two corpus files disagree about a review | irrelevant — only the set of observed values is read |

## Testing

- **Completeness:** enumeration covers the full cartesian product of observed
  values; nothing invented, nothing skipped.
- **Subtraction:** no existing identity appears as a proposal; a corpus where
  everything has been run yields an empty list.
- **Lineage:** every proposal has at least one covering parent pair, and every
  pair named genuinely covers it.
- **Distance:** measured to the *nearest* existing identity, not the first
  encountered.
- **Revision:** every proposal carries the newest observed `guardian_version`,
  and none differs from an existing identity by that alone.
- **Provider follows finder:** no impossible genome is ever proposed.
- **Determinism:** the list and its order do not depend on the order records
  were read.
- **On real data:** the run produces the five proposals recorded above.

## Out of scope

**Interpolated bodies.** The parametric body refactor was justified partly as a
prerequisite for breeding, on the grounds that continuous proportions would let
an offspring be intermediate rather than a patchwork. **That claim was
premature and is corrected here:** proportions currently live in `RATIO`, shared
by every bee, so there is nothing to interpolate. Interpolation needs the
morphology-plus-identity-variation step recorded in the main spec, which comes
after this. The refactor stands on its own merits; the ordering argument for it
was wrong.

**Automated selection.** Nothing runs Guardian. A proposal is a suggestion for a
human, and the fitness that would justify automation costs a paid LLM run per
evaluation.
