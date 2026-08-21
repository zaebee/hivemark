# AGENTS.md

## Commands

- Bun runs TypeScript directly — no build step; `tsc` is typecheck-only (`bun run typecheck`).
- Install: `bun install --frozen-lockfile --ignore-scripts` (both flags are deliberate; CI uses them).
- Tests: `bun run test` (vitest, not `bun test`). One file: `bun run test tests/claims.test.ts`.
- Before finishing: `bun run typecheck`, then `bun run test` (CI order).
- Page pipeline: `bun src/cli.ts corpus.json dist` (alias: `bun run generate ...`) — always pass the
  `corpus.json` manifest, never a raw `.jsonl`. The manifest feeds Merkle roots and birth `firstSeen`;
  omitting a file is irreversible.
- Inspect-only CLIs, all dry: `bun run anchor <attestations.json> <anchors.json>` plans the weekly
  root; `bun run birth <corpus.json> [births.json]` prints calldata for unborn identities;
  `bun run breed <corpus.jsonl>...` proposes reviewer configurations nobody has run yet.
- Broadcasting is separate: `scripts/send-*.ts` are dry by default; only `--send` opens a key or
  spends gas.

## Corpus lives in a sibling checkout

- Tests read the real corpus from `../ownima/codegraph-brain/benchmarks` (resolved by `corpus.json`).
  Without that checkout, several tests silently skip via `it.skipIf` — green output, but the sweep over
  real data never ran. The guardian_sha ancestry test also needs a full clone (`fetch-depth: 0`).
- Ratchet: every `.jsonl` under `base` must be listed in `include` or `exclude` (with a reason) or the
  load fails. That failure is the intended behavior, not a bug to fix.

## Secrets

- **Bun auto-loads `.env` from the working directory.** `env -u HIVEMARK_SIGNING_KEY ...` does not unset
  it, and printing `process.env` has already leaked a key here. To rehearse a keyless run, change
  directory out of the repo — don't change the environment.
- Keys never belong in CI; both workflows refuse `HIVEMARK_SIGNING_KEY`. Signing key: env var, local
  only. Anchoring key: `~/.hivemark/anchoring.key`, outside the repo. A key that reached a transcript
  is compromised — rotate it.

## Pinned contracts

- EAS schema UIDs are pinned in `tests/schema-uids.test.ts` and `docs/anchoring.md`. Editing a schema
  string is a breaking change requiring re-registration — not a test to update.
- `tests/fixtures/*.schema.json` vendor the upstream `codegraph-brain` 0.13.0 contracts: `Finding` is
  checked for equality, `ReviewRecord` as a projection. Regenerate per README "Drift guard".
- `anchors.json` / `births.json` are append-on-broadcast ledgers — commit them with the send. Missed
  weeks stay gaps: never anchor a week that hasn't closed, and re-harvest/re-sign immediately before.
- An attestation's `time` is the review time (`reviewed_at`), deliberately not the signing time.

## Conventions

- Conventional commits (`feat:`, `fix:`, `docs:`, `test:`, `ci:`, `anchor:`); work lands via PRs from
  branches like `feat/*` or `anchor/2026-W33`.
- GitHub Actions are pinned to commit SHAs with a trailing version comment — keep that pattern.
- Time-dependent logic takes `now` as a parameter instead of reading the clock (a clock-read bug
  shipped once).
- Runbooks: `docs/anchoring.md`, `docs/birth.md`, `docs/attestation-signers.md`, `docs/breeding.md`;
  design specs in `docs/superpowers/specs/`.
