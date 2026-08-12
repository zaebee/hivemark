# hivemark — soulbound track records for code-review agents

**Status:** design, approved 2026-08-12
**Depends on:** `codegraph-brain` (Guardian) artifacts — read-only
**Lane:** new repository, no upstream changes required for phase 1

## What this is

Guardian reviews pull requests and its findings already carry a verdict. What
Guardian does not have is a **reviewer that persists across runs**: recordings
are local JSON, scores are computed per benchmark run, and nothing accumulates
against the entity that produced them.

hivemark supplies exactly that missing piece — a durable, independently
verifiable, cumulative track record per reviewer identity — and nothing else.
It does not review code, does not judge findings, and does not change Guardian.

### Why a badge at all

A badge is not a reward. Reviewer agents have no memory across sessions, so an
accumulated token cannot motivate the thing it is attached to; claiming
otherwise would be the first lie in the system. The badge is a **record about**
a reviewer, for the human deciding whose reviews are worth reading.

This forces one design rule that everything else follows from: a badge states a
**verifiable claim with a resolved outcome**, never a participation count. "47
reviews performed" is a vanity metric. "39 claims confirmed, 6 refuted, 2
unresolved, mean impact 4.1" is a calibration.

## Ontology

### ReviewerGenome

What makes a reviewer itself:

| field | source today | notes |
|---|---|---|
| `provider` | derived from `model` | gemini / ollama / mistral — explicit prefix table; an unrecognised model is a refusal, never an "other" bucket |
| `model` | `guardian_metrics.jsonl` | ✅ recorded |
| `skeptic_model` | `guardian_metrics.jsonl` | ✅ recorded; `None` = skeptic off |
| `impact_threshold` | `guardian_metrics.jsonl` | ✅ recorded |
| `prompt_version` | — | ❌ **not recorded** (see Known gaps) |
| `context_mode` | — | ❌ **not recorded** — graph vs bare-diff |
| `schema_version` | hivemark | version of this genome schema |
| `known_fields` | hivemark | explicit set of fields present |

### ReviewerIdentity

```
identity_id = keccak256(canonical_json(genome))
```

`keccak256` because the address derivation below and the onchain contract both
live in EVM-land; a second hash function would mean two of everything.
`canonical_json` means sorted keys and no insignificant whitespace — the hash is
the identity, so its input must not depend on serialisation accidents.

Identity is the hash of its own DNA — content-addressed, not issued from a
counter. Borrowed deliberately from `pallets/kitties/src/lib.rs` in the
`node-kitty` repo, where `kitty_id = T::Hashing::hash_of(&kitty)`.

Two consequences, both wanted:

- Changing the prompt version births a **new** entity automatically. No manual
  versioning, no stale identity silently absorbing different behaviour.
- Two identically configured reviewers on different machines are **the same
  subject**, which is correct: identity here is configuration, not hardware.

`known_fields` and `schema_version` participate in the hash. This is what makes
the Known gaps survivable — see below.

### Claim

One finding plus its fate. Mirrors Guardian's `Finding`, adds identity and PR
coordinates:

```
identity_id                      who claimed it
repo, pr, commit_sha             where
file, line, anchor               what it is anchored to
severity, category, title
evidence, problem, fix
confidence      0-100            the finder's own number
verdict         confirmed | refuted | uncertain | unresolved
impact_score    0-10
```

`unresolved` is hivemark's addition and is load-bearing: Guardian's `verdict` is
`None` when the skeptic did not run. That absence must never be read as
confirmation.

### TrackRecord

**Derived, never stored.** Aggregated from claims on read, so it cannot drift
from the facts and cannot be tuned. Three independent axes, deliberately not
collapsed into one score:

1. **Skeptic axis** — confirmed / refuted / uncertain, from Guardian's skeptic.
2. **Human axis** — `findings_applied` from `rate_review()`: how many findings a
   human actually applied. The weightiest signal, because it is not an LLM
   grading an LLM.
3. **Bench axis** — precision/recall from `bench.py` / `calibrate.py`, where the
   identity has been benchmarked.

### Badge

An ERC-721 with transfers locked (ERC-5192 `locked()`), minted **once per
identity birth**. Track record is resolved dynamically through `tokenURI`, so
the cost is paid per entity, not per review.

**Ownership.** The owner address is derived from the genome:

```
owner_address = last_20_bytes(keccak256(identity_id))
```

The same shape EVM uses to turn a public key into an address — which is the
point: it looks like an ordinary address and behaves like one, except that the
preimage is a genome rather than a key, so no key exists to produce a signature
from it.

No private key exists for it — including for the repository owner. The badge
therefore cannot be sold (it is soulbound regardless), the entity cannot be
impersonated, and anyone can recompute the address from a published genome and
confirm it is that entity. Identity *is* the address. The cost is
irreversibility: there is no admin recovery. Nothing is recoverable because
nothing is transferable.

## Pipeline

Six components, each with one job. The flow is strictly one-way: hivemark reads
Guardian's artifacts and Guardian knows nothing about hivemark.

| component | does | in → out |
|---|---|---|
| `harvest` | read + normalise artifacts | `guardian_metrics.jsonl` + `FinderRecording` → `Claim[]`, `Genome[]` |
| `identity` | content-address a genome | `Genome` → `identity_id` |
| `attest` | sign one claim | `Claim` → EIP-712 offchain attestation |
| `anchor` | weekly timestamp | attestations → one Merkle root tx |
| `derive` | aggregate | `Claim[]` → `TrackRecord` |
| `publish` | showcase | `TrackRecord` → page + shields JSON + avatar |

### The join seam

`guardian_metrics.jsonl` carries identity (`model`, `skeptic_model`,
`impact_threshold`); `FinderRecording` carries the findings and the diff. They
join on `pr` — but a PR can be reviewed several times (re-run, different
provider).

Phase 1 joins on `(pr, timestamp)` with a tolerance window and **refuses**
ambiguous matches, naming the candidates. It never picks the closest and
proceeds. This follows the precedent already set in codegraph-brain #345: an
ambiguous hit is a false positive.

A `run_id` written upstream would remove the seam entirely. Not required to
start.

## Verification

Three tiers, ascending in cost.

**1. Signed attestation per claim — free.** EAS schema, texts kept offchain and
referenced by `claimHash`:

```
identityId   bytes32     repo, pr, commitSha
file, line               category, severity
confidence   uint8       verdict uint8
impactScore  uint8       appliedByHuman bool
claimHash    bytes32
```

An EIP-712 signature is verifiable by anyone against the public key, without
trusting the publisher and without touching a network.

**2. Weekly Merkle anchor — one transaction.** Root of the period's
attestations, plus period bounds and count, onchain on Base. This is what a
signature alone cannot give: proof that a claim existed **no later than** a
given date. Hundreds of reviews still cost one transaction per week.

**3. SBT mint — rare.** Only on the birth of a new identity.

### Cost

Contract deployment is a one-time single-digit-dollar item on an L2; mints occur
only when a genome is new; the anchor is one transaction per week. Attestations,
avatars and the page are free. **Verify current gas before committing to
figures** — they move.

The chain is the *showcase* layer, not the *rigour* layer. Rigour comes from
Guardian. Anchoring adds permanence, public timestamps and independent
verifiability; it does not make the data more true.

## Showcase

- **GitHub Pages site** — one card per reviewer identity: genome (with unknown
  fields explicitly marked as unknown), track record across all three axes,
  lineage, and links to the EAS explorer and the anchor transaction.
- **Shields badge in README** — via an `endpoint` JSON, the pattern already in
  use in codegraph-brain for `health_badge.json`.
- **Avatar derived from DNA** — rendered deterministically from the bytes of
  `identity_id`, the way kitty appearance derived from `dna`. Free,
  reproducible, and it needs no mechanism the design does not already have.

## Failure modes

**The dangerous one is not a crash — it is identity collapse.** If
`prompt_version` is unknown and simply omitted from the hash, two reviewers with
different prompts collapse into one `identity_id` and their track records merge.
The system would then lie confidently and undetectably.

Mitigation: `known_fields` and `schema_version` are part of the genome and
therefore part of the hash. Adding `prompt_version` later legitimately **forks**
identities — visible as a new generation rather than as corruption of old data.

| situation | behaviour |
|---|---|
| ambiguous metrics ↔ recording join | refuse, naming candidates |
| `skeptic_status` = off / failed / partial | claim is `unresolved`; never confirmed by default |
| `parse_failed` run | not LGTM, not zero-findings — inherits Guardian's care |
| re-run of the same PR | dedup by `claimHash`; no duplicate attestation |
| human disagrees with the skeptic | new **superseding** attestation; history never rewritten |
| anchor tx fails or reorgs | idempotent retry; a missed week is recorded as a gap, never backfilled silently |
| identity already minted | contract reverts — one SBT per genome |

### Survivorship bias must be displayed

`metrics.py` states it outright: a failing review writes no record at all, so the
data is *"survivorship-biased by construction"*. Every track record is therefore
systematically optimistic. This belongs on the reviewer card as a standing
disclaimer, not in a footnote discovered later — otherwise hivemark becomes the
gallery of victories it was built to avoid.

### Key handling

Signing and anchoring are separate privileges. The anchor runs weekly in its own
protected workflow (or by hand); the signing key never appears in the CI of an
ordinary review.

## Testing

- **Identity (property tests):** same genome → same id; any field change → a
  different id; an unknown field is never equal to a known field carrying a
  default.
- **Join:** a fixture with two runs of one PR must produce a refusal, not a
  nearest-match guess.
- **Merkle:** a valid proof verifies; a tampered claim does not.
- **Address:** deterministic and matching the published derivation.
- **Contract:** transfer reverts (ERC-5192); minting a known genome twice
  reverts.
- **End-to-end on real data:** codegraph-brain already holds real recordings and
  a populated `guardian_metrics.jsonl`. The first run must build track records
  from Guardian's **actual** history, not from synthetic fixtures. How many
  claims land as `unresolved` is the project's first honest result.

## Implementation language

**TypeScript throughout** — pipeline, showcase and contract tooling.

The competing option was Python, which wins on one real point: Guardian's data
contracts are pydantic models, so a Python consumer imports them and schema
drift becomes impossible by construction rather than by discipline.

TypeScript wins anyway because the gap it loses is closable and the gap it wins
is not:

- **Drift is mechanically solved.** `model_json_schema()` on Guardian's pydantic
  models emits JSON Schema; types are generated from it and the generation is
  checked in CI. A schema change upstream then breaks the build instead of
  silently corrupting track records. Soft risk → hard failure.
- **Milestone 2 has no Python equivalent.** EAS ships an official TypeScript
  SDK. In Python, EIP-712 signing and attestation handling are hand-rolled over
  `eth-account` / `web3.py` — our code where someone else's tested code exists.
- **The showcase is the web.** Page, shields endpoint and the DNA-derived SVG
  avatar are native there.

Rust was the original motivation for the `node-kitty` repository this design
borrows from, and is deliberately not used: for a JSON pipeline and a static
page it offers the slowest iteration and the thinnest attestation tooling.
Returning to Rust deserves to be its own decision, not a smuggled one.

## Delivery order

Phase 1 as described is still too much for one implementation plan — it spans a
Python pipeline, a Solidity contract and a published site. It splits cleanly at
the point where money and keys enter:

**Milestone 1 — the track record, entirely offchain.** `harvest`, `identity`,
`derive`, plus the page and the shields endpoint. No wallet, no contract, no
gas. Its completion test is the end-to-end run against Guardian's real history.
This milestone is independently useful: if the numbers turn out uninteresting,
nothing has been spent finding out.

**Milestone 2 — verifiability.** `attest` (free, signed), then `anchor`, then
the SBT contract. Each of the three is separately shippable in that order, and
the first of them still costs nothing.

The first implementation plan covers **milestone 1 only**.

## Known gaps

1. `prompt_version` and `context_mode` are absent from Guardian's artifacts.
   Phase 1 builds genomes from what is recorded today and marks them incomplete.
   A small upstream PR closes this; identities will fork when it lands, by
   design.
2. The metrics ↔ recording join is heuristic until an upstream `run_id` exists.
3. Gas figures in this document are orders of magnitude, not quotes.

## Out of scope for phase 1

**Breeding.** Reviewer genomes are discrete configuration bits, Guardian runs
finder and skeptic as two potentially different providers (a genuine
two-parent structure), and `bench.py` already computes a fitness function — so
crossbreeding two reviewer configurations via the `breed_dna` mask from
`node-kitty` is a real directed search, not decoration.

It is deferred because it is meaningless without track records to select on, and
because each evaluation costs a paid LLM run — real genetic search needs cheap
fitness, which this is not. Realistically: lineage plus occasional deliberate
crossbreeding, with intensity set by budget. Phase 2.
