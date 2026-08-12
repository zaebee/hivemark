import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { RawFindingSchema, ReviewRecordSchema } from "../src/schema.js";

const FIXTURE = "tests/fixtures/martian-reviews.sample.jsonl";
const PYDANTIC_SCHEMA = "tests/fixtures/finding.schema.json";
const CONTRACT_SCHEMA = "tests/fixtures/reviewrecord.schema.json";

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
