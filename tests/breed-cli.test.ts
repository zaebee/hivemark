import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const FIXTURE = "tests/fixtures/martian-reviews.sample.jsonl";
/** Two identities with different model pairs, so recombination is possible. */
const BREEDABLE = "tests/fixtures/breedable.sample.jsonl";

function runCli(args: string[]): { status: number; stdout: string; stderr: string } {
  const result = spawnSync("bun", ["src/cli-breed.ts", ...args], { encoding: "utf8" });
  return { status: result.status ?? -1, stdout: result.stdout, stderr: result.stderr };
}

describe("cli-breed", () => {
  it("reports that nothing is reachable when the corpus holds one model pair", () => {
    // The sample fixture has a single finder and skeptic, so the only variation
    // is context mode — and both modes have been run.
    const { status, stdout } = runCli([FIXTURE]);
    expect(status).toBe(0);
    expect(stdout).toMatch(/no proposals/i);
  });

  it("labels every proposal as having no birth and no claims", () => {
    // Asserted against a fixture that genuinely yields proposals. The first
    // version guarded this behind `if (proposals exist)` and pointed at a
    // fixture that yields none, so the assertion never ran and the line it
    // checks could have been deleted with the suite still green.
    const { status, stdout } = runCli([BREEDABLE]);
    expect(status).toBe(0);

    const proposals = stdout.match(/^\s*identity\s+0x/gm) ?? [];
    expect(proposals.length).toBeGreaterThan(0);

    const standings = stdout.match(/no birth, no claims/g) ?? [];
    expect(standings).toHaveLength(proposals.length);
  });

  it("writes the standing into the artifact, not only to the terminal", () => {
    // proposals.json lands beside real artifacts and is structurally a
    // published record; without this the guarantee would hold on screen only.
    const dir = mkdtempSync(join(tmpdir(), "hivemark-breed-"));
    const { status } = runCli([BREEDABLE, "--out", dir]);
    expect(status).toBe(0);

    const written = JSON.parse(readFileSync(join(dir, "proposals.json"), "utf8")) as {
      standing: string;
    }[];
    expect(written.length).toBeGreaterThan(0);
    for (const p of written) expect(p.standing).toMatch(/no birth, no claims/);
  });

  it("fails with one line, no stack trace, when a corpus path is missing", () => {
    const { status, stderr } = runCli(["does-not-exist.jsonl"]);
    expect(status).not.toBe(0);
    expect(stderr).toContain("hivemark:");
    expect(stderr).not.toContain("    at ");
  });

  it("refuses to run with no corpus at all", () => {
    const { status, stderr } = runCli([]);
    expect(status).not.toBe(0);
    expect(stderr).toMatch(/corpus/i);
  });
});
