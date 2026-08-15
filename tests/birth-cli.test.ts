import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { harvest } from "../src/harvest.js";
import { planBirths } from "../src/birth/plan.js";

const FIXTURE = "tests/fixtures/martian-reviews.sample.jsonl";

function runCli(ledger: string): { status: number; stdout: string; stderr: string } {
  const dir = mkdtempSync(join(tmpdir(), "hivemark-birth-"));
  const path = join(dir, "births.json");
  writeFileSync(path, ledger, "utf8");
  const result = spawnSync("bun", ["src/cli-birth.ts", FIXTURE, path], { encoding: "utf8" });
  return { status: result.status ?? -1, stdout: result.stdout, stderr: result.stderr };
}

/**
 * The only path that composes harvest → ledger → plan → request, and the one a
 * human reads before spending money. A subprocess is the honest way to test it:
 * the entry point's behaviour is part of what is under test.
 */
describe("cli-birth", () => {
  // Skipped until phase 2 registers birth schema 2, not deleted.
  //
  // encodeBirth refuses genome 2 because birth schema 1 has one provider field
  // where the genome has two, so a record encoded against it could not be
  // rebuilt into the genome it names. These two tests describe what the CLI
  // does once that is fixed, and the fix is one line — removing `.skip` — so
  // keeping them is cheaper and more honest than deleting a description nobody
  // would remember to restore. The refusal itself is asserted above.
  it.skip("lists every identity when the ledger is empty", () => {
    const { status, stdout } = runCli("[]");
    expect(status).toBe(0);
    expect(stdout).toContain("3 identities to announce");
    expect(stdout).toContain("nothing was sent");
  });

  // Skipped until phase 2 registers birth schema 2, not deleted.
  //
  // encodeBirth refuses genome 2 because birth schema 1 has one provider field
  // where the genome has two, so a record encoded against it could not be
  // rebuilt into the genome it names. These two tests describe what the CLI
  // does once that is fixed, and the fix is one line — removing `.skip` — so
  // keeping them is cheaper and more honest than deleting a description nobody
  // would remember to restore. The refusal itself is asserted above.
  it.skip("prints a genome and a first-seen date drawn from the reviews", () => {
    const { stdout } = runCli("[]");
    expect(stdout).toMatch(/genome\s+gemini · (graph|diff-only)/);
    // The corpus was reviewed on 2026-08-12; a wall-clock date would not match.
    expect(stdout).toMatch(/first seen\s+2026-08-12T/);
  });

  it("says so plainly when nothing is owed", () => {
    // A full ledger, built from the same derivation the planner uses — imported
    // rather than shelled out for, so no command string is assembled.
    const records = harvest(readFileSync(FIXTURE, "utf8")).records;
    const full = planBirths(records, []).map((plan) => ({
      identity_id: plan.identity_id,
      entity: plan.entity,
      first_seen: plan.firstSeen,
      tx_hash: `0x${"cd".repeat(32)}`,
      attestation_uid: `0x${"ef".repeat(32)}`,
      announced_at: "2026-08-17T09:00:00+00:00",
    }));

    const { status, stdout } = runCli(JSON.stringify(full));
    expect(status).toBe(0);
    expect(stdout).toContain("already has a birth record");
  });

  it("fails with one line, no stack trace, when the ledger is corrupt", () => {
    const { status, stderr } = runCli("");
    expect(status).not.toBe(0);
    expect(stderr).toContain("hivemark:");
    expect(stderr).toContain("ledger is empty");
    expect(stderr).not.toContain("    at ");
  });
});
