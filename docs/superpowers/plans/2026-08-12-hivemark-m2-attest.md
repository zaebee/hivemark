# hivemark M2 · `attest` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn every claim into an EAS-format offchain attestation, signed by the publisher and verifiable by anyone against a public key — with no wallet, no transaction, and no key in CI.

**Architecture:** A claim gains a `claim_hash` committing to the finding's full text at harvest time. `attest` ABI-encodes the claim into an EAS `Attest` payload and signs it as an EIP-712 offchain attestation bound to the Base mainnet domain. `verify` reports a structured result that separates what was checked from what cannot be established from the artifact alone. The signing key is optional: with no key, hivemark produces claims and no attestations, and that is a legitimate state rather than an error.

**Tech Stack:** TypeScript on bun, `@ethereum-attestation-service/eas-sdk` (which brings `ethers` for the signer), existing `viem` for keccak, `zod`, vitest.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-12-hivemark-design.md`. Where this plan and the spec disagree, stop and ask.
- **No transactions, no wallet funding, no key in CI.** This milestone signs and verifies only. `anchor` and the SBT contract are separate plans.
- Signing domain, fixed and covered by every signature — all three values verified, not remembered:
  - `chainId` = `8453n` (Base mainnet; the RPC's own `eth_chainId` agrees)
  - EAS contract = `0x4200000000000000000000000000000000000021` (from `eas-contracts` `deployments/base/EAS.json`; `eth_getCode` confirms bytecode)
  - EAS contract version = `"1.0.1"` (read from the deployed contract's `version()`)
- Offchain attestation version: `OffchainAttestationVersion.Version2` (enum value `2`). Its EIP-712 payload is `Attest(uint16 version, bytes32 schema, address recipient, uint64 time, uint64 expirationTime, bool revocable, bytes32 refUID, bytes data, bytes32 salt)` under domain name `"EAS Attestation"`.
- **The publisher signs, not the reviewer.** An attestation asserts that this hivemark instance observed a claim and its verdict. It never asserts the finding is correct.
- A missing signing key disables attestation. There is no `enabled` flag — "on but broken" must be unrepresentable.
- No `appliedByHuman` field: the human axis has no data, and signing a value we never observed would be a false statement.
- Strict TypeScript, no `any` in committed code. Tests run under `bun run test`.

---

## File Structure

| file | responsibility |
|---|---|
| `src/attest/domain.ts` | The frozen signing domain constants and their provenance |
| `src/attest/schema.ts` | EAS schema string, its UID, and claim → ABI-encoded `data` |
| `src/attest/signer.ts` | Optional key from env, boot probe, signer identity |
| `src/attest/attest.ts` | Claim → `SignedOffchainAttestation` wrapped in a self-describing envelope |
| `src/attest/verify.ts` | Envelope → `VerificationResult` |
| `src/claims.ts` | *(modify)* compute `claim_hash` from the full finding |
| `src/types.ts` | *(modify)* `Claim.claim_hash` |
| `docs/attestation-signers.md` | Who signed what, and when a key was retired or compromised |

---

### Task 1: `claim_hash` — commit to the finding, not to its metadata

**Files:**
- Modify: `src/types.ts`, `src/claims.ts`
- Test: `tests/claims.test.ts`

**Interfaces:**
- Consumes: `RawFinding`, `ReviewRecord` from `src/schema.ts`; `canonicalJson` from `src/canonical.ts`.
- Produces: `Claim.claim_hash: \`0x${string}\``.

Aura shipped a digest bug worth not repeating: their claim digest rendered as
`action=approve;params=trade` for *every* trade, so it distinguished nothing.
Our `Claim` drops `evidence`, `problem` and `fix`, so a hash over `Claim` alone
would commit only to metadata — two different findings on the same file and line
in the same category would collide. The hash is therefore computed where the
full finding is still in hand.

- [ ] **Step 1: Write the failing test**

Add to `tests/claims.test.ts`:

```typescript
describe("claim_hash", () => {
  it("commits to the finding's prose, not only its coordinates", () => {
    const base = records[0]!;
    const finding = base.findings[0]!;
    const other = { ...finding, problem: `${finding.problem} — and another thing` };
    const a = claimsOf(withFindings(base, [finding]))[0]!.claim_hash;
    const b = claimsOf(withFindings(base, [other]))[0]!.claim_hash;
    expect(a).not.toBe(b);
  });

  it("distinguishes two findings that share file, line and category", () => {
    const base = records[0]!;
    const f = base.findings[0]!;
    const one = { ...f, title: "first", evidence: "a", problem: "p1", fix: "x" };
    const two = { ...f, title: "second", evidence: "a", problem: "p2", fix: "x" };
    const claims = claimsOf(withFindings(base, [one, two]));
    expect(claims[0]!.claim_hash).not.toBe(claims[1]!.claim_hash);
  });

  it("is stable for the same finding in the same review", () => {
    const base = records[0]!;
    expect(claimsOf(base)[0]!.claim_hash).toBe(claimsOf(base)[0]!.claim_hash);
  });

  it("changes when the same finding is attributed to a different review", () => {
    const base = records[0]!;
    const elsewhere = { ...base, head_sha: "0000000000000000000000000000000000000000" };
    expect(claimsOf(base)[0]!.claim_hash).not.toBe(claimsOf(elsewhere)[0]!.claim_hash);
  });

  it("is a 32-byte hex string", () => {
    expect(claimsOf(records[0]!)[0]!.claim_hash).toMatch(/^0x[0-9a-f]{64}$/);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run vitest run tests/claims.test.ts`
Expected: FAIL — `claim_hash` is not a property of `Claim`.

- [ ] **Step 3: Add the field to the type**

In `src/types.ts`, inside `interface Claim`, after `identity_id`:

```typescript
  /**
   * Commitment to the whole finding, including the prose the Claim does not
   * carry. Metadata alone would collide: two different findings on one file and
   * line in one category share every field this record keeps.
   */
  readonly claim_hash: `0x${string}`;
```

- [ ] **Step 4: Compute it where the finding is still whole**

In `src/claims.ts`, add the imports and the helper, then set the field:

```typescript
import { keccak256, toHex } from "viem";
import { canonicalJson } from "./canonical.js";
import type { RawFinding, ReviewRecord } from "./schema.js";

/**
 * Hash the finding together with the review that produced it.
 *
 * The review coordinates are included so the same text found in two different
 * pull requests is two claims, not one. Every field of the finding takes part —
 * prose especially, since that is what a reader would dispute.
 */
function claimHash(record: ReviewRecord, finding: RawFinding): `0x${string}` {
  return keccak256(
    toHex(
      canonicalJson({
        url: record.url,
        head_sha: record.head_sha,
        guardian_sha: record.guardian_sha,
        finder_model: record.finder_model,
        skeptic_model: record.skeptic_model,
        finding,
      }),
    ),
  );
}
```

and inside the `record.findings.map(...)` callback, alongside `identity_id`:

```typescript
    claim_hash: claimHash(record, finding),
```

- [ ] **Step 5: Run the tests**

Run: `bun run vitest run && bun run typecheck`
Expected: PASS. The `derive` snapshot does not include claims individually, so it is unaffected.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: commit claim_hash to the finding's prose, not just its coordinates"
```

---

### Task 2: the frozen signing domain

**Files:**
- Create: `src/attest/domain.ts`
- Test: `tests/attest-domain.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `EAS_CONTRACT: \`0x${string}\``, `EAS_CHAIN_ID: bigint`, `EAS_VERSION: string`, `OFFCHAIN_VERSION: number`, `type SigningDomain`, `SIGNING_DOMAIN: SigningDomain`.

- [ ] **Step 1: Write the failing test**

`tests/attest-domain.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { SIGNING_DOMAIN } from "../src/attest/domain.js";

describe("SIGNING_DOMAIN", () => {
  it("is Base mainnet", () => {
    expect(SIGNING_DOMAIN.chainId).toBe(8453n);
  });

  it("names the EAS contract deployed there", () => {
    expect(SIGNING_DOMAIN.address).toBe("0x4200000000000000000000000000000000000021");
  });

  it("carries the contract's own version string", () => {
    expect(SIGNING_DOMAIN.version).toBe("1.0.1");
  });

  it("is frozen — every signature ever made covers these values", () => {
    expect(Object.isFrozen(SIGNING_DOMAIN)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run vitest run tests/attest-domain.test.ts`
Expected: FAIL — `Cannot find module '../src/attest/domain.js'`

- [ ] **Step 3: Write `src/attest/domain.ts`**

```typescript
/**
 * The signing domain, fixed before the first signature and never changed.
 *
 * "Offchain" does not mean chain-free: EAS puts chainId and the EAS contract
 * address inside the EIP-712 domain, so both are covered by every signature.
 * Changing either invalidates everything signed under the old values, which is
 * why Base mainnet was chosen from the start — signing is free on any chain, so
 * mainnet costs nothing and removes a migration that would discard the history.
 *
 * Provenance of each value, verified rather than remembered:
 *   chainId  8453  — eas-contracts deployments/base/.chainId; Base RPC's
 *                    eth_chainId returns the same
 *   address        — deployments/base/EAS.json; eth_getCode returns bytecode
 *   version        — read from the deployed contract's version() on Base
 */

export const EAS_CONTRACT = "0x4200000000000000000000000000000000000021" as const;
export const EAS_CHAIN_ID = 8453n;
export const EAS_VERSION = "1.0.1" as const;

/** EAS offchain attestation format version (OffchainAttestationVersion.Version2). */
export const OFFCHAIN_VERSION = 2 as const;

export interface SigningDomain {
  readonly address: `0x${string}`;
  readonly chainId: bigint;
  readonly version: string;
}

export const SIGNING_DOMAIN: SigningDomain = Object.freeze({
  address: EAS_CONTRACT,
  chainId: EAS_CHAIN_ID,
  version: EAS_VERSION,
});
```

- [ ] **Step 4: Run it to verify it passes**

Run: `bun run vitest run tests/attest-domain.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: freeze the Base mainnet signing domain with its provenance"
```

---

### Task 3: the EAS schema, its UID, and claim encoding

**Files:**
- Create: `src/attest/schema.ts`
- Test: `tests/attest-schema.test.ts`

**Interfaces:**
- Consumes: `Claim` from `src/types.ts`; `SchemaEncoder` from the EAS SDK.
- Produces: `CLAIM_SCHEMA: string`, `CLAIM_SCHEMA_UID: \`0x${string}\``, `encodeClaim(claim: Claim): string`, `VERDICT_CODES: Record<Verdict, number>`.

- [ ] **Step 1: Install the SDK**

```bash
cd path/to/hivemark
bun add @ethereum-attestation-service/eas-sdk
bun pm ls | grep -E "eas-sdk|ethers"
```

Expected: `@ethereum-attestation-service/eas-sdk` and `ethers` both present — the SDK depends on ethers for its signer interface. This is a real weight increase and it is accepted deliberately: the SDK is the reference implementation of the offchain UID and encoding, and a hand-rolled version that is subtly wrong produces attestations easscan silently will not match.

- [ ] **Step 2: Verify the schema UID derivation empirically**

EAS derives a schema UID inside `SchemaRegistry`, and the SDK exposes no helper
for it, so the formula must be confirmed against the deployed registry rather
than trusted. Run:

```bash
bun -e '
import { keccak256, encodePacked, toHex } from "viem";
const REGISTRY = "0x4200000000000000000000000000000000000020";
const schema = "bytes32 identityId,string repo,uint32 pr,string commitSha,string file,uint32 line,string category,string severity,uint8 confidence,uint8 verdict,uint8 impactScore,bytes32 claimHash";
const uid = keccak256(encodePacked(["string","address","bool"], [schema, "0x0000000000000000000000000000000000000000", true]));
console.log("derived uid:", uid);
const sel = keccak256(toHex("getSchema(bytes32)")).slice(0,10);
const data = sel + uid.slice(2);
const r = await fetch("https://mainnet.base.org", { method:"POST", headers:{"content-type":"application/json"},
  body: JSON.stringify({jsonrpc:"2.0",id:1,method:"eth_call",params:[{to:REGISTRY,data},"latest"]})});
const j = await r.json();
console.log("registry lookup:", j.result === "0x" ? "empty (schema not registered yet)" : j.result.slice(0,140));
'
```

Expected: a `derived uid` value, and a registry lookup that is either empty (our
schema is not registered — correct, registration is a transaction and belongs to
the `anchor` milestone) or a record whose returned schema string matches ours.

**If the derivation cannot be confirmed this way, stop and ask** rather than
proceeding: an attestation pointing at a UID that never resolves is worse than
no attestation, because it looks complete.

- [ ] **Step 3: Write the failing test**

`tests/attest-schema.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { SchemaEncoder } from "@ethereum-attestation-service/eas-sdk";
import { CLAIM_SCHEMA, CLAIM_SCHEMA_UID, encodeClaim, VERDICT_CODES } from "../src/attest/schema.js";
import type { Claim } from "../src/types.js";

const claim: Claim = {
  identity_id: `0x${"ab".repeat(32)}`,
  claim_hash: `0x${"cd".repeat(32)}`,
  url: "https://github.com/getsentry/sentry/pull/80168",
  project: "sentry",
  head_sha: "8422030ef456e3a898415e96475b4d8ddfc7640f",
  reviewed_at: "2026-08-12T11:27:57.981751+00:00",
  file: "src/sentry/incidents/grouptype.py",
  line: 15,
  severity: "critical",
  category: "logic",
  title: "Abstract Method Not Implemented",
  confidence: 90,
  verdict: "confirmed",
  impact_score: 7,
};

describe("CLAIM_SCHEMA", () => {
  it("has a 32-byte UID", () => {
    expect(CLAIM_SCHEMA_UID).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("declares no field hivemark cannot observe", () => {
    // appliedByHuman was removed: the human axis has no data, so signing it
    // would assert an observation never made.
    expect(CLAIM_SCHEMA).not.toContain("applied");
  });
});

describe("encodeClaim", () => {
  it("round-trips through the EAS schema encoder", () => {
    const decoded = new SchemaEncoder(CLAIM_SCHEMA).decodeData(encodeClaim(claim));
    const byName = Object.fromEntries(decoded.map((d) => [d.name, d.value.value]));
    expect(String(byName.identityId)).toBe(claim.identity_id);
    expect(String(byName.claimHash)).toBe(claim.claim_hash);
    expect(String(byName.file)).toBe(claim.file);
    expect(Number(byName.line)).toBe(15);
    expect(Number(byName.confidence)).toBe(90);
  });

  it("encodes a file-level finding as line 0, which the schema can represent", () => {
    const decoded = new SchemaEncoder(CLAIM_SCHEMA).decodeData(
      encodeClaim({ ...claim, line: null }),
    );
    const line = decoded.find((d) => d.name === "line")!;
    expect(Number(line.value.value)).toBe(0);
  });

  it("encodes an unjudged claim as its own verdict code, never as confirmed", () => {
    expect(VERDICT_CODES.unresolved).not.toBe(VERDICT_CODES.confirmed);
    expect(new Set(Object.values(VERDICT_CODES)).size).toBe(4);
  });

  it("encodes a missing impact score as 0 while impact 0 stays 0", () => {
    // Both render as 0 on the wire. The distinction lives in verdict:
    // an unresolved claim is the one whose score was never assigned.
    const none = new SchemaEncoder(CLAIM_SCHEMA).decodeData(
      encodeClaim({ ...claim, impact_score: null }),
    );
    expect(Number(none.find((d) => d.name === "impactScore")!.value.value)).toBe(0);
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `bun run vitest run tests/attest-schema.test.ts`
Expected: FAIL — `Cannot find module '../src/attest/schema.js'`

- [ ] **Step 5: Write `src/attest/schema.ts`**

```typescript
import { SchemaEncoder } from "@ethereum-attestation-service/eas-sdk";
import { encodePacked, keccak256 } from "viem";
import type { Claim, Verdict } from "../types.js";

/**
 * The attestation schema.
 *
 * `commitSha` is a string rather than bytes32 because a git sha is 20 bytes and
 * padding it would invent four bytes of zeroes that are not part of the commit
 * id. No `appliedByHuman`: the human axis has no data in benchmark artifacts,
 * and a field we could only ever sign as false asserts an observation we never
 * made.
 */
export const CLAIM_SCHEMA =
  "bytes32 identityId,string repo,uint32 pr,string commitSha,string file," +
  "uint32 line,string category,string severity,uint8 confidence,uint8 verdict," +
  "uint8 impactScore,bytes32 claimHash";

/** No resolver, revocable — the two other inputs to a schema's identity. */
const RESOLVER = "0x0000000000000000000000000000000000000000" as const;
const REVOCABLE = true;

/**
 * Derived, not registered.
 *
 * Registering a schema is a transaction, and this milestone spends no gas. The
 * UID is deterministic, so attestations signed today match the schema once it is
 * registered in the `anchor` milestone.
 */
export const CLAIM_SCHEMA_UID: `0x${string}` = keccak256(
  encodePacked(["string", "address", "bool"], [CLAIM_SCHEMA, RESOLVER, REVOCABLE]),
);

/** `unresolved` is ours, not EAS's, and must never share a code with `confirmed`. */
export const VERDICT_CODES: Record<Verdict, number> = {
  unresolved: 0,
  confirmed: 1,
  refuted: 2,
  uncertain: 3,
};

/** Pull request number from a GitHub URL, or 0 when the URL carries none. */
function prNumber(url: string): number {
  const match = /\/pull\/(\d+)/.exec(url);
  return match ? Number(match[1]) : 0;
}

export function encodeClaim(claim: Claim): string {
  return new SchemaEncoder(CLAIM_SCHEMA).encodeData([
    { name: "identityId", type: "bytes32", value: claim.identity_id },
    { name: "repo", type: "string", value: claim.project },
    { name: "pr", type: "uint32", value: prNumber(claim.url) },
    { name: "commitSha", type: "string", value: claim.head_sha },
    { name: "file", type: "string", value: claim.file },
    // 0 means file-level. Line numbers are 1-based upstream, so 0 is unused.
    { name: "line", type: "uint32", value: claim.line ?? 0 },
    { name: "category", type: "string", value: claim.category },
    { name: "severity", type: "string", value: claim.severity },
    { name: "confidence", type: "uint8", value: claim.confidence },
    { name: "verdict", type: "uint8", value: VERDICT_CODES[claim.verdict] },
    { name: "impactScore", type: "uint8", value: claim.impact_score ?? 0 },
    { name: "claimHash", type: "bytes32", value: claim.claim_hash },
  ]);
}
```

- [ ] **Step 6: Run it to verify it passes**

Run: `bun run vitest run tests/attest-schema.test.ts && bun run typecheck`
Expected: PASS, 6 tests.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: EAS claim schema, deterministic UID and claim encoding"
```

---

### Task 4: the optional signer, with a boot probe

**Files:**
- Create: `src/attest/signer.ts`
- Test: `tests/attest-signer.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `loadSigner(env: Record<string, string | undefined>): Signer | null`, `interface Signer { wallet: Wallet; address: \`0x${string}\` }`.

Aura hit two failures here that apply verbatim. `Wallet` accepts a degenerate
key without complaint, so an unset CI secret becomes a signer that produces 65
bytes which never recover to its address. And a secret written with `echo`
carries a trailing newline, which was their most common breakage. Both are
handled at load time, loudly.

- [ ] **Step 1: Write the failing test**

`tests/attest-signer.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { loadSigner } from "../src/attest/signer.js";

// A well-known test key; never used for anything real.
const KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

describe("loadSigner", () => {
  it("returns null when no key is configured", () => {
    expect(loadSigner({})).toBeNull();
    expect(loadSigner({ HIVEMARK_SIGNING_KEY: "" })).toBeNull();
    expect(loadSigner({ HIVEMARK_SIGNING_KEY: "   " })).toBeNull();
  });

  it("loads a valid key and exposes its address", () => {
    const signer = loadSigner({ HIVEMARK_SIGNING_KEY: KEY });
    expect(signer).not.toBeNull();
    expect(signer!.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it("tolerates the trailing newline that echo leaves in a secret", () => {
    const withNewline = loadSigner({ HIVEMARK_SIGNING_KEY: `${KEY}\n` });
    expect(withNewline!.address).toBe(loadSigner({ HIVEMARK_SIGNING_KEY: KEY })!.address);
  });

  it("refuses the all-zero key rather than signing with it", () => {
    expect(() => loadSigner({ HIVEMARK_SIGNING_KEY: `0x${"00".repeat(32)}` })).toThrow(
      /unusable signing key/i,
    );
  });

  it("refuses a malformed key loudly", () => {
    expect(() => loadSigner({ HIVEMARK_SIGNING_KEY: "0xnot-a-key" })).toThrow(
      /unusable signing key/i,
    );
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run vitest run tests/attest-signer.test.ts`
Expected: FAIL — `Cannot find module '../src/attest/signer.js'`

- [ ] **Step 3: Write `src/attest/signer.ts`**

```typescript
import { Wallet, verifyMessage } from "ethers";

export interface Signer {
  readonly wallet: Wallet;
  readonly address: `0x${string}`;
}

const KEY_VAR = "HIVEMARK_SIGNING_KEY";
const PROBE = "hivemark signer probe";

/**
 * Load the publisher's signing key, or nothing.
 *
 * There is no `enabled` flag on purpose: attestation is on exactly when a usable
 * key is present, so "configured on but broken" cannot be represented. Absence
 * is a legitimate state — hivemark still produces claims and a page, just
 * without signatures.
 *
 * Two failures are refused rather than carried forward, both learned from a
 * sibling project that shipped them. A key of all zeroes is accepted by the
 * constructor and yields signatures that never recover to the address, which is
 * exactly what an unset CI secret produces. And a secret written with `echo`
 * arrives with a trailing newline, so the value is trimmed before use.
 */
export function loadSigner(env: Record<string, string | undefined>): Signer | null {
  const raw = (env[KEY_VAR] ?? "").trim();
  if (raw === "") return null;

  let wallet: Wallet;
  try {
    wallet = new Wallet(raw);
  } catch (cause) {
    throw new Error(`unusable signing key in ${KEY_VAR}: ${(cause as Error).message}`, { cause });
  }

  // Prove the key signs and recovers before anything depends on it.
  const signature = wallet.signMessageSync(PROBE);
  if (verifyMessage(PROBE, signature).toLowerCase() !== wallet.address.toLowerCase()) {
    throw new Error(
      `unusable signing key in ${KEY_VAR}: signatures do not recover to ${wallet.address}`,
    );
  }

  return { wallet, address: wallet.address as `0x${string}` };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `bun run vitest run tests/attest-signer.test.ts`
Expected: PASS, 5 tests. If the all-zero key throws inside `new Wallet` rather
than failing the probe, both paths still produce the same refusal — the test
asserts the message, not which branch produced it.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: optional signing key with a boot probe that refuses a degenerate one"
```

---

### Task 5: sign a claim into a self-describing envelope

**Files:**
- Create: `src/attest/attest.ts`
- Test: `tests/attest.test.ts`

**Interfaces:**
- Consumes: `SIGNING_DOMAIN`, `OFFCHAIN_VERSION` from `domain.ts`; `CLAIM_SCHEMA_UID`, `encodeClaim` from `schema.ts`; `Signer` from `signer.ts`; `Claim` from `../types.ts`.
- Produces: `attestClaim(claim: Claim, signer: Signer, now?: bigint): Promise<AttestationEnvelope>`, `interface AttestationEnvelope`.

The envelope is self-describing: it carries the domain it was signed under, so a
verifier rebuilds the domain from the document instead of assuming today's
constants. That is what lets attestations survive a future domain change — and
it is not circular, because editing the recorded domain changes the message that
gets rebuilt, and recovery then stops matching the recorded signer.

- [ ] **Step 1: Write the failing test**

`tests/attest.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { attestClaim } from "../src/attest/attest.js";
import { loadSigner } from "../src/attest/signer.js";
import { CLAIM_SCHEMA_UID } from "../src/attest/schema.js";
import type { Claim } from "../src/types.js";

const KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const signer = loadSigner({ HIVEMARK_SIGNING_KEY: KEY })!;

const claim: Claim = {
  identity_id: `0x${"ab".repeat(32)}`,
  claim_hash: `0x${"cd".repeat(32)}`,
  url: "https://github.com/getsentry/sentry/pull/80168",
  project: "sentry",
  head_sha: "8422030ef456e3a898415e96475b4d8ddfc7640f",
  reviewed_at: "2026-08-12T11:27:57.981751+00:00",
  file: "src/sentry/incidents/grouptype.py",
  line: 15,
  severity: "critical",
  category: "logic",
  title: "Abstract Method Not Implemented",
  confidence: 90,
  verdict: "confirmed",
  impact_score: 7,
};

describe("attestClaim", () => {
  it("records the domain it signed under, not a pointer to today's constants", async () => {
    const envelope = await attestClaim(claim, signer, 1_755_000_000n);
    expect(envelope.domain.chainId).toBe("8453");
    expect(envelope.domain.address).toBe("0x4200000000000000000000000000000000000021");
    expect(envelope.domain.version).toBe("1.0.1");
  });

  it("names its signer and the schema it used", async () => {
    const envelope = await attestClaim(claim, signer, 1_755_000_000n);
    expect(envelope.signer.toLowerCase()).toBe(signer.address.toLowerCase());
    expect(envelope.attestation.message.schema).toBe(CLAIM_SCHEMA_UID);
  });

  it("keeps the claim hash reachable without decoding the payload", async () => {
    const envelope = await attestClaim(claim, signer, 1_755_000_000n);
    expect(envelope.claim_hash).toBe(claim.claim_hash);
    expect(envelope.identity_id).toBe(claim.identity_id);
  });

  it("is reproducible for the same claim at the same time", async () => {
    const a = await attestClaim(claim, signer, 1_755_000_000n);
    const b = await attestClaim(claim, signer, 1_755_000_000n);
    expect(a.attestation.uid).toBe(b.attestation.uid);
  });

  it("serialises to JSON without losing bigints", async () => {
    const envelope = await attestClaim(claim, signer, 1_755_000_000n);
    expect(() => JSON.stringify(envelope)).not.toThrow();
    expect(JSON.parse(JSON.stringify(envelope)).domain.chainId).toBe("8453");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run vitest run tests/attest.test.ts`
Expected: FAIL — `Cannot find module '../src/attest/attest.js'`

- [ ] **Step 3: Write `src/attest/attest.ts`**

```typescript
import { EAS, Offchain, OffchainAttestationVersion } from "@ethereum-attestation-service/eas-sdk";
import type { SignedOffchainAttestation } from "@ethereum-attestation-service/eas-sdk";
import { EAS_CONTRACT, SIGNING_DOMAIN } from "./domain.js";
import { CLAIM_SCHEMA_UID, encodeClaim } from "./schema.js";
import type { Signer } from "./signer.js";
import type { Claim } from "../types.js";

/** The domain as stored — strings, so the envelope survives JSON. */
export interface StoredDomain {
  readonly address: string;
  readonly chainId: string;
  readonly version: string;
}

export interface AttestationEnvelope {
  /** Which hivemark wrote this, for future format changes. */
  readonly envelope_version: 1;
  readonly domain: StoredDomain;
  readonly signer: string;
  /** Denormalised so an index can be built without decoding every payload. */
  readonly identity_id: `0x${string}`;
  readonly claim_hash: `0x${string}`;
  readonly attestation: SignedOffchainAttestation;
}

/** Constructed without a provider: nothing here touches the network. */
const offchain = new Offchain(
  { address: SIGNING_DOMAIN.address, chainId: SIGNING_DOMAIN.chainId, version: SIGNING_DOMAIN.version },
  OffchainAttestationVersion.Version2,
  new EAS(EAS_CONTRACT),
);

/**
 * Sign one claim.
 *
 * `recipient` is the reviewer's own soulbound address — the attestation is
 * about that identity — while the signer is the publisher. The two are
 * deliberately different: reviewers hold no keys, so nothing they are said to
 * have claimed is signed by them.
 *
 * `expirationTime` is 0 (never expires) and `revocable` is true, matching the
 * schema's own revocability. Revocation itself is an onchain action and belongs
 * to a later milestone; declaring it here only keeps that door open.
 */
export async function attestClaim(
  claim: Claim,
  signer: Signer,
  now: bigint = BigInt(Math.floor(Date.now() / 1000)),
): Promise<AttestationEnvelope> {
  const attestation = await offchain.signOffchainAttestation(
    {
      schema: CLAIM_SCHEMA_UID,
      recipient: ownerAddressOf(claim),
      time: now,
      expirationTime: 0n,
      revocable: true,
      refUID: `0x${"00".repeat(32)}`,
      data: encodeClaim(claim),
    },
    signer.wallet,
    { verifyOnchain: false },
  );

  return {
    envelope_version: 1,
    domain: {
      address: SIGNING_DOMAIN.address,
      chainId: SIGNING_DOMAIN.chainId.toString(),
      version: SIGNING_DOMAIN.version,
    },
    signer: signer.address,
    identity_id: claim.identity_id,
    claim_hash: claim.claim_hash,
    attestation,
  };
}

/** The reviewer's soulbound address, recomputed from the identity it belongs to. */
function ownerAddressOf(claim: Claim): string {
  return ownerAddress(claim.identity_id);
}
```

Add the import it needs at the top of the file:

```typescript
import { ownerAddress } from "../identity.js";
```

- [ ] **Step 4: Run it to verify it passes**

Run: `bun run vitest run tests/attest.test.ts && bun run typecheck`
Expected: PASS, 5 tests.

If `JSON.stringify` throws on a bigint inside `attestation.message`, that is the
SDK's own shape leaking through. Fix it by mapping the message's bigint fields
(`time`, `expirationTime`) to strings inside the envelope rather than by
patching `BigInt.prototype` — a global prototype change would alter behaviour for
every consumer of this library.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: sign a claim into a self-describing EAS offchain envelope"
```

---

### Task 6: verification that separates checked from vouched-for

**Files:**
- Create: `src/attest/verify.ts`
- Test: `tests/attest-verify.test.ts`

**Interfaces:**
- Consumes: `AttestationEnvelope` from `attest.ts`; `EAS`, `Offchain` from the SDK.
- Produces: `verifyEnvelope(envelope: AttestationEnvelope): VerificationResult`, `interface VerificationResult { ok: boolean; attested: boolean; failures: string[]; unverifiable: string[] }`.

`unverifiable` is the load-bearing field. A signature proves who wrote a record
and that it was not edited; it proves nothing about whether the finding was
right, whether the reviewer existed, or when the record was made. Listing those
explicitly is what stops a green check mark from being read as endorsement.

- [ ] **Step 1: Write the failing test**

`tests/attest-verify.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { attestClaim } from "../src/attest/attest.js";
import { loadSigner } from "../src/attest/signer.js";
import { verifyEnvelope } from "../src/attest/verify.js";
import type { Claim } from "../src/types.js";

const KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const signer = loadSigner({ HIVEMARK_SIGNING_KEY: KEY })!;

const claim: Claim = {
  identity_id: `0x${"ab".repeat(32)}`,
  claim_hash: `0x${"cd".repeat(32)}`,
  url: "https://github.com/getsentry/sentry/pull/80168",
  project: "sentry",
  head_sha: "8422030ef456e3a898415e96475b4d8ddfc7640f",
  reviewed_at: "2026-08-12T11:27:57.981751+00:00",
  file: "src/sentry/incidents/grouptype.py",
  line: 15,
  severity: "critical",
  category: "logic",
  title: "Abstract Method Not Implemented",
  confidence: 90,
  verdict: "confirmed",
  impact_score: 7,
};

describe("verifyEnvelope", () => {
  it("accepts an untouched envelope", async () => {
    const result = verifyEnvelope(await attestClaim(claim, signer, 1_755_000_000n));
    expect(result.ok).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("says attested only when a signature actually verified", async () => {
    const result = verifyEnvelope(await attestClaim(claim, signer, 1_755_000_000n));
    expect(result.attested).toBe(true);
  });

  it("rejects a tampered payload", async () => {
    const envelope = await attestClaim(claim, signer, 1_755_000_000n);
    const tampered = {
      ...envelope,
      attestation: {
        ...envelope.attestation,
        message: { ...envelope.attestation.message, data: "0xdeadbeef" },
      },
    };
    const result = verifyEnvelope(tampered);
    expect(result.ok).toBe(false);
    expect(result.attested).toBe(false);
    expect(result.failures.join(" ")).toMatch(/signature/i);
  });

  it("rejects a rewritten domain, which is why self-description is safe", async () => {
    const envelope = await attestClaim(claim, signer, 1_755_000_000n);
    const moved = { ...envelope, domain: { ...envelope.domain, chainId: "1" } };
    expect(verifyEnvelope(moved).ok).toBe(false);
  });

  it("rejects an envelope whose signer was swapped", async () => {
    const envelope = await attestClaim(claim, signer, 1_755_000_000n);
    const impostor = { ...envelope, signer: "0x000000000000000000000000000000000000dEaD" };
    expect(verifyEnvelope(impostor).ok).toBe(false);
  });

  it("names what a signature cannot establish, even when everything checks out", async () => {
    const result = verifyEnvelope(await attestClaim(claim, signer, 1_755_000_000n));
    const said = result.unverifiable.join(" ").toLowerCase();
    expect(said).toContain("correct");
    expect(said).toContain("time");
    expect(result.unverifiable.length).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run vitest run tests/attest-verify.test.ts`
Expected: FAIL — `Cannot find module '../src/attest/verify.js'`

- [ ] **Step 3: Write `src/attest/verify.ts`**

```typescript
import { EAS, Offchain, OffchainAttestationVersion } from "@ethereum-attestation-service/eas-sdk";
import type { AttestationEnvelope } from "./attest.js";

export interface VerificationResult {
  /** Nothing was found wrong. */
  readonly ok: boolean;
  /** A signature verified against the recorded signer. Never implied by `ok`. */
  readonly attested: boolean;
  readonly failures: readonly string[];
  /** What this artifact cannot establish, whatever the signature says. */
  readonly unverifiable: readonly string[];
}

/**
 * Check an envelope against the domain it records.
 *
 * The domain is rebuilt from the document rather than taken from today's
 * constants, so an attestation signed under an older domain still verifies. That
 * is not circular: a forger who edits the recorded domain changes the message
 * that gets rebuilt, and recovery then stops matching the recorded signer.
 */
export function verifyEnvelope(envelope: AttestationEnvelope): VerificationResult {
  const failures: string[] = [];

  const unverifiable = [
    "whether the finding is correct — the signature covers provenance, not truth",
    "when the attestation was made; the recorded time is the signer's own claim, " +
      "and only an onchain anchor can bound it",
    "whether the reviewer identity corresponds to a run that really happened",
  ];

  try {
    const offchain = new Offchain(
      {
        address: envelope.domain.address,
        chainId: BigInt(envelope.domain.chainId),
        version: envelope.domain.version,
      },
      OffchainAttestationVersion.Version2,
      new EAS(envelope.domain.address),
    );

    const valid = offchain.verifyOffchainAttestationSignature(
      envelope.signer,
      envelope.attestation,
    );
    if (!valid) failures.push("signature does not recover to the recorded signer");

    return { ok: failures.length === 0, attested: valid, failures, unverifiable };
  } catch (cause) {
    failures.push(`envelope could not be checked: ${(cause as Error).message}`);
    return { ok: false, attested: false, failures, unverifiable };
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `bun run vitest run tests/attest-verify.test.ts && bun run typecheck`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: verification that separates what was checked from what was vouched for"
```

---

### Task 7: signer registry, CLI wiring, and a run over the real corpus

**Files:**
- Create: `docs/attestation-signers.md`
- Modify: `src/cli.ts`, `README.md`
- Test: `tests/e2e.test.ts`

**Interfaces:**
- Consumes: everything above.
- Produces: `run(text, options?: { signer?: Signer | null })` gains `attestations: AttestationEnvelope[]` in `RunOutput`, and writes `attestations.json` when a signer is present.

- [ ] **Step 1: Write the failing test**

Add to `tests/e2e.test.ts`:

```typescript
import { loadSigner } from "../src/attest/signer.js";
import { verifyEnvelope } from "../src/attest/verify.js";

const KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

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
    expect(output.attestations.length).toBe(claims);
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run vitest run tests/e2e.test.ts`
Expected: FAIL — `run` takes one argument and `RunOutput` has no `attestations`.

- [ ] **Step 3: Make `run` async and optionally attesting**

In `src/cli.ts`, replace the `RunOutput` interface and `run` signature:

```typescript
import { attestClaim, type AttestationEnvelope } from "./attest/attest.js";
import { claimsOf } from "./claims.js";
import { loadSigner, type Signer } from "./attest/signer.js";

export interface RunOutput {
  tracks: TrackRecord[];
  files: Map<string, string>;
  warnings: string[];
  attestations: AttestationEnvelope[];
}

export interface RunOptions {
  /** Absent means "read the environment"; explicit null means "do not sign". */
  signer?: Signer | null;
}

export async function run(text: string, options: RunOptions = {}): Promise<RunOutput> {
  const { records, warnings } = harvest(text);
  const tracks = deriveTrackRecords(records);
  const files = new Map<string, string>();

  files.set("index.html", renderPage(tracks));
  for (const track of tracks) {
    const short = track.identity_id.slice(2, 14);
    files.set(`badge-${short}.json`, `${JSON.stringify(shieldsEndpoint(track), null, 2)}\n`);
    files.set(`avatar-${short}.svg`, avatarSvg(track.genome, 240));
  }

  const signer = options.signer === undefined ? loadSigner(process.env) : options.signer;
  const attestations: AttestationEnvelope[] = [];
  if (signer) {
    for (const record of records) {
      for (const claim of claimsOf(record)) {
        attestations.push(await attestClaim(claim, signer));
      }
    }
    files.set("attestations.json", `${JSON.stringify(attestations, null, 2)}\n`);
  }

  return { tracks, files, warnings, attestations };
}
```

and make `main` await it:

```typescript
async function main(): Promise<void> {
  const [source = "tests/fixtures/martian-reviews.sample.jsonl", outDir = "dist"] =
    process.argv.slice(2);
  const output = await run(readFileSync(source, "utf8"));
```

with the summary line gaining, after the identities line:

```typescript
  console.log(
    output.attestations.length > 0
      ? `  ${output.attestations.length} attestations signed`
      : "  no signing key configured — claims produced, nothing signed",
  );
```

- [ ] **Step 4: Update the existing e2e tests to await `run`**

Every existing `run(TEXT)` call in `tests/e2e.test.ts` becomes `await run(TEXT)`, and
each `it(...)` callback that uses it becomes `async`. The three assertions on
`output.files.size` must account for `attestations.json` being absent without a
key: they already call `run(TEXT)` with no options, so add `{ signer: null }` to
keep them deterministic regardless of the developer's environment.

- [ ] **Step 5: Run the suite**

Run: `bun run vitest run && bun run typecheck`
Expected: PASS.

- [ ] **Step 6: Write `docs/attestation-signers.md`**

```markdown
# Attestation signers

A signature under an unattributable key is decoration. This file is the record of
which key signed hivemark attestations and when — without it, `signer` in an
envelope is an address nobody can place.

| address | environment | active from | active until | status |
|---|---|---|---|---|
| _none yet_ | | | | |

**Status values:** `active`, `retired` (rotated out normally, its past
signatures remain good), `compromised` (its signatures should not be trusted
from the stated date onward).

No key has been placed yet. hivemark runs without one: claims and the page are
produced, and nothing is signed. That is a legitimate state, not a
misconfiguration — there is deliberately no flag that could say "signing is on"
while no usable key exists.

The key lives in `HIVEMARK_SIGNING_KEY` and is loaded from the environment at
run time. It is not present in CI, and this milestone spends no gas: attestations
are signed offchain and verify against the public key alone.
```

- [ ] **Step 7: Update `README.md`**

Replace the `## Status` section with:

```markdown
## Status

**Milestone 1 (done):** offchain track records, page, shields badges,
genome-derived bee badges. No wallet, no contract, no gas.

**Milestone 2, step 1 (this):** every claim is signed as an EAS-format offchain
attestation bound to the Base mainnet domain, and verifies against the public key
alone — still no wallet, no transaction, no key in CI.

**Still ahead:** a weekly Merkle anchor for timestamps, then the SBT contract.

### What a signature does and does not say

The publisher signs, not the reviewer — reviewers hold no keys by construction.
An attestation asserts that this hivemark instance observed a claim and the
verdict its skeptic reached. It does **not** assert the finding is correct, and
`verifyEnvelope` returns an `unverifiable` list saying so in as many words.

Signing is optional. With no `HIVEMARK_SIGNING_KEY` in the environment, hivemark
produces claims and a page and signs nothing. See `docs/attestation-signers.md`.
```

- [ ] **Step 8: Run end to end with and without a key**

```bash
bun run test
bun run typecheck
rm -rf dist && bun src/cli.ts tests/fixtures/martian-reviews.sample.jsonl dist
HIVEMARK_SIGNING_KEY=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d \
  bun src/cli.ts tests/fixtures/martian-reviews.sample.jsonl dist
ls dist/
```

Expected: the first run prints `no signing key configured` and writes no
`attestations.json`; the second reports 112 attestations signed and writes the
file. Confirm the file's first envelope carries `"chainId": "8453"`.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: wire attestation into the CLI, with a signer registry"
```

---

## Self-Review

**Spec coverage:**

| spec requirement | task |
|---|---|
| EAS schema, texts referenced by `claimHash` | 1, 3 |
| no `appliedByHuman` | 3 |
| signing domain fixed before the first signature | 2 |
| Base mainnet, verified chainId/address/version | 2 |
| publisher signs, not the reviewer | 5 |
| signature covers provenance, not truth | 6, 7 |
| free — no transaction, no wallet | all (nothing calls a provider) |
| attestation optional, absence legitimate | 4, 7 |

**Deferred by design:** schema registration, the Merkle anchor, the SBT contract,
revocation, and any CI signing. Each is named in the spec as a later step.

**Type consistency:** `Claim.claim_hash` (Task 1) is consumed by `encodeClaim`
(Task 3) and `attestClaim` (Task 5). `Signer` (Task 4) is the parameter type in
Task 5 and Task 7. `AttestationEnvelope` (Task 5) is the parameter of
`verifyEnvelope` (Task 6) and the element type of `RunOutput.attestations`
(Task 7). `SIGNING_DOMAIN` (Task 2) is read only in Task 5; Task 6 deliberately
does not read it, taking the domain from the envelope instead.

**Placeholder scan:** none. The one value this plan cannot assert from outside
the codebase — the schema UID derivation — is handled by an explicit verification
step with a runnable command and a stated stop condition, rather than by
assumption.

**Known risk carried into execution:** if `SchemaEncoder.decodeData` returns a
shape other than `{ name, value: { value } }`, Task 3's round-trip assertions
need adjusting to the SDK's actual return type. The encoding itself is unaffected
— only how the test reads it back.
