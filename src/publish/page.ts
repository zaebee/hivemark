import { avatarSvg } from "../avatar.js";
import { esc } from "../escape.js";
import { renderHive } from "./hive.js";
import { shieldsEndpoint } from "./shields.js";
import type { TrackRecord } from "../types.js";

const SURVIVORSHIP =
  "Guardian writes no record for a review that fails, so this data is " +
  "survivorship-biased by construction: every track record here is " +
  "systematically optimistic.";

export function renderPage(tracks: TrackRecord[]): string {
  const notes = [`<p class="note">${esc(SURVIVORSHIP)}</p>`];
  const divergence = leastOverlapping(tracks);
  if (divergence) notes.push(`<p class="note">${esc(confoundedNote(divergence))}</p>`);

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>hivemark</title>
<style>
:root{color-scheme:light dark;--fg:#1a1a1a;--bg:#fafafa;--card:#fff;--muted:#666;--line:#e3e3e3;
--hivemark-ink:#191b16}
@media(prefers-color-scheme:dark){:root{--fg:#e8e8e8;--bg:#161616;--card:#1f1f1f;--muted:#9a9a9a;--line:#333;
--hivemark-ink:#e8eade}}
body{margin:0;padding:2rem 1rem;background:var(--bg);color:var(--fg);
font:16px/1.6 ui-sans-serif,system-ui,sans-serif}
main{max-width:62rem;margin:0 auto}
h1{margin:0 0 .25rem;font-size:1.6rem}
.sub{color:var(--muted);margin:0 0 1.5rem}
.note{border-left:3px solid #c94;padding:.5rem 1rem;color:var(--muted);margin:0 0 1rem}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;
padding:1.25rem;margin:1.25rem 0 0;display:flex;gap:1.25rem;flex-wrap:wrap;align-items:flex-start}
.card svg{border-radius:8px;flex:none}
dl{display:grid;grid-template-columns:auto minmax(0,1fr);gap:.2rem 1rem;margin:0;flex:1 1 22rem}
dt{color:var(--muted)}dd{margin:0;font-variant-numeric:tabular-nums;min-width:0}
code{font-size:.85em;word-break:break-all}
.nodata{color:var(--muted);font-style:italic}
.warn{color:#b4690e;font-weight:600}
.hm-hive{margin:1.5rem 0 0}
.hm-family h3{margin:1rem 0 .5rem;font-size:1rem;color:var(--muted);font-weight:600}
.hm-row{display:flex;flex-wrap:wrap;gap:1rem}
.hm-bee{margin:0;width:7rem;text-align:center}
.hm-bee svg{width:100%;height:auto;aspect-ratio:1}
.hm-bee figcaption{font-size:.72rem;color:var(--muted);line-height:1.35;
display:flex;flex-direction:column;overflow-wrap:break-word}
.hm-twins{margin:.5rem 0 0;font-size:.8rem;color:var(--muted);font-style:italic}
</style></head>
<body><main>
<h1>hivemark</h1>
<p class="sub">Track records for code-review agents, derived from Guardian's own resolved claims.</p>
${notes.join("\n")}
${renderHive(tracks)}
${tracks.map(card).join("\n")}
</main></body></html>`;
}

/**
 * The warning that belongs beside a skeptic who is the finder.
 *
 * Placed on the skeptic row and repeated in the rate's own label, because those
 * are the two places a reader stops. The rate is the number that gets compared
 * across cards, and a comparison against an independently judged rate is not one
 * these two numbers support.
 */
function judgeNote(judge: TrackRecord["skeptic"]["judge"]): string {
  return judge === "self"
    ? ' <strong class="warn">— same model as the finder; it grades its own work</strong>'
    : "";
}

function card(track: TrackRecord): string {
  const s = track.skeptic;
  const resolved = s.confirmed + s.refuted + s.uncertain;
  const corpus = track.corpus.map(([p, n]) => `${esc(p)} ×${n}`).join(", ");

  return `<section class="card">
${avatarSvg(track.genome, 96)}
<dl>
<dt>identity</dt><dd><code>${esc(track.identity_id)}</code></dd>
<dt>owner</dt><dd><code>${esc(track.owner_address)}</code></dd>
<dt>finder</dt><dd>${esc(track.genome.finder_model)}</dd>
<dt>skeptic</dt><dd>${esc(track.genome.skeptic_model ?? "none")}${judgeNote(s.judge)}</dd>
<dt>context</dt><dd>${esc(track.genome.context_mode)}</dd>
<dt>fingerprint</dt><dd><code>${esc(track.genome.review_fingerprint)}</code></dd>
<dt>corpus</dt><dd>${corpus}</dd>
<dt>reviews</dt><dd>${track.reviews}</dd>
<dt>claims</dt><dd>${track.claims}</dd>
<dt>skeptic axis</dt><dd>${s.confirmed} confirmed · ${s.refuted} refuted · ${s.uncertain} uncertain · ${s.unresolved} unresolved</dd>
<dt>${s.judge === "self" ? "self-graded rate" : "confirmed rate"}</dt><dd>${resolved === 0 ? '<span class="nodata">no data</span>' : `${Math.round((s.confirmed / resolved) * 100)}% of ${resolved} resolved`}</dd>
<dt>mean impact</dt><dd>${s.mean_impact ?? '<span class="nodata">no data</span>'}</dd>
<dt>human axis</dt><dd><span class="nodata">no data</span> — benchmark artifacts carry no findings_applied</dd>
<dt>badge</dt><dd>${esc(shieldsEndpoint(track).message)}</dd>
</dl></section>`;
}

interface Divergence {
  readonly a: TrackRecord;
  readonly b: TrackRecord;
  readonly shared: number;
  readonly union: number;
}

/**
 * The worst-overlapping pair of identities, or null when every pair reviewed
 * exactly the same projects.
 *
 * Cards sitting side by side read as a comparison whether or not one is
 * warranted, so the page has to say when it is not. Two things this
 * deliberately does NOT do:
 *
 * It does not apply an overlap threshold. A threshold would assert that above
 * some percentage a comparison becomes controlled, which is untrue — it only
 * becomes less confounded. Suppressing the caveat at 51% overlap trades a
 * warning that is always on for one that is silently absent when it matters.
 *
 * It does not treat a subset as agreement. An earlier version compared against
 * `min(|A|,|B|)`, so a reviewer whose corpus was wholly contained in another's
 * passed without comment — even though the larger reviewer saw projects the
 * smaller never touched, which is exactly the confound in question.
 *
 * What replaces both is a number. The note reports the actual overlap, so it
 * reads as mild at "9 of 10" and alarming at "1 of 5" without the code having to
 * decide which is which.
 */
function leastOverlapping(tracks: TrackRecord[]): Divergence | null {
  let worst: Divergence | null = null;

  for (let i = 0; i < tracks.length; i += 1) {
    for (let j = i + 1; j < tracks.length; j += 1) {
      const a = tracks[i]!;
      const b = tracks[j]!;
      const setA = new Set(a.corpus.map(([p]) => p));
      const setB = new Set(b.corpus.map(([p]) => p));
      const shared = [...setA].filter((p) => setB.has(p)).length;
      const union = new Set([...setA, ...setB]).size;

      if (shared === union) continue; // identical corpora — nothing to caveat
      if (!worst || shared * worst.union < worst.shared * union) {
        worst = { a, b, shared, union };
      }
    }
  }

  return worst;
}

/** Name an identity distinctly: two reviewers can share a context mode. */
function describe(track: TrackRecord): string {
  return `${track.genome.finder_provider} · ${track.genome.context_mode} · ${track.genome.review_fingerprint.slice(0, 7)}`;
}

function confoundedNote(d: Divergence): string {
  return (
    `These reviewers did not all see the same projects, so the rates below are not a ` +
    `controlled comparison — a difference between reviewers may be a difference between ` +
    `codebases. At their most divergent, ${describe(d.a)} and ${describe(d.b)} ` +
    `share ${d.shared} of the ${d.union} projects they reviewed between them.`
  );
}

