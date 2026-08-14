import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { byCodeUnit } from "./canonical.js";
import { gapsIn, loadLedger } from "./anchor/ledger.js";
import { periodId, periodOf } from "./anchor/period.js";
import { planAnchor } from "./anchor/plan.js";
import { buildAnchorRequest } from "./anchor/submit.js";
import type { AttestationEnvelope } from "./attest/attest.js";

/**
 * Print what an anchor for a period would contain. Sends nothing.
 *
 * The point of a dry run here is that the next step costs money and cannot be
 * undone: whatever this prints is exactly what a human then broadcasts.
 */
/**
 * Where a set of attestations came from, in one line, never throwing.
 *
 * This is diagnostic. A missing or damaged note about the corpus must not stop
 * an anchor over attestations that are themselves valid — their signatures do
 * not depend on it.
 *
 * Every failure reads "origin unknown" rather than being silently omitted. The
 * line exists so an operator does not anchor fixture-derived attestations by
 * accident, and a line that disappears when something is wrong would be worse
 * than no line at all.
 */
function provenanceOf(attestationsPath: string): string {
  const path = join(dirname(attestationsPath), "provenance.json");
  if (!existsSync(path)) return "no provenance.json beside it; origin unknown";
  try {
    const p: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (typeof p !== "object" || p === null) return "provenance.json is not an object; origin unknown";
    const { source, generated_at: generatedAt } = p as Record<string, unknown>;
    if (typeof source !== "string" || typeof generatedAt !== "string") {
      return "provenance.json is missing source or generated_at; origin unknown";
    }
    return `from ${source}, generated ${generatedAt}`;
  } catch {
    return "provenance.json is unreadable; origin unknown";
  }
}

function main(): void {
  const [attestationsPath = "dist/attestations.json", ledgerPath = "anchors.json", period] =
    process.argv.slice(2);

  const envelopes = JSON.parse(readFileSync(attestationsPath, "utf8")) as AttestationEnvelope[];
  const records = loadLedger(readFileSync(ledgerPath, "utf8"));

  // Where these attestations came from, if `cli.ts` left a note beside them.
  // The default path makes this the easy command to run without thinking, and
  // an anchor over fixture-derived attestations would look exactly like a real
  // one — the signatures are valid either way.
  console.log(`input       ${attestationsPath} — ${provenanceOf(attestationsPath)}`);

  // The command line is where an unchecked string would otherwise enter. A week
  // that does not exist is refused here rather than deep inside the arithmetic.
  const target = period === undefined ? periodOf(new Date().toISOString()) : periodId(period);
  const plan = planAnchor(envelopes, records, target);

  if (!plan) {
    console.log(`${target}: nothing to anchor — no attestations fall in this period`);
    return;
  }

  const request = buildAnchorRequest(plan);
  console.log(`period      ${plan.period}  [${plan.periodStart}, ${plan.periodEnd})`);
  console.log(`covers      ${plan.count} attestations`);
  // The coverage edge beside the calendar edge. The guard refuses a week that has
  // not closed; nothing can tell whether the input file is current, so a Monday
  // anchor built on a Friday harvest would lose the weekend silently. Seeing how
  // far the newest attestation sits from the period's end is what catches it.
  console.log(
    `newest      ${new Date(plan.newestCovered * 1000).toISOString()} ` +
      `(${Math.round((plan.periodEnd - plan.newestCovered) / 3600)}h before the period ends — ` +
      `re-harvest if that looks stale)`,
  );
  console.log(`root        ${plan.root}`);
  console.log(`to          ${request.to}`);
  console.log(`schema      ${request.schema}`);
  console.log(`data        ${request.data.slice(0, 66)}…`);
  console.log(`value       ${request.value} wei`);

  // `YYYY-Www` sorts chronologically by code unit because both fields are
  // zero-padded and fixed width.
  const periods = records.map((r) => r.period).sort(byCodeUnit);
  const earliest = periods[0];
  if (earliest !== undefined) {
    const gaps = gapsIn(records, earliest, target);
    if (gaps.length > 0) console.log(`gaps        ${gaps.join(", ")}`);
  }
  console.log("\nnothing was sent. see docs/anchoring.md to broadcast this.");
}

// Explicit catch for message quality, not exit status — the runtime already
// exits non-zero on a throw. A stack trace is the wrong output for a tool whose
// next step a human performs by hand.
try {
  main();
} catch (error) {
  console.error(`hivemark: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
}
