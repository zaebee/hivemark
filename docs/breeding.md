# Breeding

Breeding names the reviewer configurations that have never been run but are
reachable by recombining the ones that have. The output is a work item — genomes
to hand to Guardian — and it closes the loop:

> reviews → claims → track records → proposals → reviews

## Run it

```bash
bun run breed <corpus.jsonl>...            # prints only
bun run breed --out dist <corpus.jsonl>... # also writes dist/proposals.json
```

Printing no proposals is the healthy state: it means the corpus has been
explored.

## A proposal is not an entity

A proposed genome has an identity the moment it exists, because identity is
derived — and an address and a bee follow from it. It has **no claims, no track
record and no birth attestation**. A birth asserts that a genome was observed
producing reviews, and a proposal has produced nothing.

It becomes an entity by being run, entering the corpus through the ordinary
path. Breeding plays no part in that, and publishes nothing to any chain.

## What is recombined, and what is not

Three slots: `finder_model`, `skeptic_model`, `context_mode`.

`provider` is not one — it is read off the finder model, so crossing them
separately would produce impossible reviewers.

`guardian_version` is not one either, and the distinction is worth stating:
**identity-forming and heritable are not the same thing.** A Guardian revision
distinguishes entities, and rightly so, but it is not a choice about how to
review — it is the version of the tool that happened to be running. Crossing it
would propose running on last month's Guardian, and on the real corpus it
inflated five useful proposals into thirty-three mostly stale ones.

Every proposal therefore carries the newest revision observed, where **newest is
decided by `reviewed_at` and never by sorting the sha**, which has no
chronological order at all. On the real corpus the two answers differ, and both
look like plausible shas.

The same distinction governs subtraction. Whether a configuration has been run
is a question about the configuration, not about the revision that ran it — so
an existing configuration is recognised by its three heritable slots, not by its
identity hash. Keyed on identity, a configuration already run under an older
revision comes back as a proposal at distance 0.

## Distance, and why parent records are absent

Each proposal reports how many slots separate it from the nearest existing
identity, and which ones. Distance 1 is a controlled experiment: whatever the
results show is attributable to a single slot. Distance 2 or more is confounded —
the failure this project already met when `graph` and `diff-only` were compared
across near-disjoint corpora, which the generated page still warns about.

Parent track records are deliberately not shown. They are confounded by corpus,
and putting them beside a proposal invites exactly the inference the rest of the
project is careful to prevent. Distance orders the list; anyone wanting parent
quality can look it up knowing the caveat.

## What it says today

From 89 reviews across three benchmark files — seven identities, which are
really three configurations run on several Guardian revisions:

**Five configurations have never been run, four of them cross-provider** — a
finder from one house with a skeptic from another, the combination the specimen
plate could only show as hypothetical. Every one sits at distance 1, so each is
a controlled experiment against something already run.
