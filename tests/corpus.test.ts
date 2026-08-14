import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { loadCorpus } from "../src/corpus.js";

const made: string[] = [];

afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/**
 * A manifest and a data directory, laid out the way the real ones are: the
 * manifest sits one level above and points at a sibling.
 */
function scenario(opts: {
  files: Record<string, string>;
  include: string[];
  exclude?: Record<string, string>;
  base?: string;
}): string {
  const root = mkdtempSync(join(tmpdir(), "hivemark-corpus-"));
  made.push(root);
  const data = join(root, "benchmarks");
  mkdirSync(data);
  for (const [name, body] of Object.entries(opts.files)) writeFileSync(join(data, name), body, "utf8");
  const manifest = join(root, "corpus.json");
  writeFileSync(
    manifest,
    JSON.stringify({ base: opts.base ?? "./benchmarks", include: opts.include, exclude: opts.exclude ?? {} }),
    "utf8",
  );
  return manifest;
}

const row = (n: number): string => `{"n":${n}}\n`;

describe("loadCorpus", () => {
  it("concatenates the included files in manifest order", () => {
    const manifest = scenario({
      files: { "b.jsonl": row(2), "a.jsonl": row(1) },
      include: ["b.jsonl", "a.jsonl"],
    });
    const corpus = loadCorpus(manifest);
    // Manifest order, not directory order — the assembled bytes and therefore
    // the digest must not depend on how a filesystem happens to list names.
    expect(corpus.text).toBe(row(2) + row(1));
    expect(corpus.files.map((f) => f.path)).toEqual(["b.jsonl", "a.jsonl"]);
  });

  it("refuses a file named in both include and exclude", () => {
    // The reading it would otherwise get is the dangerous one: include wins, so
    // someone who believes they removed a file finds it still counted, with the
    // exclude entry sitting there as evidence they did not.
    const manifest = scenario({
      files: { "a.jsonl": row(1) },
      include: ["a.jsonl"],
      exclude: { "a.jsonl": "changed my mind" },
    });
    expect(() => loadCorpus(manifest)).toThrow(/both included and excluded/);
  });

  it("refuses a file that is in neither include nor exclude", () => {
    // The whole point. A new review file appearing and being silently ignored
    // would narrow every birth date and every anchor built from here, with
    // nothing on screen to say so.
    const manifest = scenario({
      files: { "a.jsonl": row(1), "surprise.jsonl": row(9) },
      include: ["a.jsonl"],
    });
    expect(() => loadCorpus(manifest)).toThrow(/surprise\.jsonl/);
  });

  it("accepts a file that is explicitly excluded, with its reason recorded", () => {
    const manifest = scenario({
      files: { "a.jsonl": row(1), "judged.jsonl": row(9) },
      include: ["a.jsonl"],
      exclude: { "judged.jsonl": "judge output, not reviews" },
    });
    expect(loadCorpus(manifest).text).toBe(row(1));
  });

  it("names every missing include at once, not just the first", () => {
    // `readFileSync` would fail on its own here, so an assertion that merely
    // expects a throw passes with the check deleted — probed, and it did. What
    // the check earns is reporting the whole set before reading anything, so a
    // manifest with two stale entries takes one round trip to fix rather than
    // two.
    const manifest = scenario({
      files: { "a.jsonl": row(1) },
      include: ["a.jsonl", "gone.jsonl", "also-gone.jsonl"],
    });
    expect(() => loadCorpus(manifest)).toThrow(/gone\.jsonl[\s\S]*also-gone\.jsonl/);
    expect(() => loadCorpus(manifest)).toThrow(/2 included file/);
  });

  it("names the checkout assumption when the base directory is missing", () => {
    const manifest = scenario({ files: {}, include: ["a.jsonl"], base: "../nowhere" });
    expect(() => loadCorpus(manifest)).toThrow(/does not exist/);
  });

  it("resolves base against the manifest, not the working directory", () => {
    // Otherwise the corpus would be a different set depending on where the
    // command was run from, which is exactly the ambiguity this replaces.
    const manifest = scenario({ files: { "a.jsonl": row(1) }, include: ["a.jsonl"] });
    const before = process.cwd();
    try {
      process.chdir(tmpdir());
      expect(loadCorpus(manifest).files).toHaveLength(1);
    } finally {
      process.chdir(before);
    }
  });

  it("gives each file its own digest, so a differing run can be localised", () => {
    const manifest = scenario({
      files: { "a.jsonl": row(1), "b.jsonl": row(2) },
      include: ["a.jsonl", "b.jsonl"],
    });
    const corpus = loadCorpus(manifest);
    const digests = corpus.files.map((f) => f.sha256);
    expect(new Set(digests).size).toBe(2);
    expect(corpus.sha256).not.toBe(digests[0]);
  });

  it("terminates a file that does not end in a newline before joining", () => {
    // Without this the last row of one file and the first of the next become a
    // single unparseable line, and harvest would drop both with a warning.
    const manifest = scenario({
      files: { "a.jsonl": '{"n":1}', "b.jsonl": '{"n":2}\n' },
      include: ["a.jsonl", "b.jsonl"],
    });
    expect(loadCorpus(manifest).text).toBe('{"n":1}\n{"n":2}\n');
  });

  it("rejects a manifest that is not one", () => {
    const root = mkdtempSync(join(tmpdir(), "hivemark-corpus-"));
    made.push(root);
    const manifest = join(root, "corpus.json");
    writeFileSync(manifest, JSON.stringify({ base: "./x" }), "utf8");
    expect(() => loadCorpus(manifest)).toThrow(/not a corpus manifest/);
  });
});

describe("the committed manifest", () => {
  // The corpus lives in a sibling checkout, which a clean clone will not have.
  // Skipped explicitly rather than swallowed: a test that passes when it could
  // not run reports the reassuring answer, which is the failure this whole file
  // exists to prevent. A skip is visible in the report; a caught-and-returned
  // error is not.
  const base = resolve(dirname(resolve("corpus.json")), "../ownima/codegraph-brain/benchmarks");
  const present = existsSync(base);

  it.skipIf(!present)("describes the real corpus, or says which file nobody has classified", () => {
    // Fails when a new .jsonl lands in the benchmarks directory, which is the
    // moment someone has to decide whether it is part of the corpus.
    const corpus = loadCorpus("corpus.json");
    expect(corpus.files.length).toBeGreaterThan(0);
    expect(corpus.sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});
