import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";

/**
 * Which files make up the corpus, read from a manifest rather than retyped.
 *
 * Assembling it by hand was an input to two irreversible outputs: a birth's
 * `firstSeen` is a minimum over whatever files were concatenated, and an
 * anchor's root covers exactly the attestations derived from them. Omitting one
 * is wrong in a way that cannot be corrected after broadcast, and the
 * five-of-eight split lived only in whoever last ran it.
 */

const ManifestSchema = z.object({
  base: z.string(),
  include: z.array(z.string()).min(1),
  exclude: z.record(z.string(), z.string()),
});

export interface CorpusFile {
  readonly path: string;
  readonly bytes: number;
  readonly lines: number;
  readonly sha256: string;
}

export interface Corpus {
  readonly text: string;
  readonly files: readonly CorpusFile[];
  readonly manifest: string;
  readonly sha256: string;
}

export const nonEmptyLines = (text: string): number => text.split("\n").filter((l) => l.trim() !== "").length;

/**
 * Read review text from either a manifest or a single `.jsonl`.
 *
 * The dispatch is on file format rather than a mode flag: a manifest and a file
 * of reviews are different things, and the extensions already say which is
 * which. Shared so the two commands that build something irreversible from a
 * corpus — attestations and births — cannot disagree about what a corpus is.
 */
export function readCorpus(path: string): { text: string; corpus: Corpus | null } {
  if (!path.endsWith(".json")) return { text: readFileSync(path, "utf8"), corpus: null };
  const corpus = loadCorpus(path);
  return { text: corpus.text, corpus };
}

/**
 * Read the corpus a manifest describes.
 *
 * Every `.jsonl` beside the included ones must be accounted for. A file
 * appearing in neither list fails the load — the same ratchet the anchor and
 * birth guards use, pointed at assembly instead of at time. Silent omission is
 * the direction that costs a permanent record, so it is the one made loud.
 */
export function loadCorpus(manifestPath: string): Corpus {
  const parsed = ManifestSchema.safeParse(JSON.parse(readFileSync(manifestPath, "utf8")));
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new Error(
      `${manifestPath} is not a corpus manifest: ${first?.path.join(".") || "(root)"} — ${first?.message ?? "unknown"}`,
    );
  }
  const { base, include, exclude } = parsed.data;

  // Resolved against the manifest, not the working directory, so the corpus is
  // the same set from any cwd. `base` points into a sibling checkout, which is
  // an assumption about layout that nothing else in the repository states.
  const root = resolve(dirname(resolve(manifestPath)), base);
  if (!existsSync(root)) {
    throw new Error(
      `corpus base ${base} does not exist (resolved to ${root}) — ` +
        `the manifest assumes a sibling checkout; adjust "base" in ${manifestPath}`,
    );
  }

  // A file named in both lists is a contradiction, and the reading it currently
  // gets is the dangerous one: `include` wins, so someone who believes they
  // removed a file from the corpus finds it still counted, with the `exclude`
  // entry sitting there as evidence they did not.
  const overlap = Object.keys(exclude).filter((n) => include.includes(n));
  if (overlap.length > 0) {
    throw new Error(
      `${overlap.length} file(s) are both included and excluded in ${manifestPath}: ${overlap.join(", ")} — ` +
        `decide which, since include currently wins silently.`,
    );
  }

  const onDisk = readdirSync(root).filter((n) => n.endsWith(".jsonl")).sort();
  const accounted = new Set([...include, ...Object.keys(exclude)]);
  const unaccounted = onDisk.filter((n) => !accounted.has(n));
  if (unaccounted.length > 0) {
    throw new Error(
      `${unaccounted.length} file(s) in ${base} are in neither include nor exclude: ${unaccounted.join(", ")} — ` +
        `add each to ${manifestPath}, with a reason if it is not part of the corpus. ` +
        `Ignoring a new review file would silently narrow every birth date and anchor built from here.`,
    );
  }

  const missing = include.filter((n) => !onDisk.includes(n));
  if (missing.length > 0) {
    throw new Error(`${missing.length} included file(s) are not on disk: ${missing.join(", ")}`);
  }

  // Concatenated in manifest order so the assembled bytes — and therefore the
  // digest below — do not depend on how the directory happens to be listed.
  const files: CorpusFile[] = [];
  const parts: string[] = [];
  for (const name of include) {
    const text = readFileSync(join(root, name), "utf8");
    parts.push(text.endsWith("\n") || text === "" ? text : `${text}\n`);
    files.push({
      path: name,
      bytes: Buffer.byteLength(text),
      lines: nonEmptyLines(text),
      sha256: createHash("sha256").update(text).digest("hex"),
    });
  }

  const text = parts.join("");
  return {
    text,
    files,
    manifest: manifestPath,
    sha256: createHash("sha256").update(text).digest("hex"),
  };
}
