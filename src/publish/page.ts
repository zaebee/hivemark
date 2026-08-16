import { avatarSvg } from "../avatar.js";
import { esc } from "../escape.js";
import { renderHive } from "./hive.js";
import type { AblationStudy } from "../ablation.js";
import { shieldsEndpoint } from "./shields.js";
import type { TrackRecord } from "../types.js";

/**
 * Shown when the build produced no signed attestations.
 *
 * The default is to show it, and that direction is deliberate: a page that
 * silently omits the caveat when nothing was signed is the failure that
 * matters, while showing it on a signed build is merely wrong in the harmless
 * direction. CI builds are always unsigned — the signing key is not in CI and
 * `check.yml` fails if it ever appears — so the published page is the unsigned
 * case, permanently.
 */
const UNSIGNED =
  "This page was built without a signing key, so the numbers below carry no " +
  "attestations and nothing here is independently checkable. Signed runs are " +
  "made by hand; see docs/anchoring.md.";

/**
 * Corrected once it was checked. This previously read "Guardian writes no
 * record for a review that fails", which is false: every review row carries
 * `error` and `parse_failed`, and unreadable runs are now counted separately
 * from reviews rather than passed off as reviews that found nothing.
 *
 * The bias is real, but it is about the other direction — a defect nobody
 * reported leaves no row anywhere, so what can be measured here is the fate of
 * claims that were made, and never the fraction of defects that were missed.
 */
const SURVIVORSHIP =
  "Every rate here is measured over claims that were made. A defect no " +
  "reviewer mentioned leaves no record, so nothing on this page says how much " +
  "was missed — a reviewer that says less is not distinguishable from one that " +
  "misses less.";

export interface PageOptions {
  /** Whether this build signed anything. Absent means it did not. */
  readonly signed?: boolean;
  /** The paired ablation comparison, when the corpus contains one. */
  readonly ablation?: AblationStudy | null;
}

export function renderPage(tracks: TrackRecord[], options: PageOptions = {}): string {
  const notes = [`<p class="note">${esc(SURVIVORSHIP)}</p>`];
  if (!options.signed) notes.unshift(`<p class="note">${esc(UNSIGNED)}</p>`);
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
.ablation{margin:2.5rem 0 0;padding:1.25rem;border:1px dashed var(--line);border-radius:12px}
.ablation h2{margin:0 0 .75rem;font-size:1.15rem}
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
${renderAblation(options.ablation ?? null)}
</main></body></html>`;
}

/**
 * The ceiling of `impact_score`, from the upstream schema — an integer 0-10.
 *
 * Printed with the number because `6.31` alone does not say whether that is
 * high. A bare figure invites the reader to supply their own scale, and the two
 * plausible guesses (out of 5, out of 10) put it on opposite sides of the
 * middle.
 */
const IMPACT_MAX = 10;

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
<dt>reviews</dt><dd>${track.reviews}${attemptedNote(track)}</dd>
<dt>claims</dt><dd>${track.claims}</dd>
<dt>skeptic axis</dt><dd>${s.confirmed} confirmed · ${s.refuted} refuted · ${s.uncertain} uncertain · ${s.unresolved} unresolved</dd>
<dt>${s.judge === "self" ? "self-graded rate" : "confirmed rate"}</dt><dd>${resolved === 0 ? '<span class="nodata">no data</span>' : `${Math.round((s.confirmed / resolved) * 100)}% of ${resolved} resolved`}</dd>
<dt>${s.judge === "self" ? "self-graded mean impact" : "mean impact"}</dt><dd>${s.mean_impact === null ? '<span class="nodata">no data</span>' : `${s.mean_impact} / ${IMPACT_MAX}`}</dd>
<dt>human axis</dt><dd><span class="nodata">no data</span> — benchmark artifacts carry no findings_applied</dd>
<dt>badge</dt><dd>${esc(shieldsEndpoint(track).message)}</dd>
</dl></section>`;
}

/**
 * The one comparison on this page that is not confounded.
 *
 * Placed after the cards and visually apart from them, because it is a claim
 * about the graph and not about any reviewer. The ablated runs already sit
 * inside the diff-only identity's record; a fourth card would count them twice
 * and repeat the conflation that reading `arm` was meant to end.
 *
 * The split is stated before the averages. Two arms whose means match can
 * differ on every single pull request, and only the split can tell those apart.
 */
function renderAblation(study: AblationStudy | null): string {
  if (!study) return "";
  const n = study.pairs.length;
  const totals = study.pairs.reduce(
    (acc, p) => ({ without: acc.without + p.withoutGraph, with: acc.with + p.withGraph }),
    { without: 0, with: 0 },
  );
  const per = (total: number) => (total / n).toFixed(2);

  return `<section class="ablation">
<h2>Same code, graph removed on purpose</h2>
<p class="note">${esc(
    `Guardian ran ${n} pull requests twice: once with its dependency graph and once with the ` +
      `graph deliberately withheld, same commit and same model both times. This is the only ` +
      `comparison here where one thing changed and everything else held still.`,
  )}</p>
<dl>
<dt>pairs</dt><dd>${n}, across ${study.projects.map((p) => esc(p)).join(", ")}</dd>
<dt>graph found more</dt><dd>${study.graphFoundMore} of ${n}</dd>
<dt>graph found fewer</dt><dd>${study.graphFoundFewer} of ${n}</dd>
<dt>tied</dt><dd>${study.tied} of ${n}</dd>
<dt>findings per review</dt><dd>${per(totals.with)} with the graph · ${per(totals.without)} without</dd>
<dt>per-PR difference</dt><dd>mean ${study.meanDifference}, from ${study.lowest} to ${study.highest}</dd>
</dl>
<p class="note">${esc(
    `No difference is detectable at this size. That is not evidence the graph does nothing: ` +
      `${n} pull requests on one Guardian revision, one finder model and ${study.projects.length} ` +
      `projects cannot settle it either way, and no significance test is applied here. ` +
      `Guardian measures the question properly against golden findings; this is the small paired ` +
      `observation that happens to sit in this corpus, reported rather than left in the file.`,
  )}</p>
</section>`;
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

/**
 * Say when runs are missing from the reviews count, and why.
 *
 * Printed beside the count rather than as a separate row: the number it
 * qualifies is the one a reader uses to weigh everything else, and a caveat one
 * line away from its subject is a caveat that gets skimmed past. Absent
 * entirely when there is nothing to say, so it never becomes furniture.
 */
function attemptedNote(track: TrackRecord): string {
  const runs = (n: number) => (n === 1 ? "run" : "runs");
  const parts: string[] = [];
  if (track.unparseable > 0) {
    parts.push(`${track.unparseable} further ${runs(track.unparseable)} produced no readable output`);
  }
  // Named as its own failure rather than folded into the line above. A provider
  // 429 did not produce unreadable output; it produced none, and saying
  // otherwise would describe the wrong event.
  if (track.errored > 0) {
    parts.push(`${track.errored} ${runs(track.errored)} failed before producing output`);
  }
  if (parts.length === 0) return "";
  return ` <span class="nodata">(${parts.join(", ")})</span>`;
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

