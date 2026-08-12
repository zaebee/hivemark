import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { avatarSvg } from "./avatar.js";
import { deriveTrackRecords } from "./derive.js";
import { harvest } from "./harvest.js";
import { renderPage } from "./publish/page.js";
import { shieldsEndpoint } from "./publish/shields.js";
import type { TrackRecord } from "./types.js";

export interface RunOutput {
  tracks: TrackRecord[];
  files: Map<string, string>;
  warnings: string[];
}

/** Pure: text in, files out. Side-effect free so the e2e test needs no disk. */
export function run(text: string): RunOutput {
  const { records, warnings } = harvest(text);
  const tracks = deriveTrackRecords(records);
  const files = new Map<string, string>();

  files.set("index.html", renderPage(tracks));
  for (const track of tracks) {
    const short = track.identity_id.slice(2, 14);
    files.set(`badge-${short}.json`, `${JSON.stringify(shieldsEndpoint(track), null, 2)}\n`);
    files.set(`avatar-${short}.svg`, avatarSvg(track.genome, 240));
  }

  return { tracks, files, warnings };
}

function main(): void {
  const [source = "tests/fixtures/martian-reviews.sample.jsonl", outDir = "dist"] =
    process.argv.slice(2);
  const output = run(readFileSync(source, "utf8"));

  mkdirSync(outDir, { recursive: true });
  for (const [name, body] of output.files) writeFileSync(join(outDir, name), body, "utf8");

  for (const warning of output.warnings) console.warn(`warning: ${warning}`);
  console.log(`${output.tracks.length} identities → ${output.files.size} files in ${outDir}/`);
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

if (import.meta.url === `file://${process.argv[1]}`) main();
