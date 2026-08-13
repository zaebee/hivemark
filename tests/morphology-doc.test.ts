import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MORPHOLOGY, SOURCES, type CharacterName, type SourceKey } from "../src/morphology.js";

/**
 * The sources document and the code must agree.
 *
 * `docs/morphology-sources.md` opens by claiming exactly that — "a value in the
 * code that is not in this table, or a source key that resolves to nothing here,
 * is a bug" — and until this file existed, nothing enforced it. Eight
 * characters, sixteen range endpoints and three source keys were checked by eye,
 * which is the method that has already missed a guard on this branch more than
 * once.
 *
 * The same shape as the drift guards in the README: a published contract that
 * breaks the build instead of rotting quietly.
 */

const DOC = "docs/morphology-sources.md";

interface Row {
  readonly name: string;
  readonly mm: number;
  readonly range: readonly [number, number] | null;
  readonly sources: readonly string[];
}

/** Parse the character table, which is the only table whose first cell is a character name. */
function rowsOf(markdown: string): Row[] {
  const names = new Set(Object.keys(MORPHOLOGY));
  const rows: Row[] = [];

  for (const line of markdown.split("\n")) {
    if (!line.startsWith("|")) continue;
    const cells = line
      .split("|")
      .slice(1, -1)
      .map((c) => c.trim());
    if (cells.length < 4) continue;

    const [name, mm, range, sources] = cells as [string, string, string, string];
    if (!names.has(name)) continue;

    // "2.45 – 3.22" with an en dash, or "—" for a character that does not vary.
    const ends = range.match(/(\d+\.?\d*)\s*[–-]\s*(\d+\.?\d*)/);
    rows.push({
      name,
      mm: Number(mm),
      range: ends === null ? null : [Number(ends[1]), Number(ends[2])],
      sources: [...sources.matchAll(/`([a-z0-9-]+)`/g)].map((m) => m[1]!),
    });
  }
  return rows;
}

const doc = readFileSync(DOC, "utf8");
const rows = rowsOf(doc);

describe("the sources document and the code agree", () => {
  it("documents every character exactly once", () => {
    expect(rows.map((r) => r.name).sort()).toEqual(Object.keys(MORPHOLOGY).sort());
  });

  it("agrees on every measurement and every range endpoint", () => {
    for (const row of rows) {
      const character = MORPHOLOGY[row.name as CharacterName];
      expect(row.mm, `${row.name} mm`).toBe(character.mm);
      if (character.range === null) {
        expect(row.range, `${row.name} should document no range`).toBeNull();
      } else {
        expect(row.range, `${row.name} range`).toEqual([character.range[0], character.range[1]]);
      }
    }
  });

  it("agrees on which sources each character rests on", () => {
    for (const row of rows) {
      const character = MORPHOLOGY[row.name as CharacterName];
      expect([...row.sources].sort(), `${row.name} sources`).toEqual([...character.sources].sort());
    }
  });

  it("resolves every documented source key, and documents every key the code uses", () => {
    const documented = new Set(rows.flatMap((r) => r.sources));
    for (const key of documented) {
      expect(SOURCES[key as SourceKey], `${key} is documented but not in SOURCES`).toBeTypeOf(
        "string",
      );
    }
    for (const key of Object.keys(SOURCES)) {
      expect(documented.has(key), `${key} is in SOURCES but no character documents it`).toBe(true);
    }
  });

  it("names each source in the status table, so a reader can judge its provenance", () => {
    for (const key of Object.keys(SOURCES)) {
      expect(doc, `${key} has no row in the status table`).toContain(`| \`${key}\` |`);
    }
  });
});
