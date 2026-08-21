## What changed

## Verified, and how

Commands actually run, with the output that distinguishes pass from failure.
A check that cannot fail proves nothing.

## Not verified

Anything that could not be run — stated rather than implied.

## Checks

- [ ] `bun run typecheck`
- [ ] `bun run test` — say how many skipped: without `../ownima/codegraph-brain`,
      the corpus sweeps silently skip via `it.skipIf`.
- [ ] If a broadcast happened: the ledger (`anchors.json` / `births.json`) is
      committed in this PR, with the transaction hash.
