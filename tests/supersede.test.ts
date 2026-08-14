import { describe, expect, it } from "vitest";
import { encodeAbiParameters } from "viem";
import { supersededIn } from "../src/supersede.js";
import type { AttestationEnvelope } from "../src/attest/attest.js";

const TYPES = [
  { type: "bytes32" }, // identityId
  { type: "string" }, //  repo
  { type: "uint32" }, //  pr
  { type: "string" }, //  commitSha
  { type: "string" }, //  file
  { type: "uint32" }, //  line
  { type: "string" }, //  category
  { type: "string" }, //  severity
  { type: "uint8" }, //   confidence
  { type: "uint8" }, //   verdict
  { type: "uint8" }, //   impactScore
  { type: "bytes32" }, // claimHash
] as const;

/**
 * One attestation, carrying only what supersession is computed from.
 *
 * `file` varies per claim so two claims of the same review stay distinct
 * without touching the grouping key — the point being that grouping must not
 * depend on which line a finding landed on.
 */
function envelope(opts: {
  uid: string;
  identity?: string;
  repo?: string;
  pr?: number;
  sha?: string;
  time: number;
  file?: string;
}): AttestationEnvelope {
  const data = encodeAbiParameters(TYPES, [
    (opts.identity ?? `0x${"11".repeat(32)}`) as `0x${string}`,
    opts.repo ?? "acme/widgets",
    opts.pr ?? 42,
    opts.sha ?? "deadbeef",
    opts.file ?? "src/a.ts",
    10,
    "logic",
    "major",
    90,
    1,
    5,
    `0x${"22".repeat(32)}`,
  ]);
  return {
    attestation: { uid: opts.uid, message: { data, time: String(opts.time) } },
  } as unknown as AttestationEnvelope;
}

describe("supersededIn", () => {
  it("marks nothing when every commit was reviewed once", () => {
    const s = supersededIn([
      envelope({ uid: "0xa", time: 1000 }),
      envelope({ uid: "0xb", time: 1000, file: "src/b.ts" }),
      envelope({ uid: "0xc", pr: 43, time: 2000 }),
    ]);
    expect(s.groups).toBe(2);
    expect(s.repeated).toBe(0);
    expect(s.superseded.size).toBe(0);
  });

  it("marks the older run when the same commit is reviewed twice", () => {
    const s = supersededIn([
      envelope({ uid: "0xold", time: 1000 }),
      envelope({ uid: "0xnew", time: 2000 }),
    ]);
    expect(s.repeated).toBe(1);
    expect([...s.superseded]).toEqual(["0xold"]);
  });

  it("keeps only the newest of three runs", () => {
    const s = supersededIn([
      envelope({ uid: "0xa", time: 1000 }),
      envelope({ uid: "0xb", time: 2000 }),
      envelope({ uid: "0xc", time: 3000 }),
    ]);
    expect([...s.superseded].sort()).toEqual(["0xa", "0xb"]);
  });

  it("marks every claim of a superseded run, not one per run", () => {
    // A review produces many findings and they share its `reviewed_at`. All of
    // them are superseded together, or the count understates the difference the
    // anchor is being asked to explain.
    const s = supersededIn([
      envelope({ uid: "0xo1", time: 1000, file: "src/a.ts" }),
      envelope({ uid: "0xo2", time: 1000, file: "src/b.ts" }),
      envelope({ uid: "0xo3", time: 1000, file: "src/c.ts" }),
      envelope({ uid: "0xn1", time: 2000, file: "src/a.ts" }),
    ]);
    expect(s.superseded.size).toBe(3);
  });

  it("does not group across identities, so one reviewer cannot supersede another", () => {
    const s = supersededIn([
      envelope({ uid: "0xa", identity: `0x${"aa".repeat(32)}`, time: 1000 }),
      envelope({ uid: "0xb", identity: `0x${"bb".repeat(32)}`, time: 2000 }),
    ]);
    expect(s.groups).toBe(2);
    expect(s.superseded.size).toBe(0);
  });

  it("does not group across commits, so reviewing a new push is not a re-run", () => {
    const s = supersededIn([
      envelope({ uid: "0xa", sha: "aaa", time: 1000 }),
      envelope({ uid: "0xb", sha: "bbb", time: 2000 }),
    ]);
    expect(s.superseded.size).toBe(0);
  });

  it("does not group across repos that share a pr number", () => {
    const s = supersededIn([
      envelope({ uid: "0xa", repo: "acme/one", time: 1000 }),
      envelope({ uid: "0xb", repo: "acme/two", time: 2000 }),
    ]);
    expect(s.groups).toBe(2);
    expect(s.superseded.size).toBe(0);
  });

  it("marks nothing when two runs share a timestamp, rather than guessing", () => {
    // The corpus breaks this tie on canonical JSON, but that input is never
    // published. A reader working from attestations alone reaches a floor here,
    // and a floor is the honest answer — picking one arbitrarily would report a
    // specific claim as superseded on no evidence.
    const s = supersededIn([
      envelope({ uid: "0xa", time: 1000, file: "src/a.ts" }),
      envelope({ uid: "0xb", time: 1000, file: "src/b.ts" }),
    ]);
    expect(s.repeated).toBe(0);
    expect(s.superseded.size).toBe(0);
  });
});
