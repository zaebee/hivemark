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
| UID | `0x6ca5f932f49e5ac467c1ca24c5af39800a12df874d3856b4afdd54800c07ed02` |

The UID is derived, so attestations prepared before registration resolve the
moment it exists.

## When a new identity appears

**1. Inspect.**

```bash
bun src/cli-birth.ts tests/fixtures/martian-reviews.sample.jsonl births.json
```

Prints every identity with no birth record, its genome, the date it was first
seen, and the exact transaction — and sends nothing. Printing
`every identity in this corpus already has a birth record` is the normal state.

**2. Broadcast.** Call `attest` on the EAS contract at
`0x4200000000000000000000000000000000000021` with the printed schema and data,
the entity as recipient, zero expiration and zero refUID.

**3. Record it.** Append to `births.json` — identity, entity, first seen, the
transaction hash, the resulting attestation UID, and the time. Commit it.

## What a birth attestation claims

That this genome was observed producing reviews, and that its identity and
address derive from it exactly as published.

It does **not** claim the reviewer is any good — that is what the track record
is for. And `firstSeen` is the earliest review we hold, not a claim that the
entity did not exist before it: a genome that produced reviews we never
harvested was already that same entity, since identity is derived, not granted.
