import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { RawFindingSchema, ReviewRecordSchema } from "../src/schema.js";

const FIXTURE = "tests/fixtures/martian-reviews.sample.jsonl";
const PYDANTIC_SCHEMA = "tests/fixtures/finding.schema.json";

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
