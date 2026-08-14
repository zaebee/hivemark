import { readFileSync } from "node:fs";
import { harvest } from "./harvest.js";
import { loadBirths } from "./birth/ledger.js";
import { corpusSpan, planBirths } from "./birth/plan.js";
import { buildBirthRequest } from "./birth/submit.js";

/**
 * Print the birth announcements that are still owed. Sends nothing.
 *
 * Identities are rare — eight in the current corpus — so this is expected to
 * print nothing most of the time, and that is the healthy state rather than a
 * sign something is broken.
 */
function main(): void {
  const [reviewsPath, ledgerPath = "births.json"] = process.argv.slice(2);

  // No default corpus, for the reason in `cli.ts` — and more sharply here. A
  // birth's `firstSeen` is a minimum over whatever corpus it was handed, and the
  // record is permanent. Announcing from a fixture would publish a date that
  // describes staged data and can never be corrected.
  if (reviewsPath === undefined) {
    throw new Error(
      "usage: bun src/cli-birth.ts <reviews.jsonl> [births.json]\n" +
        "  the corpus is not optional — a birth date cannot be revised once announced",
    );
  }

  const text = readFileSync(reviewsPath, "utf8");
  const { records, warnings } = harvest(text);
  for (const warning of warnings) console.warn(`warning: ${warning}`);

  // The window a birth date is being drawn from. `planAnchor` reports the same
  // kind of edge for the same kind of reason, and a birth is the less revisable
  // of the two, so it should not be the one reporting less.
  const span = corpusSpan(records);
  console.log(`source ${reviewsPath} — ${records.length} records`);
  if (span) {
    console.log(
      `       spanning ${new Date(span.earliest * 1000).toISOString()} … ` +
        `${new Date(span.latest * 1000).toISOString()}`,
    );
  }
  console.log();

  const births = loadBirths(readFileSync(ledgerPath, "utf8"));
  const plans = planBirths(records, births);

  if (plans.length === 0) {
    console.log("every identity in this corpus already has a birth record");
    return;
  }

  console.log(`${plans.length} identit${plans.length === 1 ? "y" : "ies"} to announce\n`);
  for (const plan of plans) {
    const request = buildBirthRequest(plan);
    console.log(`identity    ${plan.identity_id}`);
    console.log(`entity      ${plan.entity}`);
    console.log(
      `genome      ${plan.genome.provider} · ${plan.genome.context_mode} · ${plan.genome.guardian_version.slice(0, 7)}`,
    );
    console.log(
      `first seen  ${new Date(plan.firstSeen * 1000).toISOString()}` +
        (plan.atCorpusEdge ? "  ← the corpus starts here; an earlier review would be outside it" : ""),
    );
    console.log(`to          ${request.to}`);
    console.log(`schema      ${request.schema}`);
    console.log(`data        ${request.data.slice(0, 66)}…\n`);
  }
  console.log("nothing was sent. see docs/birth.md to broadcast these.");
}

// Explicit catch for message quality, not exit status — the runtime already
// exits non-zero on a throw.
try {
  main();
} catch (error) {
  console.error(`hivemark: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
}
