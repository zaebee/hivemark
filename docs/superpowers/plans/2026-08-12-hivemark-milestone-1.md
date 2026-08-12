# hivemark Milestone 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a cumulative, per-identity track record for Guardian's code-review agents from real benchmark artifacts, and publish it as a page, a shields badge and a DNA-derived avatar — entirely offchain.

**Architecture:** A one-way pipeline. `harvest` parses `martian-reviews.jsonl`, `genome` + `identity` content-address the reviewer that produced each review, `claims` normalises findings into claims with resolved-or-`unresolved` verdicts, `derive` aggregates track records, and `publish` renders them. No wallet, no contract, no gas. Guardian is never imported and never modified.

**Tech Stack:** TypeScript (ESM, strict), Node 20+, vitest, zod for runtime validation, viem for keccak256 and address derivation. No web framework — the page is generated HTML.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-12-hivemark-design.md`. Where this plan and the spec disagree, stop and ask.
- **Milestone 1 is offchain only.** No private keys, no signing, no network calls, no contract. `viem` is used purely for `keccak256` and address formatting.
- `identity_id = keccak256(canonicalJson(genome))`. Canonical means recursively sorted keys, no insignificant whitespace, `undefined` fields omitted.
- `owner_address = last 20 bytes of keccak256(identity_id)`, EIP-55 checksummed.
- An unrecognised model name is a **refusal** (thrown error), never an "other" bucket.
- A finding with no verdict is `unresolved`. It is never counted as confirmed.
- The human axis (`findings_applied`) has **no data** in this source. Render "no data"; never backfill it from the skeptic.
- Survivorship bias is a standing disclaimer on every rendered card.
- **Drift guard for M1 is zod runtime validation**, not codegen. The spec names JSON-Schema codegen from Guardian's pydantic models; that requires a sibling Python checkout and is deferred to M2. Runtime validation against real data catches the same drift without the dependency. This is a deliberate deviation — do not "fix" it.
- Strict TypeScript: `"strict": true`, no `any` in committed code.

---

## File Structure

| file | responsibility |
|---|---|
| `src/schema.ts` | zod schemas for the raw artifact + inferred raw types |
| `src/types.ts` | hivemark's own types: `Genome`, `Claim`, `TrackRecord` |
| `src/canonical.ts` | canonical JSON serialisation |
| `src/harvest.ts` | JSONL → validated raw records, tolerating a truncated tail |
| `src/genome.ts` | raw record → `Genome`, provider derivation |
| `src/identity.ts` | `Genome` → `identity_id`, `owner_address` |
| `src/claims.ts` | raw record → `Claim[]` |
| `src/derive.ts` | `Claim[]` + records → `TrackRecord[]`, dedup |
| `src/avatar.ts` | `identity_id` → deterministic SVG |
| `src/publish/shields.ts` | `TrackRecord` → shields endpoint JSON |
| `src/publish/page.ts` | `TrackRecord[]` → HTML |
| `src/cli.ts` | orchestration, writes `dist/` |
| `tests/fixtures/` | frozen real data + a truncated variant |

---

### Task 1: Project scaffold, types and the frozen fixture

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`
- Create: `src/schema.ts`, `src/types.ts`
- Create: `tests/fixtures/martian-reviews.sample.jsonl`
- Test: `tests/schema.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `ReviewRecordSchema` (zod), `type ReviewRecord`, `type RawFinding`, `type Genome`, `type Claim`, `type TrackRecord`, `type Verdict`, `type Provider`.

- [ ] **Step 1: Initialise the project**

```bash
cd /home/zaebee/projects/hivemark
npm init -y
npm install --save-exact zod@3 viem@2
npm install --save-dev --save-exact typescript@5 vitest@3 @types/node@22
```

- [ ] **Step 2: Write `package.json` scripts and ESM setting**

Edit `package.json` so it contains these keys (leave the generated `dependencies`/`devDependencies` untouched):

```json
{
  "name": "hivemark",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "build": "tsc",
    "generate": "node --experimental-strip-types src/cli.ts"
  }
}
```

- [ ] **Step 3: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "."
  },
  "include": ["src", "tests"]
}
```

- [ ] **Step 4: Write `vitest.config.ts` and `.gitignore`**

`vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["tests/**/*.test.ts"] },
});
```

`.gitignore`:

```
node_modules/
dist/
*.tsbuildinfo
```

- [ ] **Step 5: Vendor the real fixture, frozen**

The source file is appended to while benchmark runs are in flight. Freeze a deterministic slice so tests never depend on a live file or a sibling checkout:

```bash
mkdir -p tests/fixtures
head -n 35 /home/zaebee/projects/ownima/codegraph-brain/benchmarks/martian-reviews.jsonl \
  > tests/fixtures/martian-reviews.sample.jsonl
wc -l tests/fixtures/martian-reviews.sample.jsonl
```

Expected: `35 tests/fixtures/martian-reviews.sample.jsonl`

- [ ] **Step 6: Write `src/schema.ts`**

```typescript
import { z } from "zod";

export const VERDICT_VALUES = ["confirmed", "refuted", "uncertain"] as const;

export const RawFindingSchema = z.object({
  file: z.string(),
  line: z.number().int().min(1).nullable().optional(),
  anchor: z.string().nullable().optional(),
  severity: z.enum(["critical", "major", "minor"]),
  category: z.enum(["logic", "contract", "tests", "types", "ontology", "security"]),
  title: z.string(),
  evidence: z.string(),
  problem: z.string(),
  fix: z.string(),
  confidence: z.number().int().min(0).max(100),
  verdict: z.enum(VERDICT_VALUES).nullable().optional(),
  skeptic_note: z.string().nullable().optional(),
  impact_score: z.number().int().min(0).max(10).nullable().optional(),
});

export const ReviewRecordSchema = z.object({
  url: z.string(),
  project: z.string(),
  base_sha: z.string(),
  head_sha: z.string(),
  guardian_sha: z.string().nullable().optional(),
  reviewed_at: z.string(),
  finder_model: z.string(),
  skeptic_model: z.string().nullable().optional(),
  had_graph: z.boolean(),
  pr_slice: z.string(),
  parse_failed: z.boolean(),
  error: z.string().nullable().optional(),
  findings: z.array(RawFindingSchema),
});

export type RawFinding = z.infer<typeof RawFindingSchema>;
export type ReviewRecord = z.infer<typeof ReviewRecordSchema>;
```

- [ ] **Step 7: Write `src/types.ts`**

```typescript
export type Provider = "gemini" | "mistral" | "ollama";

export type Verdict = "confirmed" | "refuted" | "uncertain" | "unresolved";

export interface Genome {
  readonly schema_version: number;
  readonly known_fields: readonly string[];
  readonly provider: Provider;
  readonly finder_model: string;
  readonly skeptic_model: string | null;
  readonly context_mode: "graph" | "diff-only";
  readonly guardian_version: string | null;
}

export interface Claim {
  readonly identity_id: `0x${string}`;
  readonly url: string;
  readonly project: string;
  readonly head_sha: string;
  readonly reviewed_at: string;
  readonly file: string;
  readonly line: number | null;
  readonly severity: "critical" | "major" | "minor";
  readonly category: string;
  readonly title: string;
  readonly confidence: number;
  readonly verdict: Verdict;
  readonly impact_score: number | null;
}

export interface SkepticAxis {
  readonly confirmed: number;
  readonly refuted: number;
  readonly uncertain: number;
  readonly unresolved: number;
  readonly mean_impact: number | null;
}

export interface TrackRecord {
  readonly identity_id: `0x${string}`;
  readonly owner_address: `0x${string}`;
  readonly genome: Genome;
  readonly reviews: number;
  readonly claims: number;
  readonly skeptic: SkepticAxis;
  /** No data in benchmark artifacts. Never inferred from the skeptic. */
  readonly human: { readonly available: false };
}
```

- [ ] **Step 8: Write the failing test**

`tests/schema.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ReviewRecordSchema } from "../src/schema.js";

const FIXTURE = "tests/fixtures/martian-reviews.sample.jsonl";

describe("ReviewRecordSchema", () => {
  it("validates every record in the real fixture", () => {
    const lines = readFileSync(FIXTURE, "utf8").trim().split("\n");
    expect(lines.length).toBe(35);
    for (const line of lines) {
      const parsed = ReviewRecordSchema.safeParse(JSON.parse(line));
      expect(parsed.success, `failed: ${JSON.stringify(parsed.error?.issues)}`).toBe(true);
    }
  });

  it("rejects a record missing finder_model", () => {
    const bad = { url: "u", project: "p", base_sha: "a", head_sha: "b",
      reviewed_at: "t", had_graph: true, pr_slice: "graph",
      parse_failed: false, findings: [] };
    expect(ReviewRecordSchema.safeParse(bad).success).toBe(false);
  });
});
```

- [ ] **Step 9: Run the test to verify it fails**

Run: `npx vitest run tests/schema.test.ts`
Expected: FAIL — `Cannot find module '../src/schema.js'` (before Step 6 files exist) or a validation failure naming the offending field.

- [ ] **Step 10: Run the test to verify it passes**

Run: `npx vitest run tests/schema.test.ts`
Expected: PASS, 2 tests.

If validation fails on the real fixture, **the schema is wrong, not the data** — widen the schema to match reality and note what changed.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: project scaffold, artifact schema and frozen real fixture"
```

---

### Task 2: harvest — parse JSONL, survive a truncated tail

**Files:**
- Create: `src/harvest.ts`
- Create: `tests/fixtures/truncated.jsonl`
- Test: `tests/harvest.test.ts`

**Interfaces:**
- Consumes: `ReviewRecordSchema`, `type ReviewRecord` from `src/schema.ts`.
- Produces: `harvest(text: string): HarvestResult` where `interface HarvestResult { records: ReviewRecord[]; warnings: string[] }`.

- [ ] **Step 1: Build the truncated fixture**

```bash
head -n 3 tests/fixtures/martian-reviews.sample.jsonl > tests/fixtures/truncated.jsonl
printf '{"url":"https://example.com/pull/1","project":"x","base_' \
  >> tests/fixtures/truncated.jsonl
wc -l tests/fixtures/truncated.jsonl
```

- [ ] **Step 2: Write the failing test**

`tests/harvest.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { harvest } from "../src/harvest.js";

describe("harvest", () => {
  it("returns every record from the real fixture with no warnings", () => {
    const result = harvest(readFileSync("tests/fixtures/martian-reviews.sample.jsonl", "utf8"));
    expect(result.records.length).toBe(35);
    expect(result.warnings).toEqual([]);
  });

  it("skips a truncated final line with a warning instead of throwing", () => {
    const result = harvest(readFileSync("tests/fixtures/truncated.jsonl", "utf8"));
    expect(result.records.length).toBe(3);
    expect(result.warnings.length).toBe(1);
    expect(result.warnings[0]).toContain("line 4");
  });

  it("ignores blank lines", () => {
    const result = harvest("\n\n");
    expect(result.records).toEqual([]);
    expect(result.warnings).toEqual([]);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run tests/harvest.test.ts`
Expected: FAIL — `Cannot find module '../src/harvest.js'`

- [ ] **Step 4: Write `src/harvest.ts`**

```typescript
import { ReviewRecordSchema, type ReviewRecord } from "./schema.js";

export interface HarvestResult {
  records: ReviewRecord[];
  warnings: string[];
}

/**
 * Parse the append-only review log.
 *
 * The source file is written while benchmark runs are in flight, so the final
 * line may be a partial write. A truncated tail is skipped with a warning: it
 * must neither abort the run nor be silently dropped, because a silent drop
 * makes a short result indistinguishable from a small corpus.
 */
export function harvest(text: string): HarvestResult {
  const records: ReviewRecord[] = [];
  const warnings: string[] = [];

  const lines = text.split("\n");
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed === "") return;

    let json: unknown;
    try {
      json = JSON.parse(trimmed);
    } catch {
      warnings.push(`line ${index + 1}: unparseable JSON, skipped (${trimmed.length} bytes)`);
      return;
    }

    const parsed = ReviewRecordSchema.safeParse(json);
    if (!parsed.success) {
      warnings.push(`line ${index + 1}: schema mismatch, skipped — ${parsed.error.issues[0]?.message ?? "unknown"}`);
      return;
    }
    records.push(parsed.data);
  });

  return { records, warnings };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/harvest.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: harvest reviews from JSONL, skipping a truncated tail"
```

---

### Task 3: genome — derive the reviewer's DNA

**Files:**
- Create: `src/genome.ts`
- Test: `tests/genome.test.ts`

**Interfaces:**
- Consumes: `type ReviewRecord` from `src/schema.ts`, `type Genome`, `type Provider` from `src/types.ts`.
- Produces: `GENOME_SCHEMA_VERSION: number`, `providerOf(model: string): Provider`, `genomeOf(record: ReviewRecord): Genome`.

- [ ] **Step 1: Write the failing test**

`tests/genome.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { harvest } from "../src/harvest.js";
import { genomeOf, providerOf } from "../src/genome.js";

const records = harvest(
  readFileSync("tests/fixtures/martian-reviews.sample.jsonl", "utf8"),
).records;

describe("providerOf", () => {
  it("maps known model prefixes", () => {
    expect(providerOf("gemini-2.5-flash")).toBe("gemini");
    expect(providerOf("mistral-medium-latest")).toBe("mistral");
    expect(providerOf("qwen2.5-coder:7b")).toBe("ollama");
  });

  it("refuses an unrecognised model rather than bucketing it", () => {
    expect(() => providerOf("gpt-4o")).toThrow(/unrecognised model/i);
  });
});

describe("genomeOf", () => {
  it("reads context_mode from had_graph", () => {
    const graph = records.find((r) => r.had_graph);
    const diff = records.find((r) => !r.had_graph);
    expect(graph, "fixture must contain a graph review").toBeDefined();
    expect(diff, "fixture must contain a diff-only review").toBeDefined();
    expect(genomeOf(graph!).context_mode).toBe("graph");
    expect(genomeOf(diff!).context_mode).toBe("diff-only");
  });

  it("lists exactly the fields it populated", () => {
    const genome = genomeOf(records[0]!);
    expect(genome.known_fields).toEqual([
      "context_mode", "finder_model", "guardian_version", "provider", "skeptic_model",
    ]);
  });

  it("produces more than one distinct genome across the real fixture", () => {
    const distinct = new Set(records.map((r) => JSON.stringify(genomeOf(r))));
    expect(distinct.size).toBeGreaterThan(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/genome.test.ts`
Expected: FAIL — `Cannot find module '../src/genome.js'`

- [ ] **Step 3: Write `src/genome.ts`**

```typescript
import type { ReviewRecord } from "./schema.js";
import type { Genome, Provider } from "./types.js";

/** Bump when the genome's field set changes. Part of the hash, so a bump forks every identity — deliberately. */
export const GENOME_SCHEMA_VERSION = 1;

const PROVIDER_PREFIXES: ReadonlyArray<readonly [string, Provider]> = [
  ["gemini-", "gemini"],
  ["mistral-", "mistral"],
  ["qwen", "ollama"],
  ["llama", "ollama"],
  ["deepseek", "ollama"],
];

/**
 * Map a model name to its provider.
 *
 * Throws on an unknown name. An "other" bucket would merge genuinely different
 * reviewers into one identity, which is the one failure this design cannot
 * detect after the fact.
 */
export function providerOf(model: string): Provider {
  const lower = model.toLowerCase();
  for (const [prefix, provider] of PROVIDER_PREFIXES) {
    if (lower.startsWith(prefix)) return provider;
  }
  throw new Error(
    `unrecognised model "${model}" — add it to PROVIDER_PREFIXES rather than bucketing it`,
  );
}

/** Fields this version of the genome populates, sorted so the value is stable. */
const KNOWN_FIELDS = [
  "context_mode",
  "finder_model",
  "guardian_version",
  "provider",
  "skeptic_model",
] as const;

export function genomeOf(record: ReviewRecord): Genome {
  return {
    schema_version: GENOME_SCHEMA_VERSION,
    known_fields: KNOWN_FIELDS,
    provider: providerOf(record.finder_model),
    finder_model: record.finder_model,
    skeptic_model: record.skeptic_model ?? null,
    context_mode: record.had_graph ? "graph" : "diff-only",
    guardian_version: record.guardian_sha ?? null,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/genome.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: derive reviewer genome, refusing unknown models"
```

---

### Task 4: identity — content-address the genome

**Files:**
- Create: `src/canonical.ts`, `src/identity.ts`
- Test: `tests/canonical.test.ts`, `tests/identity.test.ts`

**Interfaces:**
- Consumes: `type Genome` from `src/types.ts`.
- Produces: `canonicalJson(value: unknown): string`, `identityId(genome: Genome): \`0x${string}\``, `ownerAddress(id: \`0x${string}\`): \`0x${string}\``.

- [ ] **Step 1: Write the failing test for canonical JSON**

`tests/canonical.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { canonicalJson } from "../src/canonical.js";

describe("canonicalJson", () => {
  it("sorts keys so serialisation order cannot change the hash", () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    expect(canonicalJson({ a: 2, b: 1 })).toBe('{"a":2,"b":1}');
  });

  it("sorts nested keys too", () => {
    expect(canonicalJson({ x: { d: 1, c: 2 } })).toBe('{"x":{"c":2,"d":1}}');
  });

  it("preserves array order, which is meaningful", () => {
    expect(canonicalJson([3, 1, 2])).toBe("[3,1,2]");
  });

  it("omits undefined but keeps null", () => {
    expect(canonicalJson({ a: undefined, b: null })).toBe('{"b":null}');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/canonical.test.ts`
Expected: FAIL — `Cannot find module '../src/canonical.js'`

- [ ] **Step 3: Write `src/canonical.ts`**

```typescript
/**
 * Deterministic JSON: recursively sorted keys, no insignificant whitespace,
 * `undefined` omitted. The hash of this string is an identity, so its input
 * must not depend on property insertion order or on a serialiser's whims.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/canonical.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Write the failing test for identity**

`tests/identity.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { isAddress } from "viem";
import { identityId, ownerAddress } from "../src/identity.js";
import type { Genome } from "../src/types.js";

const base: Genome = {
  schema_version: 1,
  known_fields: ["context_mode", "finder_model", "guardian_version", "provider", "skeptic_model"],
  provider: "gemini",
  finder_model: "gemini-2.5-flash",
  skeptic_model: "gemini-3.5-flash",
  context_mode: "graph",
  guardian_version: "d0d807ef01c5",
};

describe("identityId", () => {
  it("is stable for the same genome", () => {
    expect(identityId(base)).toBe(identityId({ ...base }));
  });

  it("changes when any field changes", () => {
    const id = identityId(base);
    expect(identityId({ ...base, context_mode: "diff-only" })).not.toBe(id);
    expect(identityId({ ...base, skeptic_model: null })).not.toBe(id);
    expect(identityId({ ...base, guardian_version: "1ecd9629f46c" })).not.toBe(id);
    expect(identityId({ ...base, schema_version: 2 })).not.toBe(id);
  });

  it("distinguishes a null field from an absent one", () => {
    const withNull = identityId({ ...base, skeptic_model: null });
    const withValue = identityId({ ...base, skeptic_model: "none" });
    expect(withNull).not.toBe(withValue);
  });

  it("is a 32-byte hex string", () => {
    expect(identityId(base)).toMatch(/^0x[0-9a-f]{64}$/);
  });
});

describe("ownerAddress", () => {
  it("derives a valid checksummed address", () => {
    const address = ownerAddress(identityId(base));
    expect(isAddress(address)).toBe(true);
  });

  it("is deterministic", () => {
    expect(ownerAddress(identityId(base))).toBe(ownerAddress(identityId(base)));
  });

  it("differs for different identities", () => {
    const a = ownerAddress(identityId(base));
    const b = ownerAddress(identityId({ ...base, context_mode: "diff-only" }));
    expect(a).not.toBe(b);
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run tests/identity.test.ts`
Expected: FAIL — `Cannot find module '../src/identity.js'`

- [ ] **Step 7: Write `src/identity.ts`**

```typescript
import { getAddress, keccak256, toHex } from "viem";
import { canonicalJson } from "./canonical.js";
import type { Genome } from "./types.js";

/**
 * Identity is the hash of the genome — content-addressed, not issued.
 *
 * Borrowed from the kitties pallet, where `kitty_id = hash_of(kitty)`. Two
 * consequences are wanted: changing a prompt births a new entity automatically,
 * and two identically configured reviewers on different machines are the same
 * subject.
 */
export function identityId(genome: Genome): `0x${string}` {
  return keccak256(toHex(canonicalJson(genome)));
}

/**
 * The address the badge is soulbound to.
 *
 * The same shape the EVM uses to turn a public key into an address, except the
 * preimage is a genome. No private key exists for it — including for us — so
 * the badge cannot be moved and the entity cannot be impersonated.
 */
export function ownerAddress(id: `0x${string}`): `0x${string}` {
  return getAddress(`0x${keccak256(id).slice(-40)}`);
}
```

- [ ] **Step 8: Run it to verify it passes**

Run: `npx vitest run tests/identity.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: content-address genomes into identities and owner addresses"
```

---

### Task 5: claims — normalise findings, with `unresolved` as its own state

**Files:**
- Create: `src/claims.ts`
- Test: `tests/claims.test.ts`

**Interfaces:**
- Consumes: `type ReviewRecord` from `src/schema.ts`, `genomeOf` from `src/genome.ts`, `identityId` from `src/identity.ts`, `type Claim` from `src/types.ts`.
- Produces: `claimsOf(record: ReviewRecord): Claim[]`.

- [ ] **Step 1: Write the failing test**

`tests/claims.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { harvest } from "../src/harvest.js";
import { claimsOf } from "../src/claims.js";
import type { ReviewRecord } from "../src/schema.js";

const records = harvest(
  readFileSync("tests/fixtures/martian-reviews.sample.jsonl", "utf8"),
).records;

function withFindings(base: ReviewRecord, findings: ReviewRecord["findings"]): ReviewRecord {
  return { ...base, findings };
}

describe("claimsOf", () => {
  it("produces one claim per finding across the real fixture", () => {
    const claims = records.flatMap(claimsOf);
    const findings = records.reduce((n, r) => n + r.findings.length, 0);
    expect(claims.length).toBe(findings);
    expect(claims.length).toBeGreaterThan(0);
  });

  it("maps a missing verdict to unresolved, never to confirmed", () => {
    const base = records[0]!;
    const finding = { ...base.findings[0]!, verdict: undefined };
    const claims = claimsOf(withFindings(base, [finding]));
    expect(claims[0]!.verdict).toBe("unresolved");
  });

  it("preserves a real verdict unchanged", () => {
    const base = records[0]!;
    const finding = { ...base.findings[0]!, verdict: "refuted" as const };
    expect(claimsOf(withFindings(base, [finding]))[0]!.verdict).toBe("refuted");
  });

  it("carries the identity of the reviewer that produced it", () => {
    const claims = claimsOf(records[0]!);
    expect(claims[0]!.identity_id).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("never invents a line number", () => {
    const base = records[0]!;
    const finding = { ...base.findings[0]!, line: undefined };
    expect(claimsOf(withFindings(base, [finding]))[0]!.line).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/claims.test.ts`
Expected: FAIL — `Cannot find module '../src/claims.js'`

- [ ] **Step 3: Write `src/claims.ts`**

```typescript
import { genomeOf } from "./genome.js";
import { identityId } from "./identity.js";
import type { ReviewRecord } from "./schema.js";
import type { Claim } from "./types.js";

/**
 * Turn one review into claims.
 *
 * A finding with no verdict becomes `unresolved`, which is hivemark's own state
 * rather than Guardian's: Guardian leaves `verdict` null when the skeptic did
 * not run, and that absence must never be read as confirmation.
 */
export function claimsOf(record: ReviewRecord): Claim[] {
  const id = identityId(genomeOf(record));

  return record.findings.map((finding) => ({
    identity_id: id,
    url: record.url,
    project: record.project,
    head_sha: record.head_sha,
    reviewed_at: record.reviewed_at,
    file: finding.file,
    line: finding.line ?? null,
    severity: finding.severity,
    category: finding.category,
    title: finding.title,
    confidence: finding.confidence,
    verdict: finding.verdict ?? "unresolved",
    impact_score: finding.impact_score ?? null,
  }));
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/claims.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: normalise findings into claims with unresolved as a real state"
```

---

### Task 6: derive — aggregate track records and dedup re-reviews

**Files:**
- Create: `src/derive.ts`
- Test: `tests/derive.test.ts`

**Interfaces:**
- Consumes: `type ReviewRecord`, `genomeOf`, `identityId`, `ownerAddress`, `claimsOf`, `type TrackRecord`.
- Produces: `deriveTrackRecords(records: ReviewRecord[]): TrackRecord[]`.

- [ ] **Step 1: Write the failing test**

`tests/derive.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { harvest } from "../src/harvest.js";
import { deriveTrackRecords } from "../src/derive.js";

const records = harvest(
  readFileSync("tests/fixtures/martian-reviews.sample.jsonl", "utf8"),
).records;

describe("deriveTrackRecords", () => {
  it("finds more than one identity in the real fixture", () => {
    const track = deriveTrackRecords(records);
    expect(track.length).toBeGreaterThan(1);
  });

  it("separates graph from diff-only reviewers", () => {
    const modes = deriveTrackRecords(records).map((t) => t.genome.context_mode);
    expect(modes).toContain("graph");
    expect(modes).toContain("diff-only");
  });

  it("accounts for every claim exactly once", () => {
    const track = deriveTrackRecords(records);
    const counted = track.reduce(
      (n, t) => n + t.skeptic.confirmed + t.skeptic.refuted + t.skeptic.uncertain + t.skeptic.unresolved,
      0,
    );
    expect(counted).toBe(track.reduce((n, t) => n + t.claims, 0));
  });

  it("reports the human axis as unavailable, never inferred", () => {
    for (const t of deriveTrackRecords(records)) {
      expect(t.human.available).toBe(false);
    }
  });

  it("counts a re-reviewed (url, head_sha, identity) only once", () => {
    const first = records[0]!;
    const rerun = { ...first, reviewed_at: "2099-01-01T00:00:00Z" };
    const once = deriveTrackRecords([first]);
    const twice = deriveTrackRecords([first, rerun]);
    const find = (ts: typeof once) => ts.find((t) => t.identity_id === once[0]!.identity_id)!;
    expect(find(twice).reviews).toBe(find(once).reviews);
    expect(find(twice).claims).toBe(find(once).claims);
  });

  it("keeps the later review when a rerun supersedes", () => {
    const first = records[0]!;
    const rerun = { ...first, reviewed_at: "2099-01-01T00:00:00Z", findings: [] };
    const track = deriveTrackRecords([first, rerun]);
    const mine = track.find((t) => t.genome.finder_model === first.finder_model)!;
    expect(mine.claims).toBe(0);
  });

  it("matches a stable snapshot of the real corpus", () => {
    const summary = deriveTrackRecords(records)
      .map((t) => ({
        context_mode: t.genome.context_mode,
        guardian_version: t.genome.guardian_version,
        reviews: t.reviews,
        claims: t.claims,
        skeptic: t.skeptic,
      }))
      .sort((a, b) => (canon(a) < canon(b) ? -1 : 1));
    expect(summary).toMatchSnapshot();
  });
});

function canon(v: unknown): string {
  return JSON.stringify(v);
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/derive.test.ts`
Expected: FAIL — `Cannot find module '../src/derive.js'`

- [ ] **Step 3: Write `src/derive.ts`**

```typescript
import { claimsOf } from "./claims.js";
import { genomeOf } from "./genome.js";
import { identityId, ownerAddress } from "./identity.js";
import type { ReviewRecord } from "./schema.js";
import type { Claim, TrackRecord } from "./types.js";

/**
 * Aggregate claims into one track record per identity.
 *
 * Derived on read and never stored, so a track record cannot drift from the
 * claims underneath it and cannot be tuned.
 */
export function deriveTrackRecords(records: ReviewRecord[]): TrackRecord[] {
  const latest = dedupe(records);
  const byIdentity = new Map<`0x${string}`, { records: ReviewRecord[]; claims: Claim[] }>();

  for (const record of latest) {
    const id = identityId(genomeOf(record));
    const bucket = byIdentity.get(id) ?? { records: [], claims: [] };
    bucket.records.push(record);
    bucket.claims.push(...claimsOf(record));
    byIdentity.set(id, bucket);
  }

  return [...byIdentity.entries()].map(([id, bucket]) => ({
    identity_id: id,
    owner_address: ownerAddress(id),
    genome: genomeOf(bucket.records[0]!),
    reviews: bucket.records.length,
    claims: bucket.claims.length,
    skeptic: skepticAxis(bucket.claims),
    human: { available: false as const },
  }));
}

/**
 * One review per (url, head_sha, identity); the later `reviewed_at` wins.
 *
 * A rerun is a correction, not extra evidence — counting both would let a
 * reviewer improve its record by being run twice.
 */
function dedupe(records: ReviewRecord[]): ReviewRecord[] {
  const winners = new Map<string, ReviewRecord>();
  for (const record of records) {
    const key = `${record.url}|${record.head_sha}|${identityId(genomeOf(record))}`;
    const held = winners.get(key);
    if (!held || record.reviewed_at > held.reviewed_at) winners.set(key, record);
  }
  return [...winners.values()];
}

function skepticAxis(claims: Claim[]) {
  const count = (v: Claim["verdict"]) => claims.filter((c) => c.verdict === v).length;
  const scored = claims.map((c) => c.impact_score).filter((s): s is number => s !== null);

  return {
    confirmed: count("confirmed"),
    refuted: count("refuted"),
    uncertain: count("uncertain"),
    unresolved: count("unresolved"),
    mean_impact: scored.length
      ? Math.round((scored.reduce((a, b) => a + b, 0) / scored.length) * 100) / 100
      : null,
  };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/derive.test.ts`
Expected: PASS, 7 tests. A snapshot file is written on the first run — **read it before committing**. It is the project's first real result; if the numbers look implausible, investigate before accepting the snapshot.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: derive per-identity track records, deduping reruns"
```

---

### Task 7: avatar — a deterministic face from the DNA

**Files:**
- Create: `src/avatar.ts`
- Test: `tests/avatar.test.ts`

**Interfaces:**
- Consumes: nothing beyond the id string.
- Produces: `avatarSvg(id: \`0x${string}\`, size?: number): string`.

- [ ] **Step 1: Write the failing test**

`tests/avatar.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { avatarSvg } from "../src/avatar.js";

const ID_A = `0x${"ab".repeat(32)}` as const;
const ID_B = `0x${"cd".repeat(32)}` as const;

describe("avatarSvg", () => {
  it("is deterministic", () => {
    expect(avatarSvg(ID_A)).toBe(avatarSvg(ID_A));
  });

  it("differs for different identities", () => {
    expect(avatarSvg(ID_A)).not.toBe(avatarSvg(ID_B));
  });

  it("emits a self-contained svg with no external references", () => {
    const svg = avatarSvg(ID_A);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("</svg>");
    expect(svg).not.toContain("http");
  });

  it("is horizontally mirrored, so a face reads as a face", () => {
    const svg = avatarSvg(ID_A);
    const cells = [...svg.matchAll(/data-cell="(\d+),(\d+)"/g)].map(
      ([, col, row]) => `${col},${row}`,
    );
    for (const cell of cells) {
      const [col, row] = cell.split(",").map(Number) as [number, number];
      expect(cells).toContain(`${4 - col},${row}`);
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/avatar.test.ts`
Expected: FAIL — `Cannot find module '../src/avatar.js'`

- [ ] **Step 3: Write `src/avatar.ts`**

```typescript
const GRID = 5;
const HALF = 3; // columns 0..2 are drawn; 3..4 mirror them

/**
 * A 5x5 mirrored identicon derived from the identity hash.
 *
 * Deterministic and self-contained: the same DNA always yields the same face,
 * and the SVG references nothing external. This is the design's one concession
 * to charm — and it costs no mechanism the pipeline does not already have,
 * exactly as kitty appearance derived from kitty dna.
 */
export function avatarSvg(id: `0x${string}`, size = 120): string {
  const bytes = hexToBytes(id);
  const hue = (bytes[0]! * 360) / 256;
  const fg = `hsl(${hue.toFixed(1)} 62% 48%)`;
  const bg = `hsl(${hue.toFixed(1)} 30% 94%)`;
  const unit = size / GRID;

  const cells: string[] = [];
  for (let row = 0; row < GRID; row += 1) {
    for (let col = 0; col < HALF; col += 1) {
      const bit = bytes[1 + row * HALF + col]! % 2;
      if (bit === 0) continue;
      for (const c of col === 2 ? [col] : [col, GRID - 1 - col]) {
        cells.push(
          `<rect data-cell="${c},${row}" x="${(c * unit).toFixed(2)}" y="${(row * unit).toFixed(2)}" ` +
            `width="${unit.toFixed(2)}" height="${unit.toFixed(2)}" fill="${fg}"/>`,
        );
      }
    }
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" ` +
    `viewBox="0 0 ${size} ${size}" role="img" aria-label="reviewer avatar">` +
    `<rect width="${size}" height="${size}" fill="${bg}"/>${cells.join("")}</svg>`
  );
}

function hexToBytes(hex: string): number[] {
  const body = hex.slice(2);
  const out: number[] = [];
  for (let i = 0; i < body.length; i += 2) out.push(parseInt(body.slice(i, i + 2), 16));
  return out;
}
```

Note: column 2 is the centre and must not be mirrored onto itself, which is why it is emitted once.

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/avatar.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: derive a deterministic avatar from reviewer DNA"
```

---

### Task 8: shields endpoint JSON

**Files:**
- Create: `src/publish/shields.ts`
- Test: `tests/shields.test.ts`

**Interfaces:**
- Consumes: `type TrackRecord` from `src/types.ts`.
- Produces: `shieldsEndpoint(track: TrackRecord): ShieldsEndpoint` where `interface ShieldsEndpoint { schemaVersion: 1; label: string; message: string; color: string }`.

- [ ] **Step 1: Write the failing test**

`tests/shields.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { shieldsEndpoint } from "../src/publish/shields.js";
import type { TrackRecord } from "../src/types.js";

function track(over: Partial<TrackRecord["skeptic"]>): TrackRecord {
  return {
    identity_id: `0x${"11".repeat(32)}`,
    owner_address: "0x0000000000000000000000000000000000000001",
    genome: {
      schema_version: 1,
      known_fields: ["context_mode", "finder_model", "guardian_version", "provider", "skeptic_model"],
      provider: "gemini",
      finder_model: "gemini-2.5-flash",
      skeptic_model: "gemini-3.5-flash",
      context_mode: "graph",
      guardian_version: "d0d807ef",
    },
    reviews: 10,
    claims: 20,
    skeptic: { confirmed: 15, refuted: 3, uncertain: 2, unresolved: 0, mean_impact: 4.1, ...over },
    human: { available: false },
  };
}

describe("shieldsEndpoint", () => {
  it("uses the shields endpoint contract", () => {
    expect(shieldsEndpoint(track({})).schemaVersion).toBe(1);
  });

  it("reports confirmed out of resolved, not out of all claims", () => {
    // 15 confirmed of 18 resolved (unresolved excluded) = 83%
    expect(shieldsEndpoint(track({})).message).toContain("83%");
  });

  it("says 'no data' rather than 0% when nothing is resolved", () => {
    const endpoint = shieldsEndpoint(track({ confirmed: 0, refuted: 0, uncertain: 0, unresolved: 5 }));
    expect(endpoint.message).toBe("no data");
    expect(endpoint.color).toBe("lightgrey");
  });

  it("names the reviewer by provider and context mode", () => {
    expect(shieldsEndpoint(track({})).label).toBe("gemini · graph");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/shields.test.ts`
Expected: FAIL — `Cannot find module '../src/publish/shields.js'`

- [ ] **Step 3: Write `src/publish/shields.ts`**

```typescript
import type { TrackRecord } from "../types.js";

export interface ShieldsEndpoint {
  schemaVersion: 1;
  label: string;
  message: string;
  color: string;
}

/**
 * Render a track record as a shields.io endpoint payload.
 *
 * The rate is confirmed over *resolved* claims. Dividing by all claims would
 * let an unjudged corpus masquerade as a poor one, conflating "we do not know"
 * with "it was wrong".
 */
export function shieldsEndpoint(track: TrackRecord): ShieldsEndpoint {
  const { confirmed, refuted, uncertain } = track.skeptic;
  const resolved = confirmed + refuted + uncertain;
  const label = `${track.genome.provider} · ${track.genome.context_mode}`;

  if (resolved === 0) {
    return { schemaVersion: 1, label, message: "no data", color: "lightgrey" };
  }

  const rate = Math.round((confirmed / resolved) * 100);
  return {
    schemaVersion: 1,
    label,
    message: `${rate}% confirmed (${resolved} resolved)`,
    color: rate >= 80 ? "brightgreen" : rate >= 60 ? "yellow" : "orange",
  };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/shields.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: render track records as shields endpoint payloads"
```

---

### Task 9: page, CLI, and the first real run

**Files:**
- Create: `src/publish/page.ts`, `src/cli.ts`, `README.md`
- Test: `tests/page.test.ts`, `tests/e2e.test.ts`

**Interfaces:**
- Consumes: everything above.
- Produces: `renderPage(tracks: TrackRecord[]): string`; a CLI writing `dist/index.html`, `dist/badge-<identity>.json`, `dist/avatar-<identity>.svg`.

- [ ] **Step 1: Write the failing page test**

`tests/page.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { renderPage } from "../src/publish/page.js";
import type { TrackRecord } from "../src/types.js";

const track: TrackRecord = {
  identity_id: `0x${"11".repeat(32)}`,
  owner_address: "0x0000000000000000000000000000000000000001",
  genome: {
    schema_version: 1,
    known_fields: ["context_mode", "finder_model", "guardian_version", "provider", "skeptic_model"],
    provider: "gemini",
    finder_model: "gemini-2.5-flash",
    skeptic_model: "gemini-3.5-flash",
    context_mode: "graph",
    guardian_version: "d0d807ef",
  },
  reviews: 10,
  claims: 20,
  skeptic: { confirmed: 15, refuted: 3, uncertain: 2, unresolved: 0, mean_impact: 4.1 },
  human: { available: false },
};

describe("renderPage", () => {
  it("states the survivorship bias disclaimer on the page", () => {
    expect(renderPage([track]).toLowerCase()).toContain("survivorship");
  });

  it("marks the human axis as having no data", () => {
    expect(renderPage([track])).toMatch(/human[\s\S]{0,200}no data/i);
  });

  it("shows the owner address so it can be recomputed independently", () => {
    expect(renderPage([track])).toContain(track.owner_address);
  });

  it("escapes model names rather than interpolating them raw", () => {
    const evil = { ...track, genome: { ...track.genome, finder_model: "<script>x</script>" } };
    const html = renderPage([evil]);
    expect(html).not.toContain("<script>x</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/page.test.ts`
Expected: FAIL — `Cannot find module '../src/publish/page.js'`

- [ ] **Step 3: Write `src/publish/page.ts`**

```typescript
import { avatarSvg } from "../avatar.js";
import { shieldsEndpoint } from "./shields.js";
import type { TrackRecord } from "../types.js";

const DISCLAIMER =
  "Guardian writes no record for a review that fails, so this data is " +
  "survivorship-biased by construction: every track record here is " +
  "systematically optimistic.";

export function renderPage(tracks: TrackRecord[]): string {
  const cards = tracks.map(card).join("\n");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>hivemark</title>
<style>
:root{color-scheme:light dark;--fg:#1a1a1a;--bg:#fafafa;--card:#fff;--muted:#666;--line:#e3e3e3}
@media(prefers-color-scheme:dark){:root{--fg:#e8e8e8;--bg:#161616;--card:#1f1f1f;--muted:#9a9a9a;--line:#333}}
body{margin:0;padding:2rem 1rem;background:var(--bg);color:var(--fg);
font:16px/1.6 ui-sans-serif,system-ui,sans-serif}
main{max-width:60rem;margin:0 auto}
.note{border-left:3px solid #c94;padding:.5rem 1rem;color:var(--muted);margin:0 0 2rem}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;
padding:1.25rem;margin:0 0 1.25rem;display:flex;gap:1.25rem;flex-wrap:wrap}
.card svg{border-radius:8px;flex:none}
dl{display:grid;grid-template-columns:auto 1fr;gap:.25rem 1rem;margin:0}
dt{color:var(--muted)}dd{margin:0;font-variant-numeric:tabular-nums}
code{font-size:.85em;word-break:break-all}
</style></head>
<body><main>
<h1>hivemark</h1>
<p class="note">${esc(DISCLAIMER)}</p>
${cards}
</main></body></html>`;
}

function card(track: TrackRecord): string {
  const s = track.skeptic;
  const badge = shieldsEndpoint(track);
  return `<section class="card">
${avatarSvg(track.identity_id, 96)}
<dl>
<dt>identity</dt><dd><code>${esc(track.identity_id)}</code></dd>
<dt>owner</dt><dd><code>${esc(track.owner_address)}</code></dd>
<dt>finder</dt><dd>${esc(track.genome.finder_model)}</dd>
<dt>skeptic</dt><dd>${esc(track.genome.skeptic_model ?? "none")}</dd>
<dt>context</dt><dd>${esc(track.genome.context_mode)}</dd>
<dt>guardian</dt><dd><code>${esc(track.genome.guardian_version ?? "unknown")}</code></dd>
<dt>reviews</dt><dd>${track.reviews}</dd>
<dt>skeptic axis</dt><dd>${s.confirmed} confirmed · ${s.refuted} refuted · ${s.uncertain} uncertain · ${s.unresolved} unresolved</dd>
<dt>mean impact</dt><dd>${s.mean_impact ?? "no data"}</dd>
<dt>human axis</dt><dd>no data (benchmark artifacts carry no findings_applied)</dd>
<dt>badge</dt><dd>${esc(badge.message)}</dd>
</dl></section>`;
}

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/page.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Write the failing end-to-end test**

`tests/e2e.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { run } from "../src/cli.js";

describe("end-to-end on real Guardian data", () => {
  const text = readFileSync("tests/fixtures/martian-reviews.sample.jsonl", "utf8");

  it("produces artifacts for every identity found", () => {
    const output = run(text);
    expect(output.tracks.length).toBeGreaterThan(1);
    expect(output.files.size).toBe(1 + output.tracks.length * 2);
    expect(output.files.has("index.html")).toBe(true);
  });

  it("reports harvest warnings rather than hiding them", () => {
    const output = run(`${text}\n{"url":"broken`);
    expect(output.warnings.length).toBe(1);
  });

  it("every badge file is valid shields JSON", () => {
    for (const [name, body] of run(text).files) {
      if (!name.startsWith("badge-")) continue;
      expect(JSON.parse(body).schemaVersion).toBe(1);
    }
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run tests/e2e.test.ts`
Expected: FAIL — `Cannot find module '../src/cli.js'`

- [ ] **Step 7: Write `src/cli.ts`**

```typescript
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { avatarSvg } from "./avatar.js";
import { deriveTrackRecords } from "./derive.js";
import { harvest } from "./harvest.js";
import { renderPage } from "./publish/page.js";
import { shieldsEndpoint } from "./publish/shields.js";
import type { TrackRecord } from "./types.js";

export interface RunOutput {
  tracks: TrackRecord[];
  files: Map<string, string>;
  warnings: string[];
}

/** Pure: text in, files out. Kept side-effect free so the e2e test needs no disk. */
export function run(text: string): RunOutput {
  const { records, warnings } = harvest(text);
  const tracks = deriveTrackRecords(records);
  const files = new Map<string, string>();

  files.set("index.html", renderPage(tracks));
  for (const track of tracks) {
    const short = track.identity_id.slice(2, 14);
    files.set(`badge-${short}.json`, `${JSON.stringify(shieldsEndpoint(track), null, 2)}\n`);
    files.set(`avatar-${short}.svg`, avatarSvg(track.identity_id, 240));
  }

  return { tracks, files, warnings };
}

function main(): void {
  const [source = "tests/fixtures/martian-reviews.sample.jsonl", outDir = "dist"] =
    process.argv.slice(2);
  const output = run(readFileSync(source, "utf8"));

  mkdirSync(outDir, { recursive: true });
  for (const [name, body] of output.files) writeFileSync(join(outDir, name), body, "utf8");

  for (const warning of output.warnings) console.warn(`warning: ${warning}`);
  console.log(`${output.tracks.length} identities → ${output.files.size} files in ${outDir}/`);
  for (const track of output.tracks) {
    const s = track.skeptic;
    console.log(
      `  ${track.genome.provider} ${track.genome.context_mode}: ` +
        `${track.reviews} reviews, ${track.claims} claims — ` +
        `${s.confirmed}✓ ${s.refuted}✗ ${s.uncertain}? ${s.unresolved}–`,
    );
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
```

- [ ] **Step 8: Run the e2e test to verify it passes**

Run: `npx vitest run tests/e2e.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 9: Run the whole suite and the real generation**

```bash
npx vitest run
npx tsc --noEmit
node --experimental-strip-types src/cli.ts tests/fixtures/martian-reviews.sample.jsonl dist
```

Expected: all tests pass, no type errors, and a per-identity summary printed. Open `dist/index.html` and confirm the disclaimer, the "no data" human axis and the avatars all render.

- [ ] **Step 10: Write `README.md`**

```markdown
# hivemark

Cumulative, independently verifiable track records for code-review agents.

Guardian (in [codegraph-brain](https://github.com/zaebee/codegraph-brain)) already
resolves its own claims — findings carry `confirmed` / `refuted` / `uncertain`
verdicts from a skeptic pass. What it lacks is a reviewer that persists across
runs. hivemark supplies that and nothing else.

A reviewer's identity is the hash of its genome — provider, models, context mode
and Guardian revision — so changing a prompt births a new entity automatically,
and its badge is soulbound to an address derived from that same hash, for which
no private key exists.

## Status

Milestone 1: offchain track records, page, shields badges, DNA-derived avatars.
No wallet, no contract, no gas. Milestone 2 adds signed attestations and a
weekly Merkle anchor.

## Run

```bash
npm install
npm test
node --experimental-strip-types src/cli.ts <reviews.jsonl> dist
```

## Honest limits

- Guardian writes no record for a failed review, so every track record here is
  survivorship-biased and systematically optimistic.
- The human axis (`findings_applied`) has no data in benchmark artifacts.
- The current corpus uses a single finder/skeptic pair, so cross-provider
  comparison is not yet possible.

See `docs/superpowers/specs/2026-08-12-hivemark-design.md`.
```

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: render the page, wire the CLI, and run end-to-end on real data"
```

---

## Self-Review

**Spec coverage:**

| spec requirement | task |
|---|---|
| `harvest` from `martian-reviews.jsonl` | 2 |
| truncated final line skipped with a warning | 2 |
| genome fields incl. `context_mode`, `guardian_version` | 3 |
| unrecognised model is a refusal | 3 |
| `identity_id = keccak256(canonicalJson(genome))` | 4 |
| `owner_address` = last 20 bytes, checksummed | 4 |
| `known_fields` + `schema_version` in the hash (fork on change) | 3, 4 |
| `unresolved` never counted as confirmed | 5, 6 |
| track record derived, never stored | 6 |
| duplicate `(url, head_sha, genome)` — later wins | 6 |
| human axis "no data", never backfilled | 6, 9 |
| survivorship disclaimer on every card | 9 |
| DNA-derived avatar | 7 |
| shields endpoint JSON | 8 |
| page | 9 |
| e2e on real data, vendored frozen fixture | 1, 9 |

**Deferred to M2 by design:** `attest`, `anchor`, the SBT contract, breeding, and JSON-Schema codegen from pydantic. All named in the spec as milestone 2 or out of scope.

**Type consistency:** `Genome`, `Claim`, `TrackRecord`, `SkepticAxis` are defined once in Task 1 and imported thereafter. `identityId` / `ownerAddress` / `genomeOf` / `claimsOf` / `deriveTrackRecords` / `shieldsEndpoint` / `avatarSvg` / `renderPage` / `run` keep the same names and signatures in every task that uses them.

**Placeholder scan:** no TBD, no "add error handling", no "similar to Task N". Every code step carries the real code; the one number the plan cannot know in advance — the aggregate corpus result — is pinned by a vitest snapshot rather than guessed.
