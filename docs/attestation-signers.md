# Attestation signers

A signature under an unattributable key is decoration. This file is the record of
which key signed hivemark attestations and when — without it, `signer` in an
envelope is an address nobody can place.

| address | environment | active from | active until | status |
|---|---|---|---|---|
| _none yet_ | | | | |

**Status values:** `active`, `retired` (rotated out normally, its past
signatures remain good), `compromised` (its signatures should not be trusted
from the stated date onward).

No key has been placed yet. hivemark runs without one: claims and the page are
produced, and nothing is signed. That is a legitimate state, not a
misconfiguration — there is deliberately no flag that could say "signing is on"
while no usable key exists.

The key lives in `HIVEMARK_SIGNING_KEY` and is loaded from the environment at
run time. It is not present in CI, and this milestone spends no gas: attestations
are signed offchain and verify against the public key alone.
