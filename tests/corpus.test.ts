import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { loadCorpus, readCorpus } from "../src/corpus.js";
import { harvest } from "../src/harvest.js";

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

  it("sees a file in a subdirectory, because a ratchet that reads one level is not one", () => {
    // readdirSync is not recursive, so the first version of this claimed to
    // account for every file while seeing only the top of the tree. A review
    // file placed one directory down would have been omitted from the corpus in
    // silence — the failure this module exists to prevent, with a blind spot
    // immediately below where it was looking.
    const root = mkdtempSync(join(tmpdir(), "hivemark-corpus-"));
    made.push(root);
    const data = join(root, "benchmarks");
    mkdirSync(join(data, "nested"), { recursive: true });
    writeFileSync(join(data, "a.jsonl"), row(1), "utf8");
    writeFileSync(join(data, "nested", "buried.jsonl"), row(2), "utf8");
    const manifest = join(root, "corpus.json");
    writeFileSync(
      manifest,
      JSON.stringify({ base: "./benchmarks", include: ["a.jsonl"], exclude: {} }),
      "utf8",
    );
    expect(() => loadCorpus(manifest)).toThrow(/nested\/buried\.jsonl/);
  });

  it("includes a file from a subdirectory when the manifest names it", () => {
    const root = mkdtempSync(join(tmpdir(), "hivemark-corpus-"));
    made.push(root);
    const data = join(root, "benchmarks");
    mkdirSync(join(data, "nested"), { recursive: true });
    writeFileSync(join(data, "nested", "buried.jsonl"), row(7), "utf8");
    const manifest = join(root, "corpus.json");
    writeFileSync(
      manifest,
      JSON.stringify({ base: "./benchmarks", include: ["nested/buried.jsonl"], exclude: {} }),
      "utf8",
    );
    expect(loadCorpus(manifest).text).toBe(row(7));
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

  it("names the file when the manifest is not valid JSON", () => {
    // The raw SyntaxError is `JSON Parse error: Unexpected token '}'`, which
    // reaches an operator through a CLI that prints err.message and nothing
    // else. Without the path it says only that some JSON somewhere is wrong, at
    // a moment when corpus.json, anchors.json and births.json are all in play.
    const root = mkdtempSync(join(tmpdir(), "hivemark-corpus-"));
    made.push(root);
    const manifest = join(root, "corpus.json");
    writeFileSync(manifest, '{ "base": "./x", "include": [ }', "utf8");
    expect(() => loadCorpus(manifest)).toThrow(/corpus\.json is not readable as JSON/);
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

/**
 * Whether a commit will still be there tomorrow, not merely today.
 *
 * Resolving now and surviving are different claims, and the first was the one
 * being checked while the second was the one being asserted. A commit reachable
 * only from a branch resolves perfectly until the branch is deleted; then the
 * `guardian_sha` on a signed review points at nothing while still looking like
 * a hash that means something.
 *
 * Durable means reachable from a tag, or an ancestor of `main`. Tags are the
 * scheme upstream publishes these under; `main` is not going to be deleted, and
 * demanding a tag for a commit already on it would redden on the ordinary case
 * of a review run against released code.
 *
 * This catches the next one *before* the branch goes, which resolvability
 * cannot: a fresh sha arriving on a branch fails immediately, while the remedy
 * is still one `git tag` away.
 */
/**
 * Whichever ref stands for the trunk here, or null if neither does.
 *
 * `origin/main` first, a local `main` second: a clone with a renamed remote, or
 * none, would otherwise have no trunk to compare against.
 *
 * Null is a real answer and not a failure. A checkout whose HEAD is some
 * feature branch has neither ref — measured, cloning a repository whose HEAD
 * sits on a working branch produces exactly that — and the caller must treat it
 * as "cannot tell" rather than let a missing ref read as "nothing is durable".
 */
function mainRef(repo: string): string | null {
  for (const ref of ["origin/main", "main"]) {
    if (spawnSync("git", ["-C", repo, "rev-parse", "--verify", "--quiet", ref]).status === 0) {
      return ref;
    }
  }
  return null;
}

function durablyReachable(repo: string, sha: string): boolean {
  // `origin/main` first, a local `main` second. A clone that has been renamed,
  // or has no remote at all, would otherwise report every sha as fragile — and
  // a false alarm here is the expensive kind, because an alarm that cries wolf
  // is one somebody switches off.
  const trunk = mainRef(repo);
  if (trunk && spawnSync("git", ["-C", repo, "merge-base", "--is-ancestor", sha, trunk]).status === 0) {
    return true;
  }
  const tags = spawnSync("git", ["-C", repo, "tag", "--contains", sha]);
  return tags.status === 0 && tags.stdout.toString().trim() !== "";
}

describe("durablyReachable", () => {
  // Built rather than borrowed: upstream has no branch-only commit left to test
  // against, which is the fix working and a problem for the test. Three commits
  // in three states prove the predicate separates them.
  //
  // Set up in `beforeAll`, not in the describe body. A body runs during
  // collection — before any filtering, and even when every test here is
  // skipped — so a failing `git` there takes down the runner instead of failing
  // a test. It also made the lifecycle implicit enough that this file's shared
  // `afterEach` deleted the repository out from under these three tests.
  let scratch: string;
  let onMain: string;
  let tagged: string;
  let branchOnly: string;

  beforeAll(() => {
    scratch = mkdtempSync(join(tmpdir(), "hivemark-reach-"));
    // Throws on a non-zero exit. Ignoring it meant a failed `git init` produced
    // three confusing assertion failures several steps later instead of one
    // error naming the command — the same silent-setup problem this file spends
    // its time refusing to tolerate in the corpus.
    const git = (...args: string[]) => {
      const run = spawnSync("git", ["-C", scratch, ...args], {
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: "t",
          GIT_AUTHOR_EMAIL: "t@t",
          GIT_COMMITTER_NAME: "t",
          GIT_COMMITTER_EMAIL: "t@t",
        },
      });
      if (run.status !== 0) {
        throw new Error(`git ${args.join(" ")} failed: ${run.stderr?.toString().trim() || run.error}`);
      }
      return run.stdout.toString().trim();
    };
    const head = () => git("rev-parse", "HEAD");

    // No `git init -b`, which needs Git 2.28, and no `git branch -m` on an
    // unborn branch either, which needs 2.30. The default branch is whatever
    // this git calls it, so the name is read rather than imposed.
    git("init", "-q");
    git("commit", "-q", "--allow-empty", "-m", "root");
    const trunk = git("rev-parse", "--abbrev-ref", "HEAD");
    git("checkout", "-q", "-b", "side");
    git("commit", "-q", "--allow-empty", "-m", "tagged, off main");
    tagged = head();
    git("tag", "bench/guardian-sha/test");
    git("commit", "-q", "--allow-empty", "-m", "branch only");
    branchOnly = head();
    // main advances past the branch point, so its tip is contained by no tag.
    // Without this the "on main" commit was also tag-reachable, and the test
    // could not tell the predicate's two clauses apart — removing the main
    // clause entirely still passed.
    git("checkout", "-q", trunk);
    git("commit", "-q", "--allow-empty", "-m", "on main, untagged");
    onMain = head();
    git("update-ref", "refs/remotes/origin/main", onMain);
  });

  afterAll(() => {
    if (scratch) rmSync(scratch, { recursive: true, force: true });
  });

  it("accepts a commit on main that no tag reaches", () => {
    expect(spawnSync("git", ["-C", scratch, "tag", "--contains", onMain]).stdout.toString().trim()).toBe("");
    expect(durablyReachable(scratch, onMain)).toBe(true);
  });

  it("accepts a commit off main that a tag reaches", () => {
    expect(durablyReachable(scratch, tagged)).toBe(true);
  });

  it("rejects a commit reachable only from a branch", () => {
    // Resolves perfectly today. This is the state a thirteenth sha arrives in,
    // and the whole reason resolvability was the wrong question.
    expect(spawnSync("git", ["-C", scratch, "cat-file", "-e", `${branchOnly}^{commit}`]).status).toBe(0);
    expect(durablyReachable(scratch, branchOnly)).toBe(false);
  });
});

describe("the provenance the corpus points at", () => {
  // Same sibling checkout, same reason for skipping rather than swallowing.
  const repo = resolve(dirname(resolve("corpus.json")), "../ownima/codegraph-brain");
  const present = existsSync(join(repo, ".git"));

  // A shallow checkout cannot answer this question, and must not pretend to.
  // `actions/checkout` fetches depth 1 by default: the tip of the default branch
  // and no history at all. Run against that, this reported all six shas
  // unreachable — a true statement about that clone and a false one about the
  // repository, which is the shape of alarm that gets switched off rather than
  // acted on.
  //
  // CI no longer clones that way. `check.yml` passes `fetch-depth: 0` for the
  // corpus, because skipping was the honest answer to a question CI could not
  // ask — and the consequence was that this sweep never ran there at all: 484
  // passed with 1 skipped, against 485 and 0 on a developer's deep clone. The
  // skip stays for every other environment that cannot answer.
  // Without a trunk to compare against, every sha off a tag would read as
  // fragile — an alarm firing because the question could not be asked. Skipped
  // for the same reason a shallow clone is.
  const hasTrunk = present && mainRef(repo) !== null;

  const deep =
    present &&
    spawnSync("git", ["-C", repo, "rev-parse", "--is-shallow-repository"])
      .stdout.toString()
      .trim() === "false";

  it.skipIf(!deep || !hasTrunk)("resolves every guardian_sha a review claims to come from", () => {
    // `guardian_sha` left the genome when identity moved to the review
    // fingerprint, so nothing published depends on it — no identity, no
    // address, no birth, no anchored root. It stays on the record as
    // provenance, and provenance is the one thing it is for: a reader asking
    // what code produced a review.
    //
    // Two of these live only on `origin/feat/skip-parse-failed`, reachable from
    // no tag and not from main. Delete that branch and they become
    // unreachable, and the field goes on looking resolvable while resolving to
    // nothing — worse than absent, because absence is honest.
    //
    // Upstream hit the sharper form of this: all ten calibration shas existed
    // in one developer's clone alone, because the branches carrying them were
    // squash-merged and deleted. They now publish them under
    // `bench/guardian-sha/` tags. Ours are not tagged yet, so this test is the
    // alarm until they are.
    const { records } = harvest(readCorpus("corpus.json").text);
    const shas = [...new Set(records.map((r) => r.guardian_sha))].sort();
    expect(shas.length).toBeGreaterThan(0);

    const fragile = shas.filter((sha) => !durablyReachable(repo, sha));

    expect(
      fragile,
      `these guardian_sha values resolve today but are reachable only from a branch, ` +
        `so deleting it makes them unreachable and the field starts pointing at nothing. ` +
        `Ask upstream to tag them under bench/guardian-sha/, as they did for the ` +
        `calibration set and for the two this corpus needed.`,
    ).toEqual([]);
  });
});
