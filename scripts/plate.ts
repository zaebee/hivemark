/**
 * Generate the specimen plate — the visual study of the badge trait system.
 *
 * Every bee on the page comes from `src/avatar.ts`, so the plate cannot drift
 * from the implementation: regenerate it and it shows whatever the badges
 * actually look like today. Real genomes come from the same harvest the
 * pipeline runs, not from numbers copied into a template.
 *
 *   bun scripts/plate.ts <out.html> [reviews.jsonl]
 */

import { readFileSync, writeFileSync } from "node:fs";
import { avatarSvg } from "../src/avatar.js";
import { deriveTrackRecords } from "../src/derive.js";
import { genomeOf, providerOf } from "../src/genome.js";
import { harvest } from "../src/harvest.js";
import { identityId } from "../src/identity.js";
import { MORPHOLOGY, SOURCES, type CharacterName } from "../src/morphology.js";
import type { Genome, TrackRecord } from "../src/types.js";
import { DRIVEN_BY, characterMm } from "../src/variation.js";

const KNOWN_FIELDS = [
  "context_mode",
  "finder_model",
  "guardian_version",
  "provider",
  "skeptic_model",
] as const;

/** A genome that has never been run, built only to exercise the trait space. */
function hypothetical(over: Partial<Genome> & Pick<Genome, "finder_model">): Genome {
  return {
    schema_version: 1,
    known_fields: KNOWN_FIELDS,
    provider: providerOf(over.finder_model),
    skeptic_model: null,
    context_mode: "diff-only",
    guardian_version: "d0d807ef01c556b882dc85b9fc0d2851d92aa1e5",
    ...over,
  } as Genome;
}

/**
 * Four heritable slots — `provider` is deliberately absent.
 *
 * Crossing provider independently of finder_model produced impossible bees: a
 * child claiming provider "gemini" while carrying a qwen finder. Provider is an
 * expression of finder_model, so it travels with it.
 *
 * Not in `src/` on purpose: breeding is milestone 2, and this is the study that
 * decides its shape. `avatarSvg` is the part under test here, and that is real.
 */
const TRAITS = ["finder_model", "skeptic_model", "context_mode", "guardian_version"] as const;

function breed(a: Genome, b: Genome, mask: number): Genome {
  const child: Record<string, unknown> = { schema_version: 1, known_fields: KNOWN_FIELDS };
  TRAITS.forEach((trait, i) => {
    child[trait] = (mask >> i) & 1 ? a[trait] : b[trait];
  });
  child.provider = providerOf(child.finder_model as string);
  return child as Genome;
}

const esc = (v: string): string =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const short = (v: string | null): string => (v ? v.slice(0, 8) : "—");

// ---------------------------------------------------------------- real data
const source = process.argv[3] ?? "tests/fixtures/martian-reviews.sample.jsonl";
const { records, warnings } = harvest(readFileSync(source, "utf8"));
for (const w of warnings) console.warn(`warning: ${w}`);

const tracks = deriveTrackRecords(records).sort((a, b) => b.reviews - a.reviews);
if (tracks.length === 0) throw new Error(`no identities harvested from ${source}`);

const named = (t: TrackRecord): string =>
  `${t.genome.context_mode} · ${t.genome.guardian_version === tracks[0]!.genome.guardian_version ? "current" : "older"} Guardian`;

// ------------------------------------------------------------ hypotheticals
const HYPO: ReadonlyArray<{ name: string; genome: Genome }> = [
  { name: "ollama · local, graph", genome: hypothetical({ finder_model: "qwen2.5-coder:7b", skeptic_model: "qwen2.5-coder:7b", context_mode: "graph" }) },
  { name: "mistral · no skeptic", genome: hypothetical({ finder_model: "mistral-medium-latest" }) },
  { name: "ollama · bare diff, no skeptic", genome: hypothetical({ finder_model: "llama3.1:70b", guardian_version: "1ecd9629f46cab10b907dae285d0f58b0eef5e21" }) },
];

// --------------------------------------------------------------- morphology
/**
 * The genome that pushes one character furthest, found by searching rather than
 * by writing the number down.
 *
 * Every candidate is a real genome the pipeline would accept, so the bees below
 * are what `avatarSvg` produces and not a drawing assembled for the occasion.
 * The finder names all start `gemini-` and all carry `flash`, which pins the
 * palette and the eye shape: whatever differs between these bees is build.
 */
function extremeHead(want: "low" | "high"): Genome {
  const candidates = Array.from({ length: 400 }, (_, i) =>
    hypothetical({ finder_model: `gemini-${i}-flash`, context_mode: "graph" }),
  );
  return candidates.sort((a, b) =>
    want === "low"
      ? characterMm("headHeight", a) - characterMm("headHeight", b)
      : characterMm("headHeight", b) - characterMm("headHeight", a),
  )[0]!;
}

const VARIATION: ReadonlyArray<{ name: string; genome: Genome; note: string }> = [
  { name: "shortest head found", genome: extremeHead("low"), note: "low end of the published range" },
  { name: "the primary measurement", genome: hypothetical({ finder_model: "gemini-2.5-flash", context_mode: "graph" }), note: "Pathania et al. 2022, worker" },
  { name: "tallest head found", genome: extremeHead("high"), note: "high end of the published range" },
];

const CHARACTERS = (Object.keys(MORPHOLOGY) as CharacterName[])
  .map((name) => {
    const { mm, range, sources } = MORPHOLOGY[name];
    const span = range === null
      ? '<span class="none">does not vary</span>'
      : `${range[0].toFixed(2)} – ${range[1].toFixed(2)}`;
    const cites = sources
      .map((k) => `<span class="chip" title="${esc(SOURCES[k])}">${esc(k)}</span>`)
      .join("");
    return `<tr><td class="mono">${name}</td><td class="mono num">${mm.toFixed(2)}</td>
<td class="mono num">${span}</td><td class="mono">${DRIVEN_BY[name]}</td><td>${cites}</td></tr>`;
  })
  .join("\n");

// ----------------------------------------------------------------- crossings
const CROSSES = [
  {
    a: { name: named(tracks[1]!), genome: tracks[1]!.genome },
    b: { name: named(tracks[2]!), genome: tracks[2]!.genome },
    mask: 0b0111,
    bothReal: true,
    remark:
      "Both parents are real. The offspring — diff-only context on the older Guardian revision — " +
      "is a reviewer that has never been run, but could be today.",
  },
  {
    a: { name: named(tracks[0]!), genome: tracks[0]!.genome },
    b: { name: HYPO[1]!.name, genome: HYPO[1]!.genome },
    mask: 0b0110,
    bothReal: false,
    remark:
      "The child takes mistral's finder and therefore mistral's palette — provider follows the " +
      "model it belongs to. It keeps a skeptic from parent A, so it has a stinger.",
  },
];

// --------------------------------------------------------------- rendering
function genomeRows(g: Genome, extra = ""): string {
  return `<dl>
<dt>provider</dt><dd>${esc(g.provider)}</dd>
<dt>finder</dt><dd>${esc(g.finder_model)}</dd>
<dt>skeptic</dt><dd>${g.skeptic_model ? esc(g.skeptic_model) : '<span class="none">none</span>'}</dd>
<dt>context</dt><dd>${esc(g.context_mode)}</dd>
<dt>guardian</dt><dd>${esc(short(g.guardian_version))}</dd>
${extra}</dl>`;
}

const realCards = tracks
  .map((t) => {
    const extra =
      `<dt>identity</dt><dd>${esc(identityId(t.genome).slice(0, 18))}…</dd>` +
      `<dt>corpus</dt><dd>${esc(t.corpus.map(([p, n]) => `${p} ×${n}`).join(", "))}</dd>`;
    return `<article class="specimen">
<div class="tag real"><span>collected</span><span>${t.reviews} review${t.reviews === 1 ? "" : "s"}</span></div>
<figure>${avatarSvg(t.genome, 170)}</figure>
<div class="caption"><span class="name">${esc(named(t))}</span>${genomeRows(t.genome, extra)}</div>
</article>`;
  })
  .join("\n");

const hypoCards = HYPO.map(
  (h) => `<article class="specimen is-hypo">
<div class="tag hypo"><span>hypothetical</span><span>no such run exists</span></div>
<figure>${avatarSvg(h.genome, 170)}</figure>
<div class="caption"><span class="name">${esc(h.name)}</span>${genomeRows(h.genome)}</div>
</article>`,
).join("\n");

const crossBlocks = CROSSES.map((c) => {
  const child = breed(c.a.genome, c.b.genome, c.mask);
  const chips =
    TRAITS.map((t, i) => {
      const from = (c.mask >> i) & 1 ? "A" : "B";
      const value = child[t] === null ? "none" : String(child[t]).slice(0, 16);
      return `<span class="chip">${t} <b>← ${from}</b> ${esc(value)}</span>`;
    }).join("") +
    `<span class="chip">provider <b>← ${esc(child.provider)}</b> follows finder</span>`;

  return `<div class="cross">
<figure>${avatarSvg(c.a.genome, 130)}<figcaption>A · ${esc(c.a.name)}</figcaption></figure>
<div class="op">×</div>
<figure>${avatarSvg(c.b.genome, 130)}<figcaption>B · ${esc(c.b.name)}</figcaption></figure>
<div class="op">→</div>
<figure>${avatarSvg(child, 130)}<figcaption>offspring${c.bothReal ? "" : " (hypothetical)"}</figcaption></figure>
</div>
<div class="inherit">${chips}</div>
<p class="mono meta">mask 0b${c.mask.toString(2).padStart(4, "0")}</p>
<p class="remark">${esc(c.remark)}</p>`;
}).join("\n");

const KEY = [
  ["provider", "Body palette", "Who is looking. Gold for gemini, rust for mistral, slate for ollama. Read off the finder model, never trusted as a field of its own."],
  ["context_mode", "Wings", "graph gets two pairs — it sees structure, not just the diff. diff-only gets one. Wing dimensions come from the same slot."],
  ["skeptic_model", "Stinger", "A review with no skeptic has no teeth. Null model, no stinger — and no abdomen of its own."],
  ["finder_model", "Eyes and head", "Which model does the finding. A shape for the eyes, and the head's proportions, hashed from the same slot."],
  ["guardian_version", "Abdomen bands", "Generation marker. A new Guardian revision is a new lineage."],
]
  .map(([field, part, why]) => `<div><span class="field">${field}</span><span class="part">${part}</span><span class="why">${why}</span></div>`)
  .join("\n");

const html = `<title>Hivemark Specimen Plate</title>
<style>
:root{--paper:#E7E8E1;--card:#F2F3EE;--ink:#191B16;--ink-soft:#55584D;--ink-faint:#83877A;
--rule:#C2C6B7;--rule-soft:#D6D9CD;--accent:#A8791A;--accent-soft:#EFE2C2;--real:#3F6B4A;--hypo:#8A5B7A;
--hivemark-ink:#191B16;--shadow:0 1px 0 rgba(25,27,22,.06)}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--paper:#12140F;--card:#1B1E17;
--ink:#E5E7DC;--ink-soft:#A6AA9A;--ink-faint:#7A7E70;--rule:#333828;--rule-soft:#262A1F;--accent:#D9A93F;
--accent-soft:#2E2716;--real:#7FB08C;--hypo:#C295B4;--hivemark-ink:#E5E7DC;--shadow:0 1px 0 rgba(0,0,0,.4)}}
:root[data-theme="dark"]{--paper:#12140F;--card:#1B1E17;--ink:#E5E7DC;--ink-soft:#A6AA9A;--ink-faint:#7A7E70;
--rule:#333828;--rule-soft:#262A1F;--accent:#D9A93F;--accent-soft:#2E2716;--real:#7FB08C;--hypo:#C295B4;
--hivemark-ink:#E5E7DC;--shadow:0 1px 0 rgba(0,0,0,.4)}
*{box-sizing:border-box}
body{margin:0;padding:clamp(1.5rem,4vw,3.5rem) clamp(1rem,4vw,2rem) 5rem;background:var(--paper);color:var(--ink);
font:16px/1.65 ui-serif,"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;-webkit-font-smoothing:antialiased}
main{max-width:68rem;margin:0 auto;display:flex;flex-direction:column;gap:3.5rem}
.mono{font-family:ui-monospace,"SF Mono","Cascadia Mono",Menlo,Consolas,monospace;font-variant-numeric:tabular-nums}
.eyebrow{font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace;font-size:.7rem;letter-spacing:.16em;
text-transform:uppercase;color:var(--ink-faint);margin:0 0 .6rem}
h1{font-size:clamp(2rem,5vw,2.9rem);line-height:1.08;font-weight:600;margin:0 0 .75rem;text-wrap:balance;letter-spacing:-.015em}
h2{font-size:clamp(1.25rem,2.6vw,1.55rem);font-weight:600;margin:0 0 .3rem;text-wrap:balance;letter-spacing:-.01em}
.lede{font-size:1.08rem;color:var(--ink-soft);max-width:42rem;margin:0}
p{margin:0 0 .9rem;max-width:40rem}p:last-child{margin-bottom:0}
header{border-bottom:2px solid var(--ink);padding-bottom:1.75rem}
section>.head{margin-bottom:1.5rem}
.key{display:grid;grid-template-columns:repeat(auto-fit,minmax(15rem,1fr));border:1px solid var(--rule);background:var(--card)}
.key>div{padding:.9rem 1.1rem;border-right:1px solid var(--rule-soft);border-bottom:1px solid var(--rule-soft)}
.key .field{font-family:ui-monospace,"SF Mono",Menlo,monospace;font-size:.78rem;color:var(--accent);display:block;margin-bottom:.15rem}
.key .part{font-weight:600;display:block}
.key .why{font-size:.88rem;color:var(--ink-soft)}
.plate{display:grid;grid-template-columns:repeat(auto-fit,minmax(16rem,1fr));gap:1.25rem}
.specimen{background:var(--card);border:1px solid var(--rule);box-shadow:var(--shadow);display:flex;flex-direction:column}
.specimen.is-hypo{border-style:dashed}
.specimen figure{margin:0;padding:1.25rem 1rem .5rem;display:flex;justify-content:center}
.specimen svg{width:100%;max-width:170px;height:auto;display:block}
.tag{font-family:ui-monospace,"SF Mono",Menlo,monospace;font-size:.62rem;letter-spacing:.14em;text-transform:uppercase;
padding:.3rem 1.1rem;border-bottom:1px solid var(--rule-soft);display:flex;justify-content:space-between;gap:.5rem}
.tag.real{color:var(--real)}.tag.hypo{color:var(--hypo)}
.caption{padding:.5rem 1.1rem 1.1rem;border-top:1px solid var(--rule-soft)}
.caption .name{font-weight:600;margin-bottom:.5rem;display:block}
.caption dl{display:grid;grid-template-columns:auto minmax(0,1fr);gap:.1rem .7rem;margin:0;
font-family:ui-monospace,"SF Mono",Menlo,monospace;font-size:.72rem;font-variant-numeric:tabular-nums}
.caption dt{color:var(--ink-faint)}.caption dd{margin:0;overflow-wrap:anywhere}
.caption .none{color:var(--ink-faint);font-style:italic}
.cross{display:grid;grid-template-columns:1fr auto 1fr auto 1fr;align-items:center;gap:.5rem;border:1px solid var(--rule);
background:var(--card);padding:1.25rem;margin-bottom:1.25rem;overflow-x:auto}
.cross .op{font-size:1.4rem;color:var(--ink-faint);text-align:center;font-family:ui-monospace,"SF Mono",Menlo,monospace}
.cross figure{margin:0;text-align:center}
.cross svg{width:100%;max-width:130px;height:auto}
.cross figcaption{font-family:ui-monospace,"SF Mono",Menlo,monospace;font-size:.68rem;color:var(--ink-soft);margin-top:.4rem}
.inherit{display:flex;flex-wrap:wrap;gap:.35rem;padding-top:.9rem;border-top:1px solid var(--rule-soft)}
.chip{font-family:ui-monospace,"SF Mono",Menlo,monospace;font-size:.68rem;padding:.18rem .5rem;border:1px solid var(--rule);
border-radius:2px;color:var(--ink-soft)}
.chip b{color:var(--ink);font-weight:600}
.meta{font-size:.72rem;color:var(--ink-faint);margin:.5rem 0 .4rem}
.remark{margin:0 0 2.25rem;color:var(--ink-soft);font-size:.95rem;max-width:46rem}
.chars{width:100%;border-collapse:collapse;margin:1.5rem 0;font-size:.82rem;
font-family:ui-monospace,"SF Mono",Menlo,monospace;display:block;overflow-x:auto;white-space:nowrap}
.chars th{text-align:left;font-weight:600;color:var(--ink-faint);text-transform:uppercase;
letter-spacing:.1em;font-size:.66rem;padding:.5rem .8rem;border-bottom:1px solid var(--rule)}
.chars td{padding:.45rem .8rem;border-bottom:1px solid var(--rule-soft);vertical-align:middle}
.chars .num{text-align:right;font-variant-numeric:tabular-nums}
.chars .none{color:var(--ink-faint);font-style:italic;white-space:nowrap}
.chars .chip{margin-right:.25rem;cursor:help}
.note{border-left:3px solid var(--accent);background:var(--accent-soft);padding:.9rem 1.1rem;color:var(--ink)}
.note p{max-width:46rem}
footer{border-top:1px solid var(--rule);padding-top:1.5rem;color:var(--ink-soft);font-size:.92rem}
</style>

<main>
<header>
<p class="eyebrow">hivemark · badge visual language · generated from src/avatar.ts</p>
<h1>Bees assembled from a reviewer's genome</h1>
<p class="lede">Every trait below is read from a genome field, and so are the proportions: the base is
measured <em>Apis mellifera</em>, cited, and each part's build is hashed from the one slot that
governs it. Nothing comes from the track record. The question this plate exists to answer: can you
tell two reviewers apart at a glance, and does a crossbred bee visibly inherit from both parents?</p>
</header>

<section>
<div class="head">
<p class="eyebrow">The rule</p>
<h2>Body from genome, record from nowhere</h2>
<p>A reviewer's identity is fixed — it is the hash of its genome — while its track record grows with
every review. So the body may only encode the genome. If confirmations changed the shape of a bee,
identity would look mutable, and the whole design rests on it not being. Track record, when shown,
belongs to a separate layer drawn outside the body.</p>
</div>
<div class="key">${KEY}</div>
</section>

<section>
<div class="head">
<p class="eyebrow">Plate I · collected specimens</p>
<h2>The ${tracks.length} reviewers that actually exist</h2>
<p>Harvested from ${records.length} real reviews. Note what the plate reveals immediately:
<strong>all of them share one provider and one model pair.</strong> They differ only in context mode
and Guardian revision, so only two traits vary — wings and band count. Palette, eyes and stinger are
identical across the row because the underlying reviewers really are identical in those respects.</p>
</div>
<div class="plate">${realCards}</div>
</section>

<section>
<div class="head">
<p class="eyebrow">Plate II · hypothetical</p>
<h2>What the trait space can express</h2>
<p>No such reviewers have been run. These exist only to show the mapping has range — if the corpus
ever gains an ollama or mistral finder, or a run without a skeptic, this is what would appear.
Dashed frames mark every specimen that is not real.</p>
</div>
<div class="plate">${hypoCards}</div>
</section>

<section>
<div class="head">
<p class="eyebrow">Plate III · morphology</p>
<h2>Proportions that are facts, and how far they move</h2>
<p>The base is the measured worker: head 2.45 × 3.62 mm, thorax 3.72, abdomen 6.63, forewing
9.27 × 2.98. That is why the head is an ellipse and not a circle, and why the wings are as long as
they are — a worker's forewing is 9.27 mm against a 12.80 mm body. A character varies only where two
published means disagree, and then only between them, so every bee here coincides with a bee somebody
measured.</p>
</div>
<div class="plate">${VARIATION.map(
  (v) => `<article class="specimen is-hypo">
<div class="tag hypo"><span>${esc(v.name)}</span><span>${esc(v.note)}</span></div>
<figure>${avatarSvg(v.genome, 170)}</figure>
<div class="caption"><span class="name mono">head ${characterMm("headHeight", v.genome).toFixed(2)} × ${characterMm("headWidth", v.genome).toFixed(2)} mm</span>
${genomeRows(v.genome)}</div>
</article>`,
).join("\n")}</div>
<table class="chars">
<thead><tr><th>character</th><th class="num">mm</th><th class="num">published range</th><th>slot</th><th>sources</th></tr></thead>
<tbody>${CHARACTERS}</tbody>
</table>
<div class="note">
<p><strong>Every character here varies, and one of them nearly did not.</strong> Thorax and abdomen
length had a single published mean each for most of this work — Pathania et al. state theirs is the
first for that population — and the second measurement sat behind a publisher that refuses automated
requests. Numbers seen only in search summaries were refused as too weak to sit underneath the
largest mass of the bee. The article was opened by hand instead, and its four apiaries supply the
other end of both ranges. No rule was relaxed to get there.</p>
<p>The head is still the row shown above because it is the only region driven by a slot with an open
vocabulary. <span class="mono">context_mode</span> holds two values, so a wing has exactly two
builds; <span class="mono">guardian_version</span> and <span class="mono">skeptic_model</span> hold
as many as the corpus has seen.</p>
</div>
</section>

<section>
<div class="head">
<p class="eyebrow">Plate IV · crossings</p>
<h2>Inheritance you can see</h2>
<p>A hash-derived avatar cannot show lineage: the child's hash is unrelated to its parents'. Parts can.
Each trait slot is filled from one parent or the other by the same bitmask <span class="mono">breed_dna</span>
used in the kitties pallet — so a crossbred bee wears its ancestry.</p>
</div>
${crossBlocks}
<div class="note">
<p><strong>Drawing this plate found a bug in the trait model.</strong> The first draft treated
<span class="mono">provider</span> as a fifth heritable slot, and crossing it independently produced
impossible bees — a child claiming provider <span class="mono">gemini</span> while carrying a
<span class="mono">qwen</span> finder. Provider is not a gene; it is read off
<span class="mono">finder_model</span>. There are four heritable slots, not five, and the palette
follows the finder wherever it goes.</p>
</div>
</section>

<footer>
<p>Bees rendered by <span class="mono">src/avatar.ts</span> — the same code that draws the published
badges — so this plate cannot drift from the implementation. Regenerate with
<span class="mono">bun scripts/plate.ts &lt;out.html&gt;</span>. Genomes harvested from
<span class="mono">${esc(source)}</span>. Track records are deliberately absent: this studies bodies,
not achievements. Breeding is milestone 2 and lives only in this script for now.</p>
</footer>
</main>
`;

const out = process.argv[2];
if (!out) throw new Error("usage: bun scripts/plate.ts <out.html> [reviews.jsonl]");
writeFileSync(out, html, "utf8");
console.log(`plate → ${out}`);
console.log(`  ${tracks.length} real, ${HYPO.length} hypothetical, ${CROSSES.length} crossings`);
for (const t of tracks) {
  console.log(`  ${named(t).padEnd(34)} ${identityId(t.genome).slice(0, 14)} ${t.reviews} reviews`);
}
