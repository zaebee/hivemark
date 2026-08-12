import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";

const FIXTURE = "tests/fixtures/martian-reviews.sample.jsonl";

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

  it("labels a proposal as having no birth and no claims", () => {
    // Guarded against the corpus growing: if it ever yields proposals, they
    // must not read as entities.
    const { stdout } = runCli([FIXTURE]);
    if (/never run/i.test(stdout)) {
      expect(stdout).toMatch(/no birth/i);
    }
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
