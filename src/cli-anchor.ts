import { readFileSync } from "node:fs";
import { gapsIn, loadLedger } from "./anchor/ledger.js";
import { periodOf } from "./anchor/period.js";
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

  const target = period ?? periodOf(new Date().toISOString());
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

  const periods = records.map((r) => r.period).sort();
  const earliest = periods[0];
  if (earliest !== undefined) {
    const gaps = gapsIn(records, earliest, target);
    if (gaps.length > 0) console.log(`gaps        ${gaps.join(", ")}`);
  }
  console.log("\nnothing was sent. see docs/anchoring.md to broadcast this.");
}

main();
