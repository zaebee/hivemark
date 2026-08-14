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

**Corrected 2026-08-12 after inspecting the actual artifacts.** An earlier draft
of this document named `guardian_metrics.jsonl` as the source and declared two
fields unrecorded. Both claims were wrong and are retracted here rather than
edited into silence: that file is written at runtime and is not in the
repository, and the artifact that *is* there records more, not less.

The source is `benchmarks/martian-reviews.jsonl` — one record per review,
carrying identity and findings together.

| field | source today | notes |
|---|---|---|
| `provider` | derived from `finder_model` | gemini / ollama / mistral — explicit prefix table; an unrecognised model is a refusal, never an "other" bucket |
| `finder_model` | `finder_model` | ✅ |
| `skeptic_model` | `skeptic_model` | ✅ `None` = skeptic off |
| `context_mode` | `had_graph` / `pr_slice` | ✅ graph vs diff-only — **recorded after all** |
| `guardian_version` | `guardian_sha` | ✅ pins the whole Guardian codebase — strictly better than a `prompt_version` string, which could not distinguish two prompts at the same version number |
| `schema_version` | hivemark | version of this genome schema |
| `known_fields` | hivemark | explicit set of fields present |

`impact_threshold` is not in this artifact. It is a reporting filter rather than
a behavioural trait — it hides findings after the fact instead of changing what
the reviewer finds — so it is deliberately **not** part of the genome.

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
   grading an LLM. **Absent from `martian-reviews.jsonl`**, which is benchmark
   output rather than production review history. The axis is therefore rendered
   as "no data", never silently backfilled from the skeptic — an LLM grading an
   LLM is precisely what this axis exists to be independent of.
3. **Bench axis** — precision/recall from `bench.py` / `calibrate.py`, where the
   identity has been benchmarked.

### Badge

**Retracted 2026-08-12, before implementation.** This section specified an
ERC-721 with transfers locked (ERC-5192), minted once per identity. It is
replaced by an **EAS birth attestation** carrying the genome, for reasons that
only became clear once the rest of the design existed.

**A token cannot confer existence here, because identity is content-addressed.**
`identity_id` is the hash of the genome and the address is derived from it, so
anyone holding a genome computes both without a chain, today. A contract would
not create an entity; it would announce one. An attestation announces the same
thing, on the same chain, in a public registry, with no code of ours in it.

**~~The keyless address undercuts what a token would buy.~~ Withdrawn 2026-08-12
after review.** The argument ran: an NFT's advantage is appearing in a wallet,
and the owner address has no private key, so the token would sit somewhere
nobody can open. It does not hold. An ERC-5192 token is non-transferable by
design, so the missing key costs it nothing — a soulbound token's value is
display, and display needs no key. The point is struck rather than deleted
because a spec that quietly loses its weakest argument teaches nothing.

The decision stands on the two reasons that survive, and it did not need a
third.

**Deferring costs nothing, and that is unusual.** Because identities are
content-addressed, a token minted later attaches to exactly the same entities,
retroactively. Unlike the signing domain — which had to be settled before the
first signature or invalidate everything — this decision stays open. Writing
permanent, unpatchable on-chain code to buy something available later is the
wrong trade for a first version.

What is **not** claimed: that a token and an attestation are equivalent in
meaning. A token reads culturally as an object, an attestation as a record, and
for a project about giving digital entities standing that difference is real. It
is a reason the option is kept open rather than closed.

### Birth attestation

One EAS onchain attestation per identity, the first time it is seen, carrying:

```
identityId   bytes32     entity address (derived, keyless)
provider, finderModel, skepticModel, contextMode, guardianVersion
genomeSchemaVersion       firstSeen uint64
```

The whole genome is published, not just its hash — the same principle as
`leafDomain` in the anchor schema. A reader who has the record can recompute the
identity, the address and the bee without asking us for anything.

`firstSeen` is the earliest `reviewed_at` among that identity's reviews, so it is
derived from data rather than from when we got round to announcing.

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
| `harvest` | read + normalise artifacts | `martian-reviews.jsonl` → `Claim[]`, `Genome[]` |
| `identity` | content-address a genome | `Genome` → `identity_id` |
| `attest` | sign one claim | `Claim` → EIP-712 offchain attestation |
| `anchor` | weekly timestamp | attestations → one Merkle root tx |
| `derive` | aggregate | `Claim[]` → `TrackRecord` |
| `publish` | showcase | `TrackRecord` → page + shields JSON + avatar |

### No join seam

An earlier draft designed a heuristic join between two artifacts and a refusal
path for ambiguous matches. Inspection removed the problem: one
`martian-reviews.jsonl` record carries identity *and* findings *and* commit
coordinates together. There is nothing to join and no ambiguity to refuse.

What remains is **duplicate review detection**: the same
`(url, head_sha, genome)` reviewed twice. The later `reviewed_at` supersedes;
both are kept in history.

The file is append-only and is written while benchmark runs are in progress — it
grew by one record during the inspection that produced this section. `harvest`
must therefore tolerate a truncated final line (a partial write) by skipping it
with a warning, and must never assume a stable record count between reads.

## Verification

Three tiers, ascending in cost.

**1. Signed attestation per claim — free.** EAS schema, texts kept offchain and
referenced by `claimHash`:

```
identityId   bytes32     repo, pr, commitSha
file, line               category, severity
confidence   uint8       verdict uint8
impactScore  uint8       claimHash bytes32
```

An EIP-712 signature is verifiable by anyone against the public key, without
trusting the publisher and without touching a network.

**Corrected 2026-08-12, before implementation.** Two things an earlier draft of
this section got wrong.

`appliedByHuman` was in the field list. It cannot be populated: the human axis
has no data in benchmark artifacts, as §Track record already states. Signing a
field we can only ever set to `false` would assert something we did not observe,
so it is removed. It returns when a production source supplies it.

**Offchain does not mean chain-free.** EAS binds an offchain attestation to a
chain in its EIP-712 domain — `TypedDataConfig` requires `chainId` and the EAS
contract `address`, and both are covered by the signature. Verification still
needs no network, but the domain must be chosen before the first signature and
cannot change afterwards without invalidating everything signed under it.

The domain is therefore **Base mainnet from the first signature**. Signing costs
nothing on any chain, so choosing mainnet buys permanence for free and avoids a
migration that would otherwise discard the whole history. Values, taken from
`ethereum-attestation-service/eas-contracts` at `deployments/base/` and each
confirmed to carry bytecode via `eth_getCode` on a public Base RPC:

| | |
|---|---|
| chainId | `8453` (matches the RPC's own `eth_chainId`) |
| EAS | `0x4200000000000000000000000000000000000021` |
| SchemaRegistry | `0x4200000000000000000000000000000000000020` |

### What a signature claims, and what it does not

The **publisher** signs, not the reviewer. Reviewers hold no keys — their
addresses are derived from genomes precisely so that no key exists — so an
attestation reads:

> this hivemark instance observed that identity X made claim Y, which the
> skeptic resolved as Z

It does **not** assert that the finding is correct. Truth of a claim is the
skeptic's and the human's business, recorded in `verdict` and `impact_score`;
the signature covers provenance and integrity only. Anyone reading these as
proof of correctness has read them wrong, and the published page must say so
where the attestations are surfaced.

**2. Weekly Merkle anchor — one transaction.** Root of the period's
attestations, plus period bounds and count, onchain on Base. This is what a
signature alone cannot give: proof that a claim existed **no later than** a
given date. Hundreds of reviews still cost one transaction per week.

**Settled 2026-08-12, before implementation.** The root travels as an **EAS
onchain attestation** under its own schema, not as a contract of our own. A
contract to store 32 bytes a week would be a permanent liability — written,
tested, deployed and then never touched — to reproduce something the schema
registry already does. Using EAS also means the anchor appears on easscan beside
the claims it covers, and reuses every piece already built.

Registering the claim schema moves into this milestone too, since it is the
first step that spends gas at all. A pleasant consequence: the schema UID is
derived rather than assigned, so **every attestation signed before registration
resolves retroactively** the moment the schema exists.

The anchoring key is a **separate wallet holding a minimal balance**, and the
anchor is **run by hand**. Weekly cadence does not need automation, and a funded
key in CI would be the largest new attack surface in the project — the one thing
`attest` was careful to avoid. `docs/attestation-signers.md` gains a row for it:
this key spends, so it is not the signing key and must not be confused with one.

**3. Birth attestation — rare.** Only the first time an identity is seen. Three
exist in the current corpus, so this is a handful of transactions, not a stream.

### Cost

**Measured 2026-08-12, correcting an earlier estimate that was wrong by two
orders of magnitude.** This document previously described the running cost as
roughly a coffee a month. At Base's gas price of 0.0060 gwei and ETH at $1,883:

| | |
|---|---|
| one anchor transaction (~120k gas) | **$0.0014** |
| schema registration (~200k gas, one-off) | **$0.0023** |
| a full year of weekly anchors | **$0.07** |

Seven cents a year. Gas moves, so re-measure before quoting these — but the
conclusion survives a hundredfold increase, which puts a year at seven dollars.

This changes what the constraint actually is. **Money is not the limit; key
custody is.** The anchoring key spends funds, unlike the signing key, which
spends nothing and could therefore be treated casually by comparison. Every
decision about the anchor should be argued on operational risk, never on cost.

Attestations, avatars and the page remain free.

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
| truncated final line (concurrent append) | skip with a warning; never abort the run, never guess the rest |
| `verdict` absent / `skeptic_model` null | claim is `unresolved`; never confirmed by default |
| `parse_failed` run | not LGTM, not zero-findings — inherits Guardian's care |
| re-run of the same PR | dedup by `claimHash`; no duplicate attestation |
| human disagrees with the skeptic | new **superseding** attestation; history never rewritten |
| anchor tx fails or reorgs | idempotent retry; a missed week is recorded as a gap, never backfilled silently |
| identity already announced | refused — one birth attestation per genome |

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
- **Harvest robustness:** a fixture whose last line is truncated mid-object must
  yield every complete record plus one warning — not an exception, and not a
  silently short result.
- **Duplicates:** the same `(url, head_sha, genome)` twice must resolve to the
  later `reviewed_at` while both remain in history.
- **Merkle:** a valid proof verifies; a tampered claim does not.
- **Address:** deterministic and matching the published derivation.
- **Birth:** an identity already announced is not announced twice; the published
  genome recomputes to the identity_id it claims.
- **End-to-end on real data:** `benchmarks/martian-reviews.jsonl` in
  codegraph-brain holds 36 real reviews and 116 findings. The first run must
  build track records from that **actual** history, not from synthetic
  fixtures. A copy is vendored into hivemark as a frozen fixture so the tests
  do not depend on a sibling checkout or on a file that grows mid-run.

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
the birth attestation. Each of the three is separately shippable in that order, and
the first of them still costs nothing.

Milestone 1 is complete and merged. The second implementation plan covers
**`attest` only** — no wallet, no transaction, no key in CI. `anchor` and the
birth attestation each get their own plan, and the questions they raise (funding a
wallet, where the key lives, how a missed week is recorded) are deferred to
them. The one decision `attest` cannot defer is the signing domain, because it
is covered by every signature — settled above.

## Known gaps

1. **The human axis has no data in this source.** `martian-reviews.jsonl` is
   benchmark output; `findings_applied` lives in production metrics that are not
   committed to the repository. Until a production source is wired in, every
   track record rests on two axes, and the card must say so.
2. ~~**The corpus is narrow.** All 36 records use `gemini-2.5-flash` as finder
   and `gemini-3.5-flash` as skeptic. The three distinct genomes differ only in
   `had_graph` and `guardian_sha`. Cross-provider comparison — the thing that
   makes "digital entities with different characters" more than a phrase — needs
   ollama and mistral runs that do not exist yet.~~

   **Superseded 2026-08-14.** The mistral runs arrived. The corpus is 115
   records — 108 after deduplication, which is what a track record counts —
   across 8 identities and two providers, and the comparison this gap was
   waiting for exists: matched on `graph` mode and the three shared projects,
   14.8 claims per review against 3.4, holding on every project separately.

   Both counts are stated because the difference is not bookkeeping. The seven
   superseded re-runs are still signed and will still be covered by an anchor,
   so the same corpus yields 932 attestations and 800 counted claims. That is
   recomputable by any reader from published attestations alone, and the dry run
   prints it before broadcasting.

   The gap closes only half way, and the half it does not close was not
   anticipated here. mistral's skeptic is the same model as its finder, so its
   confirmation rate is self-assessment and cannot be set beside gemini's. This
   spec assumed a wider corpus would make the rates comparable; it made the
   claims rate comparable and left the rate this document treats as the headline
   measurement no more comparable than before. See #13, and `judge` on
   `SkepticAxis`.

   Ollama still does not exist in the corpus.
3. Gas figures in this document are orders of magnitude, not quotes.

## What the first run will show

Stated in advance so the result cannot be quietly reframed afterwards. From the
36 records currently on disk:

- **3 identities**, differing in `had_graph` (14 graph / 22 diff-only) and one
  older `guardian_sha`.
- **116 claims**, resolved by the skeptic as 86 confirmed, 11 refuted, 19
  uncertain.
- The interesting comparison available on day one is graph-enabled versus
  diff-only — the same question as gate G5 in codegraph-brain's own benchmark
  spec, approached from the reviewer's side rather than the corpus's.

If these numbers turn out to say nothing interesting, that is the honest outcome
of milestone 1 and it will have cost nothing to learn.

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

**A parametric body for the bee.** `src/avatar.ts` currently places every part by
literal coordinate — `cx="100" cy="176" rx="42" ry="58"` and a dozen more. That
is a drawing transcribed, not a body computed, so changing anything means
re-deriving the numbers around it by hand.

The refactor worth doing derives the whole figure from a few proportions: head
radius sets the thorax offset, the thorax sets the wing attachment points, the
abdomen's length sets where the stinger begins.

The reason it is more than tidying: **proportions are continuous and the current
traits are not.** Today a genome either has a stinger or does not, one wing pair
or two.

**~~With a parametric body, crossbreeding could interpolate rather than pick a
slot per trait, so an offspring could be genuinely intermediate instead of a
patchwork of whichever parent won each field.~~ Struck 2026-08-12, on
implementing it.** It cannot be delivered, and not for want of trying: **a hash
has no order.** Variation derived from hashing a model name can be inherited but
never blended — a child whose finder came from one parent and whose skeptic came
from the other gets a third value for any character, not a value between its
parents'. A genuinely intermediate build would need a numeric axis along which
one model lies between two others, and no such axis exists; inventing one would
be taste wearing a number's clothes.

What a parametric body actually buys is **heritability**: an offspring's head is
its finder-parent's head exactly, its wings its context-parent's wings, so
lineage becomes visible. That is worth having under its own name, and it is a
different claim from the one this paragraph made. See
`docs/superpowers/specs/2026-08-12-morphology-design.md`.

The constraint from §Badge still binds: proportions may be read from the genome
and never from the track record. A body responding to confirmations would make a
fixed identity look mutable.

**Agreed direction for where the ratios come from, once breeding exists.** The
base should be the measured morphology of *Apis mellifera*, cited — that turns
the constants from one person's taste into a fact about the world, which is the
standard every other number in this project is held to. Individual variation
then comes from ~~bits of `identity_id`~~ **the genome's slots hashed one at a
time — corrected 2026-08-12 for the reason above.** `identity_id` is the digest
of the whole genome, so changing one slot moves every byte of it and a child's
build would bear no relation to its parents'. Hashing each field separately
satisfies "from the genome" more literally — the proportions read the fields,
not their fingerprint — and is what makes a body inheritable at all.

Bounds stay tight enough that a bee stays a bee. Determinism survives, since
identical genomes hash identically; what changes is that two distinct identities
differ in build and not only in colour and wing count.

Deliberately after breeding, not before: the fixed set of proportions should be
seen working before a second source of variation is added to it.

The tempting third source is refused. Numbers from a review — confirmed, refuted,
impact — are track record, and a bee that filled out as findings were confirmed
would look alive at the cost of showing a fixed identity as mutable.
