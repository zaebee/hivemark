import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { attestClaim, type AttestationEnvelope } from "./attest/attest.js";
import { loadSigner, type Signer } from "./attest/signer.js";
import { avatarSvg } from "./avatar.js";
import { claimsOf } from "./claims.js";
import { nonEmptyLines, readCorpus } from "./corpus.js";
import { deriveTrackRecords } from "./derive.js";
import { harvest } from "./harvest.js";
import { renderPage } from "./publish/page.js";
import { removeStale } from "./publish/stale.js";
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

  // Written last, because whether anything was signed is only known by now and
  // the page says so out loud.
  files.set("index.html", renderPage(tracks, { signed: attestations.length > 0 }));

  return { tracks, files, warnings, attestations };
}

async function main(): Promise<void> {
  const [source, outDir = "dist"] = process.argv.slice(2);

  // No default corpus. This used to fall back to a fixture, and the artifacts in
  // `dist/` were quietly built from staged data for weeks — indistinguishable
  // from the real thing, and signed, because the signature says nothing about
  // where the reviews came from. Nothing about a bare invocation needs to
  // succeed.
  if (source === undefined) {
    throw new Error(
      "usage: bun src/cli.ts <corpus.json|reviews.jsonl> [outDir]\n" +
        "  the corpus is not optional — see docs/anchoring.md before publishing",
    );
  }

  const { text, corpus } = readCorpus(source);
  const output = await run(text);

  mkdirSync(outDir, { recursive: true });
  for (const [name, body] of output.files) writeFileSync(join(outDir, name), body, "utf8");

  // Sidecars for identities that no longer exist would otherwise stay forever.
  // `provenance.json` is written below rather than through `output.files`, so it
  // has to be named here or every run would delete the previous one's.
  const stale = removeStale(outDir, new Set([...output.files.keys(), "provenance.json"]));

  // Provenance travels with the artifact, because the terminal does not.
  // `attestations.json` is the input to anchoring, and by then nobody remembers
  // which file produced it; a digest is what lets a later reader tell whether
  // two runs saw the same corpus.
  const provenance = {
    source,
    sha256: createHash("sha256").update(text).digest("hex"),
    bytes: Buffer.byteLength(text),
    lines: nonEmptyLines(text),
    // Per-file digests when a manifest was used. The assembled digest proves two
    // runs saw the same bytes; these say which file differed when they did not.
    files: corpus?.files ?? null,
    identities: output.tracks.length,
    attestations: output.attestations.length,
    generated_at: new Date().toISOString(),
  };
  writeFileSync(join(outDir, "provenance.json"), `${JSON.stringify(provenance, null, 2)}\n`, "utf8");

  for (const warning of output.warnings) console.warn(`warning: ${warning}`);
  for (const name of stale) console.log(`removed stale ${name}`);
  console.log(`source ${source} — ${provenance.lines} records, sha256 ${provenance.sha256.slice(0, 12)}…`);
  if (corpus) {
    for (const f of corpus.files) {
      console.log(`  ${f.path.padEnd(28)} ${String(f.lines).padStart(4)} records  ${f.sha256.slice(0, 12)}…`);
    }
  }
  console.log(`${output.tracks.length} identities → ${output.files.size + 1} files in ${outDir}/`);
  console.log(
    output.attestations.length > 0
      ? `  ${output.attestations.length} attestations signed`
      : "  no signing key configured — claims produced, nothing signed",
  );
  for (const track of output.tracks) {
    const s = track.skeptic;
    const projects = track.corpus.map(([p, n]) => `${p}×${n}`).join(" ");
    console.log(
      `  ${track.genome.context_mode.padEnd(9)} ${String(track.reviews).padStart(2)} reviews ` +
        `${String(track.claims).padStart(3)} claims — ` +
        `${s.confirmed}✓ ${s.refuted}✗ ${s.uncertain}? ${s.unresolved}– ` +
        `impact ${s.mean_impact ?? "n/a"}  [${projects}]`,
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
