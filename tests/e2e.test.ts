import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { run } from "../src/cli.js";
import { loadSigner } from "../src/attest/signer.js";
import { verifyEnvelope } from "../src/attest/verify.js";

const TEXT = readFileSync("tests/fixtures/martian-reviews.sample.jsonl", "utf8");
const KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

describe("end-to-end on real Guardian data", () => {
  it("produces artifacts for every identity found", async () => {
    const output = await run(TEXT, { signer: null });
    expect(output.tracks.length).toBeGreaterThan(1);
    expect(output.files.size).toBe(1 + output.tracks.length * 2);
    expect(output.files.has("index.html")).toBe(true);
  });

  it("accounts for every review in the fixture", async () => {
    const output = await run(TEXT, { signer: null });
    expect(output.tracks.reduce((n, t) => n + t.reviews, 0)).toBe(35);
  });

  it("reports harvest warnings rather than hiding them", async () => {
    const output = await run(`${TEXT}\n{"url":"broken`, { signer: null });
    expect(output.warnings).toHaveLength(1);
  });

  it("every badge file is valid shields JSON", async () => {
    for (const [name, body] of (await run(TEXT, { signer: null })).files) {
      if (!name.startsWith("badge-")) continue;
      expect(JSON.parse(body).schemaVersion).toBe(1);
    }
  });

  it("every avatar file is an svg", async () => {
    for (const [name, body] of (await run(TEXT, { signer: null })).files) {
      if (!name.startsWith("avatar-")) continue;
      expect(body.startsWith("<svg")).toBe(true);
    }
  });
});

describe("attestation over the real corpus", () => {
  it("produces no attestations and no file when no key is configured", async () => {
    const output = await run(TEXT, { signer: null });
    expect(output.attestations).toEqual([]);
    expect(output.files.has("attestations.json")).toBe(false);
  });

  it("attests every claim when a key is present", async () => {
    const signer = loadSigner({ HIVEMARK_SIGNING_KEY: KEY });
    const output = await run(TEXT, { signer });
    const claims = output.tracks.reduce((n, t) => n + t.claims, 0);
    expect(output.attestations).toHaveLength(claims);
    expect(output.files.has("attestations.json")).toBe(true);
  });

  it("every attestation it wrote verifies", async () => {
    const signer = loadSigner({ HIVEMARK_SIGNING_KEY: KEY });
    const output = await run(TEXT, { signer });
    for (const envelope of output.attestations) {
      const result = verifyEnvelope(envelope);
      expect(result.ok, result.failures.join("; ")).toBe(true);
    }
  });
});

describe("cli entry point on a real failure", () => {
  // A subprocess, not a call into `main` directly: what's under test is the
  // `main().catch(...)` wiring at the bottom of src/cli.ts itself, which only
  // runs when the module is invoked as an entry point.
  it("exits non-zero with a clean stderr line, never the key or a stack dump", () => {
    const badKey = "not-a-real-private-key";
    const result = spawnSync(
      "bun",
      ["src/cli.ts", "tests/fixtures/martian-reviews.sample.jsonl", "dist-cli-entry-test"],
      { env: { ...process.env, HIVEMARK_SIGNING_KEY: badKey }, encoding: "utf8" },
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("hivemark:");
    expect(result.stderr).not.toContain(badKey);
    expect(result.stderr).not.toContain("    at "); // no stack trace
  });
});
