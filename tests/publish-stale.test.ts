import { mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { removeStale } from "../src/publish/stale.js";

let dir: string;

function put(...names: string[]): void {
  for (const n of names) writeFileSync(join(dir, n), "x");
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "hivemark-stale-"));
});

describe("removeStale", () => {
  it("removes a badge and avatar for an identity this run did not produce", () => {
    // The real case: eight identities collapsed to three, and five sets of
    // sidecars were left serving track records for identities that stopped
    // existing.
    put("badge-0d950fdc615b.json", "avatar-0d950fdc615b.svg", "index.html");
    const removed = removeStale(dir, new Set(["index.html"]));
    expect(removed).toEqual(["avatar-0d950fdc615b.svg", "badge-0d950fdc615b.json"]);
    expect(readdirSync(dir)).toEqual(["index.html"]);
  });

  it("keeps everything the current run produced", () => {
    put("index.html", "badge-176647ddd967.json", "avatar-176647ddd967.svg");
    const produced = new Set(["index.html", "badge-176647ddd967.json", "avatar-176647ddd967.svg"]);
    expect(removeStale(dir, produced)).toEqual([]);
    expect(readdirSync(dir).sort()).toHaveLength(3);
  });

  it("never touches a file it did not write", () => {
    // The output directory is a command-line argument. A generator that empties
    // whatever it is handed is one typo away from deleting someone's work.
    put("CNAME", "notes.md", ".nojekyll", "avatar-not-twelve-hex.svg", "badge-XYZ.json");
    expect(removeStale(dir, new Set())).toEqual([]);
    expect(readdirSync(dir).sort()).toEqual([
      ".nojekyll",
      "CNAME",
      "avatar-not-twelve-hex.svg",
      "badge-XYZ.json",
      "notes.md",
    ]);
  });

  it("removes a stale attestations.json when a run produces none", () => {
    // A build with no signing key writes no attestations. Leaving the previous
    // run's file behind would publish signatures the current corpus never
    // produced, beside a page that does not match them.
    put("attestations.json", "index.html");
    expect(removeStale(dir, new Set(["index.html"]))).toEqual(["attestations.json"]);
  });

  it("does not claim an uppercase-hex file as its own", () => {
    // Filenames come from `identity_id`, which is a keccak hash and therefore
    // lowercase from viem — unlike `entity`, which is a checksummed address and
    // genuinely mixed-case. Matching case-insensitively would widen this
    // function's authority to delete files it never wrote, for the sake of a
    // name it cannot produce.
    put("avatar-ABCDEF123456.svg", "badge-ABCDEF123456.json");
    expect(removeStale(dir, new Set())).toEqual([]);
    expect(readdirSync(dir)).toHaveLength(2);
  });

  it("reports nothing for an empty directory", () => {
    // The first run into a fresh directory, and the degenerate case for a
    // function whose whole job is deciding what to delete.
    expect(removeStale(dir, new Set(["index.html"]))).toEqual([]);
  });
});
