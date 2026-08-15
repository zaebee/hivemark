import { readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { byCodeUnit } from "../canonical.js";

/**
 * The filenames this tool produces, and therefore the only ones it may delete.
 *
 * Scoped deliberately. The output directory is a command-line argument, so it
 * can be pointed anywhere, and a generator that empties whatever directory it is
 * handed is one typo away from deleting someone's work. Matching its own naming
 * shapes removes the files that actually go stale — a badge or avatar for an
 * identity that no longer exists — and cannot touch anything it did not write.
 */
const OWNED =
  /^(?:index\.html|attestations\.json|provenance\.json|avatar-[0-9a-f]{12}\.svg|badge-[0-9a-f]{12}\.json)$/;

/**
 * Delete this tool's own outputs that the current run did not produce.
 *
 * Without this, an identity that stops existing leaves its badge and avatar
 * behind forever. On a local run that is clutter. Published, it is worse: a
 * shields.io badge endpoint keeps serving a track record for an identity the
 * page no longer lists and the chain never knew, and nothing about the stale
 * file says it is stale.
 *
 * Returns what it removed so the caller can say so out loud — a silent delete
 * in a publishing pipeline is the kind of thing discovered much later.
 */
export function removeStale(outDir: string, produced: ReadonlySet<string>): string[] {
  const removed: string[] = [];
  for (const name of readdirSync(outDir)) {
    if (!OWNED.test(name) || produced.has(name)) continue;
    rmSync(join(outDir, name));
    removed.push(name);
  }
  // An explicit comparator, but `byCodeUnit` rather than `localeCompare`: this
  // project sorts by code unit everywhere, because locale-aware collation varies
  // with whatever ICU data the runtime carries and one of these orderings
  // decides a Merkle root. Two spellings of "sorted" in one codebase is how the
  // wrong one ends up somewhere that matters.
  return removed.sort(byCodeUnit);
}
