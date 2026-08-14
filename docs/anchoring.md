# Anchoring runbook

An anchor publishes one Merkle root per calendar week, so an attestation can be
shown to have existed no later than the block that carried it. It costs a
fraction of a cent and is run **by hand**.

## What this key is, and what it is not

The anchoring key **spends funds**. It is a different key from the signing key in
`docs/attestation-signers.md`, which spends nothing, and the two must never be
the same. It is not in CI, and this project has no scheduled job that could use
it. Weekly is not a cadence that needs automation, and a funded key in a CI
secret would be the largest attack surface here by a wide margin.

## One-time setup

**1. Create an empty wallet.** Any tool that generates a standard EVM key works.
Record only the address; the private key goes into your password manager and
nowhere else. Add the address to the table below.

**2. Fund it.** A few dollars of ETH on Base covers years — a year of weekly
anchors costs about seven cents at the gas price measured on 2026-08-12
(0.0060 gwei, ETH at $1,883). Do not overfund a hot key; top it up when it runs
low.

**3. Register all three schemas, before anything else onchain.** These are
one-off transactions against the
SchemaRegistry at `0x4200000000000000000000000000000000000020`:

| schema | source | UID |
|---|---|---|
| claim | `CLAIM_SCHEMA` in `src/attest/schema.ts` | `0x9c6648261df139b4453dd540ed2e8d821a9e775beede14ba9aae9e7202daacfb` |
| anchor | `ANCHOR_SCHEMA` in `src/anchor/schema.ts` | `0x8ff2e1ad6186bbe4c1ac54ea7d969dcf04a8caa7d31e8ac45127bfa3cfba06bd` |
| birth | `BIRTH_SCHEMA` in `src/birth/schema.ts` | `0x6ca5f932f49e5ac467c1ca24c5af39800a12df874d3856b4afdd54800c07ed02` |

Register each with `resolver = 0x0` and `revocable = true` — those two values are
part of what the UID is derived from, so a different choice produces a different
UID and the attestations will not resolve.

**Look each UID up on easscan first.** A UID is global and derived from the
schema text alone, so if anyone anywhere has registered the identical string with
the same resolver and revocable flag, it already exists — attestations resolve
against it and no transaction is needed. Registering it again does not fail
safely into a no-op: EAS rejects it and the gas is spent on a revert. The script
cannot check this offline.

Do not hand-assemble the calls. `bun scripts/register-schemas.ts` prints the
exact `to`, `value` and `data` for all three and sends nothing. It re-derives
each UID from the calldata it just built and compares it against a **literal**
written in the script, not against the constant the code computes — an earlier
version compared against the computed constant, which made the check
`keccak(x) === keccak(x)` and printed a cheerful ✓ for a schema no attestation
names. On a mismatch the calldata is withheld rather than printed under a
warning, and the script exits non-zero.

The UIDs in the table above are pinned in `tests/schema-uids.test.ts` against the
constants and against this file. If that test fails, a schema string was edited:
that is a breaking change needing a fresh registration and a decision about every
attestation signed under the old UID, not a test to update.

All three UIDs are derived rather than assigned, so **every attestation already
signed becomes decodable the moment the claim schema exists**. Nothing needs
re-signing. "Decodable" and not "listed": easscan can render an offchain
attestation once the schema exists and someone presents it, but offchain
attestations do not appear in a listing by themselves.

**Registration must come before any onchain attestation, and this is not a
preference.** EAS reverts `attest` when the schema UID does not exist, so a birth
or anchor sent first does not fail into a harmless no-op — it spends gas on a
revert. Measured against Base mainnet from the anchoring address before
registration, `eth_call` on a real birth request returns `0xbf37b20e`, which is
`InvalidSchema()`. Order is schemas, then births, then anchors.

The claim that registering late "costs only visibility, never validity" holds for
the offchain attestations already on disk, and only for those.

### What it costs

Measured with `eth_estimateGas` on 2026-08-14, gas price 0.006 gwei:

| | gas |
|---|---|
| register claim | 238,914 |
| register anchor | 166,938 |
| register birth | 261,819 |
| **all three** | **667,671 ≈ 0.0000040 ETH** |

Births and anchors cannot be estimated until the schemas exist — the estimate
reverts, which is the point above. Expect the same order of magnitude each.

A couple of dollars of ETH is therefore generous by a wide margin, and the
warning against overfunding a hot key stands.

## Every week

**1. Regenerate and inspect.**

```bash
HIVEMARK_SIGNING_KEY=… bun src/cli.ts tests/fixtures/martian-reviews.sample.jsonl dist
bun src/cli-anchor.ts dist/attestations.json anchors.json
```

The second command prints the period, the root, the count and the exact
transaction that would be sent — and sends nothing. Read it before continuing.
Gaps in earlier weeks are printed too; they stay gaps.

**2. Broadcast.** Send the printed request from your wallet, calling `attest` on
the EAS contract at `0x4200000000000000000000000000000000000021` with the
printed schema, data, and a zero recipient, zero expiration and zero refUID.
Anything that can send a transaction to a contract will do.

**3. Record it.** Append to `anchors.json` — period, root, count, the uid list,
the transaction hash, the resulting attestation UID, and the time. Commit it.
The ledger is what makes a proof checkable later, so an anchor that is not
recorded may as well not have happened.

## Anchoring keys

| address | active from | active until | status |
|---|---|---|---|
| `0xFe30FD1fAEba962015C25a4f7149fA9054133c36` | 2026-08-14 | | active |

`active`, `retired` (rotated out; its past anchors remain valid) or
`compromised` (do not trust anchors from it after the stated date).

## Never anchor a week that is still running

The dry run refuses it, and this is why. One anchor per period is enforced, in
the ledger and again in `planAnchor`. So anchoring on a Thursday publishes a root
over that week and closes it: every review made on the Friday, Saturday and
Sunday lands in a week that can never be anchored again.

That is strictly worse than missing the week. A gap is visible — `gapsIn` lists
it, the dry run prints it, and the attestations in it are honestly unbounded in
time. A half-covered week looks finished from the outside, and nothing in the
record distinguishes "these are all the attestations of that week" from "these
are the ones that happened to exist by Thursday".

Wait for the period to close, then anchor. The guard takes the current time as
an argument rather than reading the clock, so it can be tested at a chosen
instant — this project has already shipped one bug from time taken off the clock.

**Re-harvest and re-sign before anchoring, every time.** The guard closes one
door and not the other: it knows the week has ended, and knows nothing about
whether the file it was handed is current. Anchoring on Monday from a corpus last
synced on Friday loses the weekend from the only anchor that week will ever have
— the same half-covered week, entered from the other side. The dry run prints
`newest`, the time of the latest attestation it covers, next to the period's end.
If those are far apart, the input is stale, not the week quiet.

## A missed week

Leave it missed. An anchor asserts that its contents existed by a date that has
now passed; publishing it late would assert something untrue. `gapsIn` lists
missed weeks and the dry run prints them, which is the honest outcome — those
attestations still verify by signature, they simply have no time bound.

## Which week an attestation belongs to

An attestation's `time` field carries **the moment the review happened**, taken
from `reviewed_at`, not the moment it was signed. EAS reads that field as an
attestation's creation date, so this is a deliberate departure and easscan will
show a date that is not when the signature was made.

It is done that way because the anchor buckets by this field. With a signing
timestamp, an anchor labelled "the week of 12 August" would really have covered
whichever week the pipeline last ran — re-running in October would have anchored
August's reviews as October's, asserting something untrue about when they
existed. It also makes a rerun mint the same UIDs instead of fresh ones, so the
root over unchanged data is reproducible.

## What an anchor proves

Only that an attestation existed no later than the block carrying its root. It
says nothing about whether the claim inside it is correct, and nothing about
whether the reviewer that made the claim ran at all. Those limits are the same
ones `verifyEnvelope` reports in its `unverifiable` list, and anchoring does not
shorten that list — it removes exactly one item from it, the one about time.
