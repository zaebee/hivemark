import { readFileSync } from "node:fs";
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
function main(): void {
  const [attestationsPath = "dist/attestations.json", ledgerPath = "anchors.json", period] =
    process.argv.slice(2);

  const envelopes = JSON.parse(readFileSync(attestationsPath, "utf8")) as AttestationEnvelope[];
  const records = loadLedger(readFileSync(ledgerPath, "utf8"));

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
