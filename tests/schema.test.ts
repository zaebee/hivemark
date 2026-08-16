import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { RawFindingSchema, ReviewRecordSchema } from "../src/schema.js";

const FIXTURE = "tests/fixtures/martian-reviews.sample.jsonl";
const PYDANTIC_SCHEMA = "tests/fixtures/finding.schema.json";
const CONTRACT_SCHEMA = "tests/fixtures/reviewrecord.schema.json";

describe("ReviewRecordSchema", () => {
  it("validates every record in the real fixture", () => {
    const lines = readFileSync(FIXTURE, "utf8").trim().split("\n");
    expect(lines).toHaveLength(35);
    for (const line of lines) {
      const parsed = ReviewRecordSchema.safeParse(JSON.parse(line));
      expect(parsed.success, `failed: ${JSON.stringify(parsed.error?.issues)}`).toBe(true);
    }
  });

  it("rejects a record missing finder_model", () => {
    const bad = {
      url: "u",
      project: "p",
      base_sha: "a",
      head_sha: "b",
      reviewed_at: "t",
      had_graph: true,
      pr_slice: "graph",
      parse_failed: false,
      findings: [],
    };
    expect(ReviewRecordSchema.safeParse(bad).success).toBe(false);
  });
});

/**
 * Drift guard for the outer review record.
 *
 * `cgis.guardian.martian.ReviewRecord` reached PyPI in codegraph-brain 0.11.0,
 * so this half is now a published contract too. Regenerate with:
 *
 *   pip install codegraph-brain==0.11.0
 *   python -c "import json;from cgis.guardian.martian import ReviewRecord;\
 *              print(json.dumps(ReviewRecord.model_json_schema(),indent=2,sort_keys=True))" \
 *     > tests/fixtures/reviewrecord.schema.json
 *
 * The assertion is deliberately *projection*, not equality. hivemark consumes a
 * subset — it never reads token counts or durations — and demanding those fields
 * would break the pipeline over data it does not use. What must hold is that we
 * invent nothing and promise nothing the contract does not guarantee.
 */
describe("ReviewRecordSchema is a faithful projection of the published contract", () => {
  const contract = JSON.parse(readFileSync(CONTRACT_SCHEMA, "utf8")) as {
    required: string[];
    properties: Record<string, { type?: string; anyOf?: Array<{ type?: string }> }>;
  };

  const ours = ReviewRecordSchema.shape;
  const nullableInContract = (name: string): boolean =>
    (contract.properties[name]?.anyOf ?? []).some((v) => v.type === "null");

  /**
   * Contract fields this project knowingly does not read.
   *
   * A ratchet, not a waiver. Everything here is a cost or timing metric that
   * says nothing about a reviewer's identity or its claims. A new field
   * appearing upstream fails the test below until somebody puts it in one list
   * or the other, which is the point: `arm` was declared in the contract,
   * ignored here, and nothing noticed — until reading `had_graph` without it
   * led to describing 19 deliberate ablations as a run that had lost its graph.
   *
   * The three assertions around this one all check our schema against the
   * contract. This is the only one that checks the contract against us.
   */
  const KNOWINGLY_UNREAD = new Set([
    "completion_tokens",
    "duration_s",
    "prompt_tokens",
    "review_fingerprint_source",
    "skeptic_completion_tokens",
    "skeptic_prompt_tokens",
    "temperature",
  ]);

  it("reads every contract field it has not explicitly set aside", () => {
    const ours = new Set(Object.keys(ReviewRecordSchema.shape));
    const ignored = [...Object.keys(contract.properties)].filter(
      (name) => !ours.has(name) && !KNOWINGLY_UNREAD.has(name),
    );
    expect(ignored, "declared upstream, read nowhere, and not listed as deliberate").toEqual([]);
  });

  it("sets aside nothing it actually reads", () => {
    // The other half of the ratchet: a field that starts being read must leave
    // the list, or the list stops describing anything.
    const ours = new Set(Object.keys(ReviewRecordSchema.shape));
    expect([...KNOWINGLY_UNREAD].filter((name) => ours.has(name))).toEqual([]);
  });

  it("invents no field the contract does not declare", () => {
    for (const name of Object.keys(ours)) {
      expect(Object.keys(contract.properties), `${name} is not in the contract`).toContain(name);
    }
  });

  it("never requires a field the contract leaves optional", () => {
    const contractRequired = new Set(contract.required);
    for (const [name, field] of Object.entries(ours)) {
      if (field.isOptional()) continue;
      expect(contractRequired, `we require ${name}, the contract does not`).toContain(name);
    }
  });

  it("accepts null exactly where the contract does", () => {
    for (const [name, field] of Object.entries(ours)) {
      // A field we allow to be null must be nullable upstream, or we would
      // manufacture a value the producer never emits.
      if (field.isNullable()) {
        expect(nullableInContract(name), `we allow null for ${name}, the contract does not`).toBe(
          true,
        );
      }
    }
  });

  it("agrees that guardian_sha is present and never null", () => {
    // The field that decides a genome's generation. If this ever loosens
    // upstream, the identity model needs revisiting, not a silent fallback.
    expect(contract.required).toContain("guardian_sha");
    expect(nullableInContract("guardian_sha")).toBe(false);
    expect(ours.guardian_sha.isNullable()).toBe(false);
  });

  it("agrees that skeptic_model may be null", () => {
    // A badge without a stinger depends on this staying nullable.
    expect(nullableInContract("skeptic_model")).toBe(true);
    expect(ours.skeptic_model.isNullable()).toBe(true);
  });
});

/**
 * Drift guard for the inner Finding contract.
 *
 * `cgis/guardian/findings.py` in codegraph-brain 0.10.0 on PyPI is byte-identical
 * to the repository's copy, so this schema is a published contract rather than a
 * local observation. Regenerate with:
 *
 *   pip install codegraph-brain==0.10.0
 *   python -c "import json;from cgis.guardian.findings import Finding;\
 *              print(json.dumps(Finding.model_json_schema(),indent=2,sort_keys=True))" \
 *     > tests/fixtures/finding.schema.json
 *
 * The outer review record has no published contract — martian.py is not packaged —
 * so it is guarded by runtime validation above, not by this comparison.
 */
describe("RawFindingSchema agrees with Guardian's published pydantic contract", () => {
  const pydantic = JSON.parse(readFileSync(PYDANTIC_SCHEMA, "utf8")) as {
    required: string[];
    properties: Record<string, { enum?: string[] }>;
  };

  it("covers every property the pydantic model declares", () => {
    const ours = Object.keys(RawFindingSchema.shape).sort();
    expect(ours).toEqual(Object.keys(pydantic.properties).sort());
  });

  it("requires exactly the fields pydantic requires", () => {
    const optional = Object.entries(RawFindingSchema.shape)
      .filter(([, field]) => field.isOptional())
      .map(([name]) => name);
    const ourRequired = Object.keys(RawFindingSchema.shape)
      .filter((name) => !optional.includes(name))
      .sort();
    expect(ourRequired).toEqual([...pydantic.required].sort());
  });

  it("uses the same severity and category enums", () => {
    expect(RawFindingSchema.shape.severity.options).toEqual(pydantic.properties.severity!.enum);
    expect(RawFindingSchema.shape.category.options).toEqual(pydantic.properties.category!.enum);
  });

  it("accepts a finding taken verbatim from the real corpus", () => {
    const first = JSON.parse(readFileSync(FIXTURE, "utf8").split("\n")[0]!) as {
      findings: unknown[];
    };
    expect(RawFindingSchema.safeParse(first.findings[0]).success).toBe(true);
  });
});

describe("the fields identity is keyed on", () => {
  const row = (over: Record<string, unknown> = {}): unknown => ({
    url: "https://github.com/acme/widgets/pull/1",
    project: "acme",
    pr_slice: "graph",
    base_sha: "aaa",
    head_sha: "bbb",
    had_graph: true,
    finder_model: "gemini-2.5-flash",
    skeptic_model: "gemini-3.5-flash",
    findings: [],
    guardian_sha: "d0d807ef",
    reviewed_at: "2026-08-12T11:27:57+00:00",
    parse_failed: false,
    review_fingerprint: "1a2884400bd7",
    finder_provider: "gemini",

    skeptic_provider: "gemini",
    ...over,
  });

  it("accepts a record carrying all three", () => {
    expect(ReviewRecordSchema.safeParse(row()).success).toBe(true);
  });

  it("refuses a record without a fingerprint", () => {
    // Optional-with-a-fallback was rejected in the spec: a corpus where some
    // rows key on a fingerprint and some on guardian_sha makes one reviewer
    // two entities depending on which run it came from.
    const { review_fingerprint: _drop, ...without } = row() as Record<string, unknown>;
    expect(ReviewRecordSchema.safeParse(without).success).toBe(false);
  });

  it("refuses a record without a stated finder provider", () => {
    const { finder_provider: _drop, ...without } = row() as Record<string, unknown>;
    expect(ReviewRecordSchema.safeParse(without).success).toBe(false);
  });

  it("accepts a null skeptic finder_provider, because a skeptic can be absent", () => {
    expect(
      ReviewRecordSchema.safeParse(row({ skeptic_model: null, skeptic_provider: null })).success,
    ).toBe(true);
  });

  it("accepts a skeptic finder_provider that is absent, because the contract permits it", () => {
    // Written the other way round first, by analogy with skeptic_model, and the
    // drift guard caught it: codegraph-brain 0.13.0 requires review_fingerprint
    // and finder_provider and leaves this one optional. Requiring it would
    // reject a record the producer is entitled to emit.
    const { skeptic_provider: _drop, ...without } = row() as Record<string, unknown>;
    expect(ReviewRecordSchema.safeParse(without).success).toBe(true);
  });
});
