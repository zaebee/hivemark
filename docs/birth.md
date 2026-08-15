# Birth runbook

A birth attestation announces a reviewer identity once, publishing its whole
genome so an outsider can recompute the entity without asking us. Identities are
rare — three in the current corpus — so this runs when a new one appears, not on
a schedule.

## Why this is not a token

An earlier design specified an ERC-721 with locked transfers. It was dropped
because **a token cannot confer existence here.** Identity is the hash of the
genome and the address derives from it, so anyone holding a genome computes both
without a chain. A contract would not create an entity, only announce one — and
an attestation announces the same thing with none of our code on the chain.

An earlier draft of this page argued that the keyless address undercuts a token,
since an NFT's advantage is appearing in a wallet. That reasoning was withdrawn
under review: a soulbound token is non-transferable anyway, so the missing key
costs it nothing — its value is display, which needs no key.

The option stays open. Because identities are content-addressed, a token minted
later attaches to exactly the same entities, retroactively. What is *not* claimed
is that the two are equivalent in meaning — a token reads culturally as an
object and an attestation as a record, and for a project about giving digital
entities standing that difference is real.

## Setup

The **anchoring wallet is reused** — see `docs/anchoring.md`. It already exists
for spending, holds a minimal balance, and is not in CI.

The birth schema must be registered once, alongside the other two, against the
SchemaRegistry at `0x4200000000000000000000000000000000000020` with
`resolver = 0x0` and `revocable = true`:

| | |
|---|---|
| schema | `BIRTH_SCHEMA` in `src/birth/schema.ts` |
| UID | `0xde2b5303867b8d593b14ccccf4e168d1e8afbce0a66881facf1f9047799e01e5` |
| superseded UID | `0x6ca5f932f49e5ac467c1ca24c5af39800a12df874d3856b4afdd54800c07ed02` — version 1, registered and unrevoked, named a single provider and a guardianVersion |

The UID is derived, so attestations prepared before registration resolve the
moment it exists.

## When a new identity appears

**1. Inspect.**

```bash
bun scripts/send-births.ts
```

Prints every identity with no birth record, its genome, the date it was first
seen, and whether the chain already holds a birth for it — and sends nothing.
Printing `every identity in this corpus already has a birth record` is the
normal state.

`src/cli-birth.ts` prints the raw calldata for the same identities, for pasting
into a wallet. It exists for the case where the key is not on this machine; when
it is, prefer the script, because a wallet cannot run the checks in step 2.

**2. Broadcast.**

```bash
bun scripts/send-births.ts --send
```

Reads `~/.hivemark/anchoring.key`, which a run without `--send` never opens.
Before each send it refuses if the schema is unregistered, if the genome does
not hash to the identity it names, if the entity is not that identity's address,
if the balance cannot cover *every* pending birth, or if the chain already holds
a birth for that entity — the last being the check `births.json` cannot make
about itself, since a lost commit or a stale checkout makes a born identity look
unborn. Each success is confirmed by decoding the receipt's own `Attested`
event.

**3. Record it.** Append to `births.json` — identity, entity, first seen, the
transaction hash, the resulting attestation UID, and the time. Commit it. Until
that lands, the chain and the repository disagree, and step 2 refuses to run.

## The births announced so far

Genome schema version 2, all on Base, all unrevoked.

| genome | entity | first seen | attestation |
|---|---|---|---|
| gemini · graph · `1a28844` | [`0x180299a0…`](https://basescan.org/address/0x180299a08C6A36A226dE330a453414755D84E8EB) | 2026-08-12 11:27:57Z | [`0x754d6bcc…`](https://basescan.org/tx/0xc883987c2787dd5053fefdedb0fe00f2d709394721180119f5273728ba1e4849) |
| gemini · diff-only · `1a28844` | [`0xE3aFb42A…`](https://basescan.org/address/0xE3aFb42A25F000b5C999b86933eB694Bb1D24089) | 2026-08-12 15:18:57Z | [`0xb27a51ae…`](https://basescan.org/tx/0xf80cdbecf9aca7a388716fa16a1e3f4b3f85ea64bbe2f9c977f8b7580d58415a) |
| mistral · graph · `eebfdf9` | [`0x9dF50D27…`](https://basescan.org/address/0x9dF50D273CBFa1aB6E9FC4e06F2cf7b2CFF7c1f1) | 2026-08-12 22:14:43Z | [`0x59d033c7…`](https://basescan.org/tx/0xc0dc2ad1e25f1b2b25f86a20923bc9c8dfd6a13e8bb2fc1076fd26ee6283c5b8) |

Announced 2026-08-15, about 811,000 gas each. No address here has a private key:
each is the last 20 bytes of its identity's hash, so nothing can ever spend from
it or sign as it. That is the point — the entity is a name for a genome, not an
account somebody holds.

## What a birth attestation claims

That this genome was observed producing reviews, and that its identity and
address derive from it exactly as published.

It does **not** claim the reviewer is any good — that is what the track record
is for. And `firstSeen` is the earliest review we hold, not a claim that the
entity did not exist before it: a genome that produced reviews we never
harvested was already that same entity, since identity is derived, not granted.
