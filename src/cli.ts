import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { attestClaim, type AttestationEnvelope } from "./attest/attest.js";
import { loadSigner, type Signer } from "./attest/signer.js";
import { avatarSvg } from "./avatar.js";
import { claimsOf } from "./claims.js";
import { deriveTrackRecords } from "./derive.js";
import { harvest } from "./harvest.js";
import { renderPage } from "./publish/page.js";
import { shieldsEndpoint } from "./publish/shields.js";
import type { TrackRecord } from "./types.js";

export interface RunOutput {
  tracks: TrackRecord[];
  files: Map<string, string>;
  warnings: string[];
  attestations: AttestationEnvelope[];
}

export interface RunOptions {
  /** Absent means "read the environment"; explicit null means "do not sign". */
  signer?: Signer | null;
}

/** Text in, files out. Reads the environment only when `signer` is left unspecified. */
export async function run(text: string, options: RunOptions = {}): Promise<RunOutput> {
  const { records, warnings } = harvest(text);
  const tracks = deriveTrackRecords(records);
  const files = new Map<string, string>();

  files.set("index.html", renderPage(tracks));
  for (const track of tracks) {
    const short = track.identity_id.slice(2, 14);
    files.set(`badge-${short}.json`, `${JSON.stringify(shieldsEndpoint(track), null, 2)}\n`);
    files.set(`avatar-${short}.svg`, avatarSvg(track.genome, 240));
  }

  const signer = options.signer === undefined ? loadSigner(process.env) : options.signer;
  const attestations: AttestationEnvelope[] = [];
  if (signer) {
    for (const record of records) {
      for (const claim of claimsOf(record)) {
        attestations.push(await attestClaim(claim, signer));
      }
    }
    files.set("attestations.json", `${JSON.stringify(attestations, null, 2)}\n`);
  }

  return { tracks, files, warnings, attestations };
}

async function main(): Promise<void> {
  const [source = "tests/fixtures/martian-reviews.sample.jsonl", outDir = "dist"] =
    process.argv.slice(2);
  const output = await run(readFileSync(source, "utf8"));

  mkdirSync(outDir, { recursive: true });
  for (const [name, body] of output.files) writeFileSync(join(outDir, name), body, "utf8");

  for (const warning of output.warnings) console.warn(`warning: ${warning}`);
  console.log(`${output.tracks.length} identities → ${output.files.size} files in ${outDir}/`);
  console.log(
    output.attestations.length > 0
      ? `  ${output.attestations.length} attestations signed`
      : "  no signing key configured — claims produced, nothing signed",
  );
  for (const track of output.tracks) {
    const s = track.skeptic;
    const corpus = track.corpus.map(([p, n]) => `${p}×${n}`).join(" ");
    console.log(
      `  ${track.genome.context_mode.padEnd(9)} ${String(track.reviews).padStart(2)} reviews ` +
        `${String(track.claims).padStart(3)} claims — ` +
        `${s.confirmed}✓ ${s.refuted}✗ ${s.uncertain}? ${s.unresolved}– ` +
        `impact ${s.mean_impact ?? "n/a"}  [${corpus}]`,
    );
  }
}

// The runtime already exits non-zero on an unhandled rejection (verified: both
// bun and node do). This catch exists for message quality, not exit status —
// so a script reading this CLI's output sees one clean line instead of a
// runtime-level stack dump. `err.message` only, never `cause` or the raw
// value: `main` reaches `loadSigner`, and the same key-hygiene rule that keeps
// its thrown message free of key material would be defeated by printing
// anything beyond that message here.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err: unknown) => {
    console.error(`hivemark: ${err instanceof Error ? err.message : "unknown error"}`);
    process.exitCode = 1;
  });
}
