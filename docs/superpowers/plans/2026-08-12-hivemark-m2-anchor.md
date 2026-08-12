# hivemark M2 · `anchor` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove that an attestation existed no later than a given date, by publishing one Merkle root per calendar week as an EAS onchain attestation on Base.

**Architecture:** Attestation UIDs for a week are domain-separated into Merkle leaves and reduced to a root. The root, its period bounds and its count travel as an EAS onchain attestation under a dedicated schema. A committed ledger records every anchor and, by their absence, every gap. Everything up to the transaction is pure and tested offline; the transaction itself is run by hand against a funded wallet, because that key spends money and belongs nowhere near CI.

**Tech Stack:** TypeScript on bun, `@openzeppelin/merkle-tree` for tree construction, existing `@ethereum-attestation-service/eas-sdk`, `ethers`, `viem`, `zod`, vitest.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-12-hivemark-design.md`. Where this plan and the spec disagree, stop and ask.
- **No key in CI, ever.** The anchoring key spends funds. It is read from the environment at run time on a human's machine and never written to disk, logged, or included in an error message.
- **No automated sending.** Committed code may *construct* and *simulate* a transaction; broadcasting it is a step a human runs deliberately. There is no scheduled workflow in this milestone.
- Signing domain constants, already fixed and verified — reuse `src/attest/domain.ts`, do not redeclare:
  - chainId `8453n`, EAS `0x4200000000000000000000000000000000000021`, version `"1.0.1"`
  - SchemaRegistry `0x4200000000000000000000000000000000000020`
- A schema UID is `keccak256(abi.encodePacked(schema, resolver, revocable))` — confirmed from `SchemaRegistry.sol`'s own `_getUID`. Derive; never fetch.
- **A missed week is a gap, not a backlog.** It is recorded as absent and never folded into a later period. Anything that silently merges two periods is a defect.
- Strict TypeScript, no `any` in committed code. Existing 125 tests must stay green.
- Comments explain why, not what.

---

## File Structure

| file | responsibility |
|---|---|
| `src/anchor/period.ts` | ISO week bucketing — a timestamp to its period, and the period's bounds |
| `src/anchor/leaf.ts` | Domain-separated leaf from an attestation UID |
| `src/anchor/tree.ts` | Root and proofs over a period's leaves |
| `src/anchor/schema.ts` | The anchor EAS schema, its UID, and root → ABI-encoded `data` |
| `src/anchor/ledger.ts` | The committed record of anchors, and which periods are gaps |
| `src/anchor/plan.ts` | Given attestations and the ledger, decide what the next anchor covers |
| `src/anchor/submit.ts` | Build and simulate the transaction; never broadcast |
| `src/anchor/prove.ts` | Produce and check an inclusion proof against a recorded root |
| `docs/anchoring.md` | The runbook a human follows, including wallet setup |
| `anchors.json` | Committed ledger of anchors |

---

### Task 1: ISO week periods

**Files:**
- Create: `src/anchor/period.ts`
- Test: `tests/anchor-period.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `type PeriodId` (a string like `"2026-W33"`), `periodOf(iso: string): PeriodId`, `periodBounds(id: PeriodId): { start: number; end: number }` (inclusive start, exclusive end, both Unix seconds), `periodsBetween(from: PeriodId, to: PeriodId): PeriodId[]`.

Calendar weeks rather than "everything since last time" is what makes a gap
expressible at all: a skipped week is a period with no anchor, which a reader can
see. A rolling window would swallow it silently.

- [ ] **Step 1: Write the failing test**

`tests/anchor-period.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { periodOf, periodBounds, periodsBetween } from "../src/anchor/period.js";

describe("periodOf", () => {
  it("buckets a timestamp into its ISO week", () => {
    expect(periodOf("2026-08-12T11:27:57+00:00")).toBe("2026-W33");
  });

  it("puts Monday and the following Sunday in the same week", () => {
    expect(periodOf("2026-08-10T00:00:00Z")).toBe(periodOf("2026-08-16T23:59:59Z"));
  });

  it("starts a new week on Monday, not Sunday", () => {
    expect(periodOf("2026-08-16T23:59:59Z")).not.toBe(periodOf("2026-08-17T00:00:00Z"));
  });

  it("handles a year boundary the ISO way, where week 1 holds the first Thursday", () => {
    // 2027-01-01 is a Friday, so it belongs to the week that began 2026-12-28.
    expect(periodOf("2027-01-01T12:00:00Z")).toBe("2026-W53");
  });

  it("refuses a timestamp it cannot parse rather than bucketing it somewhere", () => {
    expect(() => periodOf("whenever")).toThrow(/unparseable/i);
  });
});

describe("periodBounds", () => {
  it("returns a half-open range covering exactly seven days", () => {
    const { start, end } = periodBounds("2026-W33");
    expect(end - start).toBe(7 * 24 * 60 * 60);
  });

  it("round-trips with periodOf at both edges", () => {
    const { start, end } = periodBounds("2026-W33");
    expect(periodOf(new Date(start * 1000).toISOString())).toBe("2026-W33");
    expect(periodOf(new Date((end - 1) * 1000).toISOString())).toBe("2026-W33");
    expect(periodOf(new Date(end * 1000).toISOString())).not.toBe("2026-W33");
  });
});

describe("periodsBetween", () => {
  it("lists every week inclusive, so a gap has a name", () => {
    expect(periodsBetween("2026-W33", "2026-W36")).toEqual([
      "2026-W33",
      "2026-W34",
      "2026-W35",
      "2026-W36",
    ]);
  });

  it("crosses a year boundary", () => {
    expect(periodsBetween("2026-W52", "2027-W01")).toEqual(["2026-W52", "2026-W53", "2027-W01"]);
  });

  it("returns a single period when from equals to", () => {
    expect(periodsBetween("2026-W33", "2026-W33")).toEqual(["2026-W33"]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run vitest run tests/anchor-period.test.ts`
Expected: FAIL — `Cannot find module '../src/anchor/period.js'`

- [ ] **Step 3: Write `src/anchor/period.ts`**

```typescript
/**
 * Weeks, not rolling windows.
 *
 * An anchor covers a named calendar week, so a week nobody anchored is a period
 * with no record — visible as an absence. A window running from "whenever we
 * last anchored" would absorb the skipped days into the next root and leave
 * nothing to notice.
 *
 * ISO 8601 weeks: Monday starts the week, and week 1 is the one containing the
 * year's first Thursday. That last rule is why a January date can belong to the
 * previous year's final week, and it is the reason this is computed rather than
 * approximated by dividing the epoch by 604800.
 */

export type PeriodId = string;

const DAY = 24 * 60 * 60;
const WEEK = 7 * DAY;

function parseUtc(iso: string): Date {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) throw new Error(`unparseable timestamp: ${iso}`);
  return at;
}

/** Midnight UTC on the Monday of the week containing `at`. */
function mondayOf(at: Date): Date {
  const day = at.getUTCDay();
  // getUTCDay is Sunday-based; ISO weeks are Monday-based.
  const offset = day === 0 ? 6 : day - 1;
  return new Date(
    Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate() - offset, 0, 0, 0, 0),
  );
}

/** The Thursday of a week decides which year the week belongs to. */
function isoYearWeek(at: Date): { year: number; week: number } {
  const monday = mondayOf(at);
  const thursday = new Date(monday.getTime() + 3 * DAY * 1000);
  const year = thursday.getUTCFullYear();
  const firstThursday = (() => {
    const jan4 = new Date(Date.UTC(year, 0, 4));
    return new Date(mondayOf(jan4).getTime() + 3 * DAY * 1000);
  })();
  const week = Math.round((thursday.getTime() - firstThursday.getTime()) / (WEEK * 1000)) + 1;
  return { year, week };
}

export function periodOf(iso: string): PeriodId {
  const { year, week } = isoYearWeek(parseUtc(iso));
  return `${year}-W${String(week).padStart(2, "0")}`;
}

function parsePeriod(id: PeriodId): { year: number; week: number } {
  const match = /^(\d{4})-W(\d{2})$/.exec(id);
  if (!match) throw new Error(`unparseable period: ${id}`);
  return { year: Number(match[1]), week: Number(match[2]) };
}

/** Half-open [start, end) in Unix seconds. */
export function periodBounds(id: PeriodId): { start: number; end: number } {
  const { year, week } = parsePeriod(id);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const week1Monday = mondayOf(jan4);
  const start = Math.floor(week1Monday.getTime() / 1000) + (week - 1) * WEEK;
  return { start, end: start + WEEK };
}

export function periodsBetween(from: PeriodId, to: PeriodId): PeriodId[] {
  const first = periodBounds(from).start;
  const last = periodBounds(to).start;
  if (last < first) throw new Error(`period range runs backwards: ${from} to ${to}`);

  const out: PeriodId[] = [];
  for (let t = first; t <= last; t += WEEK) {
    out.push(periodOf(new Date(t * 1000).toISOString()));
  }
  return out;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `bun run vitest run tests/anchor-period.test.ts && bun run typecheck`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: ISO week periods, so a skipped anchor is a visible gap"
```

---

### Task 2: domain-separated leaves and the tree

**Files:**
- Create: `src/anchor/leaf.ts`, `src/anchor/tree.ts`
- Test: `tests/anchor-tree.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `LEAF_DOMAIN: string`, `leafOf(uid: \`0x${string}\`): \`0x${string}\``, `rootOf(uids: readonly \`0x${string}\`[]): \`0x${string}\``, `proofFor(uids, uid): \`0x${string}\`[]`, `verifyInclusion(root, uid, proof): boolean`.

**Why the leaves are hashed with a prefix.** A Merkle proof shows a path from
some 32-byte value to the root. Nothing in the structure distinguishes a leaf
from an internal node, so without separation an internal node could be presented
as though it were a leaf and its proof would check out. Hashing each leaf with a
fixed domain string puts leaves in a different space from internal nodes, which
are keccak over two concatenated children.

- [ ] **Step 1: Install the tree library**

```bash
bun add @openzeppelin/merkle-tree
```

Verified beforehand: `SimpleMerkleTree.of(leaves)` gives `.root` and
`.getProof(index)`, and `SimpleMerkleTree.verify(root, leaf, proof)` returns
true for a correct leaf and false for a wrong one. Tree construction is left to
the library for the same reason the EAS SDK computes UIDs: hand-rolled versions
of well-known primitives fail in well-known ways.

- [ ] **Step 2: Write the failing test**

`tests/anchor-tree.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { keccak256, concat } from "viem";
import { LEAF_DOMAIN, leafOf, rootOf, proofFor, verifyInclusion } from "../src/anchor/tree.js";

const uid = (n: number): `0x${string}` => `0x${String(n).padStart(2, "0").repeat(32)}`;
const UIDS = [uid(11), uid(22), uid(33), uid(44), uid(55)] as const;

describe("leafOf", () => {
  it("is deterministic", () => {
    expect(leafOf(UIDS[0])).toBe(leafOf(UIDS[0]));
  });

  it("differs from the raw uid, so a uid is not itself a leaf", () => {
    expect(leafOf(UIDS[0])).not.toBe(UIDS[0]);
  });

  it("mixes in the domain, not just the uid", () => {
    const undomained = keccak256(UIDS[0]);
    expect(leafOf(UIDS[0])).not.toBe(undomained);
    expect(LEAF_DOMAIN.length).toBeGreaterThan(0);
  });
});

describe("rootOf", () => {
  it("is deterministic for the same set in the same order", () => {
    expect(rootOf(UIDS)).toBe(rootOf([...UIDS]));
  });

  it("changes when any member changes", () => {
    expect(rootOf([...UIDS.slice(0, 4), uid(99)])).not.toBe(rootOf(UIDS));
  });

  it("changes when a member is dropped", () => {
    expect(rootOf(UIDS.slice(0, 4))).not.toBe(rootOf(UIDS));
  });

  it("refuses an empty set rather than producing a root of nothing", () => {
    expect(() => rootOf([])).toThrow(/no attestations/i);
  });

  it("handles an odd number of leaves", () => {
    expect(rootOf(UIDS.slice(0, 3))).toMatch(/^0x[0-9a-f]{64}$/);
  });
});

describe("inclusion proofs", () => {
  it("proves a member", () => {
    const root = rootOf(UIDS);
    expect(verifyInclusion(root, UIDS[2], proofFor(UIDS, UIDS[2]))).toBe(true);
  });

  it("rejects a non-member", () => {
    const root = rootOf(UIDS);
    expect(verifyInclusion(root, uid(99), proofFor(UIDS, UIDS[2]))).toBe(false);
  });

  it("rejects a member with someone else's proof", () => {
    const root = rootOf(UIDS);
    expect(verifyInclusion(root, UIDS[1], proofFor(UIDS, UIDS[2]))).toBe(false);
  });

  it("refuses to build a proof for a uid that is not in the set", () => {
    expect(() => proofFor(UIDS, uid(99))).toThrow(/not in this period/i);
  });

  it("does not accept an internal node dressed up as a leaf", () => {
    // The attack domain separation exists to stop: take two adjacent leaves,
    // hash them the way the tree hashes internal nodes, and offer the result as
    // if it were a member's uid. With prefixed leaves that value can never be
    // one, because a leaf is keccak(domain ‖ uid) and this is not.
    const [a, b] = [leafOf(UIDS[0]), leafOf(UIDS[1])].sort();
    const internal = keccak256(concat([a as `0x${string}`, b as `0x${string}`]));
    const root = rootOf(UIDS);
    expect(verifyInclusion(root, internal, proofFor(UIDS, UIDS[2]))).toBe(false);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `bun run vitest run tests/anchor-tree.test.ts`
Expected: FAIL — `Cannot find module '../src/anchor/tree.js'`

- [ ] **Step 4: Write `src/anchor/leaf.ts`**

```typescript
import { concat, keccak256, toHex } from "viem";

/**
 * Prefix that puts leaves in a different space from internal nodes.
 *
 * A Merkle proof only shows that some 32-byte value hashes its way to the root;
 * nothing marks which values were leaves. Undomained, an internal node — keccak
 * over two concatenated children — could be presented as a member and its proof
 * would verify. Hashing every leaf with this string makes that impossible: a
 * leaf is keccak(domain ‖ uid), which an internal node cannot be.
 *
 * Versioned, because changing it changes every root ever computed.
 */
export const LEAF_DOMAIN = "hivemark-anchor-leaf-v1";

export function leafOf(uid: `0x${string}`): `0x${string}` {
  return keccak256(concat([toHex(LEAF_DOMAIN), uid]));
}
```

- [ ] **Step 5: Write `src/anchor/tree.ts`**

```typescript
import { SimpleMerkleTree } from "@openzeppelin/merkle-tree";
import { LEAF_DOMAIN, leafOf } from "./leaf.js";

export { LEAF_DOMAIN, leafOf };

/**
 * Tree construction is the library's job.
 *
 * Merkle implementations fail in well-known ways, and the reasoning that led us
 * to keep the EAS SDK rather than hand-roll a UID applies here unchanged. What
 * we do own is the leaf preimage, which is where the interesting decision lives.
 */
function treeOf(uids: readonly `0x${string}`[]): SimpleMerkleTree {
  if (uids.length === 0) {
    throw new Error("cannot anchor a period with no attestations");
  }
  return SimpleMerkleTree.of(uids.map(leafOf));
}

export function rootOf(uids: readonly `0x${string}`[]): `0x${string}` {
  return treeOf(uids).root as `0x${string}`;
}

export function proofFor(
  uids: readonly `0x${string}`[],
  uid: `0x${string}`,
): `0x${string}`[] {
  const index = uids.indexOf(uid);
  if (index === -1) throw new Error(`uid is not in this period: ${uid}`);
  return treeOf(uids).getProof(index) as `0x${string}`[];
}

export function verifyInclusion(
  root: `0x${string}`,
  uid: `0x${string}`,
  proof: readonly `0x${string}`[],
): boolean {
  return SimpleMerkleTree.verify(root, leafOf(uid), [...proof]);
}
```

- [ ] **Step 6: Run it to verify it passes**

Run: `bun run vitest run tests/anchor-tree.test.ts && bun run typecheck`
Expected: PASS, 13 tests.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: domain-separated Merkle leaves, so an internal node cannot pose as one"
```

---

### Task 3: the anchor schema

**Files:**
- Create: `src/anchor/schema.ts`
- Test: `tests/anchor-schema.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `ANCHOR_SCHEMA: string`, `ANCHOR_SCHEMA_UID: \`0x${string}\``, `encodeAnchor(a: AnchorRecord): string`, `interface AnchorPayload { root; periodStart; periodEnd; count; leafDomain }`.

- [ ] **Step 1: Write the failing test**

`tests/anchor-schema.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { SchemaEncoder } from "@ethereum-attestation-service/eas-sdk";
import { ANCHOR_SCHEMA, ANCHOR_SCHEMA_UID, encodeAnchor } from "../src/anchor/schema.js";
import { CLAIM_SCHEMA_UID } from "../src/attest/schema.js";
import { LEAF_DOMAIN } from "../src/anchor/tree.js";

const payload = {
  root: `0x${"ab".repeat(32)}` as const,
  periodStart: 1_754_956_800,
  periodEnd: 1_755_561_600,
  count: 112,
};

describe("ANCHOR_SCHEMA", () => {
  it("has a 32-byte UID distinct from the claim schema's", () => {
    expect(ANCHOR_SCHEMA_UID).toMatch(/^0x[0-9a-f]{64}$/);
    expect(ANCHOR_SCHEMA_UID).not.toBe(CLAIM_SCHEMA_UID);
  });

  it("records the leaf domain, so a reader can reproduce the root", () => {
    expect(ANCHOR_SCHEMA).toContain("leafDomain");
  });
});

describe("encodeAnchor", () => {
  it("round-trips through the EAS schema encoder", () => {
    const decoded = new SchemaEncoder(ANCHOR_SCHEMA).decodeData(encodeAnchor(payload));
    const byName = Object.fromEntries(decoded.map((d) => [d.name, d.value.value]));
    expect(String(byName.root)).toBe(payload.root);
    expect(Number(byName.count)).toBe(112);
    expect(String(byName.leafDomain)).toBe(LEAF_DOMAIN);
  });

  it("keeps the period bounds exactly, since they are the claim being made", () => {
    const decoded = new SchemaEncoder(ANCHOR_SCHEMA).decodeData(encodeAnchor(payload));
    const byName = Object.fromEntries(decoded.map((d) => [d.name, d.value.value]));
    expect(Number(byName.periodStart)).toBe(payload.periodStart);
    expect(Number(byName.periodEnd)).toBe(payload.periodEnd);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run vitest run tests/anchor-schema.test.ts`
Expected: FAIL — `Cannot find module '../src/anchor/schema.js'`

- [ ] **Step 3: Write `src/anchor/schema.ts`**

```typescript
import { SchemaEncoder } from "@ethereum-attestation-service/eas-sdk";
import { encodePacked, keccak256 } from "viem";
import { LEAF_DOMAIN } from "./tree.js";

export interface AnchorPayload {
  readonly root: `0x${string}`;
  readonly periodStart: number;
  readonly periodEnd: number;
  readonly count: number;
}

/**
 * `leafDomain` is in the schema on purpose.
 *
 * A root is only checkable by someone who can rebuild the leaves, and the leaf
 * preimage is our invention rather than anything EAS specifies. Publishing it
 * with the root means an outsider needs no documentation from us to verify an
 * inclusion proof — which is the whole point of anchoring in public.
 */
export const ANCHOR_SCHEMA =
  "bytes32 root,uint64 periodStart,uint64 periodEnd,uint32 count,string leafDomain";

const RESOLVER = "0x0000000000000000000000000000000000000000" as const;
const REVOCABLE = true;

/** Derived exactly as SchemaRegistry._getUID does; never fetched. */
export const ANCHOR_SCHEMA_UID: `0x${string}` = keccak256(
  encodePacked(["string", "address", "bool"], [ANCHOR_SCHEMA, RESOLVER, REVOCABLE]),
);

export function encodeAnchor(payload: AnchorPayload): string {
  return new SchemaEncoder(ANCHOR_SCHEMA).encodeData([
    { name: "root", type: "bytes32", value: payload.root },
    { name: "periodStart", type: "uint64", value: payload.periodStart },
    { name: "periodEnd", type: "uint64", value: payload.periodEnd },
    { name: "count", type: "uint32", value: payload.count },
    { name: "leafDomain", type: "string", value: LEAF_DOMAIN },
  ]);
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `bun run vitest run tests/anchor-schema.test.ts && bun run typecheck`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: anchor schema carrying the leaf domain alongside the root"
```

---

### Task 4: the anchor ledger, where gaps are visible

**Files:**
- Create: `src/anchor/ledger.ts`, `anchors.json`
- Test: `tests/anchor-ledger.test.ts`

**Interfaces:**
- Consumes: `PeriodId`, `periodsBetween` from `src/anchor/period.ts`.
- Produces: `AnchorRecordSchema` (zod), `type AnchorRecord`, `loadLedger(text: string): AnchorRecord[]`, `gapsIn(records, from, to): PeriodId[]`, `recordFor(records, period): AnchorRecord | null`.

An `AnchorRecord` stores the period, the root, the count, the **full list of
uids** it covered, the transaction hash and the resulting attestation UID.
Storing the uid list rather than recomputing it later is deliberate: it pins
exactly what was anchored, so a proof stays checkable even if the pipeline's
output changes afterwards.

- [ ] **Step 1: Write the failing test**

`tests/anchor-ledger.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { loadLedger, gapsIn, recordFor } from "../src/anchor/ledger.js";

const record = (period: string) => ({
  period,
  root: `0x${"ab".repeat(32)}`,
  count: 2,
  uids: [`0x${"11".repeat(32)}`, `0x${"22".repeat(32)}`],
  tx_hash: `0x${"cd".repeat(32)}`,
  attestation_uid: `0x${"ef".repeat(32)}`,
  anchored_at: "2026-08-17T09:00:00+00:00",
});

describe("loadLedger", () => {
  it("reads an empty ledger", () => {
    expect(loadLedger("[]")).toEqual([]);
  });

  it("refuses a record missing the uids it claims to cover", () => {
    const { uids, ...withoutUids } = record("2026-W33");
    expect(() => loadLedger(JSON.stringify([withoutUids]))).toThrow(/uids/i);
  });

  it("refuses a record whose count disagrees with its uid list", () => {
    expect(() => loadLedger(JSON.stringify([{ ...record("2026-W33"), count: 99 }]))).toThrow(
      /count/i,
    );
  });

  it("refuses two anchors for one period", () => {
    const twice = JSON.stringify([record("2026-W33"), record("2026-W33")]);
    expect(() => loadLedger(twice)).toThrow(/already anchored/i);
  });
});

describe("gapsIn", () => {
  it("names every week with no anchor", () => {
    const records = loadLedger(JSON.stringify([record("2026-W33"), record("2026-W36")]));
    expect(gapsIn(records, "2026-W33", "2026-W36")).toEqual(["2026-W34", "2026-W35"]);
  });

  it("returns nothing when every week is covered", () => {
    const records = loadLedger(JSON.stringify([record("2026-W33"), record("2026-W34")]));
    expect(gapsIn(records, "2026-W33", "2026-W34")).toEqual([]);
  });
});

describe("recordFor", () => {
  it("finds an anchored period", () => {
    const records = loadLedger(JSON.stringify([record("2026-W33")]));
    expect(recordFor(records, "2026-W33")?.period).toBe("2026-W33");
  });

  it("returns null for a gap rather than the nearest neighbour", () => {
    const records = loadLedger(JSON.stringify([record("2026-W33")]));
    expect(recordFor(records, "2026-W34")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run vitest run tests/anchor-ledger.test.ts`
Expected: FAIL — `Cannot find module '../src/anchor/ledger.js'`

- [ ] **Step 3: Write `src/anchor/ledger.ts`**

```typescript
import { z } from "zod";
import { periodsBetween, type PeriodId } from "./period.js";

const Hex32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/);

export const AnchorRecordSchema = z
  .object({
    period: z.string().regex(/^\d{4}-W\d{2}$/),
    root: Hex32,
    count: z.number().int().min(1),
    /**
     * The uids this root covered, stored rather than recomputed.
     *
     * A proof has to stay checkable years later. Recomputing the set from the
     * pipeline's current output would make old proofs depend on code that has
     * moved on; pinning it here makes the record self-contained.
     */
    uids: z.array(Hex32).min(1),
    tx_hash: Hex32,
    attestation_uid: Hex32,
    anchored_at: z.string(),
  })
  .refine((r) => r.uids.length === r.count, {
    message: "count disagrees with the number of uids anchored",
  });

export type AnchorRecord = z.infer<typeof AnchorRecordSchema>;

export function loadLedger(text: string): AnchorRecord[] {
  const records = z.array(AnchorRecordSchema).parse(JSON.parse(text));

  // One anchor per period. Two roots for one week would mean the record cannot
  // say which one a proof should check against.
  const seen = new Set<string>();
  for (const record of records) {
    if (seen.has(record.period)) {
      throw new Error(`period is already anchored: ${record.period}`);
    }
    seen.add(record.period);
  }
  return records;
}

/**
 * Periods in the range with no anchor.
 *
 * These are gaps, not a backlog: a week that went unanchored stays unanchored,
 * because an anchor claims its contents existed by a date that has now passed.
 */
export function gapsIn(records: AnchorRecord[], from: PeriodId, to: PeriodId): PeriodId[] {
  const anchored = new Set(records.map((r) => r.period));
  return periodsBetween(from, to).filter((period) => !anchored.has(period));
}

export function recordFor(records: AnchorRecord[], period: PeriodId): AnchorRecord | null {
  return records.find((r) => r.period === period) ?? null;
}
```

- [ ] **Step 4: Create the empty ledger**

```bash
echo '[]' > anchors.json
```

- [ ] **Step 5: Run it to verify it passes**

Run: `bun run vitest run tests/anchor-ledger.test.ts && bun run typecheck`
Expected: PASS, 8 tests.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: anchor ledger where a skipped week is an absence, not a backlog"
```

---

### Task 5: plan the next anchor

**Files:**
- Create: `src/anchor/plan.ts`
- Test: `tests/anchor-plan.test.ts`

**Interfaces:**
- Consumes: `AttestationEnvelope` from `src/attest/attest.ts`; `periodOf` from `period.ts`; `rootOf` from `tree.ts`; `AnchorRecord`, `recordFor` from `ledger.ts`.
- Produces: `planAnchor(envelopes, records, period): AnchorPlan | null`, `interface AnchorPlan { period; root; count; uids; periodStart; periodEnd }`.

- [ ] **Step 1: Write the failing test**

`tests/anchor-plan.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { planAnchor } from "../src/anchor/plan.js";
import type { AnchorRecord } from "../src/anchor/ledger.js";

const envelope = (uid: string, time: string) =>
  ({
    envelope_version: 1 as const,
    domain: { address: "0x42", chainId: "8453", version: "1.0.1" },
    signer: "0xsigner",
    identity_id: `0x${"11".repeat(32)}` as const,
    claim_hash: `0x${"22".repeat(32)}` as const,
    attestation: {
      uid,
      message: { time: String(Math.floor(new Date(time).getTime() / 1000)) },
    },
  }) as never;

const W33 = "2026-08-12T11:00:00Z";
const W34 = "2026-08-19T11:00:00Z";

describe("planAnchor", () => {
  it("covers exactly the attestations whose time falls in the period", () => {
    const envelopes = [
      envelope(`0x${"aa".repeat(32)}`, W33),
      envelope(`0x${"bb".repeat(32)}`, W33),
      envelope(`0x${"cc".repeat(32)}`, W34),
    ];
    const plan = planAnchor(envelopes, [], "2026-W33")!;
    expect(plan.count).toBe(2);
    expect(plan.uids).toEqual([`0x${"aa".repeat(32)}`, `0x${"bb".repeat(32)}`]);
  });

  it("returns null for a period with no attestations, rather than an empty root", () => {
    expect(planAnchor([envelope(`0x${"cc".repeat(32)}`, W34)], [], "2026-W33")).toBeNull();
  });

  it("refuses a period that is already anchored", () => {
    const records = [{ period: "2026-W33" } as AnchorRecord];
    expect(() => planAnchor([envelope(`0x${"aa".repeat(32)}`, W33)], records, "2026-W33")).toThrow(
      /already anchored/i,
    );
  });

  it("orders uids deterministically, so the root does not depend on input order", () => {
    const a = envelope(`0x${"aa".repeat(32)}`, W33);
    const b = envelope(`0x${"bb".repeat(32)}`, W33);
    expect(planAnchor([a, b], [], "2026-W33")!.root).toBe(
      planAnchor([b, a], [], "2026-W33")!.root,
    );
  });

  it("reports the period's own bounds, not the range of its attestations", () => {
    const plan = planAnchor([envelope(`0x${"aa".repeat(32)}`, W33)], [], "2026-W33")!;
    expect(plan.periodEnd - plan.periodStart).toBe(7 * 24 * 60 * 60);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run vitest run tests/anchor-plan.test.ts`
Expected: FAIL — `Cannot find module '../src/anchor/plan.js'`

- [ ] **Step 3: Write `src/anchor/plan.ts`**

```typescript
import type { AttestationEnvelope } from "../attest/attest.js";
import { periodBounds, periodOf, type PeriodId } from "./period.js";
import { recordFor, type AnchorRecord } from "./ledger.js";
import { rootOf } from "./tree.js";

export interface AnchorPlan {
  readonly period: PeriodId;
  readonly root: `0x${string}`;
  readonly count: number;
  readonly uids: `0x${string}`[];
  readonly periodStart: number;
  readonly periodEnd: number;
}

/**
 * What a given week's anchor would cover, or null if there is nothing to anchor.
 *
 * The period's own bounds are reported rather than the span of its contents: the
 * claim being made is about a calendar week, and narrowing it to the first and
 * last attestation would quietly change what the anchor asserts.
 */
export function planAnchor(
  envelopes: readonly AttestationEnvelope[],
  records: readonly AnchorRecord[],
  period: PeriodId,
): AnchorPlan | null {
  if (recordFor([...records], period)) {
    throw new Error(`period is already anchored: ${period}`);
  }

  const uids = envelopes
    .filter((e) => periodOf(new Date(Number(e.attestation.message.time) * 1000).toISOString()) === period)
    .map((e) => e.attestation.uid as `0x${string}`)
    // Sorted so the root depends on the set, not on the order it was read in.
    .sort();

  if (uids.length === 0) return null;

  const { start, end } = periodBounds(period);
  return {
    period,
    root: rootOf(uids),
    count: uids.length,
    uids,
    periodStart: start,
    periodEnd: end,
  };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `bun run vitest run tests/anchor-plan.test.ts && bun run typecheck`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: plan a week's anchor from its attestations, refusing a re-anchor"
```

---

### Task 6: build and simulate the transaction, never send it

**Files:**
- Create: `src/anchor/submit.ts`, `src/cli-anchor.ts`
- Test: `tests/anchor-submit.test.ts`

**Interfaces:**
- Consumes: `AnchorPlan` from `plan.ts`; `encodeAnchor`, `ANCHOR_SCHEMA_UID` from `anchor/schema.ts`; `EAS_CONTRACT` from `attest/domain.ts`.
- Produces: `buildAnchorRequest(plan): AnchorRequest`, `interface AnchorRequest { to; schema; data; recipient; expirationTime; revocable; refUID; value }`, and a `dry-run` CLI.

**This task writes no code that broadcasts.** It produces the exact request a
human will send, and prints it for inspection. Sending is Task 7, by hand.

- [ ] **Step 1: Write the failing test**

`tests/anchor-submit.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { SchemaEncoder } from "@ethereum-attestation-service/eas-sdk";
import { buildAnchorRequest } from "../src/anchor/submit.js";
import { ANCHOR_SCHEMA, ANCHOR_SCHEMA_UID } from "../src/anchor/schema.js";
import { EAS_CONTRACT } from "../src/attest/domain.js";

const plan = {
  period: "2026-W33",
  root: `0x${"ab".repeat(32)}` as const,
  count: 2,
  uids: [`0x${"11".repeat(32)}`, `0x${"22".repeat(32)}`] as `0x${string}`[],
  periodStart: 1_754_956_800,
  periodEnd: 1_755_561_600,
};

describe("buildAnchorRequest", () => {
  it("targets the EAS contract on Base", () => {
    expect(buildAnchorRequest(plan).to).toBe(EAS_CONTRACT);
  });

  it("carries the anchor schema and a decodable payload", () => {
    const request = buildAnchorRequest(plan);
    expect(request.schema).toBe(ANCHOR_SCHEMA_UID);
    const decoded = new SchemaEncoder(ANCHOR_SCHEMA).decodeData(request.data);
    const byName = Object.fromEntries(decoded.map((d) => [d.name, d.value.value]));
    expect(String(byName.root)).toBe(plan.root);
    expect(Number(byName.count)).toBe(2);
  });

  it("sends no value — an anchor pays gas and nothing else", () => {
    expect(buildAnchorRequest(plan).value).toBe(0n);
  });

  it("never expires, because the claim it makes is about the past", () => {
    expect(buildAnchorRequest(plan).expirationTime).toBe(0n);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run vitest run tests/anchor-submit.test.ts`
Expected: FAIL — `Cannot find module '../src/anchor/submit.js'`

- [ ] **Step 3: Write `src/anchor/submit.ts`**

```typescript
import { EAS_CONTRACT } from "../attest/domain.js";
import { ANCHOR_SCHEMA_UID, encodeAnchor } from "./schema.js";
import type { AnchorPlan } from "./plan.js";

export interface AnchorRequest {
  readonly to: `0x${string}`;
  readonly schema: `0x${string}`;
  readonly data: string;
  readonly recipient: `0x${string}`;
  readonly expirationTime: bigint;
  readonly revocable: boolean;
  readonly refUID: `0x${string}`;
  readonly value: bigint;
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
const ZERO_UID = `0x${"00".repeat(32)}` as const;

/**
 * The exact request a human will broadcast.
 *
 * Nothing here sends anything. Building and sending are separated so the thing
 * that spends money is a deliberate act with a reviewable input, rather than a
 * side effect of running the pipeline.
 *
 * There is no recipient: an anchor is a statement about a period, not about
 * anybody, and naming an address would invite the reading that someone endorsed
 * its contents.
 */
export function buildAnchorRequest(plan: AnchorPlan): AnchorRequest {
  return {
    to: EAS_CONTRACT,
    schema: ANCHOR_SCHEMA_UID,
    data: encodeAnchor({
      root: plan.root,
      periodStart: plan.periodStart,
      periodEnd: plan.periodEnd,
      count: plan.count,
    }),
    recipient: ZERO_ADDRESS,
    expirationTime: 0n,
    revocable: true,
    refUID: ZERO_UID,
    value: 0n,
  };
}
```

- [ ] **Step 4: Write `src/cli-anchor.ts`**

```typescript
import { readFileSync } from "node:fs";
import { loadLedger } from "./anchor/ledger.js";
import { planAnchor } from "./anchor/plan.js";
import { buildAnchorRequest } from "./anchor/submit.js";
import { gapsIn } from "./anchor/ledger.js";
import { periodOf } from "./anchor/period.js";
import type { AttestationEnvelope } from "./attest/attest.js";

/**
 * Print what an anchor for a period would contain. Sends nothing.
 *
 * The point of a dry run here is that the next step costs money and cannot be
 * undone: whatever this prints is exactly what a human then broadcasts.
 */
function main(): void {
  const [attestationsPath = "dist/attestations.json", ledgerPath = "anchors.json", period] =
    process.argv.slice(2);

  const envelopes = JSON.parse(readFileSync(attestationsPath, "utf8")) as AttestationEnvelope[];
  const records = loadLedger(readFileSync(ledgerPath, "utf8"));

  const target = period ?? periodOf(new Date().toISOString());
  const plan = planAnchor(envelopes, records, target);

  if (!plan) {
    console.log(`${target}: nothing to anchor — no attestations fall in this period`);
    return;
  }

  const request = buildAnchorRequest(plan);
  console.log(`period      ${plan.period}  [${plan.periodStart}, ${plan.periodEnd})`);
  console.log(`covers      ${plan.count} attestations`);
  console.log(`root        ${plan.root}`);
  console.log(`to          ${request.to}`);
  console.log(`schema      ${request.schema}`);
  console.log(`data        ${request.data.slice(0, 66)}…`);
  console.log(`value       ${request.value} wei`);

  const periods = records.map((r) => r.period).sort();
  if (periods.length > 0) {
    const gaps = gapsIn(records, periods[0]!, target);
    if (gaps.length > 0) console.log(`gaps        ${gaps.join(", ")}`);
  }
  console.log("\nnothing was sent. see docs/anchoring.md to broadcast this.");
}

if (import.meta.url === `file://${process.argv[1]}`) main();
```

- [ ] **Step 5: Run it to verify it passes**

Run: `bun run vitest run tests/anchor-submit.test.ts && bun run typecheck`
Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: build and print an anchor request without sending it"
```

---

### Task 7: inclusion proofs and the runbook

**Files:**
- Create: `src/anchor/prove.ts`, `docs/anchoring.md`
- Modify: `README.md`
- Test: `tests/anchor-prove.test.ts`

**Interfaces:**
- Consumes: `AnchorRecord`, `recordFor` from `ledger.ts`; `proofFor`, `verifyInclusion` from `tree.ts`.
- Produces: `proveInclusion(records, uid): InclusionProof | null`, `checkInclusion(proof): boolean`, `interface InclusionProof { uid; period; root; proof; attestation_uid }`.

- [ ] **Step 1: Write the failing test**

`tests/anchor-prove.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { proveInclusion, checkInclusion } from "../src/anchor/prove.js";
import { rootOf } from "../src/anchor/tree.js";
import type { AnchorRecord } from "../src/anchor/ledger.js";

const UIDS = [`0x${"11".repeat(32)}`, `0x${"22".repeat(32)}`, `0x${"33".repeat(32)}`] as const;

const records: AnchorRecord[] = [
  {
    period: "2026-W33",
    root: rootOf(UIDS),
    count: 3,
    uids: [...UIDS],
    tx_hash: `0x${"cd".repeat(32)}`,
    attestation_uid: `0x${"ef".repeat(32)}`,
    anchored_at: "2026-08-17T09:00:00+00:00",
  },
];

describe("proveInclusion", () => {
  it("produces a proof that checks out", () => {
    const proof = proveInclusion(records, UIDS[1])!;
    expect(checkInclusion(proof)).toBe(true);
  });

  it("names the anchor the proof should be checked against", () => {
    const proof = proveInclusion(records, UIDS[1])!;
    expect(proof.period).toBe("2026-W33");
    expect(proof.attestation_uid).toBe(records[0]!.attestation_uid);
  });

  it("returns null for an attestation no anchor covers", () => {
    expect(proveInclusion(records, `0x${"99".repeat(32)}`)).toBeNull();
  });

  it("rejects a proof whose root was swapped", () => {
    const proof = proveInclusion(records, UIDS[1])!;
    expect(checkInclusion({ ...proof, root: `0x${"00".repeat(32)}` })).toBe(false);
  });

  it("rejects a proof re-pointed at a different uid", () => {
    const proof = proveInclusion(records, UIDS[1])!;
    expect(checkInclusion({ ...proof, uid: UIDS[2] })).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run vitest run tests/anchor-prove.test.ts`
Expected: FAIL — `Cannot find module '../src/anchor/prove.js'`

- [ ] **Step 3: Write `src/anchor/prove.ts`**

```typescript
import type { AnchorRecord } from "./ledger.js";
import { proofFor, verifyInclusion } from "./tree.js";
import type { PeriodId } from "./period.js";

export interface InclusionProof {
  readonly uid: `0x${string}`;
  readonly period: PeriodId;
  readonly root: `0x${string}`;
  readonly proof: `0x${string}`[];
  /** The onchain attestation carrying this root, so a checker can find it. */
  readonly attestation_uid: `0x${string}`;
}

/**
 * Show that an attestation was inside an anchored week.
 *
 * What this establishes is a bound on time and nothing else: the attestation
 * existed no later than the block that carried its root. It says nothing about
 * whether the claim inside it is true — that separation is the same one
 * `verifyEnvelope` maintains, and it has to survive here too.
 */
export function proveInclusion(
  records: readonly AnchorRecord[],
  uid: `0x${string}`,
): InclusionProof | null {
  const record = records.find((r) => r.uids.includes(uid));
  if (!record) return null;

  const uids = record.uids as `0x${string}`[];
  return {
    uid,
    period: record.period,
    root: record.root as `0x${string}`,
    proof: proofFor(uids, uid),
    attestation_uid: record.attestation_uid as `0x${string}`,
  };
}

export function checkInclusion(proof: InclusionProof): boolean {
  return verifyInclusion(proof.root, proof.uid, proof.proof);
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `bun run vitest run tests/anchor-prove.test.ts && bun run typecheck`
Expected: PASS, 5 tests.

- [ ] **Step 5: Write `docs/anchoring.md`**

```markdown
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
anchors costs about seven cents at the gas prices measured on 2026-08-12. Do not
overfund a hot key; top it up when it runs low.

**3. Register both schemas.** These are one-off transactions against
`0x4200000000000000000000000000000000000020`:

- the claim schema (`CLAIM_SCHEMA` in `src/attest/schema.ts`)
- the anchor schema (`ANCHOR_SCHEMA` in `src/anchor/schema.ts`)

Both UIDs are derived rather than assigned, so **every attestation already
signed becomes resolvable on easscan the moment the claim schema exists**.
Nothing needs re-signing.

## Every week

**1. Regenerate and inspect.**

```bash
bun src/cli.ts tests/fixtures/martian-reviews.sample.jsonl dist
bun src/cli-anchor.ts dist/attestations.json anchors.json
```

The second command prints the period, the root, the count and the exact
transaction that would be sent — and sends nothing. Read it before continuing.
Any gaps in earlier weeks are printed too; they stay gaps.

**2. Broadcast.** Send the printed request from your wallet. Anything that can
send a transaction to a contract will do.

**3. Record it.** Append to `anchors.json` — period, root, count, the uid list,
the transaction hash, the resulting attestation UID, and the time. Commit it.
The ledger is what makes a proof checkable later, so an anchor that is not
recorded may as well not have happened.

## Anchoring keys

| address | active from | active until | status |
|---|---|---|---|
| _none yet_ | | | |

`active`, `retired` (rotated out; its past anchors remain valid) or
`compromised` (do not trust anchors from it after the stated date).

## A missed week

Leave it missed. An anchor asserts that its contents existed by a date that has
now passed; publishing it late would assert something untrue. `gapsIn` lists
missed weeks and the dry run prints them, which is the honest outcome — those
attestations still verify by signature, they simply have no time bound.
```

- [ ] **Step 6: Update `README.md`**

Replace the `## Status` section's milestone lines with:

```markdown
**Milestone 2, step 1 (done):** every claim is signed as an EAS-format offchain
attestation bound to the Base mainnet domain, and verifies against the public key
alone — no wallet, no transaction, no key in CI.

**Milestone 2, step 2 (this):** one Merkle root per calendar week, published as
an EAS onchain attestation, so an attestation can be shown to have existed no
later than a given block. Run by hand — see `docs/anchoring.md`. A skipped week
stays a gap and is never backfilled.

**Still ahead:** the SBT contract.
```

- [ ] **Step 7: Run everything**

```bash
bun run test
bun run typecheck
bun src/cli.ts tests/fixtures/martian-reviews.sample.jsonl dist
HIVEMARK_SIGNING_KEY=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d \
  bun src/cli.ts tests/fixtures/martian-reviews.sample.jsonl dist
bun src/cli-anchor.ts dist/attestations.json anchors.json
```

Expected: all tests pass; the dry run prints a period, a root over the
attestations in it, and the words confirming nothing was sent. Report the root
and count you observe.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: inclusion proofs and the anchoring runbook"
```

---

## Self-Review

**Spec coverage:**

| spec requirement | task |
|---|---|
| root of the period's attestations, plus bounds and count | 3, 5 |
| EAS onchain attestation rather than our own contract | 3, 6 |
| claim schema registration moves here | 7 (runbook) |
| separate wallet, minimal balance, run by hand | 6, 7 |
| a missed week is a gap, never backfilled | 1, 4, 7 |
| proof that a claim existed no later than a date | 7 |
| anchoring key recorded, distinguished from the signing key | 7 |

**Deferred by design:** the SBT contract, revocation, any scheduled job, and
breeding. Each is named in the spec as later work.

**Type consistency:** `PeriodId` (Task 1) is used by `ledger.ts` (4), `plan.ts`
(5) and `prove.ts` (7). `AnchorPlan` (5) is the input to `buildAnchorRequest`
(6). `AnchorRecord` (4) is consumed by `planAnchor` (5) and `proveInclusion`
(7). `rootOf`/`proofFor`/`verifyInclusion` (2) are used by 5 and 7 and nowhere
else.

**Placeholder scan:** none. The two steps that cannot be automated — creating a
funded wallet and broadcasting — are written as runbook instructions for a human
rather than as code, which is the point rather than an omission.

**Known risk carried into execution:** `SimpleMerkleTree.of` sorts leaf pairs
internally, so `rootOf` does not depend on input order at the tree level — but
`planAnchor` sorts the uid list anyway, because the *stored* list is what a later
proof reconstructs from, and an unstable order there would change which index
`proofFor` finds. If a test shows the two orderings disagreeing, the stored list
is the authority.
