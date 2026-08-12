import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { harvest } from "./harvest.js";
import { proposalsFrom } from "./breed/propose.js";
import { vocabularyOf } from "./breed/vocabulary.js";
import type { ReviewRecord } from "./schema.js";

/**
 * Print the configurations reachable from a corpus that nobody has run.
 *
 * Sends nothing, publishes nothing, mints nothing. The output is a work item:
 * genomes to hand to Guardian. Printing none is a healthy state, not a fault —
 * it means the corpus has been explored.
 */
function main(): void {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf("--out");
  if (outIndex !== -1 && args[outIndex + 1] === undefined) {
    // Silently writing nothing would be the worst outcome: the run looks like a
    // success and the file the caller asked for is simply absent.
    throw new Error("--out needs a directory");
  }
  const outDir = outIndex === -1 ? null : (args[outIndex + 1] ?? null);
  // The guard on `outIndex === -1` is load-bearing: without `--out` the index is
  // -1, so `outIndex + 1` is 0 and the first corpus path would be silently
  // dropped as though it were the flag's value.
  const corpora = args.filter(
    (a, i) => a !== "--out" && (outIndex === -1 || i !== outIndex + 1),
  );

  if (corpora.length === 0) {
    throw new Error("no corpus given; pass one or more review .jsonl paths");
  }

  const records: ReviewRecord[] = [];
  for (const path of corpora) {
    const { records: parsed, warnings } = harvest(readFileSync(path, "utf8"));
    for (const warning of warnings) console.warn(`warning: ${path}: ${warning}`);
    records.push(...parsed);
  }

  const vocabulary = vocabularyOf(records);
  const proposals = proposalsFrom(vocabulary);

  console.log(
    `${records.length} reviews · ${vocabulary.existing.length} identities · ` +
      `newest guardian ${vocabulary.newestGuardian.slice(0, 10)}\n`,
  );

  if (proposals.length === 0) {
    console.log("no proposals — every reachable configuration has been run");
    return;
  }

  console.log(`${proposals.length} configuration${proposals.length === 1 ? "" : "s"} never run\n`);
  for (const p of proposals) {
    const g = p.genome;
    console.log(
      `${g.provider} · ${g.finder_model} / ${g.skeptic_model ?? "no skeptic"} · ${g.context_mode}`,
    );
    console.log(`  identity   ${p.identity_id}`);
    console.log(`  standing   no birth, no claims — nothing has run yet`);
    console.log(
      `  distance   ${p.distance} from ${p.nearest.slice(0, 10)} (${p.differsIn.join(", ")})`,
    );
    const parents = p.parents.map(([a, b]) => `${a.slice(0, 10)}×${b.slice(0, 10)}`).join(", ");
    console.log(`  parents    ${parents}\n`);
  }

  if (outDir !== null && outDir !== undefined) {
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, "proposals.json"), `${JSON.stringify(proposals, null, 2)}\n`, "utf8");
    console.log(`written to ${join(outDir, "proposals.json")}`);
  }
}

// Explicit catch for message quality, not exit status — the runtime already
// exits non-zero on a throw.
try {
  main();
} catch (error) {
  console.error(`hivemark: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
}
