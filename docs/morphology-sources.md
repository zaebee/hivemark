# Where the bee's proportions come from

Input to `src/morphology.ts`. The two must agree: a value in the code that is
not in this table, or a source key that resolves to nothing here, is a bug.

Every number below is a published mean for **worker** *Apis mellifera*, in
millimetres. Queens and drones are measured by these papers too and are not used
— there is no reviewer trait a caste would express.

## Status of each source

| key | source | status |
|---|---|---|
| `pathania-2022` | Pathania A, Kumar A, Dhiman S (2022). Morphometrics of *Apis mellifera* in North-Western Himalayan region of Himachal Pradesh, India. *J. Entomol. Zool. Stud.* 10(3):105–109. [doi:10.22271/j.ento.2022.v10.i3b.8997](https://doi.org/10.22271/j.ento.2022.v10.i3b.8997) | **Read in full.** Tables 1–3 of the PDF, worker row. |
| `alkahtani-2021` | AL-Kahtani SN, Taha E-KA (2021). Morphometric study of Yemeni (*Apis mellifera jemenitica*) and Carniolan (*A. m. carnica*) honeybee workers in Saudi Arabia. *PLoS ONE* 16(2):e0247262. | **Read in full**, from the manuscript XML. **Carries an Expression of Concern** — see below. |
| `ibrahim-2017` | Ibrahim MM, Chandel YS, Anil A (2017). Morphometrics of *Apis mellifera* after Five Decades of its Introduction in North-Western Himalayan Region of India. *Pakistan J. Zool.* 49(4):1397–1403. [doi:10.17582/journal.pjz/2017.49.4.1397.1403](https://doi.org/10.17582/journal.pjz/2017.49.4.1397.1403) | **Table II read directly**, opened by hand after the publisher refused automated access. Four apiaries in Himachal Pradesh, 644–1268 m. |

### The Expression of Concern on `alkahtani-2021`

PLOS issued an Expression of Concern in April 2023. It concerns **authorship and
competing interests**, the integrity of peer review, and the article's
contribution given its study design. PLOS states the evidence pertaining to this
article was **inconclusive**. The article is not retracted, and no concern was
raised about the measurements themselves.

It is used anyway, and the flag is recorded in `SOURCES` in the code rather than
only here, so it travels with the number. The reasoning: an inconclusive concern
about authorship is not evidence that a wing was mismeasured, and the
alternative is no citation at all, which is strictly worse. Anyone who disagrees
should drop the key — the wing characters then lose their ranges and stop
varying, which the design already handles.

## The table

| character | mm | range | sources | note |
|---|---|---|---|---|
| headHeight | 2.45 | 2.45 – 3.22 | `pathania-2022`, `ibrahim-2017` | high end is Palampur |
| headWidth | 3.62 | 3.62 – 3.72 | `pathania-2022`, `ibrahim-2017` | high end is Dhaulakuan |
| thoraxLength | 3.72 | 3.72 – 4.38 | `pathania-2022`, `ibrahim-2017` | high end is Bajaura |
| abdomenLength | 6.63 | 5.54 – 6.63 | `pathania-2022`, `ibrahim-2017` | low end is Bajaura |
| forewingLength | 9.27 | 7.94 – 9.27 | `pathania-2022`, `alkahtani-2021` | low end is *jemenitica* 7.94; *carnica* is 9.14 |
| forewingWidth | 2.98 | 2.44 – 3.53 | `pathania-2022`, `alkahtani-2021` | 2.44 *jemenitica*, 3.53 *carnica* |
| hindwingLength | 6.20 | 5.85 – 6.74 | `pathania-2022`, `alkahtani-2021` | 5.85 *jemenitica*, 6.74 *carnica* |
| hindwingWidth | 1.82 | 1.67 – 2.21 | `pathania-2022`, `alkahtani-2021` | 1.67 *jemenitica*, 2.21 *carnica* |

The wing ranges are spans between two *subspecies* of *A. mellifera*; the head,
thorax and abdomen ranges are spans between named sampled populations — four
Himachal apiaries and Pathania et al.'s worker sample. That is what makes them
defensible as bounds: every value inside is a bee somebody measured, and each end
is a described population rather than an error bar.

Ibrahim et al.'s Table II, per apiary, in millimetres:

| site | altitude | head height | head width | thorax | abdomen |
|---|---|---|---|---|---|
| Dhaulakuan | 644 m | 3.20 | 3.72 | 4.14 | 5.96 |
| Nagrota Bagwan | 861 m | 3.14 | 3.65 | 4.30 | 6.07 |
| Bajaura | 1087 m | 3.19 | 3.64 | 4.38 | 5.54 |
| Palampur | 1268 m | 3.22 | 3.71 | 4.23 | 6.08 |

**These two papers are not independent, and it is visible in the arithmetic.**
Their reported error terms are identical, character for character — ±0.10, ±0.09,
±0.06, ±0.20, ±0.93 — against entirely different means. Same region, same method,
one shared pool. They are two published means, which is what the rule requires,
but nobody should read the range as two independent measurements agreeing. Note
too that Pathania et al.'s single station, Nagrota Bagwan, is one of the four
sites above.

**`sharma-1990` is dropped.** Head height 3.19 and width 3.78 were attributed to
that unpublished thesis by Pathania et al.'s discussion, read second-hand. Table
II above reports 3.19 for head height directly — the same figure — and 3.64–3.72
for width, never 3.78. Most likely the discussion conflated two sources. A
first-hand table replaces a second-hand attribution, and the questionable 3.78
leaves with it.

## Two claims from the spec, withdrawn on verification

**`dyer-seeley-1987`, forewing 7.64–9.70 — dropped.** The spec took this from
the discussion of `pathania-2022`, which reads: "Dyer & Seeley (1987) reported
the fore-wing length in *A. mellifera* of different altitudes between 7.64 to
9.70mm." The cited paper is *Interspecific comparisons of endothermy in
honey-bees (Apis)*, J Exp Biol 127:1–26 — a comparison of thoracic temperature
across four *Apis* **species**, not a study of *A. mellifera* across altitudes.
Its full text is paywalled, so the attribution could not be settled either way.

Not thrown out for being unreachable, which would be no evidence at all. Thrown
out because the subject of the cited paper does not match the claim attributed
to it, and because `alkahtani-2021` now supplies a forewing range that was read
first-hand. A doubtful citation carrying the widest range in the system is
exactly the thing this file exists to catch.

**`ruttner-2013`, forewing 9.33 — dropped.** Also read second-hand, also a
source that could not be opened, and it moves the forewing maximum by 0.6%. It
bought nothing that would justify a third unverified number.

## Thorax and abdomen: settled, and how

The spec predicted these two might never vary, and for most of this work they did
not: their second measurement sat behind a publisher that returns 403 to
automated requests, and numbers seen only in search summaries were refused as too
weak to put underneath the largest masses of the silhouette.

**Resolved 2026-08-13.** The article was opened by hand in a browser and Table II
was read from it. That was the promotion path this file specified, and it was
taken. Thorax and abdomen now have ranges, so every character in the model varies
and a genome differing in any slot differs in the region that slot builds. The
three collected identities share two slots, so they differ in thorax and wings
only — a fact about the corpus, not about the model.

What did not change: the rule. No range was widened, no number was estimated, and
nothing was accepted that had not been read. The gap closed because the evidence
arrived, which is the only way this file allows a gap to close.

## Searches run, including the ones that found nothing

Recorded so that "no second measurement is available" is a finding rather than a
shrug, and so the next attempt does not repeat them.

```
Apis mellifera worker morphometric characters mean standard deviation head width thorax width forewing length Ruttner
honey bee worker body measurements mm head width thorax width abdomen length forewing length table
"Apis mellifera" worker morphometry "head width" "thorax width" "abdomen length" mean SD open access study
"Apis mellifera" worker morphometrics "abdomen length" "thorax length" mm mean Nigeria OR Syria OR Ethiopia study table
MDPI Insects OR "Journal of Apicultural Research" Apis mellifera worker morphometric "abdomen length" "thorax length" mean mm open access
Ibrahim Chandel 2017 "Pakistan Journal of Zoology" 49 1397 Morphometrics Apis mellifera five decades pdf full text
Dyer Seeley 1987 "Interspecific comparisons of endothermy in honey-bees" Journal of Experimental Biology 127 forewing length Apis mellifera
```

Sources that exist and could not be opened: Pakistan J. Zool. 49(4) (403);
ResearchGate copies of the Kwara State, Nigeria study and the Kashmir altitude
study (403); PMC article pages (reCAPTCHA); J Exp Biol 127 full text (paywall).
Three of these measure thorax and abdomen and would settle the question.

## What is not measured at all

`thoraxWidth` and `abdomenWidth`. No source here records either, and they are
the two widest parts of the drawing. They live in `body.ts` as `DRAWING`
conventions, expressed as a fraction of the measured length, and are marked
there as not measured. They are not in this file because this file is for
measurements.
