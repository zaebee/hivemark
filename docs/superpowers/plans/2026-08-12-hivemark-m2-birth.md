# hivemark M2 · birth attestation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Announce each reviewer identity once, as an EAS onchain attestation carrying its whole genome, so an outsider can look an entity up and recompute everything about it without asking us.

**Architecture:** A schema publishes the genome rather than its hash, so the identity, the address and the bee are all reproducible from the record alone. A committed ledger records who has been announced; the planner names who has not. Everything up to the transaction is pure and tested offline, and broadcasting is a step a human runs — the same shape as `anchor`, for the same reason.

**Tech Stack:** TypeScript on bun, existing `@ethereum-attestation-service/eas-sdk`, `viem`, `zod`, vitest. No new dependencies, and deliberately no Solidity.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-12-hivemark-design.md`, §Badge and §Birth attestation. Where this plan and the spec disagree, stop and ask.
- **No key in CI, no automated sending.** Committed code constructs and prints a transaction; a human broadcasts it. The anchoring wallet is reused — it already exists for this purpose and holds a minimal balance.
- Reuse, do not redeclare: `EAS_CONTRACT`, `EAS_CHAIN_ID`, `EAS_VERSION` from `src/attest/domain.ts`; `identityId`, `ownerAddress` from `src/identity.ts`; `genomeOf` from `src/genome.ts`; `byCodeUnit` from `src/canonical.ts`.
- A schema UID is `keccak256(abi.encodePacked(schema, resolver, revocable))` — confirmed from `SchemaRegistry.sol`. Derive; never fetch.
- **The published genome must recompute to the identity it claims.** A record whose fields hash to a different `identityId` is a contradiction, and the code must refuse to build one rather than emit it.
- An identity is announced **once**. A second announcement would give one entity two birth records with no way to say which is authoritative.
- Strict TypeScript, no `any` in committed code. Existing 184 tests must stay green.
- Comments explain why, not what.

---

## File Structure

| file | responsibility |
|---|---|
| `src/birth/schema.ts` | The birth EAS schema, its UID, and genome → ABI-encoded `data` |
| `src/birth/ledger.ts` | The committed record of announcements, and who is still unannounced |
| `src/birth/plan.ts` | Given track records and the ledger, decide what to announce |
| `src/birth/submit.ts` | Build the transaction; never broadcast |
| `src/cli-birth.ts` | Dry run |
| `docs/birth.md` | The runbook a human follows |
| `births.json` | Committed ledger of announcements |

---

### Task 1: the birth schema

**Files:**
- Create: `src/birth/schema.ts`
- Test: `tests/birth-schema.test.ts`

**Interfaces:**
- Consumes: `Genome` from `src/types.ts`; `identityId`, `ownerAddress` from `src/identity.ts`.
- Produces: `BIRTH_SCHEMA: string`, `BIRTH_SCHEMA_UID: \`0x${string}\``, `encodeBirth(genome: Genome, firstSeen: number): string`.

The genome is published in full, not as a hash. A reader with the record can
recompute `identityId`, the address and the bee without asking us for anything —
the same principle that put `leafDomain` in the anchor schema.

- [ ] **Step 1: Write the failing test**

`tests/birth-schema.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { SchemaEncoder } from "@ethereum-attestation-service/eas-sdk";
import { BIRTH_SCHEMA, BIRTH_SCHEMA_UID, encodeBirth } from "../src/birth/schema.js";
import { ANCHOR_SCHEMA_UID } from "../src/anchor/schema.js";
import { CLAIM_SCHEMA_UID } from "../src/attest/schema.js";
import { identityId, ownerAddress } from "../src/identity.js";
import type { Genome } from "../src/types.js";

const genome: Genome = {
  schema_version: 1,
  known_fields: [
    "context_mode",
    "finder_model",
    "guardian_version",
    "provider",
    "skeptic_model",
  ],
  provider: "gemini",
  finder_model: "gemini-2.5-flash",
  skeptic_model: "gemini-3.5-flash",
  context_mode: "graph",
  guardian_version: "d0d807ef01c556b882dc85b9fc0d2851d92aa1e5",
};

const FIRST_SEEN = 1_786_527_600;

describe("BIRTH_SCHEMA", () => {
  it("has a UID distinct from the other two schemas", () => {
    expect(BIRTH_SCHEMA_UID).toMatch(/^0x[0-9a-f]{64}$/);
    expect(BIRTH_SCHEMA_UID).not.toBe(CLAIM_SCHEMA_UID);
    expect(BIRTH_SCHEMA_UID).not.toBe(ANCHOR_SCHEMA_UID);
  });

  it("publishes the genome, not only its hash", () => {
    for (const field of ["finderModel", "skepticModel", "contextMode", "guardianVersion"]) {
      expect(BIRTH_SCHEMA).toContain(field);
    }
  });
});

describe("encodeBirth", () => {
  it("round-trips through the EAS schema encoder", () => {
    const decoded = new SchemaEncoder(BIRTH_SCHEMA).decodeData(encodeBirth(genome, FIRST_SEEN));
    const byName = Object.fromEntries(decoded.map((d) => [d.name, d.value.value]));
    expect(String(byName.identityId)).toBe(identityId(genome));
    expect(String(byName.finderModel)).toBe(genome.finder_model);
    expect(Number(byName.firstSeen)).toBe(FIRST_SEEN);
  });

  it("names the entity by its derived, keyless address", () => {
    const decoded = new SchemaEncoder(BIRTH_SCHEMA).decodeData(encodeBirth(genome, FIRST_SEEN));
    const byName = Object.fromEntries(decoded.map((d) => [d.name, d.value.value]));
    expect(String(byName.entity).toLowerCase()).toBe(
      ownerAddress(identityId(genome)).toLowerCase(),
    );
  });

  it("writes an absent skeptic as an empty string, not as a missing field", () => {
    // A reader must be able to tell "no skeptic" from "field not published".
    const decoded = new SchemaEncoder(BIRTH_SCHEMA).decodeData(
      encodeBirth({ ...genome, skeptic_model: null }, FIRST_SEEN),
    );
    const byName = Object.fromEntries(decoded.map((d) => [d.name, d.value.value]));
    expect(String(byName.skepticModel)).toBe("");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run vitest run tests/birth-schema.test.ts`
Expected: FAIL — `Cannot find module '../src/birth/schema.js'`

- [ ] **Step 3: Write `src/birth/schema.ts`**

```typescript
import { SchemaEncoder } from "@ethereum-attestation-service/eas-sdk";
import { encodePacked, keccak256 } from "viem";
import { identityId, ownerAddress } from "../identity.js";
import type { Genome } from "../types.js";

/**
 * The genome in full, not its hash.
 *
 * A hash would let a reader confirm a genome they already have; publishing the
 * fields lets them obtain one. With this record alone, an outsider recomputes
 * the identity, the address and the bee — the same reasoning that put
 * `leafDomain` in the anchor schema.
 */
export const BIRTH_SCHEMA =
  "bytes32 identityId,address entity,string provider,string finderModel," +
  "string skepticModel,string contextMode,string guardianVersion," +
  "uint16 genomeSchemaVersion,uint64 firstSeen";

const RESOLVER = "0x0000000000000000000000000000000000000000" as const;
const REVOCABLE = true;

/** Derived exactly as SchemaRegistry._getUID does; never fetched. */
export const BIRTH_SCHEMA_UID: `0x${string}` = keccak256(
  encodePacked(["string", "address", "bool"], [BIRTH_SCHEMA, RESOLVER, REVOCABLE]),
);

export function encodeBirth(genome: Genome, firstSeen: number): string {
  const id = identityId(genome);
  return new SchemaEncoder(BIRTH_SCHEMA).encodeData([
    { name: "identityId", type: "bytes32", value: id },
    { name: "entity", type: "address", value: ownerAddress(id) },
    { name: "provider", type: "string", value: genome.provider },
    { name: "finderModel", type: "string", value: genome.finder_model },
    // Empty string means "ran without a skeptic", which is a real configuration.
    // The field is always present so its absence can never be mistaken for it.
    { name: "skepticModel", type: "string", value: genome.skeptic_model ?? "" },
    { name: "contextMode", type: "string", value: genome.context_mode },
    { name: "guardianVersion", type: "string", value: genome.guardian_version },
    { name: "genomeSchemaVersion", type: "uint16", value: genome.schema_version },
    { name: "firstSeen", type: "uint64", value: firstSeen },
  ]);
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `bun run vitest run tests/birth-schema.test.ts && bun run typecheck`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: birth schema publishing the genome rather than its hash"
```

---

### Task 2: the birth ledger

**Files:**
- Create: `src/birth/ledger.ts`, `births.json`
- Test: `tests/birth-ledger.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `BirthRecordSchema` (zod), `type BirthRecord`, `loadBirths(text: string): BirthRecord[]`, `announced(records, id): BirthRecord | null`.

- [ ] **Step 1: Write the failing test**

`tests/birth-ledger.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { loadBirths, announced } from "../src/birth/ledger.js";

const record = (id: string) => ({
  identity_id: id,
  entity: "0x0000000000000000000000000000000000000001",
  first_seen: 1_786_527_600,
  tx_hash: `0x${"cd".repeat(32)}`,
  attestation_uid: `0x${"ef".repeat(32)}`,
  announced_at: "2026-08-17T09:00:00+00:00",
});

const ID_A = `0x${"11".repeat(32)}`;
const ID_B = `0x${"22".repeat(32)}`;

describe("loadBirths", () => {
  it("reads an empty ledger", () => {
    expect(loadBirths("[]")).toEqual([]);
  });

  it("refuses an empty file rather than reading it as nobody announced yet", () => {
    // Same hazard as the anchor ledger: read as empty, a truncated file would
    // announce identities that already have a birth record.
    expect(loadBirths.bind(null, "")).toThrow(/ledger is empty/i);
  });

  it("says plainly when the ledger is not JSON", () => {
    expect(loadBirths.bind(null, "{nope")).toThrow(/not valid JSON/i);
  });

  it("refuses two births for one identity", () => {
    const twice = JSON.stringify([record(ID_A), record(ID_A)]);
    expect(loadBirths.bind(null, twice)).toThrow(/already announced/i);
  });
});

describe("announced", () => {
  it("finds an identity that has a birth record", () => {
    const records = loadBirths(JSON.stringify([record(ID_A)]));
    expect(announced(records, ID_A)?.identity_id).toBe(ID_A);
  });

  it("returns null for one that does not", () => {
    const records = loadBirths(JSON.stringify([record(ID_A)]));
    expect(announced(records, ID_B)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run vitest run tests/birth-ledger.test.ts`
Expected: FAIL — `Cannot find module '../src/birth/ledger.js'`

- [ ] **Step 3: Write `src/birth/ledger.ts`**

```typescript
import { z } from "zod";

const Hex32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const Address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);

export const BirthRecordSchema = z.object({
  identity_id: Hex32,
  entity: Address,
  first_seen: z.number().int().min(0),
  tx_hash: Hex32,
  attestation_uid: Hex32,
  announced_at: z.string(),
});

export type BirthRecord = z.infer<typeof BirthRecordSchema>;

export function loadBirths(text: string): BirthRecord[] {
  // Refused rather than read as "nobody announced yet" — the dangerous reading,
  // since a truncated file would re-announce identities that already have a
  // birth record, and two births for one entity leave no way to say which is
  // authoritative.
  if (text.trim() === "") {
    throw new Error("birth ledger is empty; an unannounced ledger is the text []");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (cause) {
    throw new Error(`birth ledger is not valid JSON: ${(cause as Error).message}`);
  }

  const records = z.array(BirthRecordSchema).parse(parsed);

  const seen = new Set<string>();
  for (const record of records) {
    const key = record.identity_id.toLowerCase();
    if (seen.has(key)) {
      throw new Error(`identity is already announced: ${record.identity_id}`);
    }
    seen.add(key);
  }
  return records;
}

export function announced(
  records: readonly BirthRecord[],
  identityId: string,
): BirthRecord | null {
  const key = identityId.toLowerCase();
  return records.find((r) => r.identity_id.toLowerCase() === key) ?? null;
}
```

- [ ] **Step 4: Create the empty ledger**

```bash
echo '[]' > births.json
```

- [ ] **Step 5: Run it to verify it passes**

Run: `bun run vitest run tests/birth-ledger.test.ts && bun run typecheck`
Expected: PASS, 6 tests.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: birth ledger, refusing a second announcement for one identity"
```

---

### Task 3: plan the announcements

**Files:**
- Create: `src/birth/plan.ts`
- Test: `tests/birth-plan.test.ts`

**Interfaces:**
- Consumes: `TrackRecord` from `src/types.ts`; `ReviewRecord` from `src/schema.ts`; `genomeOf` from `src/genome.ts`; `identityId` from `src/identity.ts`; `BirthRecord`, `announced` from `birth/ledger.ts`.
- Produces: `planBirths(records: ReviewRecord[], births: BirthRecord[]): BirthPlan[]`, `interface BirthPlan { identity_id; genome; firstSeen; entity }`.

`firstSeen` is the earliest `reviewed_at` among that identity's reviews — derived
from the data, so the record says when the entity first acted rather than when we
got round to announcing it.

- [ ] **Step 1: Write the failing test**

`tests/birth-plan.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { harvest } from "../src/harvest.js";
import { planBirths } from "../src/birth/plan.js";
import { identityId } from "../src/identity.js";
import { genomeOf } from "../src/genome.js";
import type { BirthRecord } from "../src/birth/ledger.js";

const records = harvest(
  readFileSync("tests/fixtures/martian-reviews.sample.jsonl", "utf8"),
).records;

describe("planBirths", () => {
  it("names every identity in the corpus when none are announced", () => {
    const plans = planBirths(records, []);
    const distinct = new Set(records.map((r) => identityId(genomeOf(r))));
    expect(plans.length).toBe(distinct.size);
    expect(plans.length).toBeGreaterThan(1);
  });

  it("skips identities that already have a birth record", () => {
    const first = identityId(genomeOf(records[0]!));
    const existing = [{ identity_id: first } as BirthRecord];
    const plans = planBirths(records, existing);
    expect(plans.some((p) => p.identity_id === first)).toBe(false);
  });

  it("dates each identity by its earliest review, not by the run", () => {
    const plans = planBirths(records, []);
    for (const plan of plans) {
      const own = records
        .filter((r) => identityId(genomeOf(r)) === plan.identity_id)
        .map((r) => Math.floor(Date.parse(r.reviewed_at) / 1000));
      expect(plan.firstSeen).toBe(Math.min(...own));
    }
  });

  it("publishes a genome that recomputes to the identity it claims", () => {
    for (const plan of planBirths(records, [])) {
      expect(identityId(plan.genome)).toBe(plan.identity_id);
    }
  });

  it("is ordered deterministically, so two runs propose the same sequence", () => {
    expect(planBirths(records, []).map((p) => p.identity_id)).toEqual(
      planBirths([...records].reverse(), []).map((p) => p.identity_id),
    );
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run vitest run tests/birth-plan.test.ts`
Expected: FAIL — `Cannot find module '../src/birth/plan.js'`

- [ ] **Step 3: Write `src/birth/plan.ts`**

```typescript
import { byCodeUnit } from "../canonical.js";
import { genomeOf } from "../genome.js";
import { identityId, ownerAddress } from "../identity.js";
import type { ReviewRecord } from "../schema.js";
import type { Genome } from "../types.js";
import { announced, type BirthRecord } from "./ledger.js";

export interface BirthPlan {
  readonly identity_id: `0x${string}`;
  readonly entity: `0x${string}`;
  readonly genome: Genome;
  readonly firstSeen: number;
}

/**
 * Which identities have no birth record yet.
 *
 * `firstSeen` is the earliest review the identity produced, not the moment this
 * runs — the record should say when the entity first acted, and a wall clock
 * would make the same corpus announce different dates on different days. The
 * same reasoning that moved an attestation's `time` off the clock.
 */
export function planBirths(
  records: readonly ReviewRecord[],
  births: readonly BirthRecord[],
): BirthPlan[] {
  const earliest = new Map<`0x${string}`, { genome: Genome; firstSeen: number }>();

  for (const record of records) {
    const genome = genomeOf(record);
    const id = identityId(genome);
    const seenAt = Math.floor(Date.parse(record.reviewed_at) / 1000);
    const held = earliest.get(id);
    if (!held || seenAt < held.firstSeen) {
      earliest.set(id, { genome, firstSeen: held ? Math.min(held.firstSeen, seenAt) : seenAt });
    }
  }

  return [...earliest.entries()]
    .filter(([id]) => !announced(births, id))
    .map(([id, { genome, firstSeen }]) => ({
      identity_id: id,
      entity: ownerAddress(id),
      genome,
      firstSeen,
    }))
    // Ordered by identity so two runs over the same corpus propose the same
    // sequence regardless of the order reviews were read in.
    .sort((a, b) => byCodeUnit(a.identity_id, b.identity_id));
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `bun run vitest run tests/birth-plan.test.ts && bun run typecheck`
Expected: PASS, 5 tests. If the `firstSeen` test fails, the `Math.min` bookkeeping
in the loop is the place to look — the held value must always win when it is
earlier.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: plan births from the corpus, dated by earliest review"
```

---

### Task 4: build the transaction and the dry run

**Files:**
- Create: `src/birth/submit.ts`, `src/cli-birth.ts`
- Test: `tests/birth-submit.test.ts`

**Interfaces:**
- Consumes: `BirthPlan` from `birth/plan.ts`; `BIRTH_SCHEMA_UID`, `encodeBirth` from `birth/schema.ts`; `EAS_CONTRACT` from `attest/domain.ts`.
- Produces: `buildBirthRequest(plan: BirthPlan): BirthRequest`, and a `dry-run` CLI.

- [ ] **Step 1: Write the failing test**

`tests/birth-submit.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { SchemaEncoder } from "@ethereum-attestation-service/eas-sdk";
import { buildBirthRequest } from "../src/birth/submit.js";
import { BIRTH_SCHEMA, BIRTH_SCHEMA_UID } from "../src/birth/schema.js";
import { EAS_CONTRACT } from "../src/attest/domain.js";
import { identityId, ownerAddress } from "../src/identity.js";
import type { Genome } from "../src/types.js";
import type { BirthPlan } from "../src/birth/plan.js";

const genome: Genome = {
  schema_version: 1,
  known_fields: [
    "context_mode",
    "finder_model",
    "guardian_version",
    "provider",
    "skeptic_model",
  ],
  provider: "gemini",
  finder_model: "gemini-2.5-flash",
  skeptic_model: "gemini-3.5-flash",
  context_mode: "graph",
  guardian_version: "d0d807ef01c556b882dc85b9fc0d2851d92aa1e5",
};

const plan: BirthPlan = {
  identity_id: identityId(genome),
  entity: ownerAddress(identityId(genome)),
  genome,
  firstSeen: 1_786_527_600,
};

describe("buildBirthRequest", () => {
  it("targets the EAS contract on Base", () => {
    expect(buildBirthRequest(plan).to).toBe(EAS_CONTRACT);
  });

  it("addresses the entity itself as recipient", () => {
    // Unlike an anchor, which is about a period and names nobody, a birth is
    // about this entity — so the derived address is the right recipient.
    expect(buildBirthRequest(plan).recipient).toBe(plan.entity);
  });

  it("carries a payload that recomputes to the identity it names", () => {
    const request = buildBirthRequest(plan);
    expect(request.schema).toBe(BIRTH_SCHEMA_UID);
    const decoded = new SchemaEncoder(BIRTH_SCHEMA).decodeData(request.data);
    const byName = Object.fromEntries(decoded.map((d) => [d.name, d.value.value]));
    expect(String(byName.identityId)).toBe(plan.identity_id);
  });

  it("sends no value and never expires", () => {
    const request = buildBirthRequest(plan);
    expect(request.value).toBe(0n);
    expect(request.expirationTime).toBe(0n);
  });

  it("refuses a plan whose genome does not hash to its identity", () => {
    // A contradiction that must never reach the chain: the published fields
    // would recompute to a different entity than the one named.
    const lying = { ...plan, identity_id: `0x${"99".repeat(32)}` } as BirthPlan;
    expect(() => buildBirthRequest(lying)).toThrow(/does not match its genome/i);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run vitest run tests/birth-submit.test.ts`
Expected: FAIL — `Cannot find module '../src/birth/submit.js'`

- [ ] **Step 3: Write `src/birth/submit.ts`**

```typescript
import { EAS_CONTRACT } from "../attest/domain.js";
import { identityId } from "../identity.js";
import { BIRTH_SCHEMA_UID, encodeBirth } from "./schema.js";
import type { BirthPlan } from "./plan.js";

export interface BirthRequest {
  readonly to: `0x${string}`;
  readonly schema: `0x${string}`;
  readonly data: string;
  readonly recipient: `0x${string}`;
  readonly expirationTime: bigint;
  readonly revocable: boolean;
  readonly refUID: `0x${string}`;
  readonly value: bigint;
}

const ZERO_UID = `0x${"00".repeat(32)}` as const;

/**
 * The exact request a human will broadcast.
 *
 * The recipient is the entity itself — unlike an anchor, which is about a period
 * and names nobody, a birth is about this identity, and its derived address is
 * who it concerns.
 *
 * The consistency check is not defensive padding. A record whose published
 * genome hashes to a different identity than the one it names is a contradiction
 * that cannot be corrected once it is on a chain, and it would quietly break the
 * one property this schema exists to provide: that a reader can recompute the
 * entity from the record.
 */
export function buildBirthRequest(plan: BirthPlan): BirthRequest {
  if (identityId(plan.genome) !== plan.identity_id) {
    throw new Error(
      `birth plan names ${plan.identity_id} but does not match its genome, which hashes to ${identityId(plan.genome)}`,
    );
  }

  return {
    to: EAS_CONTRACT,
    schema: BIRTH_SCHEMA_UID,
    data: encodeBirth(plan.genome, plan.firstSeen),
    recipient: plan.entity,
    expirationTime: 0n,
    revocable: true,
    refUID: ZERO_UID,
    value: 0n,
  };
}
```

- [ ] **Step 4: Write `src/cli-birth.ts`**

```typescript
import { readFileSync } from "node:fs";
import { harvest } from "./harvest.js";
import { loadBirths } from "./birth/ledger.js";
import { planBirths } from "./birth/plan.js";
import { buildBirthRequest } from "./birth/submit.js";

/**
 * Print the birth announcements that are still owed. Sends nothing.
 *
 * Identities are rare — three in the current corpus — so this is expected to
 * print nothing most weeks, and that is the healthy state rather than a bug.
 */
function main(): void {
  const [reviewsPath = "tests/fixtures/martian-reviews.sample.jsonl", ledgerPath = "births.json"] =
    process.argv.slice(2);

  const { records, warnings } = harvest(readFileSync(reviewsPath, "utf8"));
  for (const warning of warnings) console.warn(`warning: ${warning}`);

  const births = loadBirths(readFileSync(ledgerPath, "utf8"));
  const plans = planBirths(records, births);

  if (plans.length === 0) {
    console.log("every identity in this corpus already has a birth record");
    return;
  }

  console.log(`${plans.length} identit${plans.length === 1 ? "y" : "ies"} to announce\n`);
  for (const plan of plans) {
    const request = buildBirthRequest(plan);
    console.log(`identity    ${plan.identity_id}`);
    console.log(`entity      ${plan.entity}`);
    console.log(`genome      ${plan.genome.provider} · ${plan.genome.context_mode} · ${plan.genome.guardian_version.slice(0, 7)}`);
    console.log(`first seen  ${new Date(plan.firstSeen * 1000).toISOString()}`);
    console.log(`to          ${request.to}`);
    console.log(`schema      ${request.schema}`);
    console.log(`data        ${request.data.slice(0, 66)}…\n`);
  }
  console.log("nothing was sent. see docs/birth.md to broadcast these.");
}

// Explicit catch for message quality, not exit status — the runtime already
// exits non-zero on a throw.
try {
  main();
} catch (error) {
  console.error(`hivemark: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `bun run vitest run tests/birth-submit.test.ts && bun run typecheck`
Expected: PASS, 5 tests.

- [ ] **Step 6: Run the dry run on the real corpus**

```bash
bun src/cli-birth.ts tests/fixtures/martian-reviews.sample.jsonl births.json
```

Expected: three identities, each with a genome line, a first-seen date drawn from
the reviews rather than today, and the confirmation that nothing was sent. Report
the identities and dates observed.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: build birth requests, refusing a genome that contradicts its identity"
```

---

### Task 5: the runbook

**Files:**
- Create: `docs/birth.md`
- Modify: `README.md`, `docs/anchoring.md`
- Test: none — documentation.

- [ ] **Step 1: Write `docs/birth.md`**

```markdown
# Birth runbook

A birth attestation announces a reviewer identity once, publishing its whole
genome so an outsider can recompute the entity without asking us. Identities are
rare — three in the current corpus — so this runs when a new one appears, not on
a schedule.

## Why this is not a token

An earlier design specified an ERC-721 with locked transfers. It was dropped
because a token cannot confer existence here: identity is the hash of the genome
and the address derives from it, so anyone holding a genome computes both without
a chain. A contract would not create an entity, only announce one — and an
attestation announces the same thing with none of our code on the chain.

The option stays open. Because identities are content-addressed, a token minted
later attaches to exactly the same entities, retroactively.

## Setup

The **anchoring wallet is reused** — see `docs/anchoring.md`. It already exists
for spending, holds a minimal balance, and is not in CI.

The birth schema must be registered once, alongside the other two, against the
SchemaRegistry at `0x4200000000000000000000000000000000000020` with
`resolver = 0x0` and `revocable = true`. Its UID is derived, so attestations
prepared before registration resolve the moment it exists.

## When a new identity appears

**1. Inspect.**

```bash
bun src/cli-birth.ts tests/fixtures/martian-reviews.sample.jsonl births.json
```

Prints every identity with no birth record, its genome, the date it was first
seen, and the exact transaction — and sends nothing. Printing nothing is the
normal state.

**2. Broadcast.** Call `attest` on the EAS contract at
`0x4200000000000000000000000000000000000021` with the printed schema and data,
the entity as recipient, zero expiration and zero refUID.

**3. Record it.** Append to `births.json` — identity, entity, first seen, the
transaction hash, the resulting attestation UID, and the time. Commit it.

## What a birth attestation claims

That this genome was observed producing reviews, and that its identity and
address derive from it as published. It does **not** claim the reviewer is any
good — that is what the track record is for — and it does not claim the entity
existed before `firstSeen`, only that this is the earliest review we hold.
```

- [ ] **Step 2: Update `README.md`**

Replace the "Still ahead" line with:

```markdown
**Milestone 2, step 3 (this):** each identity is announced once as an EAS
birth attestation carrying its whole genome, so an outsider can recompute the
entity — its id, its address and its bee — from the record alone. Run by hand,
see `docs/birth.md`.

**Milestone 2 is complete.** A soulbound token was specified and dropped: identity
is content-addressed, so a token cannot confer existence, and one minted later
would attach to the same entities retroactively. The reasoning is in the spec's
§Badge.
```

- [ ] **Step 3: Cross-reference from `docs/anchoring.md`**

Add to the schema registration table a third row:

```markdown
| birth | `BIRTH_SCHEMA` in `src/birth/schema.ts` | derived — print it with `bun -e 'import {BIRTH_SCHEMA_UID} from "./src/birth/schema.ts"; console.log(BIRTH_SCHEMA_UID)'` |
```

- [ ] **Step 4: Run everything**

```bash
bun run test
bun run typecheck
bun src/cli-birth.ts tests/fixtures/martian-reviews.sample.jsonl births.json
bun -e 'import {BIRTH_SCHEMA_UID} from "./src/birth/schema.ts"; console.log(BIRTH_SCHEMA_UID)'
```

Expected: all tests pass, three identities printed, and a birth schema UID.
Record the UID in `docs/anchoring.md` in place of the command, the way the other
two are recorded.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "docs: birth runbook, and milestone 2 closed"
```

---

## Self-Review

**Spec coverage:**

| spec requirement | task |
|---|---|
| one attestation per identity, first time seen | 2, 3 |
| genome published in full, not hashed | 1 |
| `firstSeen` from the earliest review | 3 |
| entity named by its derived keyless address | 1, 4 |
| an identity is never announced twice | 2, 3 |
| published genome recomputes to its identity | 4 |
| no key in CI, human broadcasts | 4, 5 |
| the SBT retraction is recorded where a reader will meet it | 5 |

**Type consistency:** `BirthPlan` (Task 3) is the input to `buildBirthRequest`
(4). `BirthRecord` (2) is consumed by `planBirths` (3). `BIRTH_SCHEMA_UID` and
`encodeBirth` (1) are used only by 4.

**Placeholder scan:** none. The birth schema UID is not written into this plan
because it depends on the exact schema string; Task 5 prints it and records it,
the way the other two UIDs were.

**Known risk carried into execution:** `planBirths` keeps the *genome* of
whichever review it saw first for an identity. All reviews sharing an identity
have identical genomes by construction — that is what identity means here — so
the choice cannot matter; if a test ever shows it does, the identity derivation
is broken and that is the bug to chase, not this function.
