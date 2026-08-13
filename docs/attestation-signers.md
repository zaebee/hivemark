# Attestation signers

A signature under an unattributable key is decoration. This file is the record of
which key signed hivemark attestations and when — without it, `signer` in an
envelope is an address nobody can place.

| address | environment | active from | active until | status |
|---|---|---|---|---|
| `0x3C780bA24bbbF5d5f2468475992D83d42f50D505` | local workstation | 2026-08-13 | — | `active` |
| `0xbaD6982B041a71961b07BB0a0fF1C4Fc0B212510` | local workstation | 2026-08-13 | 2026-08-13 | `compromised` |

**Status values:** `active`, `retired` (rotated out normally, its past
signatures remain good), `compromised` (its signatures should not be trusted
from the stated date onward).

The key lives in `HIVEMARK_SIGNING_KEY` and is loaded from the environment at
run time. It is not present in CI, and this milestone spends no gas: attestations
are signed offchain and verify against the public key alone — demonstrated by
verifying all 112 envelopes in a process started outside the repository, with no
key reachable from it.

Running without a key remains legitimate rather than a misconfiguration: claims
and the page are still produced, and nothing is signed. There is deliberately no
flag that could say "signing is on" while no usable key exists.

## The first key was burned within the hour, and here is how

`0xbaD6982B…2510` signed 112 attestations, none of which were published, and was
then discarded because its **private key was printed into a session transcript**.

The mechanism is worth knowing, because it defeats the obvious precaution. **Bun
loads `.env` from the working directory automatically.** A command written to
prove that verification needs no key — `env -u HIVEMARK_SIGNING_KEY bun …` —
therefore did not run without the key: the variable was unset in the process
environment and Bun immediately re-read it from the file on disk. The check then
printed `process.env` to show the variable was absent, and printed the key
instead.

Three rules follow, and they are cheap:

- **Never print `process.env`,** in any form, from a process started inside this
  repository. There is no arrangement of `env -u` or `unset` that makes it safe
  while `.env` sits in the working directory.
- **To demonstrate key-free verification, change directory,** do not change the
  environment. Bun finds no `.env` outside the repository, which is what makes
  the demonstration real rather than decorative.
- **A key that reaches a transcript is compromised,** even when nothing it signed
  was published and the file never left the machine. Rotation costs one command;
  arguing about the blast radius costs more than that.

The entry above stays. A signer table that lists only the keys whose stories are
flattering is a worse record than no table.
